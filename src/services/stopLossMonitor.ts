import { BotConfig, PerpetualsPosition } from '../types';
import { HLClient } from './hlClient';
import { OrderExecutor } from './orderExecutor';
import { PositionRegistry } from './positionRegistry';
import { getLogger } from '../utils/logger';
import { KeyedQueue } from '../utils/keyedQueue';
import { aggressiveBuyPrice, aggressiveSellPrice } from '../utils/math';

/**
 * Per-position stop-loss (STOP_LOSS_PERCENT).
 *
 * On each tick it checks every managed position's mark price against its entry.
 * If price has moved STOP_LOSS_PERCENT against the position, it closes the whole
 * position with a reduce-only IOC order. Disabled when STOP_LOSS_PERCENT <= 0.
 */
export class StopLossMonitor {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly config: BotConfig,
    private readonly client: HLClient,
    private readonly executor: OrderExecutor,
    private readonly registry: PositionRegistry,
    private readonly queue: KeyedQueue,
  ) {}

  get enabled(): boolean {
    return this.config.stopLossPercent > 0;
  }

  start(): void {
    if (!this.enabled) return;
    this.running = true;
    this.timer = setInterval(() => {
      if (!this.running) return;
      void this.runOnce().catch((err) => {
        getLogger().error('Stop-loss check error', {
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }, this.config.stopLossCheckIntervalMs);
    getLogger().info(
      `Stop-loss active at ${this.config.stopLossPercent}% ` +
        `(checked every ${this.config.stopLossCheckIntervalMs / 1000}s)`,
    );
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
  }

  private async runOnce(): Promise<void> {
    const managed = this.registry.list();
    if (managed.length === 0) return;

    const [ourPositions, mids] = await Promise.all([
      this.client.getPositions(this.client.walletAddress),
      this.client.getAllMids(),
    ]);
    const ourMap = new Map(ourPositions.map((p) => [p.coin, p]));

    for (const coin of managed) {
      const pos = ourMap.get(coin);
      if (!pos) {
        this.registry.remove(coin);
        continue;
      }

      const mark = parseFloat(mids[coin] ?? '0');
      if (mark === 0) continue;

      if (this.hasBreachedStop(pos, mark)) {
        await this.closePosition(pos, mark);
      }
    }
  }

  /** True when price has moved STOP_LOSS_PERCENT or more against the position. */
  private hasBreachedStop(pos: PerpetualsPosition, mark: number): boolean {
    const entry = parseFloat(pos.entryPx);
    if (entry === 0) return false;

    const isLong = parseFloat(pos.szi) > 0;
    // Signed adverse move as a percentage of entry.
    const lossPct = isLong
      ? ((entry - mark) / entry) * 100
      : ((mark - entry) / entry) * 100;

    return lossPct >= this.config.stopLossPercent;
  }

  private async closePosition(pos: PerpetualsPosition, mark: number): Promise<void> {
    const logger = getLogger();
    const isLong = parseFloat(pos.szi) > 0;

    logger.warn(
      `⛔ STOP-LOSS ${pos.coin}: mark ${mark} vs entry ${pos.entryPx} ` +
        `(${this.config.stopLossPercent}% breached) — closing`,
    );

    await this.queue.run(pos.coin, async () => {
      const asset = this.client.getAsset(pos.coin);
      if (!asset) return;

      // Re-read inside the lock: a fill/reconcile may have changed the size.
      const current = (await this.client.getPositions(this.client.walletAddress)).find(
        (p) => p.coin === pos.coin,
      );
      if (!current) {
        this.registry.remove(pos.coin);
        return;
      }

      const size = Math.abs(parseFloat(current.szi));
      if (size === 0) {
        this.registry.remove(pos.coin);
        return;
      }

      // Double slippage buffer to guarantee the protective close fills.
      const price = isLong
        ? aggressiveSellPrice(mark, this.config.slippageBps * 2)
        : aggressiveBuyPrice(mark, this.config.slippageBps * 2);

      const result = await this.executor.placeOrder({
        coin: pos.coin,
        assetIndex: asset.index,
        isBuy: !isLong,
        size,
        price,
        isReduceOnly: true,
        leverage: current.leverage.value,
        reason: 'stop-loss',
      });

      if (result.success) this.registry.remove(pos.coin);
    });
  }
}
