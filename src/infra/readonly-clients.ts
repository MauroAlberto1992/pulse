/**
 * The ONLY code that talks to Railway and Vercel with pulse's tokens, and it can only read.
 *
 * ⛔ Hard rule (see api_cp/docs/PULSE_OBSERVABILITY_PLAN.md): nothing is ever deleted or changed on
 * Railway or Vercel through these tokens. Neither platform offers read-only tokens, so the
 * guarantee lives here: Railway accepts GraphQL queries only (any mutation or subscription is
 * refused before a request is made), Vercel accepts GET only, on an allow-list of paths.
 * readonly-clients.spec.ts enforces both. Don't add a write path here; changes are made by hand.
 */

const RAILWAY_URL = 'https://backboard.railway.com/graphql/v2';
const VERCEL_URL = 'https://api.vercel.com';
const VERCEL_ALLOWED_PATHS = ['/v6/deployments', '/v9/projects'];

export class ReadOnlyViolation extends Error {}

/** True only for a GraphQL document made of queries (named, anonymous or shorthand `{ … }`). */
export function isQueryOnly(document: string): boolean {
  // Strip comments and string literals so a word inside them can't fool the check.
  const code = document
    .replace(/#[^\n]*/g, '')
    .replace(/"""[\s\S]*?"""/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
  if (/\b(mutation|subscription)\b/i.test(code)) {
    return false;
  }
  const trimmed = code.trim();
  return trimmed.startsWith('{') || /^query\b/.test(trimmed);
}

export class RailwayReader {
  constructor(
    private readonly token: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async query<T>(
    document: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    if (!isQueryOnly(document)) {
      throw new ReadOnlyViolation('Railway: only GraphQL queries are allowed');
    }
    const response = await this.fetchFn(RAILWAY_URL, {
      method: 'POST', // GraphQL transport; the document itself is checked to be a query above
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query: document, variables }),
      signal: AbortSignal.timeout(15000),
    });
    const body = (await response.json()) as {
      data?: T;
      errors?: Array<{ message?: string }>;
    };
    if (response.ok === false || body.errors !== undefined) {
      throw new Error(
        `Railway API: ${body.errors?.[0]?.message ?? `HTTP ${response.status}`}`,
      );
    }
    return body.data as T;
  }
}

export class VercelReader {
  constructor(
    private readonly token: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    if (!VERCEL_ALLOWED_PATHS.includes(path)) {
      throw new ReadOnlyViolation(`Vercel: path not allowed: ${path}`);
    }
    const url = `${VERCEL_URL}${path}?${new URLSearchParams(params).toString()}`;
    const response = await this.fetchFn(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(15000),
    });
    const body = (await response.json()) as T & {
      error?: { message?: string };
    };
    if (response.ok === false) {
      throw new Error(
        `Vercel API: ${body.error?.message ?? `HTTP ${response.status}`}`,
      );
    }
    return body;
  }
}
