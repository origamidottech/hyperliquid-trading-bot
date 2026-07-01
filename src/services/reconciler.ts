import { BotConfig } from '../types';
import { HLClient } from './hlClient';
import { OrderExecutor } from './orderExecutor';
import { PositionRegistry } from './positionRegistry';
import { StatsTracker } from './statsTracker';
import { getLogger } from '../utils/logger';
import { KeyedQueue } from '../utils/keyedQueue';
import { aggressiveBuyPrice, aggressiveSellPrice, pctDiff } from '../utils/math';

/** Warn when our size differs from the expected scaled size by more than this %. */
const DRIFT_THRESHOLD_PCT = 5;

/**
 * Periodic safety net. Compares our managed positions against the target's
 * (scaled) and closes anything the target has already exited — the backstop for
 * missed fills or WebSocket reconnects. Also warns on size drift.
 */
export class Reconciler {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly config: BotConfig,
    private readonly client: HLClient,
    private readonly executor: OrderExecutor,
    private readonly registry: PositionRegistry,
    private readonly stats: StatsTracker,
    private readonly queue: KeyedQueue,
  ) {}

  start(): void {
    this.running = true;
    this.timer = setInterval(() => {
      if (!this.running) return;
      void this.runOnce().catch((err) => {
        getLogger().error('Reconciliation error', {
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }, this.config.reconcileIntervalMs);
    getLogger().info(`Reconciliation scheduled every ${this.config.reconcileIntervalMs / 1000}s`);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
  }

  private async runOnce(): Promise<void> {
    const logger = getLogger();

    const [targetPositions, ourPositions] = await Promise.all([
      this.client.getPositions(this.config.targetTrader),
      this.client.getPositions(this.client.walletAddress),
    ]);

    const targetMap = new Map(targetPositions.map((p) => [p.coin, p]));
    const ourMap = new Map(ourPositions.map((p) => [p.coin, p]));

    for (const coin of this.registry.list()) {
      const ourPos = ourMap.get(coin);
      if (!ourPos) {
        // We're already flat — stop managing it.
        this.registry.remove(coin);
        continue;
      }

      if (!targetMap.has(coin)) {
        await this.closeDrifted(coin, ourPos.szi, ourPos.leverage.value);
      } else {
        const targetPos = targetMap.get(coin)!;
        const expected = Math.abs(parseFloat(targetPos.szi)) * this.config.sizeMultiplier;
        const actual = Math.abs(parseFloat(ourPos.szi));
        const drift = pctDiff(actual, expected);
        if (drift > DRIFT_THRESHOLD_PCT) {
          logger.warn(
            `[reconcile] ${coin} size drift ${drift.toFixed(1)}%: ` +
              `expected ~${expected.toFixed(4)}, have ${actual.toFixed(4)}`,
          );
        }
      }
    }

    const accountValue = await this.client.getAccountValue();
    const s = this.stats.snapshot();
    logger.info(
      `[reconcile] Account=$${accountValue.toFixed(2)} | ` +
        `Copied=${s.tradesCopied} Failed=${s.tradesFailed} Skipped=${s.tradeSkipped} | ` +
        `Managed: [${this.registry.list().join(', ') || 'none'}]`,
    );
  }

  /** Close a position the target has exited but we still hold. */
  private async closeDrifted(coin: string, szi: string, leverage: number): Promise<void> {
    const logger = getLogger();
    logger.warn(`[reconcile] Target exited ${coin} but we still hold it — closing...`);

    await this.queue.run(coin, async () => {
      const asset = this.client.getAsset(coin);
      if (!asset) return;

      const size = parseFloat(szi);
      if (size === 0) {
        this.registry.remove(coin);
        return;
      }

      const isLong = size > 0;
      const mid = await this.client.getMidPrice(coin).catch(() => 0);
      if (mid === 0) return;

      // Double the slippage buffer — this is a safety close, we want it filled.
      const price = isLong
        ? aggressiveSellPrice(mid, this.config.slippageBps * 2)
        : aggressiveBuyPrice(mid, this.config.slippageBps * 2);

      const result = await this.executor.placeOrder({
        coin,
        assetIndex: asset.index,
        isBuy: !isLong,
        size: Math.abs(size),
        price,
        isReduceOnly: true,
        leverage,
        reason: 'reconcile-close',
      });

      if (result.success) {
        this.registry.remove(coin);
        this.stats.recordCopied(coin);
      } else {
        this.stats.recordFailed();
      }
    });
  }
}
