/** Fixed-window counter per key, held in memory. Enough for one process; swap for a shared store when scaling out. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

  allow(key: string, now: number): boolean {
    const entry = this.hits.get(key);
    if (!entry || now >= entry.resetAt) {
      // Opportunistic cleanup keeps the map from growing without a timer.
      if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (now >= v.resetAt) this.hits.delete(k);
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    return ++entry.count <= this.limit;
  }
}
