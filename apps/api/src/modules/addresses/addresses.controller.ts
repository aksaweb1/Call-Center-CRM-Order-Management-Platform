import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AddressesService } from './addresses.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import { RequirePermissions } from '../../common/decorators/auth.decorator';
import { Permissions } from '../permissions/permissions.constants';

@ApiTags('Addresses')
@Controller('customers/:customerId/addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  @RequirePermissions(Permissions.CUSTOMER_READ)
  list(@Param('customerId') customerId: string) {
    return this.addressesService.list(customerId);
  }

  @Post()
  @RequirePermissions(Permissions.CUSTOMER_UPDATE)
  create(@Param('customerId') customerId: string, @Body() dto: CreateAddressDto) {
    return this.addressesService.create(customerId, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.CUSTOMER_UPDATE)
  update(
    @Param('customerId') customerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.update(customerId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.CUSTOMER_UPDATE)
  remove(@Param('id') id: string) {
    return this.addressesService.remove(id);
  }
}