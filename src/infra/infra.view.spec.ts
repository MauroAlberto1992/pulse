import { lineChart } from './charts';
import { infraPage } from './infra.view';

const points = [
  { ts: 0, value: 0.1 },
  { ts: 60, value: 0.2 },
];

function service(overrides = {}) {
  return {
    project: 'Espion',
    environment: 'production',
    service: 'api_cp',
    series: {
      CPU_USAGE: [
        { ts: 0, value: 0.0012 },
        { ts: 60, value: 0.0024 },
      ],
      MEMORY_USAGE_GB: [
        { ts: 0, value: 0.15 },
        { ts: 60, value: 0.16 },
      ],
      NETWORK_RX_GB: [
        { ts: 0, value: 0.00005 },
        { ts: 60, value: 0.00007 },
      ],
      NETWORK_TX_GB: [],
    },
    lastDeploy: {
      status: 'SUCCESS',
      createdAt: '2026-09-28T05:00:00Z',
      commitMessage: '<img src=x onerror=alert(1)> fix',
      branch: 'main',
    },
    ...overrides,
  };
}

describe('lineChart', () => {
  it('draws a polyline per series and says when there is no data', () => {
    const svg = lineChart(
      [{ points, className: 'line-a', label: 'x' }],
      String,
    );
    expect(svg).toContain('<polyline class="line-a"');
    expect(
      lineChart([{ points: [], className: 'line-a', label: 'x' }], String),
    ).toContain('No data');
  });
});

describe('infraPage', () => {
  it('escapes API text, formats units and groups by environment', () => {
    const html = infraPage(
      {
        fetchedAt: new Date(0),
        railway: [
          service(),
          service({ environment: 'staging', service: 'MongoDB' }),
        ],
        vercel: [
          {
            project: 'espion',
            state: 'ERROR',
            target: 'production',
            createdAt: 0,
            branch: 'main',
            commitMessage: '<b>boom</b>',
          },
        ],
      },
      '24h',
    );
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>boom</b>');
    expect(html).toContain('0.24%'); // CPU as share of one vCPU
    expect(html).toContain('164 MB');
    expect(html).toContain('73 KB');
    expect(html.indexOf('>production<')).toBeLessThan(
      html.indexOf('>staging<'),
    );
    expect(html).toContain('class="state down">ERROR');
  });

  it('shows configuration and API errors instead of failing', () => {
    const html = infraPage(
      {
        fetchedAt: new Date(0),
        railway: null,
        vercel: { error: 'Vercel API: Forbidden' },
      },
      '1h',
    );
    expect(html).toContain('Railway is not configured');
    expect(html).toContain('Vercel: Vercel API: Forbidden');
  });
});

describe('infra ranges', () => {
  it('offers 5m to 7d, and every sample rate is one Railway accepts (30 s or more)', () => {
    const { INFRA_RANGES } = jest.requireActual('./infra.service');
    expect(Object.keys(INFRA_RANGES)).toEqual([
      '5m',
      '15m',
      '30m',
      '1h',
      '6h',
      '24h',
      '7d',
    ]);
    for (const range of Object.values(INFRA_RANGES) as Array<{
      sampleSeconds: number;
    }>) {
      expect(range.sampleSeconds).toBeGreaterThanOrEqual(30);
    }
    const html = infraPage(
      { fetchedAt: new Date(0), railway: [], vercel: [] },
      '15m',
    );
    expect(html).toContain('href="/infra?range=5m"');
    expect(html).toContain('href="/infra?range=15m" class="active"');
  });
});
