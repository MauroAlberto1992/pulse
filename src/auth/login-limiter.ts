/**
 * Global (not per-IP) failed-login limit: there is one account, so any burst of failures is an
 * attack on it. MAX_FAILURES per WINDOW_MS, then locked until the window passes.
 */
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

export class LoginLimiter {
  private failures: number[] = [];

  isLocked(nowMs = Date.now()): boolean {
    this.failures = this.failures.filter(at => nowMs - at < WINDOW_MS);
    return this.failures.length >= MAX_FAILURES;
  }

  recordFailure(nowMs = Date.now()): void {
    this.failures.push(nowMs);
  }

  reset(): void {
    this.failures = [];
  }
}
