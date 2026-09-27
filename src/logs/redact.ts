// Same rules as api_cp/src/logger/redact.ts and the web copy; keep them in sync.
/**
 * Masks personal data in a log line. The apps redact before sending; pulse runs it again on
 * ingest in case a sender didn't. Best effort: it catches structured identifiers (emails, phone
 * numbers, NIF / SNS numbers and other long digit runs, IBANs, tokens, secrets in key=value form),
 * not free-text names, so never log a patient's name on purpose.
 */
// A date ("2026-09-27", optionally followed by the hour) looks like a digit run; keep it.
const keepDates = (match: string): string =>
  /^\d{4}-\d{2}-\d{2}(?:\s\d{1,2})?$/.test(match) ? match : '[number]';

const PATTERNS: Array<[RegExp, string | ((match: string) => string)]> = [
  // JWTs and Bearer tokens first, before their digits are caught as numbers.
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]'],
  [/\b(bearer)\s+[\w.~+/-]+=*/gi, '$1 [token]'],
  // "password": "...", token=..., secret: ...
  [
    /\b(pass(?:word)?|pwd|token|secret|api[-_]?key|authorization|cookie)(["']?\s*[:=]\s*["']?)[^\s"',;&}]+/gi,
    '$1$2[redacted]',
  ],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]'],
  [/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b/g, '[iban]'],
  [/(?:\+|\b00)\d{1,3}[\s-]?\d{2,4}[\s-]?\d{3}[\s-]?\d{3,4}\b/g, '[phone]'],
  // NIF, SNS number, PT phone numbers, card numbers: any run of 9+ digits, spaces allowed.
  [/\b\d(?:[\s-]?\d){8,}\b/g, keepDates],
];

export function redact(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PATTERNS) {
    out =
      typeof replacement === 'string'
        ? out.replace(pattern, replacement)
        : out.replace(pattern, replacement);
  }
  return out;
}
