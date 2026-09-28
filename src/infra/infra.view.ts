import { escapeHtml, formatDate, page } from '../status/views';
import { lineChart } from './charts';
import {
  evaluate,
  evaluateService,
  Finding,
  RULE_DESCRIPTIONS,
  Severity,
  worst,
} from './infra-rules';
import {
  INFRA_RANGES,
  InfraRange,
  InfraSnapshot,
  ServiceMetrics,
  WebDeploy,
} from './infra.service';

const mb = (gb: number) => {
  const megabytes = gb * 1024;
  if (megabytes < 1) {
    return `${Math.round(megabytes * 1024)} KB`;
  }
  return `${megabytes.toFixed(megabytes < 10 ? 1 : 0)} MB`;
};
// Share of one vCPU: 0.0012 → "0.12%". Railway reports usage in vCPUs.
const vcpu = (v: number) => `${(v * 100).toFixed(v * 100 < 10 ? 2 : 0)}%`;

function statusClass(status: string): string {
  if (/^(SUCCESS|READY)$/.test(status)) return 'up';
  if (/^(FAILED|CRASHED|ERROR|CANCELED)$/.test(status)) return 'down';
  return 'unknown';
}

const TIPS = {
  cpu: 'How much of the processor the service uses; 100% is one full vCPU. Short spikes (deploys, bursts of requests) are normal. Worry if it stays above 50% (slower responses) or 80% (overloaded).',
  memory:
    'RAM in use. On Railway, running out crashes and restarts the service, and memory × time is most of the bill. Worry above 512 MB or 1 GB, or if it keeps climbing over days without coming down (a leak).',
  network:
    'Data in and out. Small numbers mean little traffic. Worry about large, unexpected spikes: a burst of requests or someone hammering the API.',
  deploy:
    'The latest deploy of this service. SUCCESS is the running version. FAILED or CRASHED means the new version never came up; building for a long time means it is stuck.',
  vercel:
    'Latest web deployments. READY is live (production) or a working preview. ERROR means the build failed; production keeps serving the previous version.',
};

/** ⓘ with a CSS-only tooltip: hover on desktop, tap (focus) on mobile. */
function tip(text: string): string {
  return `<span class="tip" tabindex="0" role="note" aria-label="${escapeHtml(text)}">ⓘ<span class="tip-text" aria-hidden="true">${escapeHtml(text)}</span></span>`;
}

const ICON: Record<Severity, string> = { ok: '✅', warn: '⚠️', problem: '❌' };

function summary(findings: Finding[]): string {
  const level = worst(findings);
  const title =
    level === 'ok'
      ? 'All normal'
      : `${findings.filter(f => f.severity === 'problem').length} problem(s), ${findings.filter(f => f.severity === 'warn').length} warning(s)`;
  const items = findings
    .map(
      f =>
        `<li class="${f.severity}">${ICON[f.severity]} <strong>${escapeHtml(f.where)}</strong>: ${escapeHtml(f.message)}</li>`,
    )
    .join('');
  return `<div class="panel summary summary-${level}"><p class="summary-title">${ICON[level]} ${escapeHtml(title)}</p>${items === '' ? '' : `<ul>${items}</ul>`}</div>`;
}

function rulesTable(): string {
  const rows = RULE_DESCRIPTIONS.map(
    r =>
      `<tr><td>${escapeHtml(r.check)}</td><td>${escapeHtml(r.warn)}</td><td>${escapeHtml(r.problem)}</td></tr>`,
  ).join('');
  return `<details class="rules"><summary>How this is judged</summary><div class="panel"><table>
<tr><th>Check</th><th>⚠️ Warning</th><th>❌ Problem</th></tr>${rows}</table></div></details>`;
}

