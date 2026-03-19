import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { DigestSchedulerService } from './digest-scheduler.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ReportsController],
  providers: [ReportsService, DigestSchedulerService],
  exports: [ReportsService, DigestSchedulerService],
})
export class ReportsModule {}
