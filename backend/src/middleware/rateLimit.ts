/**
 * Minimal in-memory token-bucket rate limiter (plan G6). The MIS runs as one process,
 * so memory is the right store. If that ever changes, this needs Redis like presence does.
 */
interface Bucket {
  tokens: number;
  updated: number;
}

export class TokenBucket {
  private buckets = new Map<string, Bucket>();
  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number,
    private readonly maxKeys = 50_000,
  ) {}

  /** Take `cost` tokens for `key`. Returns false when the bucket is empty. */
  take(key: string, cost = 1, now = Date.now()): boolean {
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.capacity, updated: now };
      this.buckets.set(key, b);
      if (this.buckets.size > this.maxKeys) this.prune(now);
    } else {
      b.tokens = Math.min(this.capacity, b.tokens + (now - b.updated) * this.refillPerMs);
      b.updated = now;
    }
    if (b.tokens < cost) return false;
    b.tokens -= cost;
    return true;
  }

  private prune(now: number) {
    for (const [k, b] of this.buckets)
      if (b.tokens + (now - b.updated) * this.refillPerMs >= this.capacity) this.buckets.delete(k);
    while (this.buckets.size > this.maxKeys) this.buckets.delete(this.buckets.keys().next().value as string);
  }

  reset() {
    this.buckets.clear();
  }
}

/** n requests per minute, with bursts up to n. */
export const perMinute = (n: number) => new TokenBucket(n, n / 60_000);

/** Express middleware: limit by IP (requires `trust proxy` for real client IPs). */
export const rateLimitByIp = (bucket: TokenBucket, message = "Too many requests, please slow down.") =>
  (req: any, res: any, next: any) => {
    if (process.env.NODE_ENV === "test" && !req.get("X-Test-Rate-Limit")) return next();
    const key = String(req.ip || req.socket?.remoteAddress || "unknown");
    if (!bucket.take(key)) {
      res.set("Retry-After", "60");
      return res.status(429).json({ success: false, message });
    }
    next();
  };
