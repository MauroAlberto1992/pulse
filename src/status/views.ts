// Server-rendered HTML, no client JS. Phase 1 keeps the dashboard inside the pulse service; the
// plan's separate Next.js app can replace these views when the Logs view (Phase 2) needs it.

export interface TargetStatus {
  name: string;
  url: string;
  state: 'up' | 'down' | 'unknown';
  lastCheckedAt: Date | null;
  lastLatencyMs: number | null;
  lastError: string | null;
  uptime24h: number | null;
  openIncidentSince: Date | null;
}

export interface IncidentRow {
  target: string;
  openedAt: Date;
  closedAt: Date | null;
  cause: string | null;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const lisbon = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Lisbon',
  dateStyle: 'short',
  timeStyle: 'medium',
});

function formatDate(date: Date | null): string {
  return date === null ? '—' : lisbon.format(date);
}

export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

const STYLE = `
:root { --bg:#f7f7f5; --panel:#fff; --text:#1c1c1a; --muted:#6b6b66; --line:#e3e3de;
  --up:#1f7a45; --down:#b3261e; --unknown:#8a6d00; }
@media (prefers-color-scheme: dark) { :root { --bg:#141413; --panel:#1f1f1d; --text:#ececea;
  --muted:#9c9c96; --line:#33332f; --up:#4cc27f; --down:#ff6b5f; --unknown:#e0b83a; } }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--text);
  font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; }
main { max-width:960px; margin:0 auto; padding:24px 16px 48px; }
header { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
h1 { font-size:20px; margin:0; } h2 { font-size:16px; margin:32px 0 12px; }
nav a { color:var(--muted); margin-right:16px; text-decoration:none; }
nav a.active { color:var(--text); font-weight:600; }
.panel { background:var(--panel); border:1px solid var(--line); border-radius:8px; overflow-x:auto; }
table { width:100%; border-collapse:collapse; }
th, td { text-align:left; padding:10px 12px; border-bottom:1px solid var(--line); white-space:nowrap; }
th { color:var(--muted); font-weight:500; font-size:13px; }
tr:last-child td { border-bottom:0; }
.state { font-weight:600; } .up { color:var(--up); } .down { color:var(--down); }
.unknown { color:var(--unknown); } .muted { color:var(--muted); }
button { font:inherit; padding:8px 14px; border-radius:6px; border:1px solid var(--line);
  background:var(--panel); color:var(--text); cursor:pointer; }
form.login { max-width:320px; margin:15vh auto 0; display:grid; gap:12px; }
.password { position:relative; display:grid; }
.password input { padding-right:44px; }
.reveal { position:absolute; right:4px; top:50%; transform:translateY(-50%); padding:6px 8px;
  border:0; background:transparent; color:var(--muted); line-height:0; }
.reveal:hover, .reveal:focus-visible { color:var(--text); }
input { font:inherit; padding:9px 10px; border-radius:6px; border:1px solid var(--line);
  background:var(--panel); color:var(--text); }
.error { color:var(--down); }
form.filters { display:flex; flex-wrap:wrap; gap:8px; margin:16px 0; }
form.filters input[type=search] { flex:1 1 220px; }
a.clear { display:inline-flex; align-items:center; padding:8px 14px; border-radius:6px;
  border:1px solid var(--line); background:var(--panel); color:var(--text); text-decoration:none; }
a.clear:hover { border-color:var(--muted); }
select { font:inherit; padding:8px; border-radius:6px; border:1px solid var(--line);
  background:var(--panel); color:var(--text); }
td.msg { white-space:normal; word-break:break-word; min-width:280px; }
td.msg summary { cursor:pointer; list-style:none; }
td.msg pre { white-space:pre-wrap; font-size:12px; color:var(--muted); margin:8px 0 0; }
.warn { color:var(--unknown); }
.pager { margin-top:12px; }
.pager a, p.muted a { color:var(--text); }
`;

