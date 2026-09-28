import {
  InfraRange,
  InfraSnapshot,
  ServiceMetrics,
  WebDeploy,
} from './infra.service';

/**
 * The rules behind the Infra summary. Kept in one place and shown on the page ("How this is
 * judged"), so a yellow or red line can always be explained.
 */
export const RULES = {
  cpuWarn: 0.5, // vCPU (50% of one)
  cpuProblem: 0.8,
  cpuPoints: 3, // average of the latest N points, so one spike doesn't alarm
  memoryWarnGb: 0.5, // 512 MB
  memoryProblemGb: 1,
  memoryGrowthFactor: 2, // latest > 2× the range's minimum
  memoryGrowthRanges: ['24h', '7d'] as InfraRange[],
  stuckDeployMinutes: 15,
};

export type Severity = 'ok' | 'warn' | 'problem';

export interface Finding {
  severity: Exclude<Severity, 'ok'>;
  where: string;
  message: string;
}

export const RULE_DESCRIPTIONS: Array<{
  check: string;
  warn: string;
  problem: string;
}> = [
  {
    check: 'CPU (average of the latest 3 points)',
    warn: '> 50% of one vCPU',
    problem: '> 80%',
  },
  { check: 'Memory (current)', warn: '> 512 MB', problem: '> 1 GB' },
  {
    check: 'Memory growth (24h and 7d views)',
    warn: 'current > 2× the lowest in the range',
    problem: '—',
  },
  {
    check: 'Railway deploy',
    warn: 'building or deploying for more than 15 min',
    problem: 'FAILED or CRASHED',
  },
  {
    check: 'Vercel deploys',
    warn: 'a recent deploy in ERROR',
    problem: 'the latest production deploy in ERROR',
  },
  {
    check: 'Platform APIs',
    warn: "Railway or Vercel couldn't be read",
    problem: '—',
  },
];

const mb = (gb: number) => `${Math.round(gb * 1024)} MB`;
const pct = (vcpu: number) => `${Math.round(vcpu * 100)}%`;

export function serviceName(s: ServiceMetrics): string {
  return `${s.service} (${s.project}, ${s.environment})`;
}

export function evaluateService(
  s: ServiceMetrics,
  range: InfraRange,
  now: Date,
): Finding[] {
  const where = serviceName(s);
  const findings: Finding[] = [];

  const cpu = s.series.CPU_USAGE.slice(-RULES.cpuPoints);
  if (cpu.length !== 0) {
    const average = cpu.reduce((sum, p) => sum + p.value, 0) / cpu.length;
    if (average > RULES.cpuProblem) {
      findings.push({
        severity: 'problem',
        where,
        message: `CPU at ${pct(average)} of one vCPU`,
      });
    } else if (average > RULES.cpuWarn) {
      findings.push({
        severity: 'warn',
        where,
        message: `CPU at ${pct(average)} of one vCPU`,
      });
    }
  }

  const memory = s.series.MEMORY_USAGE_GB;
  const current = memory[memory.length - 1]?.value;
  if (current !== undefined) {
    if (current > RULES.memoryProblemGb) {
      findings.push({
        severity: 'problem',
        where,
        message: `memory at ${mb(current)}`,
      });
    } else if (current > RULES.memoryWarnGb) {
      findings.push({
        severity: 'warn',
        where,
        message: `memory at ${mb(current)}`,
      });
    } else if (RULES.memoryGrowthRanges.includes(range)) {
      const lowest = Math.min(...memory.map(p => p.value));
      if (lowest > 0 && current > lowest * RULES.memoryGrowthFactor) {
        findings.push({
          severity: 'warn',
          where,
          message: `memory grew from ${mb(lowest)} to ${mb(current)} in this range`,
        });
      }
    }
  }

  const deploy = s.lastDeploy;
  if (deploy !== null) {
    if (/^(FAILED|CRASHED)$/.test(deploy.status)) {
      findings.push({
        severity: 'problem',
        where,
        message: `last deploy ${deploy.status}`,
      });
    } else if (
      /^(BUILDING|DEPLOYING|INITIALIZING|QUEUED|WAITING)$/.test(deploy.status)
    ) {
      const minutes =
        (now.getTime() - new Date(deploy.createdAt).getTime()) / 60_000;
      if (minutes > RULES.stuckDeployMinutes) {
        findings.push({
          severity: 'warn',
          where,
          message: `deploy ${deploy.status} for ${Math.round(minutes)} min`,
        });
      }
    }
  }
  return findings;
}

export function evaluateWeb(deploys: WebDeploy[]): Finding[] {
  const latestProduction = deploys.find(d => d.target === 'production');
  if (latestProduction?.state === 'ERROR') {
    return [
      {
        severity: 'problem',
        where: `web (${latestProduction.project})`,
        message: 'latest production deploy failed',
      },
    ];
  }
  const failed = deploys.slice(0, 5).filter(d => d.state === 'ERROR');
  return failed.length === 0
    ? []
    : [
        {
          severity: 'warn',
          where: `web (${failed[0].project})`,
          message: `${failed.length} of the latest 5 deploys failed`,
        },
      ];
}

export function evaluate(
  snapshot: InfraSnapshot,
  range: InfraRange,
): Finding[] {
  const findings: Finding[] = [];
  if (snapshot.railway !== null) {
    if ('error' in snapshot.railway) {
      findings.push({
        severity: 'warn',
        where: 'Railway',
        message: "couldn't read metrics",
      });
    } else {
      for (const service of snapshot.railway) {
        findings.push(...evaluateService(service, range, snapshot.fetchedAt));
      }
    }
  }
  if (snapshot.vercel !== null) {
    if ('error' in snapshot.vercel) {
      findings.push({
        severity: 'warn',
        where: 'Vercel',
        message: "couldn't read deployments",
      });
    } else {
      findings.push(...evaluateWeb(snapshot.vercel));
    }
  }
  return findings.sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'problem' ? -1 : 1,
  );
}

export function worst(findings: Finding[]): Severity {
  if (findings.some(f => f.severity === 'problem')) return 'problem';
  return findings.length === 0 ? 'ok' : 'warn';
}
