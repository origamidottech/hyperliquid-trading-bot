import { BotConfig, TraderFill, PerpetualsPosition, OrderResult } from '../types';
import { HLClient } from './hlClient';
import { OrderExecutor } from './orderExecutor';
import { RiskManager } from './riskManager';
import { PositionRegistry } from './positionRegistry';
import { StatsTracker } from './statsTracker';
import { KellySizer } from './kellySizer';
import { getLogger } from '../utils/logger';
import { KeyedQueue } from '../utils/keyedQueue';
import { aggressiveBuyPrice, aggressiveSellPrice, notionalUsd } from '../utils/math';
import { sleep } from '../utils/sleep';

/** Skip copy orders below this USD notional (avoids dust positions). */
const MIN_NOTIONAL_USD = 5;

/** Treat a close as "full" (and drop the coin from the registry) at ≥ this fraction. */
const FULL_CLOSE_FRACTION = 0.999;

/** Context captured about our own position before we close part of it. */
interface CloseContext {
  closeSize: number;
  ourSize: number;
  entryPx: number;
  isLong: boolean;
}

/**
 * Turns a target trader's fills into copied orders on our account.
 *
 * Every fill is serialized per-coin through the shared {@link KeyedQueue}, so
 * concurrent fills for the same market can't race each other (or a reconcile /
 * stop-loss close) into a double-open or an over-close.
 */
export class FillProcessor {
  constructor(
    private readonly config: BotConfig,
    private readonly client: HLClient,
    private readonly executor: OrderExecutor,
    private readonly risk: RiskManager,
    private readonly registry: PositionRegistry,
    private readonly stats: StatsTracker,
    private readonly queue: KeyedQueue,
    private readonly kelly: KellySizer,
  ) {}

  /**
   * Enqueue a fill for processing. Returns immediately; the fill runs when the
   * coin's queue slot is free. Errors are logged, never thrown to the caller.
   */
  enqueue(fill: TraderFill): void {
    void this.queue
      .run(fill.coin, () => this.processFill(fill))
      .catch((err) => {
        getLogger().error(`Unhandled error processing fill for ${fill.coin}`, {
          err: err instanceof Error ? err.message : String(err),
        });
      });
  }

  /**
   * Copy the target's already-open positions at startup (COPY_EXISTING_POSITIONS).
   */
  async copyExisting(targetPositions: PerpetualsPosition[]): Promise<void> {
    const logger = getLogger();
    const mids = await this.client.getAllMids();

    for (const pos of targetPositions) {
      const szi = parseFloat(pos.szi);
      if (szi === 0) continue;

      const asset = this.client.getAsset(pos.coin);
      if (!asset) {
        logger.warn(`No metadata for ${pos.coin} — skipping`);
        continue;
      }

      const mid = parseFloat(mids[pos.coin] ?? '0');
      if (mid === 0) {
        logger.warn(`No mid price for ${pos.coin} — skipping`);
        continue;
      }

      await this.queue.run(pos.coin, async () => {
        const isBuy = szi > 0;
        const rawSize = Math.abs(szi) * this.config.sizeMultiplier;
        const kellySized = await this.applyKelly(pos.coin, rawSize, mid);
        if (kellySized <= 0 && this.kelly.ready) {
          logger.info(`Kelly: no edge for ${pos.coin} — skipping existing position`);
          return;
        }
        const copySize = this.risk.capSize(kellySized, mid, asset.szDecimals);
        const notional = notionalUsd(copySize, mid);

        const risk = await this.risk.checkNewPosition(pos.coin, notional);
        if (!risk.allowed) {
          logger.warn(`Skipping existing position ${pos.coin}: ${risk.reason}`);
          return;
        }

        const leverage = this.risk.capLeverage(pos.leverage.value, asset.maxLeverage);
        await this.executor.setLeverage(asset.index, leverage);

        const price = isBuy
          ? aggressiveBuyPrice(mid, this.config.slippageBps)
          : aggressiveSellPrice(mid, this.config.slippageBps);

        const result = await this.executor.placeOrder({
          coin: pos.coin,
          assetIndex: asset.index,
          isBuy,
          size: copySize,
          price,
          isReduceOnly: false,
          leverage,
          reason: 'copy-existing',
        });

        if (result.success) {
          this.registry.add(pos.coin);
          this.stats.recordCopied(pos.coin);
        } else {
          this.stats.recordFailed();
        }
      });

      await sleep(500); // rate-limit buffer between markets
    }
  }

  // ─── Fill processing ───────────────────────────────────────────────────────

