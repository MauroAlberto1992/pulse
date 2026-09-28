import { BusinessMetrics, BusinessService } from './business.service';
import { barChart, businessPage } from './business.view';

const zeros = () => new Array(12).fill(0);
const series = () => ({
  newPractitioners: zeros(),
  newPatients: zeros(),
  deletedPatients: zeros(),
  consultations: [...zeros().slice(1), 7],
  invoices: zeros(),
  invoicedAmount: [...zeros().slice(1), 1234.5],
  failedInvoices: zeros(),
  referrals: zeros(),
});
const metrics: BusinessMetrics = {
  generatedAt: '2026-09-28T10:00:00Z',
  months: Array.from(
    { length: 12 },
    (_, i) => `2026-${String(i + 1).padStart(2, '0')}`,
  ),
  weeks: Array.from(
    { length: 12 },
    (_, i) => `2026-07-${String(i + 1).padStart(2, '0')}`,
  ),
  totals: {
    practitioners: 3,
    activePractitioners: 2,
    patients: 10,
    deletedPatients: 1,
    consultations: 7,
    invoices: 4,
    failedInvoices: 0,
    invoicedAmount: 1234.5,
    referrals: 1,
  },
  monthly: series(),
  weekly: series(),
  byPractitionerType: [
    {
      type: '<script>X</script>',
      practitioners: 1,
      activePractitioners: 1,
      patients: 10,
      consultations: 7,
      invoicedAmount: 1234.5,
    },
  ],
};

describe('business page', () => {
  it('shows totals, charts and the per-type table, escaped', () => {
    const html = businessPage(metrics, 'month');
    expect(html).toContain('>2<'); // active practitioners
    expect(html).toContain('of 3 accounts');
    expect(html).toMatch(/1\s?235\s?€|1\.?235 €/); // pt-PT euros, rounded
    expect(html).toContain('this month 7');
    expect(html).not.toContain('<script>X');
    expect(html).toContain('href="/business?by=month" class="active"');
  });

  it('explains when it is not configured or api_cp fails', () => {
    expect(businessPage(null, 'month')).toContain('Not configured');
    expect(
      businessPage({ error: 'api_cp answered HTTP 401' }, 'week'),
    ).toContain('HTTP 401');
  });

  it('bar chart: one bar per period, zero-safe', () => {
    const svg = barChart(zeros(), metrics.months, 'month', String);
    expect(svg.match(/<rect/g)).toHaveLength(12);
    expect(svg).toContain('Last 12 months: 0');
  });
});

describe('BusinessService', () => {
  const config = {
    businessMetricsUrl: 'https://api/metrics',
    metricsSecret: 's',
  } as never;

  it('sends the secret and caches for 10 minutes', async () => {
    const fetchFn = jest.fn<Promise<Response>, [string, RequestInit]>(
      async () => new Response(JSON.stringify(metrics)),
    );
    const service = new BusinessService(config);
    await service.metrics(fetchFn as unknown as typeof fetch, 0);
    await service.metrics(fetchFn as unknown as typeof fetch, 9 * 60_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(
      (fetchFn.mock.calls[0][1].headers as Record<string, string>)[
        'x-metrics-secret'
      ],
    ).toBe('s');
    await service.metrics(fetchFn as unknown as typeof fetch, 11 * 60_000);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('reports HTTP errors without caching them', async () => {
    const fetchFn = jest.fn(async () => new Response('{}', { status: 401 }));
    const service = new BusinessService(config);
    expect(
      await service.metrics(fetchFn as unknown as typeof fetch, 0),
    ).toEqual({ error: 'api_cp answered HTTP 401' });
  });
});
