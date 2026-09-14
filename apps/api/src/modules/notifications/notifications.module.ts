import { OutboxWorkerService } from './outbox-worker.service';
import { Module, Global } from '@nestjs/common';
import { GroupMeModule } from '../groupme/groupme.module';
import { JobsModule } from '../jobs/jobs.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationChannelsService } from './notification-channels.service';
import { DiscordController } from './discord.controller';
import { SlackController } from './slack.controller';

@Global()
@Module({
  imports: [GroupMeModule, JobsModule],
  controllers: [NotificationsController, DiscordController, SlackController],
  providers: [OutboxWorkerService, NotificationsService, NotificationChannelsService],
  exports: [NotificationsService, NotificationChannelsService],
})
export class NotificationsModule {}
