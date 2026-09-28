import {
  Controller,
  Get,
  Header,
  Inject,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AuthGuard } from '../auth/auth.guard';
import { CONFIG, Config } from '../config';
import { PrismaService } from '../prisma.service';
import { statusPage, TargetStatus } from './views';

const DAY_MS = 86_400_000;
// Read once at startup; Railway runs from the repo root, where public/ lives.
const FAVICON = readFileSync(join(process.cwd(), 'public', 'favicon.png'));
const FILTERS_JS = readFileSync(join(process.cwd(), 'public', 'filters.js'));
const LOGIN_JS = readFileSync(join(process.cwd(), 'public', 'login.js'));

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

  /** Public, so the login page gets its tab icon too. */
  @Get('favicon.png')
  @Header('Content-Type', 'image/png')
  @Header('Cache-Control', 'public, max-age=86400')
  favicon(): StreamableFile {
    return new StreamableFile(FAVICON);
  }

  /** Public: the login page needs it before there's a session. */
  @Get('login.js')
  @Header('Content-Type', 'text/javascript; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  loginScript(): StreamableFile {
    return new StreamableFile(LOGIN_JS);
  }

  @Get('filters.js')
  @Header('Content-Type', 'text/javascript; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  filtersScript(): StreamableFile {
    return new StreamableFile(FILTERS_JS);
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
}
