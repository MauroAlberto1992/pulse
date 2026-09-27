import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LogEntry, Prisma } from '@prisma/client';
import { CONFIG, Config } from '../config';
import { PrismaService } from '../prisma.service';
import { IngestEntry } from './ingest';

export const LOG_RANGES = {
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
} as const;
export type LogRange = keyof typeof LOG_RANGES;
export const PAGE_SIZE = 100;
export const EXPORT_LIMIT = 100_000;
const EXPORT_CHUNK = 2000;

export interface LogQuery {
  range: LogRange;
  level: 'warn' | 'error' | null;
  service: string | null;
  environment: string | null;
  text: string | null;
  /** Show rows older than this id (next page). */
  before: bigint | null;
}

@Injectable()
export class LogsService {
  private readonly logger = new Logger(LogsService.name);

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly prisma: PrismaService,
  ) {}

  async store(entries: IngestEntry[]): Promise<void> {
    if (entries.length !== 0) {
      await this.prisma.logEntry.createMany({ data: entries });
    }
  }

  private where(query: LogQuery, now: Date): Prisma.LogEntryWhereInput {
    const where: Prisma.LogEntryWhereInput = {
      timestamp: { gte: new Date(now.getTime() - LOG_RANGES[query.range]) },
    };
    if (query.level !== null) where.level = query.level;
    if (query.service !== null) where.service = query.service;
    if (query.environment !== null) where.environment = query.environment;
    if (query.before !== null) where.id = { lt: query.before };
    if (query.text !== null) {
      where.OR = [
        { message: { contains: query.text, mode: 'insensitive' } },
        { context: { contains: query.text, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  async search(query: LogQuery, now = new Date()) {
    const rows = await this.prisma.logEntry.findMany({
      where: this.where(query, now),
      orderBy: { id: 'desc' },
      take: PAGE_SIZE + 1,
    });
    return {
      rows: rows.slice(0, PAGE_SIZE),
      nextBefore: rows.length > PAGE_SIZE ? rows[PAGE_SIZE - 1].id : null,
    };
  }

  /** How many rows match the filters (ignoring the page). */
  count(query: LogQuery, now = new Date()): Promise<number> {
    return this.prisma.logEntry.count({
      where: this.where({ ...query, before: null }, now),
    });
  }

  /**
   * Rows matching the filters (ignoring the page), newest first, in chunks so a 30-day export
   * never sits in memory at once. At most EXPORT_LIMIT rows.
   */
  async *export(query: LogQuery, now = new Date()): AsyncGenerator<LogEntry[]> {
    const where = this.where({ ...query, before: null }, now);
    let cursor: bigint | null = null;
    let sent = 0;
    while (sent < EXPORT_LIMIT) {
      const rows: LogEntry[] = await this.prisma.logEntry.findMany({
        where:
          cursor === null ? where : { AND: [where, { id: { lt: cursor } }] },
        orderBy: { id: 'desc' },
        take: Math.min(EXPORT_CHUNK, EXPORT_LIMIT - sent),
      });
      if (rows.length === 0) {
        return;
      }
      yield rows;
      sent += rows.length;
      cursor = rows[rows.length - 1].id;
    }
  }

  /** Services and environments seen recently, for the filter dropdowns. */
  async sources(): Promise<{ services: string[]; environments: string[] }> {
    const since = new Date(Date.now() - LOG_RANGES['30d']);
    const [services, environments] = await Promise.all([
      this.prisma.logEntry.findMany({
        where: { timestamp: { gte: since } },
        distinct: ['service'],
        select: { service: true },
      }),
      this.prisma.logEntry.findMany({
        where: { timestamp: { gte: since } },
        distinct: ['environment'],
        select: { environment: true },
      }),
    ]);
    return {
      services: services.map(row => row.service).sort(),
      environments: environments.map(row => row.environment).sort(),
    };
  }

  @Cron('30 3 * * *', { timeZone: 'Europe/Lisbon' })
  async prune(): Promise<void> {
    const cutoff = new Date(
      Date.now() - this.config.logRetentionDays * 86_400_000,
    );
    const { count } = await this.prisma.logEntry.deleteMany({
      where: { timestamp: { lt: cutoff } },
    });
    this.logger.log(
      `Pruned ${count} log entries older than ${this.config.logRetentionDays} days`,
    );
  }
}
