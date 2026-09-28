import { evaluate, evaluateService, evaluateWeb, worst } from './infra-rules';
import { ServiceMetrics } from './infra.service';

const now = new Date('2026-09-28T12:00:00Z');
const flat = (value: number, n = 5) =>
  Array.from({ length: n }, (_, i) => ({ ts: i * 60, value }));

function svc(
  overrides: Partial<ServiceMetrics> = {},
  series: Partial<ServiceMetrics['series']> = {},
): ServiceMetrics {
  return {
    project: 'Espion',
    environment: 'production',
    service: 'api_cp',
    series: {
      CPU_USAGE: flat(0.01),
      MEMORY_USAGE_GB: flat(0.16),
      NETWORK_RX_GB: [],
      NETWORK_TX_GB: [],
      ...series,
    },
    lastDeploy: {
      status: 'SUCCESS',
      createdAt: '2026-09-28T11:00:00Z',
      commitMessage: null,
      branch: 'main',
    },
    ...overrides,
  };
}

describe('infra rules', () => {
  it('a quiet, healthy service has no findings', () => {
    expect(evaluateService(svc(), '24h', now)).toEqual([]);
  });

  it('CPU: warn above 50%, problem above 80%, on the average of the last 3 points', () => {
    expect(
      evaluateService(svc({}, { CPU_USAGE: flat(0.6) }), '1h', now)[0].severity,
    ).toBe('warn');
    expect(
      evaluateService(svc({}, { CPU_USAGE: flat(0.9) }), '1h', now)[0].severity,
    ).toBe('problem');
    // one spike among quiet points is averaged away
    const spike = [...flat(0.01, 4), { ts: 999, value: 0.95 }];
    expect(evaluateService(svc({}, { CPU_USAGE: spike }), '1h', now)).toEqual(
      [],
    );
  });

  it('memory: warn above 512 MB, problem above 1 GB', () => {
    expect(
      evaluateService(svc({}, { MEMORY_USAGE_GB: flat(0.6) }), '1h', now)[0],
    ).toMatchObject({
      severity: 'warn',
      message: 'memory at 614 MB',
    });
    expect(
      evaluateService(svc({}, { MEMORY_USAGE_GB: flat(1.2) }), '1h', now)[0]
        .severity,
    ).toBe('problem');
  });

  it('memory growth: only on 24h/7d, current > 2× the lowest', () => {
    const growing = [0.1, 0.12, 0.15, 0.18, 0.25].map((value, i) => ({
      ts: i,
      value,
    }));
    expect(
      evaluateService(svc({}, { MEMORY_USAGE_GB: growing }), '7d', now)[0]
        .message,
    ).toMatch(/grew from 102 MB to 256 MB/);
    expect(
      evaluateService(svc({}, { MEMORY_USAGE_GB: growing }), '1h', now),
    ).toEqual([]);
  });

  it('deploys: failed is a problem, stuck for 15+ min is a warning', () => {
    const failed = svc({
      lastDeploy: {
        status: 'CRASHED',
        createdAt: '2026-09-28T11:59:00Z',
        commitMessage: null,
        branch: null,
      },
    });
    expect(evaluateService(failed, '1h', now)[0].severity).toBe('problem');
    const stuck = svc({
      lastDeploy: {
        status: 'BUILDING',
        createdAt: '2026-09-28T11:30:00Z',
        commitMessage: null,
        branch: null,
      },
    });
    expect(evaluateService(stuck, '1h', now)[0].message).toBe(
      'deploy BUILDING for 30 min',
    );
    const fresh = svc({
      lastDeploy: {
        status: 'BUILDING',
        createdAt: '2026-09-28T11:58:00Z',
        commitMessage: null,
        branch: null,
      },
    });
    expect(evaluateService(fresh, '1h', now)).toEqual([]);
  });

  it('web: production ERROR is a problem, a failed preview is a warning', () => {
    const d = (state: string, target: string | null) => ({
      project: 'espion',
      state,
      target,
      createdAt: 0,
      branch: null,
      commitMessage: null,
    });
    expect(evaluateWeb([d('ERROR', 'production')])[0].severity).toBe('problem');
    expect(
      evaluateWeb([d('ERROR', null), d('READY', 'production')])[0].severity,
    ).toBe('warn');
    expect(evaluateWeb([d('READY', 'production')])).toEqual([]);
  });

  it('summary: unreadable APIs are warnings, problems sort first', () => {
    const findings = evaluate(
      {
        fetchedAt: now,
        railway: [svc({}, { MEMORY_USAGE_GB: flat(1.5) })],
        vercel: { error: 'Forbidden' },
      },
      '1h',
    );
    expect(findings.map(f => f.severity)).toEqual(['problem', 'warn']);
    expect(worst(findings)).toBe('problem');
    expect(worst([])).toBe('ok');
  });
});
