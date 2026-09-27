import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { CONFIG, Config, Target } from '../config';
import { PrismaService } from '../prisma.service';
import { AlertService } from './alert.service';
import { nextState, TargetState } from './incident-state';
import { probe } from './probe';

@Injectable()
export class MonitorService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MonitorService.name);
  private readonly states = new Map<string, TargetState>();
  private running = false;

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly prisma: PrismaService,
    private readonly alerts: AlertService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Rebuild state from the database, so a restart neither re-alerts an open incident nor loses it.
    const open = await this.prisma.incident.findMany({
      where: { closedAt: null },
    });
    for (const target of this.config.targets) {
      const isOpen = open.some(incident => incident.target === target.name);
      this.states.set(target.name, {
        consecutiveFailures: isOpen ? this.config.failureThreshold : 0,
        openIncident: isOpen,
      });
    }

    this.scheduler.addInterval(
      'check-round',
      setInterval(() => void this.runRound(), this.config.checkIntervalMs),
    );
    void this.runRound();
    this.logger.log(
      `Monitoring ${this.config.targets.length} targets every ${this.config.checkIntervalMs / 1000} s`,
    );
  }

  onModuleDestroy(): void {
    if (this.scheduler.doesExist('interval', 'check-round')) {
      this.scheduler.deleteInterval('check-round');
    }
  }

  /** One pass over every target, then the heartbeat. Skipped if the previous pass still runs. */
  async runRound(): Promise<void> {
    if (this.running) {
      this.logger.warn('Previous check round still running; skipping this one');
      return;
    }
    this.running = true;
    try {
      await Promise.all(
        this.config.targets.map(target => this.checkTarget(target)),
      );
      await this.heartbeat();
    } catch (error) {
      // Most likely pulse's own database. No heartbeat, so the external monitor notices.
      this.logger.error(`Check round failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async checkTarget(target: Target): Promise<void> {
    const result = await probe(
      target,
      this.config.checkTimeoutMs,
      this.config.healthCheckSecret,
    );
    await this.prisma.check.create({
      data: {
        target: target.name,
        ok: result.ok,
        statusCode: result.statusCode,
        latencyMs: result.latencyMs,
        error: result.error,
      },
    });

    const previous = this.states.get(target.name) ?? {
      consecutiveFailures: 0,
      openIncident: false,
    };
    const { state, transition } = nextState(
      previous,
      result.ok,
      this.config.failureThreshold,
    );
    this.states.set(target.name, state);

    if (transition === 'open') {
      await this.prisma.incident.create({
        data: { target: target.name, cause: result.error },
      });
      this.logger.warn(`Incident opened for ${target.name}: ${result.error}`);
      await this.alerts.incidentOpened(target.name, result.error);
    } else if (transition === 'close') {
      const open = await this.prisma.incident.findMany({
        where: { target: target.name, closedAt: null },
      });
      const now = new Date();
      await this.prisma.incident.updateMany({
        where: { target: target.name, closedAt: null },
        data: { closedAt: now },
      });
      const openedAt = open.reduce(
        (earliest, incident) =>
          incident.openedAt < earliest ? incident.openedAt : earliest,
        now,
      );
      this.logger.log(`Incident closed for ${target.name}`);
      await this.alerts.incidentClosed(
        target.name,
        now.getTime() - openedAt.getTime(),
      );
    }
  }

  private async heartbeat(): Promise<void> {
    if (this.config.heartbeatUrl === null) {
      return;
    }
    try {
      await fetch(this.config.heartbeatUrl, {
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      this.logger.warn(`Heartbeat failed: ${(error as Error).name}`);
    }
  }

  @Cron('0 3 * * *', { timeZone: 'Europe/Lisbon' })
  async prune(): Promise<void> {
    const cutoff = new Date(
      Date.now() - this.config.retentionDays * 86_400_000,
    );
    const { count } = await this.prisma.check.deleteMany({
      where: { checkedAt: { lt: cutoff } },
    });
    this.logger.log(
      `Pruned ${count} checks older than ${this.config.retentionDays} days`,
    );
  }
}
