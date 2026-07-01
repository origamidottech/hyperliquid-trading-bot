/**
 * Serializes async tasks per key.
 *
 * Tasks submitted with the same key run strictly one-at-a-time, in submission
 * order. Tasks with different keys run concurrently. This is the primitive that
 * prevents two operations on the *same coin* (e.g. a live fill, a reconcile
 * close, and a stop-loss close arriving at once) from interleaving and
 * double-opening or over-closing a position.
 */
export class KeyedQueue {
  private readonly tails = new Map<string, Promise<void>>();

  /**
   * Run `task` after any previously-queued task for `key` has settled.
   * Returns the task's result (rejections propagate to the caller, but never
   * block subsequent tasks for the same key).
   */
  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();

    const result = prev.then(() => task());

    // The next task waits for this one to settle, regardless of outcome.
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tail);

    // Drop the entry once drained so the map doesn't grow without bound.
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });

    return result;
  }

  /** Number of keys with in-flight or queued work (diagnostics only). */
  get activeKeys(): number {
    return this.tails.size;
  }
}
