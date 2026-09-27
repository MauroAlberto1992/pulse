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
input { font:inherit; padding:9px 10px; border-radius:6px; border:1px solid var(--line);
  background:var(--panel); color:var(--text); }
.error { color:var(--down); }
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
<input name="password" type="password" autocomplete="current-password" placeholder="Password" required autofocus>
${code}<button type="submit">Log in</button></form>`,
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
  active: 'logs' | 'infra' | 'business',
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
