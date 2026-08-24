import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/interfaces/auth.interface';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { Permissions } from '../permissions/permissions.constants';
import { RequirePermissions } from '../../common/decorators/auth.decorator';

@ApiTags('Customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @RequirePermissions(Permissions.CUSTOMER_CREATE)
  create(@Body() dto: CreateCustomerDto, @CurrentUser() user: AuthUser) {
    return this.customersService.create(dto, user.id);
  }

  @Get()
  @RequirePermissions(Permissions.CUSTOMER_READ)
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('tag') tag?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.customersService.findAll({ page, limit, search, tag, sortBy, sortOrder });
  }

  @Get(':id')
  @RequirePermissions(Permissions.CUSTOMER_READ)
  findOne(@Param('id') id: string) {
    return this.customersService.findById(id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.CUSTOMER_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.CUSTOMER_DELETE)
  remove(@Param('id') id: string) {
    return this.customersService.remove(id);
  }
}