import { escapeHtml, formatDate, page } from '../status/views';
import { lineChart } from './charts';
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

function serviceCard(s: ServiceMetrics): string {
  const deploy =
    s.lastDeploy === null
      ? '<span class="muted">No deploys</span>'
      : `<span class="state ${statusClass(s.lastDeploy.status)}">${escapeHtml(s.lastDeploy.status)}</span>
<span class="muted">${formatDate(new Date(s.lastDeploy.createdAt))}${s.lastDeploy.branch === null ? '' : ` · ${escapeHtml(s.lastDeploy.branch)}`}</span>
${s.lastDeploy.commitMessage === null ? '' : `<br><span class="muted commit">${escapeHtml(s.lastDeploy.commitMessage.split('\n')[0].slice(0, 90))}</span>`}`;
  return `<div class="panel card">
<h3>${escapeHtml(s.service)} <span class="muted">${escapeHtml(s.project)}</span></h3>
<p class="deploy">${deploy}</p>
<h4>CPU (% of one vCPU)</h4>${lineChart([{ points: s.series.CPU_USAGE, className: 'line-a', label: 'CPU' }], vcpu)}
<h4>Memory</h4>${lineChart([{ points: s.series.MEMORY_USAGE_GB, className: 'line-a', label: 'Memory' }], mb)}
<h4>Network</h4>${lineChart(
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
            .map(serviceCard)
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
<h2>Railway</h2>${railway}
<h2>Web deployments (Vercel)</h2>${vercel}`,
  );
}
