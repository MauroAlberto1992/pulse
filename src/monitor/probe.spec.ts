import { probe } from './probe';

const web = { name: 'web', url: 'https://example.test', deep: false };
const api = {
  name: 'api',
  url: 'https://api.test/api/health/deep',
  deep: true,
};

function fakeFetch(status: number, body: unknown = {}) {
  return jest.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe('probe', () => {
  it('treats 2xx as up', async () => {
    const result = await probe(web, 1000, null, fakeFetch(200) as typeof fetch);
    expect(result).toMatchObject({ ok: true, statusCode: 200, error: null });
  });

  it('sends the health secret only to deep targets', async () => {
    const fetchFn = fakeFetch(200);
    await probe(api, 1000, 's3cret', fetchFn as typeof fetch);
    await probe(web, 1000, 's3cret', fetchFn as typeof fetch);
    const headers = fetchFn.mock.calls.map(
      call => (call as unknown as [string, RequestInit])[1].headers,
    );
    expect(headers[0]).toMatchObject({ 'x-health-secret': 's3cret' });
    expect(headers[1]).not.toHaveProperty('x-health-secret');
  });

  it('names the down dependencies of a deep target', async () => {
    const fetchFn = fakeFetch(503, {
      status: 'degraded',
      checks: {
        postgres: { state: 'up' },
        mongo: { state: 'down' },
        storage: { state: 'down' },
      },
    });
    const result = await probe(api, 1000, 's3cret', fetchFn as typeof fetch);
    expect(result).toMatchObject({
      ok: false,
      statusCode: 503,
      error: 'down: mongo, storage',
    });
  });

  it('labels a plain failure by status code', async () => {
    const result = await probe(web, 1000, null, fakeFetch(502) as typeof fetch);
    expect(result.error).toBe('HTTP 502');
  });

  it('labels timeouts and network errors without their message', async () => {
    const timeout = jest.fn(async () => {
      throw Object.assign(new Error('x'), { name: 'TimeoutError' });
    });
    const refused = jest.fn(async () => {
      throw new TypeError('connect ECONNREFUSED 10.0.0.1:5432');
    });
    expect((await probe(web, 1000, null, timeout as typeof fetch)).error).toBe(
      'timeout',
    );
    expect((await probe(web, 1000, null, refused as typeof fetch)).error).toBe(
      'unreachable',
    );
  });
});
