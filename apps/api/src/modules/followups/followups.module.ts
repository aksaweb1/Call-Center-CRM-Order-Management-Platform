import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FollowUpReminderScheduler } from './followup-reminder.scheduler';
import { FollowUpsController } from './followups.controller';
import { FollowUpsService } from './followups.service';

@Module({
  imports: [ActivityModule, NotificationsModule],
  controllers: [FollowUpsController],
  providers: [FollowUpsService, FollowUpReminderScheduler],
  exports: [FollowUpsService],
})
export class FollowUpsModule {}