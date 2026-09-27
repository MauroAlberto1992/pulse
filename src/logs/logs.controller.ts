import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  Query,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CONFIG, Config } from '../config';
import { logsPage } from '../status/views';
import {
  CSV_HEADER,
  csvRow,
  ExportFormat,
  exportFilename,
  jsonRow,
} from './export-format';
import { parseBatch } from './ingest';
import { IngestLimiter } from './ingest-limiter';
import {
  EXPORT_LIMIT,
  LOG_RANGES,
  LogQuery,
  LogRange,
  LogsService,
} from './logs.service';

@Controller()
export class LogsController {
  private readonly limiter = new IngestLimiter();

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly logs: LogsService,
  ) {}

  /** Called by the apps' log shippers. 404 while LOG_INGEST_SECRET is unset. */
  @Post('ingest/logs')
  @HttpCode(202)
  async ingest(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ): Promise<{ stored: number }> {
    const secret = this.config.logIngestSecret;
    if (secret === null) {
      throw new NotFoundException();
    }
    if (!secretsMatch(authorization ?? '', `Bearer ${secret}`)) {
      throw new UnauthorizedException();
    }
    const parsed = parseBatch(body);
    if ('error' in parsed) {
      throw new HttpException(parsed.error, HttpStatus.BAD_REQUEST);
    }
    if (this.limiter.tryConsume(parsed.entries.length) === false) {
      throw new HttpException('rate limit', HttpStatus.TOO_MANY_REQUESTS);
    }
    await this.logs.store(parsed.entries);
    return { stored: parsed.entries.length };
  }

  @Get('logs')
  @UseGuards(AuthGuard)
  @Header('Content-Type', 'text/html; charset=utf-8')
  async page(
    @Query() raw: Record<string, string | undefined>,
  ): Promise<string> {
    const query = parseQuery(raw);
    const [result, sources] = await Promise.all([
      this.logs.search(query),
      this.logs.sources(),
    ]);
    return logsPage(query, result.rows, result.nextBefore, sources);
  }

  /** Everything the current filters match over the whole range (not just the page), as a file. */
  @Get('logs/download')
  @UseGuards(AuthGuard)
  async download(
    @Query() raw: Record<string, string | undefined>,
    @Res() res: Response,
  ): Promise<void> {
    const query = parseQuery(raw);
    const format: ExportFormat = raw.format === 'json' ? 'json' : 'csv';
    const now = new Date();
    const total = await this.logs.count(query, now);

    res.status(200);
    res.type(
      format === 'csv'
        ? 'text/csv; charset=utf-8'
        : 'application/x-ndjson; charset=utf-8',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${exportFilename(query.range, format, now)}"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Pulse-Rows', String(Math.min(total, EXPORT_LIMIT)));
    res.setHeader('X-Pulse-Truncated', String(total > EXPORT_LIMIT));

    // Excel only reads CSV as UTF-8 with a BOM; without it, accents come out garbled.
    res.write(format === 'csv' ? `\uFEFF${CSV_HEADER}` : '');
    for await (const chunk of this.logs.export(query, now)) {
      res.write(chunk.map(format === 'csv' ? csvRow : jsonRow).join(''));
    }
    res.end();
  }
}

function parseQuery(raw: Record<string, string | undefined>): LogQuery {
  const pick = (value: string | undefined) =>
    value === undefined || value.trim() === '' ? null : value.trim();
  const range =
    raw.range !== undefined && raw.range in LOG_RANGES
      ? (raw.range as LogRange)
      : '24h';
  const level =
    raw.level === 'warn' || raw.level === 'error' ? raw.level : null;
  const before =
    raw.before !== undefined && /^\d{1,19}$/.test(raw.before)
      ? BigInt(raw.before)
      : null;
  return {
    range,
    level,
    service: pick(raw.service),
    environment: pick(raw.environment),
    text: pick(raw.q)?.slice(0, 200) ?? null,
    before,
  };
}

function secretsMatch(provided: string, expected: string): boolean {
  const digest = (value: string) =>
    new Uint8Array(createHash('sha256').update(value).digest());
  return timingSafeEqual(digest(provided), digest(expected));
}
