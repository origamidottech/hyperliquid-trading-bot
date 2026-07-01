import { edgeFromReturns, kellyStakeFromReturns } from '@zscdao/kelly';
import { KellyConfig, TraderFill } from '../types';
import { getLogger } from '../utils/logger';

/**
 * Bankroll-aware position sizing via the Kelly criterion (`@zscdao/kelly`).
 *
 * The bot cannot know its own forward edge, but it *can* observe the target
 * trader's realised results. Every time the target closes (part of) a position,
 * we record their return on the closed notional. Once enough samples have
 * accumulated, {@link edgeFromReturns} estimates `{ winProbability, payoffRatio }`
 * and {@link kellyStakeFromReturns} converts our account value into the
 * fractional-Kelly stake for the next copy.
 *
 * The suggested stake is used as a *cap* on the mirrored size (see
 * FillProcessor) — Kelly only ever shrinks a copy when the observed edge is
 * thin, it never levers us beyond what the mirror would open. Guard rails
 * (fractional Kelly + `maxFraction`) are enforced inside the module.
 */
export class KellySizer {
  /** Rolling window of the target's most-recent per-trade returns (fraction of notional). */
  private readonly returns: number[] = [];

  constructor(private readonly config: KellyConfig) {}

  get enabled(): boolean {
    return this.config.enabled;
  }

  get sampleSize(): number {
    return this.returns.length;
  }

  /** True once we have enough history for Kelly to engage. */
  get ready(): boolean {
    return this.config.enabled && this.returns.length >= this.config.minSamples;
  }

  /**
   * Record a realised per-trade return of the target trader, as a fraction of
   * the notional that was closed (e.g. `0.05` = +5%, `-0.02` = -2%).
   *
   * Zero and non-finite returns carry no edge information and are ignored.
   */
  record(returnFraction: number): void {
    if (!Number.isFinite(returnFraction) || returnFraction === 0) return;

    this.returns.push(returnFraction);
    if (this.returns.length > this.config.window) {
      this.returns.shift();
    }
  }

  /**
   * Record a target close from its raw fill fields. Return on closed notional is
   * `closedPnl / (closeSize × closePrice)`. Returns silently if inputs are unusable.
   */
  recordClose(closedPnl: number, closeSize: number, closePrice: number): void {
    const notional = Math.abs(closeSize) * closePrice;
    if (!(notional > 0)) return;
    this.record(closedPnl / notional);
  }

  /**
   * Suggested stake in USD notional for the next copy, or `null` when Kelly is
   * disabled or still warming up (caller should fall back to mirror sizing).
   *
   * Returns `0` when the observed edge is non-positive — i.e. don't copy this open.
   */
  suggestNotional(bankroll: number, maxStake: number): number | null {
    if (!this.ready) return null;
    if (!(bankroll > 0)) return 0;

    return kellyStakeFromReturns(this.returns, {
      bankroll,
      fraction: this.config.fraction,
      maxFraction: this.config.maxFraction,
      maxStake,
    });
  }

  /**
   * Seed the edge estimate from a batch of the target's historical fills so
   * Kelly can engage without waiting for `minSamples` live closes. Fills are
   * expected most-recent-first (as the API returns them); we replay them
   * oldest-first and keep only the closes within the window.
   */
  warmUp(fills: TraderFill[]): void {
    const closes = fills
      .filter((f) => f.dir.toLowerCase().includes('close'))
      .slice(0, this.config.window)
      .reverse();

    for (const f of closes) {
      this.recordClose(parseFloat(f.closedPnl), parseFloat(f.sz), parseFloat(f.px));
    }

    if (this.returns.length > 0) {
      getLogger().info(
        `Kelly warm-up: seeded ${this.returns.length} target trade(s) ` +
          `(${this.ready ? 'ready' : `need ${this.config.minSamples}`}).`,
      );
    }
  }

  /** Log the current edge estimate — useful at startup and for debugging. */
  logEdge(): void {
    const edge = edgeFromReturns(this.returns);
    getLogger().debug(
      `Kelly edge: p=${(edge.winProbability * 100).toFixed(1)}% ` +
        `b=${edge.payoffRatio.toFixed(2)} (n=${edge.sampleSize})`,
    );
  }
}
