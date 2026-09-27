import { escapeHtml, loginPage, statusPage } from './views';

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