function layout(title: string, body: string, refreshSeconds?: number): string {
  const refresh =
    refreshSeconds === undefined
      ? ''
      : `<meta http-equiv="refresh" content="${refreshSeconds}">`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">${refresh}
<link rel="icon" type="image/png" href="/favicon.png">
<title>${escapeHtml(title)}</title><style>${STYLE}</style></head>
<body><main>${body}</main></body></html>`;
}

function shell(
  active: 'status' | 'logs' | 'infra' | 'business',
  body: string,
): string {
  const link = (key: typeof active, href: string, label: string) =>
    `<a href="${href}"${key === active ? ' class="active"' : ''}>${label}</a>`;
  return `<header><h1>Pulse</h1>
<nav>${link('status', '/', 'Status')}${link('logs', '/logs', 'Logs')}${link('infra', '/infra', 'Infra')}${link('business', '/business', 'Business')}</nav>
<form method="post" action="/logout"><button type="submit">Log out</button></form></header>
${body}`;
}

// Stroke icons (feather style) so they follow the text colour in light and dark mode.
const EYE_ON =
  '<svg class="eye-on" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF =
  '<svg class="eye-off" style="display:none" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

export function loginPage(options: { totp: boolean; error?: string }): string {
  const error =
    options.error === undefined
      ? ''
      : `<p class="error">${escapeHtml(options.error)}</p>`;
  const code = options.totp
    ? '<input name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="6-digit code" required>'
    : '';
  return layout(
    'Pulse login',
    `<form class="login" method="post" action="/login">
<h1>Pulse</h1>${error}
<div class="password">
<input name="password" type="password" autocomplete="current-password" placeholder="Password" required autofocus>
<button type="button" class="reveal" aria-label="Show password" aria-pressed="false" hidden>${EYE_ON}${EYE_OFF}</button>
</div>
${code}<button type="submit">Log in</button></form>
<script src="/login.js" defer></script>`,
  );
}

export function statusPage(
  targets: TargetStatus[],
  incidents: IncidentRow[],
  now: Date = new Date(),
): string {
  const rows = targets
    .map(target => {
      const uptime =
        target.uptime24h === null ? '—' : `${target.uptime24h.toFixed(2)}%`;
      const detail =
        target.openIncidentSince !== null
          ? `incident open for ${formatDuration(now.getTime() - target.openIncidentSince.getTime())}`
          : (target.lastError ?? '');
      return `<tr><td><strong>${escapeHtml(target.name)}</strong><br><span class="muted">${escapeHtml(target.url)}</span></td>
<td class="state ${target.state}">${target.state.toUpperCase()}</td>
<td>${target.lastLatencyMs === null ? '—' : `${target.lastLatencyMs} ms`}</td>
<td>${uptime}</td><td>${formatDate(target.lastCheckedAt)}</td>
<td class="muted">${escapeHtml(detail)}</td></tr>`;
    })
    .join('');

  const incidentRows =
    incidents.length === 0
      ? '<tr><td colspan="4" class="muted">No incidents in the last 30 days.</td></tr>'
      : incidents
          .map(incident => {
            const end = incident.closedAt ?? now;
            const duration = formatDuration(
              end.getTime() - incident.openedAt.getTime(),
            );
            const state =
              incident.closedAt === null
                ? '<span class="state down">OPEN</span>'
                : '<span class="state up">resolved</span>';
            return `<tr><td>${escapeHtml(incident.target)}</td><td>${formatDate(incident.openedAt)}</td>
<td>${state} · ${duration}</td><td class="muted">${escapeHtml(incident.cause ?? '')}</td></tr>`;
          })
          .join('');

  return layout(
    'Pulse status',
    shell(
      'status',
      `<h2>Targets</h2><div class="panel"><table>
<tr><th>Target</th><th>State</th><th>Latency</th><th>Uptime 24 h</th><th>Last check</th><th></th></tr>
${rows}</table></div>
<h2>Incidents (30 days)</h2><div class="panel"><table>
<tr><th>Target</th><th>Opened</th><th>Status</th><th>Cause</th></tr>
${incidentRows}</table></div>`,
    ),
    60,
  );
}

export function comingSoonPage(
  active: 'infra' | 'business',
  title: string,
  phase: string,
): string {
  return layout(
    `Pulse ${title.toLowerCase()}`,
    shell(
      active,
      `<h2>${escapeHtml(title)}</h2><p class="muted">Coming soon (${escapeHtml(phase)}).</p>`,
    ),
  );
}

export interface LogRow {
  id: bigint;
  timestamp: Date;
  service: string;
  environment: string;
  level: string;
  context: string | null;
  message: string;
  stack: string | null;
}

export interface LogFilters {
  range: string;
  level: string | null;
  service: string | null;
  environment: string | null;
  text: string | null;
}

function option(value: string, label: string, selected: string | null): string {
  return `<option value="${escapeHtml(value)}"${value === (selected ?? '') ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}

export function logsPage(
  filters: LogFilters,
  rows: LogRow[],
  nextBefore: bigint | null,
  sources: { services: string[]; environments: string[] },
): string {
  const select = (
    name: string,
    all: string,
    values: string[],
    selected: string | null,
  ) =>
    `<select name="${name}">${option('', all, selected)}${values.map(v => option(v, v, selected)).join('')}</select>`;

  const form = `<form class="filters" method="get" action="/logs">
<input type="search" name="q" placeholder="Search message or module (Enter)" value="${escapeHtml(filters.text ?? '')}">
${select('level', 'All levels', ['error', 'warn'], filters.level)}
${select('service', 'All services', sources.services, filters.service)}
${select('environment', 'All environments', sources.environments, filters.environment)}
<select name="range">${['5m', '15m', '30m', '1h', '24h', '7d', '30d'].map(r => option(r, `Last ${r}`, filters.range)).join('')}</select>
<a class="clear" href="/logs">Clear</a></form>
<script src="/filters.js" defer></script>`;

  const body =
    rows.length === 0
      ? '<tr><td colspan="4" class="muted">No logs match these filters.</td></tr>'
      : rows
          .map(row => {
            const short =
              row.message.length > 240
                ? `${row.message.slice(0, 240)}…`
                : row.message;
            const expandable = row.message.length > 240 || row.stack !== null;
            const message = expandable
              ? `<details><summary>${escapeHtml(short)}</summary><pre>${escapeHtml(row.message)}${row.stack === null ? '' : `\n\n${escapeHtml(row.stack)}`}</pre></details>`
              : escapeHtml(row.message);
            return `<tr><td>${formatDate(row.timestamp)}</td>
<td>${escapeHtml(row.service)}<br><span class="muted">${escapeHtml(row.environment)}</span></td>
<td class="state ${row.level === 'error' ? 'down' : 'warn'}">${escapeHtml(row.level.toUpperCase())}<br><span class="muted">${escapeHtml(row.context ?? '')}</span></td>
<td class="msg">${message}</td></tr>`;
          })
          .join('');

  let pager = '';
  if (nextBefore !== null) {
    const params = new URLSearchParams();
    if (filters.text !== null) params.set('q', filters.text);
    if (filters.level !== null) params.set('level', filters.level);
    if (filters.service !== null) params.set('service', filters.service);
    if (filters.environment !== null)
      params.set('environment', filters.environment);
    params.set('range', filters.range);
    params.set('before', nextBefore.toString());
    pager = `<p class="pager"><a href="/logs?${escapeHtml(params.toString())}">Older →</a></p>`;
  }

  const download = new URLSearchParams();
  if (filters.text !== null) download.set('q', filters.text);
  if (filters.level !== null) download.set('level', filters.level);
  if (filters.service !== null) download.set('service', filters.service);
  if (filters.environment !== null)
    download.set('environment', filters.environment);
  download.set('range', filters.range);
  const downloadLinks = `<p class="muted">Download everything these filters match in the last ${escapeHtml(filters.range)}:
<a href="/logs/download?${escapeHtml(download.toString())}&amp;format=csv">CSV</a> ·
<a href="/logs/download?${escapeHtml(download.toString())}&amp;format=json">JSON (NDJSON)</a></p>`;

  return layout(
    'Pulse logs',
    shell(
      'logs',
      `<h2>Logs</h2>${form}${downloadLinks}<div class="panel"><table>
<tr><th>Time</th><th>Service</th><th>Level</th><th>Message</th></tr>
${body}</table></div>${pager}`,
    ),
  );
}
