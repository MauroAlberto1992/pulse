import { parseBatch } from './ingest';

const now = new Date('2026-09-28T10:00:00Z');
const valid = {
  service: 'api',
  environment: 'production',
  entries: [
    {
      timestamp: '2026-09-28T09:59:58Z',
      level: 'error',
      context: 'PatientsService',
      message: 'NIF 123456789 rejected for x@y.pt',
      stack: 'Error\n    at a (b.ts:1)',
    },
  ],
};

describe('parseBatch', () => {
  it('accepts a valid batch and re-redacts it', () => {
    const result = parseBatch(valid, now);
    expect(result).toEqual({
      entries: [
        {
          timestamp: new Date('2026-09-28T09:59:58Z'),
          service: 'api',
          environment: 'production',
          level: 'error',
          context: 'PatientsService',
          message: 'NIF [number] rejected for [email]',
          stack: 'Error\n    at a (b.ts:1)',
        },
      ],
    });
  });

  it('stamps missing or far-off timestamps with the arrival time', () => {
    const result = parseBatch(
      {
        ...valid,
        entries: [{ level: 'warn', message: 'x', timestamp: '1999-01-01' }],
      },
      now,
    );
    expect('entries' in result && result.entries[0].timestamp).toEqual(now);
  });

  it('turns dropped lines into a visible warning', () => {
    const result = parseBatch({ ...valid, entries: [], dropped: 12 }, now);
    expect('entries' in result && result.entries[0].message).toMatch(
      /^12 log lines were dropped/,
    );
  });

  it.each([
    [null, /JSON object/],
    [{ ...valid, service: 'API!' }, /service/],
    [{ ...valid, environment: '' }, /environment/],
    [
      { ...valid, entries: new Array(101).fill(valid.entries[0]) },
      /at most 100/,
    ],
    [{ ...valid, entries: [{ level: 'info', message: 'x' }] }, /level/],
    [{ ...valid, entries: [{ level: 'error', message: 5 }] }, /message/],
  ])('rejects %#', (body, error) => {
    const result = parseBatch(body, now);
    expect('error' in result && result.error).toMatch(error);
  });
});