  private async processFill(fill: TraderFill): Promise<void> {
    const logger = getLogger();

    // Skip spot markets — perps use plain names ("BTC"); spot uses "@0" or "BTC/USDC".
    if (fill.coin.includes('/') || fill.coin.startsWith('@')) {
      logger.debug(`Skipping spot fill: ${fill.coin}`);
      return;
    }

    if (this.risk.isPaused()) {
      logger.warn(`Skipping ${fill.coin} fill: bot is paused`);
      this.stats.recordSkipped();
      return;
    }

    const isOpen = fill.dir.toLowerCase().includes('open');
    const isClose = fill.dir.toLowerCase().includes('close');
    const isBuy = fill.side === 'B';
    const fillSize = parseFloat(fill.sz);

    logger.info(
      `◆ TARGET FILL  ${fill.coin.padEnd(8)} [${fill.dir.padEnd(12)}] ` +
        `sz=${fillSize}  px=${fill.px}  tx=${fill.hash.slice(0, 10)}...`,
    );

    const asset = this.client.getAsset(fill.coin);
    if (!asset) {
      logger.warn(`No asset metadata for ${fill.coin} — skipping`);
      this.stats.recordSkipped();
      return;
    }

    // Mid price for IOC order pricing; fall back to the target's fill price.
    let mid: number;
    try {
      mid = await this.client.getMidPrice(fill.coin);
    } catch {
      logger.warn(`Cannot get mid price for ${fill.coin}, using fill price`);
      mid = parseFloat(fill.px);
    }

    if (isClose) {
      // Learn the target's edge from this realised result before we act on it.
      this.kelly.recordClose(
        parseFloat(fill.closedPnl),
        parseFloat(fill.sz),
        parseFloat(fill.px),
      );
      await this.handleClose(fill, asset.szDecimals, asset.index, mid, isBuy);
    } else if (isOpen) {
      await this.handleOpen(fill, asset.index, asset.maxLeverage, asset.szDecimals, mid, isBuy);
    } else {
      logger.debug(`Unknown fill dir "${fill.dir}" — skipping`);
      this.stats.recordSkipped();
    }
  }

  // ─── Open ──────────────────────────────────────────────────────────────────

  private async handleOpen(
    fill: TraderFill,
    assetIndex: number,
    assetMaxLeverage: number,
    szDecimals: number,
    mid: number,
    isBuy: boolean,
  ): Promise<void> {
    const logger = getLogger();

    const raw = parseFloat(fill.sz) * this.config.sizeMultiplier;
    const kellySized = await this.applyKelly(fill.coin, raw, mid);
    if (kellySized <= 0 && this.kelly.ready) {
      logger.info(`Kelly: no edge for ${fill.coin} — skipping open`);
      this.stats.recordSkipped();
      return;
    }
    const copySize = this.risk.capSize(kellySized, mid, szDecimals);
    if (copySize <= 0) {
      logger.debug(`Copy size is 0 for ${fill.coin} — nothing to do`);
      this.stats.recordSkipped();
      return;
    }

    const notional = notionalUsd(copySize, mid);
    if (notional < MIN_NOTIONAL_USD) {
      logger.debug(`${fill.coin}: notional $${notional.toFixed(2)} below minimum — skipping`);
      this.stats.recordSkipped();
      return;
    }

    const risk = await this.risk.checkNewPosition(fill.coin, notional);
    if (!risk.allowed) {
      logger.warn(`Risk blocked ${fill.coin}: ${risk.reason}`);
      this.stats.recordSkipped();
      return;
    }

    await this.syncLeverage(fill.coin, assetIndex, assetMaxLeverage);
    this.registry.add(fill.coin);

    const price = isBuy
      ? aggressiveBuyPrice(mid, this.config.slippageBps)
      : aggressiveSellPrice(mid, this.config.slippageBps);

    const result = await this.executor.placeOrder({
      coin: fill.coin,
      assetIndex,
      isBuy,
      size: copySize,
      price,
      isReduceOnly: false,
      leverage: 1, // already set by syncLeverage above
      reason: `copy-${fill.dir.toLowerCase().replace(/ /g, '-')}`,
    });

    if (result.success) this.stats.recordCopied(fill.coin);
    else this.stats.recordFailed();
  }

  /**
   * Cap the mirrored size by the fractional-Kelly stake for our current account
   * value. Returns `mirrorSize` unchanged when Kelly is disabled or warming up;
   * `0` when the observed edge is non-positive (caller then skips the open).
   */
  private async applyKelly(coin: string, mirrorSize: number, mid: number): Promise<number> {
    if (!this.kelly.ready) return mirrorSize;

    let bankroll: number;
    try {
      bankroll = await this.client.getAccountValue();
    } catch {
      getLogger().warn(`Kelly: can't read account value for ${coin} — using mirror size`);
      return mirrorSize;
    }

    const kellyNotional = this.kelly.suggestNotional(bankroll, this.config.maxPositionSizeUsd);
    if (kellyNotional === null) return mirrorSize;
    if (kellyNotional <= 0) return 0;

    const kellySize = kellyNotional / mid;
    const sized = Math.min(mirrorSize, kellySize);
    getLogger().info(
      `Kelly ${coin}: bankroll $${bankroll.toFixed(2)} → stake $${kellyNotional.toFixed(2)} ` +
        `(${(kellyNotional / bankroll * 100).toFixed(1)}%); ` +
        `mirror ${mirrorSize.toFixed(4)} → copy ${sized.toFixed(4)}`,
    );
    return sized;
  }