function serviceCard(s: ServiceMetrics, range: InfraRange, now: Date): string {
  const level = worst(evaluateService(s, range, now));
  const deploy =
    s.lastDeploy === null
      ? '<span class="muted">No deploys</span>'
      : `<span class="state ${statusClass(s.lastDeploy.status)}">${escapeHtml(s.lastDeploy.status)}</span>
<span class="muted">${formatDate(new Date(s.lastDeploy.createdAt))}${s.lastDeploy.branch === null ? '' : ` · ${escapeHtml(s.lastDeploy.branch)}`}</span>
${s.lastDeploy.commitMessage === null ? '' : `<br><span class="muted commit">${escapeHtml(s.lastDeploy.commitMessage.split('\n')[0].slice(0, 90))}</span>`}`;
  return `<div class="panel card card-${level}">
<h3>${level === 'ok' ? '' : `${ICON[level]} `}${escapeHtml(s.service)} <span class="muted">${escapeHtml(s.project)}</span></h3>
<p class="deploy">${deploy} ${tip(TIPS.deploy)}</p>
<h4>CPU (% of one vCPU) ${tip(TIPS.cpu)}</h4>${lineChart([{ points: s.series.CPU_USAGE, className: 'line-a', label: 'CPU' }], vcpu)}
<h4>Memory ${tip(TIPS.memory)}</h4>${lineChart([{ points: s.series.MEMORY_USAGE_GB, className: 'line-a', label: 'Memory' }], mb)}
<h4>Network ${tip(TIPS.network)}</h4>${lineChart(
    [
      { points: s.series.NETWORK_RX_GB, className: 'line-a', label: 'in' },
      { points: s.series.NETWORK_TX_GB, className: 'line-b', label: 'out' },
    ],
    mb,
  )}
</div>`;
}

function webTable(deploys: WebDeploy[]): string {
  if (deploys.length === 0) {
    return '<p class="muted">No deployments.</p>';
  }
  const rows = deploys
    .slice(0, 12)
    .map(
      d => `<tr><td>${formatDate(new Date(d.createdAt))}</td>
<td class="state ${statusClass(d.state)}">${escapeHtml(d.state)}</td>
<td>${escapeHtml(d.target ?? 'preview')}</td><td>${escapeHtml(d.branch ?? '')}</td>
<td class="msg">${escapeHtml((d.commitMessage ?? '').split('\n')[0].slice(0, 90))}</td></tr>`,
    )
    .join('');
  return `<div class="panel"><table><tr><th>Created</th><th>State</th><th>Target</th><th>Branch</th><th>Commit</th></tr>${rows}</table></div>`;
}

function errorOrNull(
  value: unknown,
  name: string,
  envVar: string,
): string | null {
  if (value === null) {
    return `<p class="muted">${name} is not configured (set ${envVar}).</p>`;
  }
  if (typeof value === 'object' && value !== null && 'error' in value) {
    return `<p class="error">${name}: ${escapeHtml(String((value as { error: string }).error))}</p>`;
  }
  return null;
}

export function infraPage(snapshot: InfraSnapshot, range: InfraRange): string {
  const ranges = (Object.keys(INFRA_RANGES) as InfraRange[])
    .map(
      r =>
        `<a href="/infra?range=${r}"${r === range ? ' class="active"' : ''}>${r}</a>`,
    )
    .join('');

  let railway = errorOrNull(snapshot.railway, 'Railway', 'RAILWAY_API_TOKEN');
  if (railway === null) {
    const services = snapshot.railway as ServiceMetrics[];
    const environments = [...new Set(services.map(s => s.environment))].sort(
      (a, b) =>
        a === 'production' ? -1 : b === 'production' ? 1 : a.localeCompare(b),
    );
    railway = environments
      .map(
        env =>
          `<h3 class="env">${escapeHtml(env)}</h3><div class="cards">${services
            .filter(s => s.environment === env)
            .map(s => serviceCard(s, range, snapshot.fetchedAt))
            .join('')}</div>`,
      )
      .join('');
  }
  const vercel =
    errorOrNull(snapshot.vercel, 'Vercel', 'VERCEL_TOKEN') ??
    webTable(snapshot.vercel as WebDeploy[]);

  return page(
    'Pulse infra',
    'infra',
    `<h2>Infra</h2>
<p class="ranges">${ranges} <span class="muted">· read-only from Railway and Vercel · updated ${formatDate(snapshot.fetchedAt)}</span></p>
${summary(evaluate(snapshot, range))}
${rulesTable()}
<h2>Railway</h2>${railway}
<h2>Web deployments (Vercel) ${tip(TIPS.vercel)}</h2>${vercel}`,
  );
}
