import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import { ReminderSchedulerService } from './reminder-scheduler.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [RemindersController],
  providers: [RemindersService, ReminderSchedulerService],
  exports: [RemindersService],
})
export class RemindersModule {}
