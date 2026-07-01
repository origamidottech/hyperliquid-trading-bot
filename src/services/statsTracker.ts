import { BotStats } from '../types';

/**
 * Accumulates lifetime counters for the bot run. Wrapping the raw counters in a
 * small class keeps mutation in one place and hands out an immutable snapshot
 * for display.
 */
export class StatsTracker {
  private readonly startTime = new Date();
  private tradesCopied = 0;
  private tradesFailed = 0;
  private tradesSkipped = 0;
  private readonly copiedCoins = new Set<string>();

  recordCopied(coin: string): void {
    this.tradesCopied++;
    this.copiedCoins.add(coin);
  }

  recordFailed(): void {
    this.tradesFailed++;
  }

  recordSkipped(): void {
    this.tradesSkipped++;
  }

  snapshot(): Readonly<BotStats> {
    return {
      startTime: this.startTime,
      tradesCopied: this.tradesCopied,
      tradesFailed: this.tradesFailed,
      tradeSkipped: this.tradesSkipped,
      copiedCoins: new Set(this.copiedCoins),
    };
  }
}
