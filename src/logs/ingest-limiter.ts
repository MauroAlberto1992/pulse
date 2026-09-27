/**
 * Caps stored rows per minute across all senders, so an error loop in an app can't fill pulse's
 * database. Over the cap, batches get a 429 and the shipper counts them as dropped.
 */
export class IngestLimiter {
  private windowStart = 0;
  private count = 0;

  constructor(private readonly maxPerMinute = 5000) {}

  tryConsume(rows: number, nowMs = Date.now()): boolean {
    if (nowMs - this.windowStart >= 60_000) {
      this.windowStart = nowMs;
      this.count = 0;
    }
    if (this.count + rows > this.maxPerMinute) {
      return false;
    }
    this.count += rows;
    return true;
  }
}
