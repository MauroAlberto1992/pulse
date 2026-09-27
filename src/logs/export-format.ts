import { LogEntry } from '@prisma/client';

export type ExportFormat = 'csv' | 'json';

export const CSV_HEADER =
  'timestamp,service,environment,level,context,message,stack\n';

/**
 * RFC 4180 quoting. A cell starting with = + - @ (or tab/CR) is prefixed with ' so Excel or
 * Numbers never runs it as a formula: log text comes from the apps, not from us.
 */
export function csvCell(value: string | null): string {
  if (value === null) {
    return '';
  }
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvRow(row: LogEntry): string {
  return (
    [
      row.timestamp.toISOString(),
      row.service,
      row.environment,
      row.level,
      row.context,
      row.message,
      row.stack,
    ]
      .map(csvCell)
      .join(',') + '\n'
  );
}

/** One JSON object per line (NDJSON): streams, and jq / Datadog / BigQuery read it directly. */
export function jsonRow(row: LogEntry): string {
  return (
    JSON.stringify({
      timestamp: row.timestamp.toISOString(),
      service: row.service,
      environment: row.environment,
      level: row.level,
      context: row.context,
      message: row.message,
      stack: row.stack,
    }) + '\n'
  );
}

export function exportFilename(
  range: string,
  format: ExportFormat,
  now = new Date(),
): string {
  const stamp = now.toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return `pulse-logs-${range}-${stamp}.${format === 'csv' ? 'csv' : 'ndjson'}`;
}
