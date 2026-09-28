import { escapeHtml, formatDate, page, tip } from '../status/views';
import { BusinessMetrics, Series } from './business.service';

export type Grouping = 'month' | 'week';

const count = (n: number) => n.toLocaleString('pt-PT');
const euros = (n: number) =>
  n.toLocaleString('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });

function label(key: string, by: Grouping): string {
  if (by === 'week') {
    const [, m, d] = key.split('-');
    return `${d}/${m}`;
  }
  const [y, m] = key.split('-');
  return `${m}/${y.slice(2)}`;
}

/** Bar chart as inline SVG; each bar has a native tooltip with its period and value. */
export function barChart(
  values: number[],
  keys: string[],
  by: Grouping,
  format: (n: number) => string,
  bad = false,
): string {
  const width = 280;
  const height = 64;
  const max = Math.max(...values, 0);
  const slot = width / values.length;
  const bars = values
    .map((value, i) => {
      const h =
        max === 0
          ? 0
          : Math.max((value / max) * (height - 2), value > 0 ? 2 : 0);
      return `<rect${bad ? ' class="bad"' : ''} x="${(i * slot + slot * 0.15).toFixed(1)}" y="${(height - h).toFixed(1)}" width="${(slot * 0.7).toFixed(1)}" height="${h.toFixed(1)}"><title>${escapeHtml(`${label(keys[i], by)}: ${format(value)}`)}</title></rect>`;
    })
    .join('');
  const total = values.reduce((a, b) => a + b, 0);
  return `<svg class="chart bars" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(`total ${format(total)}`)}">${bars}</svg>
<p class="axis"><span>${escapeHtml(label(keys[0], by))}</span><span>${escapeHtml(label(keys[keys.length - 1], by))}</span></p>
<p class="chart-legend">Last 12 ${by}s: ${escapeHtml(format(total))} · this ${by} ${escapeHtml(format(values[values.length - 1]))}</p>`;
}

const CHARTS: Array<{
  key: keyof Series;
  title: string;
  tip: string;
  money?: boolean;
  bad?: boolean;
}> = [
  {
    key: 'newPractitioners',
    title: 'New practitioners',
    tip: 'Practitioner accounts created per period. Growth of the customer base.',
  },
  {
    key: 'newPatients',
    title: 'New patients',
    tip: 'Patients created per period, including ones later deleted. Shows how much practitioners use the app.',
  },
  {
    key: 'consultations',
    title: 'Consultations',
    tip: 'Consultations by their scheduled date. The best signal of real, day-to-day use.',
  },
  {
    key: 'invoices',
    title: 'Invoices issued',
    tip: 'Moloni invoice-receipts created (completed or pending), by invoice date.',
  },
  {
    key: 'invoicedAmount',
    title: 'Invoiced amount',
    tip: 'Total of completed Moloni invoice-receipts. Money practitioners billed through Espion, not Espion revenue.',
    money: true,
  },
  {
    key: 'failedInvoices',
    title: 'Failed invoices',
    tip: 'Invoice-receipts that failed in Moloni. Should be zero; if not, check the logs for the Moloni error.',
    bad: true,
  },
  {
    key: 'deletedPatients',
    title: 'Deleted patients',
    tip: 'Patients deleted per period. A spike can mean cleanup, or a practitioner leaving.',
    bad: true,
  },
  {
    key: 'referrals',
    title: 'Referrals',
    tip: 'New practitioners who joined through another practitioner’s referral.',
  },
];

function kpi(labelText: string, value: string, sub = ''): string {
  return `<div class="panel kpi"><p class="label">${escapeHtml(labelText)}</p><p class="value">${escapeHtml(value)}</p>${sub === '' ? '' : `<p class="sub">${escapeHtml(sub)}</p>`}</div>`;
}

export function businessPage(
  data: BusinessMetrics | { error: string } | null,
  by: Grouping,
): string {
  const toggle = `<p class="ranges"><a href="/business?by=month"${by === 'month' ? ' class="active"' : ''}>Last 12 months</a><a href="/business?by=week"${by === 'week' ? ' class="active"' : ''}>Last 12 weeks</a></p>`;
  if (data === null) {
    return page(
      'Pulse business',
      'business',
      `<h2>Business</h2><p class="muted">Not configured (set BUSINESS_METRICS_URL and METRICS_SECRET).</p>`,
    );
  }
  if ('error' in data) {
    return page(
      'Pulse business',
      'business',
      `<h2>Business</h2><p class="error">Couldn't read the metrics: ${escapeHtml(data.error)}</p>`,
    );
  }

  const t = data.totals;
  const kpis = `<div class="kpis">
${kpi('Active practitioners', count(t.activePractitioners), `of ${count(t.practitioners)} accounts`)}
${kpi('Patients', count(t.patients), `${count(t.deletedPatients)} deleted`)}
${kpi('Consultations', count(t.consultations), 'all time')}
${kpi('Invoiced', euros(t.invoicedAmount), `${count(t.invoices)} invoices`)}
${kpi('Failed invoices', count(t.failedInvoices))}
${kpi('Referrals', count(t.referrals))}
</div>`;

  const series = by === 'month' ? data.monthly : data.weekly;
  const keys = by === 'month' ? data.months : data.weeks;
  const charts = `<div class="cards">${CHARTS.map(
    c =>
      `<div class="panel card"><h4>${escapeHtml(c.title)} ${tip(c.tip)}</h4>${barChart(series[c.key], keys, by, c.money === true ? euros : count, c.bad === true)}</div>`,
  ).join('')}</div>`;

  const rows = data.byPractitionerType
    .map(
      r =>
        `<tr><td>${escapeHtml(r.type)}</td><td>${count(r.activePractitioners)} / ${count(r.practitioners)}</td><td>${count(r.patients)}</td><td>${count(r.consultations)}</td><td>${euros(r.invoicedAmount)}</td></tr>`,
    )
    .join('');
  const table =
    rows === ''
      ? '<p class="muted">No data yet.</p>'
      : `<div class="panel"><table><tr><th>Practitioner type</th><th>Active / accounts</th><th>Patients</th><th>Consultations</th><th>Invoiced</th></tr>${rows}</table></div>`;

  return page(
    'Pulse business',
    'business',
    `<h2>Business</h2>
<p class="muted">Aggregated by api_cp: counts and sums only, never patient data. Updated ${formatDate(new Date(data.generatedAt))} (cached 10 min).</p>
${kpis}${toggle}${charts}
<h2>By practitioner type ${tip('Current totals per practitioner type (the form template each practitioner uses). Consultations are all time.')}</h2>${table}`,
  );
}
