import { escapeHtml, loginPage, logsPage, statusPage } from './views';

describe('views', () => {
  it('escapes everything that comes from data', () => {
    expect(escapeHtml(`<script>"&'`)).toBe('&lt;script&gt;&quot;&amp;&#39;');
    const html = statusPage(
      [
        {
          name: '<b>web</b>',
          url: 'https://espion.pt',
          state: 'down',
          lastCheckedAt: new Date(0),
          lastLatencyMs: 12,
          lastError: '<img src=x>',
          uptime24h: 99.5,
          openIncidentSince: null,
        },
      ],
      [],
    );
    expect(html).not.toContain('<b>web</b>');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('99.50%');
  });

  it('asks for a code only when TOTP is on', () => {
    expect(loginPage({ totp: true })).toContain('name="code"');
    expect(loginPage({ totp: false })).not.toContain('name="code"');
  });
});

describe('logsPage', () => {
  const filters = {
    range: '24h',
    level: null,
    service: null,
    environment: null,
    text: '<x>',
  };
  const row = {
    id: 5n,
    timestamp: new Date(0),
    service: 'api',
    environment: 'production',
    level: 'error',
    context: 'PatientsService',
    message: '<script>alert(1)</script>',
    stack: 'Error\n at <anonymous>',
  };

  it('escapes messages, stacks and the search box', () => {
    const html = logsPage(filters, [row], null, {
      services: ['api'],
      environments: ['production'],
    });
    expect(html).not.toContain('<script>alert(1)');
    expect(html).not.toContain('at <anonymous>');
    expect(html).toContain('value="&lt;x&gt;"');
  });

  it('links to the next page keeping the filters', () => {
    const html = logsPage({ ...filters, level: 'error' }, [row], 5n, {
      services: [],
      environments: [],
    });
    expect(html).toContain('before=5');
    expect(html).toContain('level=error');
  });
});
