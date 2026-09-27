import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { CONFIG, loadConfig } from './config';
import { LogsController } from './logs/logs.controller';
import { LogsService } from './logs/logs.service';
import { AlertService } from './monitor/alert.service';
import { MonitorService } from './monitor/monitor.service';
import { PrismaService } from './prisma.service';
import { StatusController } from './status/status.controller';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [AuthController, StatusController, LogsController],
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig() },
    PrismaService,
    AlertService,
    MonitorService,
    LogsService,
    AuthGuard,
  ],
})
export class AppModule {}
