import {
  isQueryOnly,
  RailwayReader,
  ReadOnlyViolation,
  VercelReader,
} from './readonly-clients';

const ok = (body: unknown) =>
  jest.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

describe('read-only clients (never delete or change anything)', () => {
  it.each([
    ['query { projects { edges { node { id } } } }', true],
    [
      'query Metrics($e: String!) { metrics(environmentId: $e) { measurement } }',
      true,
    ],
    ['{ projects { edges { node { id } } } }', true],
    ['mutation { serviceDelete(id: "x") }', false],
    ['query { a } mutation { serviceDelete(id: "x") }', false],
    ['  MUTATION { deploymentRemove(id: "x") }', false],
    ['subscription { deploymentLogs(deploymentId: "x") { message } }', false],
    ['query { a(name: "mutation") }', true],
    ['# mutation in a comment\nquery { a }', true],
    ['serviceDelete(id: "x")', false],
  ])('isQueryOnly(%j) is %s', (document, expected) => {
    expect(isQueryOnly(document)).toBe(expected);
  });

  it('Railway: refuses a mutation without making any request', async () => {
    const fetchFn = ok({ data: {} });
    const railway = new RailwayReader('t', fetchFn as unknown as typeof fetch);
    await expect(
      railway.query('mutation { projectDelete(id: "x") }'),
    ).rejects.toBeInstanceOf(ReadOnlyViolation);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('Railway: sends queries and returns data', async () => {
    const fetchFn = ok({ data: { projects: [] } });
    const railway = new RailwayReader('t', fetchFn as unknown as typeof fetch);
    await expect(railway.query('query { projects }')).resolves.toEqual({
      projects: [],
    });
  });

  it('Railway: surfaces API errors', async () => {
    const fetchFn = ok({ errors: [{ message: 'Not Authorized' }] });
    const railway = new RailwayReader('t', fetchFn as unknown as typeof fetch);
    await expect(railway.query('query { me { id } }')).rejects.toThrow(
      'Not Authorized',
    );
  });

  it('Vercel: only GET, only allow-listed paths', async () => {
    const fetchFn = jest.fn<Promise<Response>, [string, RequestInit]>(
      async () => new Response('{}', { status: 200 }),
    );
    const vercel = new VercelReader('t', fetchFn as unknown as typeof fetch);
    await vercel.get('/v6/deployments', { projectId: 'p' });
    expect(fetchFn.mock.calls[0][1].method).toBe('GET');
    await expect(vercel.get('/v13/deployments/x')).rejects.toBeInstanceOf(
      ReadOnlyViolation,
    );
    await expect(vercel.get('/v9/projects/p/env')).rejects.toBeInstanceOf(
      ReadOnlyViolation,
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('there is no method to write: the classes expose reads only', () => {
    const railwayMethods = Object.getOwnPropertyNames(RailwayReader.prototype);
    const vercelMethods = Object.getOwnPropertyNames(VercelReader.prototype);
    expect(railwayMethods.sort()).toEqual(['constructor', 'query']);
    expect(vercelMethods.sort()).toEqual(['constructor', 'get']);
  });
});
