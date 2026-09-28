import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { BusinessService } from './business.service';
import { businessPage, Grouping } from './business.view';

@Controller()
export class BusinessController {
  constructor(private readonly business: BusinessService) {}

  @Get('business')
  @UseGuards(AuthGuard)
  @Header('Content-Type', 'text/html; charset=utf-8')
  async page(@Query('by') by: string | undefined): Promise<string> {
    const grouping: Grouping = by === 'week' ? 'week' : 'month';
    return businessPage(await this.business.metrics(), grouping);
  }
}
