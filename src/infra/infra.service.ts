import { Inject, Injectable } from '@nestjs/common';
import { CONFIG, Config } from '../config';
import { RailwayReader, VercelReader } from './readonly-clients';

// Railway's smallest sample rate is 30 s. Short ranges also get a shorter cache, or a 5-minute
// view would lag by 2 minutes.
export const INFRA_RANGES = {
  '5m': { ms: 5 * 60_000, sampleSeconds: 30, cacheMs: 30_000 },
  '15m': { ms: 15 * 60_000, sampleSeconds: 30, cacheMs: 30_000 },
  '30m': { ms: 30 * 60_000, sampleSeconds: 60, cacheMs: 30_000 },
  '1h': { ms: 3_600_000, sampleSeconds: 60, cacheMs: 120_000 },
  '6h': { ms: 6 * 3_600_000, sampleSeconds: 300, cacheMs: 120_000 },
  '24h': { ms: 86_400_000, sampleSeconds: 900, cacheMs: 120_000 },
  '7d': { ms: 7 * 86_400_000, sampleSeconds: 3600, cacheMs: 120_000 },
} as const;
export type InfraRange = keyof typeof INFRA_RANGES;

const MEASUREMENTS = [
  'CPU_USAGE',
  'MEMORY_USAGE_GB',
  'NETWORK_RX_GB',
  'NETWORK_TX_GB',
] as const;
type Measurement = (typeof MEASUREMENTS)[number];
export type Series = Array<{ ts: number; value: number }>;

export interface ServiceMetrics {
  project: string;
  environment: string;
  service: string;
  series: Record<Measurement, Series>;
  lastDeploy: {
    status: string;
    createdAt: string;
    commitMessage: string | null;
    branch: string | null;
  } | null;
}

export interface WebDeploy {
  project: string;
  state: string;
  target: string | null;
  createdAt: number;
  branch: string | null;
  commitMessage: string | null;
}

export interface InfraSnapshot {
  fetchedAt: Date;
  railway: ServiceMetrics[] | { error: string } | null;
  vercel: WebDeploy[] | { error: string } | null;
}

interface ProjectsQuery {
  projects: {
    edges: Array<{
      node: {
        name: string;
        environments: { edges: Array<{ node: { id: string; name: string } }> };
        services: { edges: Array<{ node: { id: string; name: string } }> };
      };
    }>;
  };
}

// 4 services × 4 measurements = 16 metric queries per request, under Railway's 19.
const SERVICES_PER_REQUEST = 4;

/**
 * Reads infra data from Railway and Vercel through the read-only clients. Nothing is stored:
 * both platforms keep the history. Results are cached per range (30 s to 2 min), and Railway is
 * read in a few batched GraphQL requests (aliases), one at a time, to stay inside its limits.
 */
@Injectable()
export class InfraService {
  private readonly cache = new Map<InfraRange, InfraSnapshot>();
  private readonly railway: RailwayReader | null;
  private readonly vercel: VercelReader | null;

  constructor(@Inject(CONFIG) config: Config) {
    this.railway =
      config.railwayApiToken === null
        ? null
        : new RailwayReader(config.railwayApiToken);
    this.vercel =
      config.vercelToken === null ? null : new VercelReader(config.vercelToken);
  }

  async snapshot(range: InfraRange, now = new Date()): Promise<InfraSnapshot> {
    const cached = this.cache.get(range);
    if (
      cached !== undefined &&
      now.getTime() - cached.fetchedAt.getTime() < INFRA_RANGES[range].cacheMs
    ) {
      return cached;
    }
    const [railway, vercel] = await Promise.all([
      this.railway === null
        ? null
        : this.railwayMetrics(this.railway, range, now).catch(toError),
      this.vercel === null ? null : this.webDeploys(this.vercel).catch(toError),
    ]);
    const snapshot = { fetchedAt: now, railway, vercel };
    this.cache.set(range, snapshot);
    return snapshot;
  }

