import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/interfaces/auth.interface';
import { OrdersService } from './orders.service';
import {
  CreateOrderDto,
  CreateShipmentDto,
  RecordPaymentDto,
  UpdateOrderStatusDto,
  UpdateShipmentStatusDto,
} from './dto/order.dto';
import { RequirePermissions } from '../../common/decorators/auth.decorator';
import { Permissions } from '../permissions/permissions.constants';

@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @RequirePermissions(Permissions.ORDER_CREATE)
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthUser) {
    return this.ordersService.create(dto, user.id);
  }

  @Get()
  @RequirePermissions(Permissions.ORDER_READ)
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('agentId') agentId?: string,
    @Query('customerId') customerId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.ordersService.findAll({
      page, limit, search, status, paymentStatus, agentId, customerId, from, to, sortBy, sortOrder,
    });
  }

  @Get(':id')
  @RequirePermissions(Permissions.ORDER_READ)
  findOne(@Param('id') id: string) {
    return this.ordersService.findById(id);
  }

  @Patch(':id/status')
  @RequirePermissions(Permissions.ORDER_UPDATE)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ordersService.updateStatus(id, dto, user.id);
  }

  @Post(':id/payments')
  @RequirePermissions(Permissions.PAYMENT_CREATE)
  recordPayment(
    @Param('id') id: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ordersService.recordPayment(id, dto, user.id);
  }

  @Post(':id/shipments')
  @RequirePermissions(Permissions.SHIPMENT_CREATE)
  createShipment(
    @Param('id') id: string,
    @Body() dto: CreateShipmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ordersService.createShipment(id, dto, user.id);
  }

  @Patch(':id/shipments/status')
  @RequirePermissions(Permissions.SHIPMENT_UPDATE)
  updateShipmentStatus(
    @Param('id') id: string,
    @Body() dto: UpdateShipmentStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ordersService.updateShipmentStatus(id, dto, user.id);
  }
}