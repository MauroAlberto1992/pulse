import { Controller, Get, Header, Inject, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CONFIG, Config } from '../config';
import { PrismaService } from '../prisma.service';
import { comingSoonPage, statusPage, TargetStatus } from './views';

const DAY_MS = 86_400_000;

@Controller()
export class StatusController {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly prisma: PrismaService,
  ) {}

  /** Railway's healthcheck for pulse itself: public, touches nothing. */
  @Get('healthz')
  healthz(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get()
  @UseGuards(AuthGuard)
  @Header('Content-Type', 'text/html; charset=utf-8')
  async status(): Promise<string> {
    const now = new Date();
    const since = new Date(now.getTime() - DAY_MS);

    const [counts, openIncidents, incidents] = await Promise.all([
      this.prisma.check.groupBy({
        by: ['target', 'ok'],
        where: { checkedAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.incident.findMany({ where: { closedAt: null } }),
      this.prisma.incident.findMany({
        where: { openedAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
        orderBy: { openedAt: 'desc' },
        take: 100,
      }),
    ]);

    const targets: TargetStatus[] = await Promise.all(
      this.config.targets.map(async target => {
        const last = await this.prisma.check.findFirst({
          where: { target: target.name },
          orderBy: { checkedAt: 'desc' },
        });
        const count = (ok: boolean) =>
          counts.find(row => row.target === target.name && row.ok === ok)
            ?._count._all ?? 0;
        const total = count(true) + count(false);
        const open = openIncidents.find(
          incident => incident.target === target.name,
        );
        return {
          name: target.name,
          url: target.url,
          state: last === null ? 'unknown' : last.ok ? 'up' : 'down',
          lastCheckedAt: last?.checkedAt ?? null,
          lastLatencyMs: last?.latencyMs ?? null,
          lastError: last?.error ?? null,
          uptime24h: total === 0 ? null : (count(true) / total) * 100,
          openIncidentSince: open?.openedAt ?? null,
        };
      }),
    );

    return statusPage(targets, incidents, now);
  }

  @Get('logs')
  @UseGuards(AuthGuard)
  @Header('Content-Type', 'text/html; charset=utf-8')
  logs(): string {
    return comingSoonPage('logs', 'Logs', 'phase 2');
  }

  @Get('infra')
  @UseGuards(AuthGuard)
  @Header('Content-Type', 'text/html; charset=utf-8')
  infra(): string {
    return comingSoonPage('infra', 'Infra', 'phase 3');
  }

  @Get('business')
  @UseGuards(AuthGuard)
  @Header('Content-Type', 'text/html; charset=utf-8')
  business(): string {
    return comingSoonPage('business', 'Business', 'phase 4');
  }
}
