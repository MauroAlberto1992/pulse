import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { INFRA_RANGES, InfraRange, InfraService } from './infra.service';
import { infraPage } from './infra.view';

@Controller()
export class InfraController {
  constructor(private readonly infra: InfraService) {}

  @Get('infra')
  @UseGuards(AuthGuard)
  @Header('Content-Type', 'text/html; charset=utf-8')
  async page(@Query('range') raw: string | undefined): Promise<string> {
    const range: InfraRange =
      raw !== undefined && raw in INFRA_RANGES ? (raw as InfraRange) : '24h';
    return infraPage(await this.infra.snapshot(range), range);
  }
}
