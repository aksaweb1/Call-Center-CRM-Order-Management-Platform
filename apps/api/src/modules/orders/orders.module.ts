import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module';
import { ActivityModule } from '../activity/activity.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [LeadsModule, ActivityModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}