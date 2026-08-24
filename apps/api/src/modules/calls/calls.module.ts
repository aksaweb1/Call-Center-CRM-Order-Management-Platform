import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { FollowUpsModule } from '../followups/followups.module';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';

@Module({
  imports: [ActivityModule, FollowUpsModule],
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}