  // ─── Close ─────────────────────────────────────────────────────────────────

  private async handleClose(
    fill: TraderFill,
    szDecimals: number,
    assetIndex: number,
    mid: number,
    isBuy: boolean,
  ): Promise<void> {
    const logger = getLogger();

    const ctx = await this.calcCloseContext(fill, szDecimals);
    if (!ctx || ctx.closeSize <= 0) {
      logger.debug(`Nothing to close for ${fill.coin}`);
      this.stats.recordSkipped();
      return;
    }

    const price = isBuy
      ? aggressiveBuyPrice(mid, this.config.slippageBps)
      : aggressiveSellPrice(mid, this.config.slippageBps);

    const result = await this.executor.placeOrder({
      coin: fill.coin,
      assetIndex,
      isBuy,
      size: ctx.closeSize,
      price,
      isReduceOnly: true,
      leverage: 1,
      reason: `copy-${fill.dir.toLowerCase().replace(/ /g, '-')}`,
    });

    if (!result.success) {
      this.stats.recordFailed();
      return;
    }

    this.stats.recordCopied(fill.coin);
    this.recordRealizedPnl(fill.coin, ctx, result, mid);

    // Drop from the managed set once we're (approximately) flat.
    if (ctx.closeSize >= ctx.ourSize * FULL_CLOSE_FRACTION) {
      this.registry.remove(fill.coin);
    }
  }

  /**
   * When the target closes X% of their position, close the same X% of ours.
   * Also captures our entry price and side so realized PnL can be computed.
   */
  private async calcCloseContext(
    fill: TraderFill,
    szDecimals: number,
  ): Promise<CloseContext | null> {
    const logger = getLogger();
    const fillSize = parseFloat(fill.sz);
    const startPosition = parseFloat(fill.startPosition);

    const ourPositions = await this.client.getPositions(this.client.walletAddress);
    const ourPos = ourPositions.find((p) => p.coin === fill.coin);
    if (!ourPos) {
      logger.debug(`No open position in ${fill.coin} to close`);
      return null;
    }

    const ourSizeSigned = parseFloat(ourPos.szi);
    const ourSize = Math.abs(ourSizeSigned);
    const entryPx = parseFloat(ourPos.entryPx);

    // If the target had no prior position on record, fall back to a scaled copy.
    const closePercent =
      startPosition === 0 ? 1 : Math.min(1, fillSize / Math.abs(startPosition));
    const closeSize = ourSize * closePercent;

    logger.debug(
      `${fill.coin} close: target closed ${(closePercent * 100).toFixed(1)}% ` +
        `→ closing ${closeSize.toFixed(szDecimals)} of our ${ourSize}`,
    );

    return { closeSize, ourSize, entryPx, isLong: ourSizeSigned > 0 };
  }

  /**
   * Record *our* realized PnL from this close (not the target's `closedPnl`),
   * so the daily-loss circuit breaker tracks our actual account.
   */
  private recordRealizedPnl(
    coin: string,
    ctx: CloseContext,
    result: OrderResult,
    mid: number,
  ): void {
    const exitPx = result.avgPx ?? mid;
    const closedSize = result.filledSize ?? ctx.closeSize;
    const pnl = (exitPx - ctx.entryPx) * closedSize * (ctx.isLong ? 1 : -1);
    getLogger().debug(
      `${coin} realized PnL ≈ $${pnl.toFixed(2)} ` +
        `(entry ${ctx.entryPx} → exit ${exitPx}, size ${closedSize})`,
    );
    this.risk.recordPnl(pnl);
  }

  // ─── Leverage sync ───────────────────────────────────────────────────────────

  private async syncLeverage(
    coin: string,
    assetIndex: number,
    assetMaxLeverage: number,
  ): Promise<void> {
    try {
      const targetPositions = await this.client.getPositions(this.config.targetTrader);
      const tp = targetPositions.find((p) => p.coin === coin);
      const targetLeverage = tp?.leverage.value ?? 1;
      const capped = this.risk.capLeverage(targetLeverage, assetMaxLeverage);
      await this.executor.setLeverage(assetIndex, capped);
    } catch {
      getLogger().debug(`Could not sync leverage for ${coin} — proceeding with default`);
    }
  }
}
