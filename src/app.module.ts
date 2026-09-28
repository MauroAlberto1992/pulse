import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { CONFIG, loadConfig } from './config';
import { InfraController } from './infra/infra.controller';
import { InfraService } from './infra/infra.service';
import { LogsController } from './logs/logs.controller';
import { LogsService } from './logs/logs.service';
import { AlertService } from './monitor/alert.service';
import { MonitorService } from './monitor/monitor.service';
import { PrismaService } from './prisma.service';
import { StatusController } from './status/status.controller';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [
    AuthController,
    StatusController,
    LogsController,
    InfraController,
  ],
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig() },
    PrismaService,
    AlertService,
    MonitorService,
    LogsService,
    InfraService,
    AuthGuard,
  ],
})
export class AppModule {}
