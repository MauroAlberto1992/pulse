import { Target } from '../config';

export interface ProbeResult {
  ok: boolean;
  statusCode: number | null;
  latencyMs: number;
  /** Pulse's own short label, never raw response text. */
  error: string | null;
}

/**
 * One GET against a target. A 2xx is up. For deep targets a non-2xx body from api_cp's
 * /api/health/deep is read only to name which dependencies are down ("down: mongo, storage").
 */
export async function probe(
  target: Target,
  timeoutMs: number,
  healthCheckSecret: string | null,
  fetchFn: typeof fetch = fetch,
): Promise<ProbeResult> {
  const started = Date.now();
  const headers: Record<string, string> = { 'user-agent': 'pulse-monitor' };
  if (target.deep && healthCheckSecret !== null) {
    headers['x-health-secret'] = healthCheckSecret;
  }

  try {
    const response = await fetchFn(target.url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latencyMs = Date.now() - started;
    if (response.ok) {
      await response.body?.cancel();
      return { ok: true, statusCode: response.status, latencyMs, error: null };
    }
    let error = `HTTP ${response.status}`;
    if (target.deep) {
      const down = await downDependencies(response);
      if (down.length !== 0) {
        error = `down: ${down.join(', ')}`;
      }
    } else {
      await response.body?.cancel();
    }
    return { ok: false, statusCode: response.status, latencyMs, error };
  } catch (caught) {
    const name = (caught as { name?: string })?.name;
    return {
      ok: false,
      statusCode: null,
      latencyMs: Date.now() - started,
      error: name === 'TimeoutError' ? 'timeout' : 'unreachable',
    };
  }
}

async function downDependencies(response: Response): Promise<string[]> {
  try {
    const body = (await response.json()) as {
      checks?: Record<string, { state?: string }>;
    };
    return Object.entries(body.checks ?? {})
      .filter(([, check]) => check?.state === 'down')
      .map(([name]) => name.replace(/[^\w-]/g, '').slice(0, 32));
  } catch {
    return [];
  }
}