  private async railwayMetrics(
    railway: RailwayReader,
    range: InfraRange,
    now: Date,
  ): Promise<ServiceMetrics[]> {
    const { projects } = await railway.query<ProjectsQuery>(`query {
      projects { edges { node { name
        environments { edges { node { id name } } }
        services { edges { node { id name } } } } } } }`);

    const targets: Array<
      Omit<ServiceMetrics, 'series' | 'lastDeploy'> & {
        envId: string;
        serviceId: string;
      }
    > = [];
    for (const { node: project } of projects.edges) {
      for (const { node: env } of project.environments.edges) {
        for (const { node: service } of project.services.edges) {
          targets.push({
            project: project.name,
            environment: env.name,
            service: service.name,
            envId: env.id,
            serviceId: service.id,
          });
        }
      }
    }
    if (targets.length === 0) {
      return [];
    }

    // Railway allows at most 19 concurrent metric queries per client, and each measurement of
    // each service counts as one. So: batches of SERVICES_PER_REQUEST services, one request at a
    // time, with m<i>/d<i> aliases. IDs come from Railway itself and are passed as variables,
    // never spliced into the document.
    const { ms, sampleSeconds } = INFRA_RANGES[range];
    const start = new Date(now.getTime() - ms).toISOString();
    const data: Record<string, unknown> = {};
    for (
      let offset = 0;
      offset < targets.length;
      offset += SERVICES_PER_REQUEST
    ) {
      const indexes = targets
        .slice(offset, offset + SERVICES_PER_REQUEST)
        .map((_, j) => offset + j);
      const variableDefs = indexes
        .map(i => `$e${i}: String!, $s${i}: String!`)
        .join(', ');
      const fields = indexes
        .map(
          i => `m${i}: metrics(environmentId: $e${i}, serviceId: $s${i}, startDate: $start,
            sampleRateSeconds: ${sampleSeconds}, measurements: [${MEASUREMENTS.join(', ')}]) { measurement values { ts value } }
          d${i}: deployments(first: 1, input: { environmentId: $e${i}, serviceId: $s${i} }) {
            edges { node { status createdAt meta } } }`,
        )
        .join('\n');
      const variables: Record<string, string> = { start };
      for (const i of indexes) {
        variables[`e${i}`] = targets[i].envId;
        variables[`s${i}`] = targets[i].serviceId;
      }
      Object.assign(
        data,
        await railway.query<Record<string, unknown>>(
          `query Infra($start: DateTime!, ${variableDefs}) {\n${fields}\n}`,
          variables,
        ),
      );
    }

    return (
      targets
        .map((target, i) => {
          const metrics = (data[`m${i}`] ?? []) as Array<{
            measurement: Measurement;
            values: Series;
          }>;
          const deploys = data[`d${i}`] as
            | {
                edges: Array<{
                  node: {
                    status: string;
                    createdAt: string;
                    meta: Record<string, unknown> | null;
                  };
                }>;
              }
            | undefined;
          const series = Object.fromEntries(
            MEASUREMENTS.map(m => [m, [] as Series]),
          ) as Record<Measurement, Series>;
          // The first and last buckets are partial (the first starts before the range, the last
          // is still filling up) and read as a drop to ~0: keep only whole buckets.
          const firstWhole = (now.getTime() - ms) / 1000;
          const lastWhole = now.getTime() / 1000 - sampleSeconds;
          for (const metric of metrics) {
            series[metric.measurement] = metric.values.filter(
              point => point.ts >= firstWhole && point.ts <= lastWhole,
            );
          }
          const deploy = deploys?.edges[0]?.node;
          return {
            project: target.project,
            environment: target.environment,
            service: target.service,
            series,
            lastDeploy:
              deploy === undefined
                ? null
                : {
                    status: deploy.status,
                    createdAt: deploy.createdAt,
                    commitMessage: text(deploy.meta?.commitMessage),
                    branch: text(deploy.meta?.branch),
                  },
          };
        })
        // A service that doesn't exist in an environment has neither metrics nor deploys.
        .filter(
          s =>
            s.lastDeploy !== null ||
            Object.values(s.series).some(v => v.length !== 0),
        )
    );
  }

  private async webDeploys(vercel: VercelReader): Promise<WebDeploy[]> {
    const { projects } = await vercel.get<{
      projects: Array<{ id: string; name: string; accountId: string }>;
    }>('/v9/projects', { limit: '20' });
    const perProject = await Promise.all(
      projects.map(async project => {
        const { deployments } = await vercel.get<{
          deployments: Array<{
            state?: string;
            readyState?: string;
            target?: string | null;
            created: number;
            meta?: Record<string, string>;
          }>;
        }>('/v6/deployments', {
          projectId: project.id,
          teamId: project.accountId,
          limit: '8',
        });
        return deployments.map(d => ({
          project: project.name,
          state: d.state ?? d.readyState ?? 'UNKNOWN',
          target: d.target ?? null,
          createdAt: d.created,
          branch: d.meta?.githubCommitRef ?? null,
          commitMessage: d.meta?.githubCommitMessage ?? null,
        }));
      }),
    );
    return perProject.flat().sort((a, b) => b.createdAt - a.createdAt);
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function toError(error: unknown): { error: string } {
  return { error: error instanceof Error ? error.message : 'unknown error' };
}
