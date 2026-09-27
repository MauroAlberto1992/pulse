import { redact } from './redact';

export interface IngestEntry {
  timestamp: Date;
  service: string;
  environment: string;
  level: 'warn' | 'error';
  context: string | null;
  message: string;
  stack: string | null;
}

export const MAX_ENTRIES_PER_BATCH = 100;
const MAX_MESSAGE = 4000;
const MAX_STACK = 8000;
const NAME = /^[a-z][a-z0-9-]{0,31}$/;
// Accept app clocks up to a day off; anything else is stamped with the arrival time.
const MAX_SKEW_MS = 86_400_000;

/**
 * Validates one batch from an app's log shipper. Returns the rows to store (re-redacted: pulse
 * doesn't trust every sender to have done it) or an error message for a 400. `dropped` lines the
 * sender couldn't deliver earlier become one warning row, so gaps are visible in the viewer.
 */
export function parseBatch(
  body: unknown,
  now: Date = new Date(),
): { entries: IngestEntry[] } | { error: string } {
  if (typeof body !== 'object' || body === null) {
    return { error: 'body must be a JSON object' };
  }
  const { service, environment, entries, dropped } = body as Record<
    string,
    unknown
  >;
  if (typeof service !== 'string' || !NAME.test(service)) {
    return { error: 'service must be a short lowercase name' };
  }
  if (typeof environment !== 'string' || !NAME.test(environment)) {
    return { error: 'environment must be a short lowercase name' };
  }
  if (!Array.isArray(entries) || entries.length > MAX_ENTRIES_PER_BATCH) {
    return {
      error: `entries must be an array of at most ${MAX_ENTRIES_PER_BATCH}`,
    };
  }

  const rows: IngestEntry[] = [];
  for (const raw of entries) {
    const entry = (raw ?? {}) as Record<string, unknown>;
    if (entry.level !== 'warn' && entry.level !== 'error') {
      return { error: 'level must be "warn" or "error"' };
    }
    if (typeof entry.message !== 'string') {
      return { error: 'message must be a string' };
    }
    const parsed =
      typeof entry.timestamp === 'string' ? new Date(entry.timestamp) : null;
    const timestamp =
      parsed !== null &&
      Number.isNaN(parsed.getTime()) === false &&
      Math.abs(parsed.getTime() - now.getTime()) < MAX_SKEW_MS
        ? parsed
        : now;
    rows.push({
      timestamp,
      service,
      environment,
      level: entry.level,
      context:
        typeof entry.context === 'string' ? entry.context.slice(0, 200) : null,
      message: redact(entry.message).slice(0, MAX_MESSAGE),
      stack:
        typeof entry.stack === 'string'
          ? redact(entry.stack).slice(0, MAX_STACK)
          : null,
    });
  }

  if (typeof dropped === 'number' && Number.isInteger(dropped) && dropped > 0) {
    rows.push({
      timestamp: now,
      service,
      environment,
      level: 'warn',
      context: 'LogShipper',
      message: `${dropped} log lines were dropped by the ${service} shipper (pulse unreachable or buffer full)`,
      stack: null,
    });
  }
  return { entries: rows };
}
