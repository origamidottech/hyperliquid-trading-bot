/**
 * Tracks the set of coins whose positions this bot actively manages.
 *
 * Only coins we opened as copies live here — this is what keeps the bot from
 * touching positions a user opened manually outside the bot. Shared by the
 * fill processor, reconciler, and stop-loss monitor.
 */
export class PositionRegistry {
  private readonly coins = new Set<string>();

  add(coin: string): void {
    this.coins.add(coin);
  }

  remove(coin: string): void {
    this.coins.delete(coin);
  }

  has(coin: string): boolean {
    return this.coins.has(coin);
  }

  list(): string[] {
    return [...this.coins];
  }

  get size(): number {
    return this.coins.size;
  }
}
