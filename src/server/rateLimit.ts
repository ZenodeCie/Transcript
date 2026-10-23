interface Bucket {
  tokens: number
  updatedAt: number
}

export class TokenBucket {
  private readonly buckets = new Map<string, Bucket>()
  private readonly rate: number
  private readonly burst: number

  constructor(ratePerMinute: number) {
    this.rate = ratePerMinute
    this.burst = Math.max(ratePerMinute, 10)
  }

  take(key: string): { ok: boolean; retryAfter: number } {
    const now = Date.now()
    const bucket = this.buckets.get(key) ?? { tokens: this.burst, updatedAt: now }
    const elapsed = now - bucket.updatedAt
    bucket.tokens = Math.min(this.burst, bucket.tokens + (elapsed * this.rate) / 60_000)
    bucket.updatedAt = now

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      this.buckets.set(key, bucket)
      return { ok: true, retryAfter: 0 }
    }

    this.buckets.set(key, bucket)
    const missing = 1 - bucket.tokens
    const retryAfterMs = Math.ceil((missing * 60_000) / this.rate)
    return { ok: false, retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)) }
  }

  cleanup(maxAgeMs = 10 * 60_000): void {
    const now = Date.now()
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.updatedAt > maxAgeMs) this.buckets.delete(key)
    }
  }
}
