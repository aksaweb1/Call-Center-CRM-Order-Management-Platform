import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AssignmentService } from './assignment.service';
import { LeadsController } from './leads.controller';
import { LeadsRepository } from './leads.repository';
import { LeadsService } from './leads.service';

@Module({
  imports: [ActivityModule, NotificationsModule],
  controllers: [LeadsController],
  providers: [LeadsService, LeadsRepository, AssignmentService],
  exports: [LeadsService, LeadsRepository],
})
export class LeadsModule {}