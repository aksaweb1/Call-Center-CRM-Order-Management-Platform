import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleType } from '../../common/enums/types.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/interfaces/auth.interface';
import { CreateUserDto, UpdateUserDto, SetUserPermissionsDto } from './dto/user.dto';
import { UsersService } from './users.service';
import { Body } from '@nestjs/common';
import { Permissions } from '../permissions/permissions.constants';
import { RequirePermissions } from '../../common/decorators/auth.decorator';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermissions(Permissions.USER_CREATE)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @RequirePermissions(Permissions.USER_READ)
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('roleKey') roleKey?: string,
    @Query('teamId') teamId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.usersService.findAll({
      page, limit, search, roleKey, teamId, sortBy, sortOrder,
    });
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.usersService.findById(user.id);
  }

  @Get('me/permissions')
  mePermissions(@CurrentUser() user: AuthUser) {
    return this.usersService.getPermissions(user.id);
  }

  @Get(':id')
  @RequirePermissions(Permissions.USER_READ)
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.USER_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Get(':id/permissions')
  @RequirePermissions(Permissions.USER_PERMISSION_READ)
  getEffectivePermissions(@Param('id') id: string) {
    return this.usersService.getEffectivePermissions(id);
  }

  @Put(':id/permissions')
  @RequirePermissions(Permissions.USER_PERMISSION_UPDATE)
  setPermissions(
    @Param('id') id: string,
    @Body() dto: SetUserPermissionsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.setUserPermissions(id, dto, { id: user.id, role: user.role });
  }

  @Delete(':id')
  @RequirePermissions(Permissions.USER_DELETE)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}