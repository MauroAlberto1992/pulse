export interface Target {
  name: string;
  url: string;
  /** Send x-health-secret (api_cp's /api/health/deep). */
  deep: boolean;
}

export interface Config {
  port: number;
  production: boolean;
  passwordHash: string;
  totpSecret: string | null;
  sessionSecret: string;
  targets: Target[];
  healthCheckSecret: string | null;
  checkIntervalMs: number;
  checkTimeoutMs: number;
  failureThreshold: number;
  retentionDays: number;
  brevoApiKey: string | null;
  alertFrom: string | null;
  alertTo: string | null;
  heartbeatUrl: string | null;
}

/** Validates the environment once at startup; throws naming every problem (never the values). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const problems: string[] = [];
  const optional = (name: string): string | null => {
    const value = env[name]?.trim() ?? '';
    return value === '' ? null : value;
  };
  const required = (name: string): string => {
    const value = optional(name);
    if (value === null) {
      problems.push(`${name} is not set`);
      return '';
    }
    return value;
  };
  const positiveInt = (name: string, fallback: number): number => {
    const raw = optional(name);
    if (raw === null) {
      return fallback;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
      problems.push(`${name} must be a positive integer`);
      return fallback;
    }
    return value;
  };

  required('DATABASE_URL');
  const passwordHash = required('PULSE_PASSWORD_HASH');
  const sessionSecret = required('SESSION_SECRET');
  if (sessionSecret !== '' && sessionSecret.length < 32) {
    problems.push('SESSION_SECRET must be at least 32 characters');
  }

  const targets = parseTargets(required('PULSE_TARGETS'), problems);
  const healthCheckSecret = optional('HEALTH_CHECK_SECRET');
  if (targets.some(target => target.deep) && healthCheckSecret === null) {
    problems.push(
      'HEALTH_CHECK_SECRET is required when a target has "deep": true',
    );
  }

  const alertFrom = optional('ALERT_EMAIL_FROM');
  const alertTo = optional('ALERT_EMAIL_TO');
  const brevoApiKey = optional('BREVO_API_KEY');
  const alertVars = [brevoApiKey, alertFrom, alertTo].filter(v => v !== null);
  if (alertVars.length !== 0 && alertVars.length !== 3) {
    problems.push(
      'set all of BREVO_API_KEY, ALERT_EMAIL_FROM and ALERT_EMAIL_TO, or none',
    );
  }

  const config: Config = {
    port: positiveInt('PORT', 3000),
    production: env.NODE_ENV === 'production',
    passwordHash,
    totpSecret: optional('PULSE_TOTP_SECRET'),
    sessionSecret,
    targets,
    healthCheckSecret,
    checkIntervalMs: positiveInt('CHECK_INTERVAL_SECONDS', 60) * 1000,
    checkTimeoutMs: positiveInt('CHECK_TIMEOUT_MS', 10000),
    failureThreshold: positiveInt('FAILURE_THRESHOLD', 3),
    retentionDays: positiveInt('RETENTION_DAYS', 30),
    brevoApiKey,
    alertFrom,
    alertTo,
    heartbeatUrl: optional('HEARTBEAT_URL'),
  };

  if (problems.length !== 0) {
    throw new Error(
      `Invalid environment (see .env.example):\n- ${problems.join('\n- ')}`,
    );
  }
  return config;
}

function parseTargets(raw: string, problems: string[]): Target[] {
  if (raw === '') {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    problems.push('PULSE_TARGETS is not valid JSON');
    return [];
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    problems.push('PULSE_TARGETS must be a non-empty JSON array');
    return [];
  }
  const targets: Target[] = [];
  for (const item of parsed) {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    const url = typeof item?.url === 'string' ? item.url.trim() : '';
    if (name === '' || !/^https?:\/\//.test(url)) {
      problems.push(
        'each PULSE_TARGETS entry needs a "name" and an http(s) "url"',
      );
      continue;
    }
    if (targets.some(target => target.name === name)) {
      problems.push(`PULSE_TARGETS has a duplicate name "${name}"`);
      continue;
    }
    targets.push({ name, url, deep: item.deep === true });
  }
  return targets;
}

export const CONFIG = Symbol('CONFIG');
