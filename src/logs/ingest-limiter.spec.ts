import { IngestLimiter } from './ingest-limiter';

describe('IngestLimiter', () => {
  it('allows up to the cap per minute, then resets', () => {
    const limiter = new IngestLimiter(10);
    expect(limiter.tryConsume(6, 0)).toBe(true);
    expect(limiter.tryConsume(5, 1000)).toBe(false);
    expect(limiter.tryConsume(4, 2000)).toBe(true);
    expect(limiter.tryConsume(10, 61_000)).toBe(true);
  });
});
