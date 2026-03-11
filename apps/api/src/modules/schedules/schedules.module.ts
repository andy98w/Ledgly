import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChargesModule } from '../charges/charges.module';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { ScheduleRunnerService } from './schedule-runner.service';

@Module({
  imports: [AuthModule, ChargesModule],
  controllers: [SchedulesController],
  providers: [SchedulesService, ScheduleRunnerService],
  exports: [SchedulesService],
})
export class SchedulesModule {}
