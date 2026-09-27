import { loadConfig } from './config';

const base = {
  DATABASE_URL: 'postgresql://x',
  PULSE_PASSWORD_HASH: 'scrypt$...',
  SESSION_SECRET: 's'.repeat(32),
  PULSE_TARGETS: '[{"name":"web","url":"https://espion.pt"}]',
};

describe('loadConfig', () => {
  it('applies defaults', () => {
    const config = loadConfig(base);
    expect(config).toMatchObject({
      checkIntervalMs: 60000,
      failureThreshold: 3,
      retentionDays: 30,
      totpSecret: null,
    });
    expect(config.targets).toEqual([
      { name: 'web', url: 'https://espion.pt', deep: false },
    ]);
  });

  it('names every problem without printing values', () => {
    expect(() =>
      loadConfig({
        ...base,
        SESSION_SECRET: 'short-secret-value',
        PULSE_TARGETS:
          '[{"name":"api","url":"https://a/api/health/deep","deep":true}]',
        BREVO_API_KEY: 'brevo-key-value',
        FAILURE_THRESHOLD: '0',
      }),
    ).toThrow(
      /SESSION_SECRET must be at least 32[\s\S]*HEALTH_CHECK_SECRET is required[\s\S]*BREVO_API_KEY, ALERT_EMAIL_FROM[\s\S]*FAILURE_THRESHOLD/,
    );
    try {
      loadConfig({ ...base, SESSION_SECRET: 'short-secret-value' });
    } catch (error) {
      expect((error as Error).message).not.toContain('short-secret-value');
    }
  });

  it('rejects malformed targets', () => {
    expect(() => loadConfig({ ...base, PULSE_TARGETS: 'nope' })).toThrow(
      /not valid JSON/,
    );
    expect(() =>
      loadConfig({
        ...base,
        PULSE_TARGETS:
          '[{"name":"a","url":"https://x"},{"name":"a","url":"https://y"}]',
      }),
    ).toThrow(/duplicate name/);
  });
});
