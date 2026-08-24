import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/auth.decorator';
import { AuthUser } from '../../common/interfaces/auth.interface';
import { Permissions } from '../permissions/permissions.constants';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @RequirePermissions(Permissions.SETTINGS_READ)
  findAll() {
    return this.settingsService.findAll();
  }

  @Get(':key')
  @RequirePermissions(Permissions.SETTINGS_READ)
  findOne(@Param('key') key: string) {
    return this.settingsService.findOne(key);
  }

  @Post()
  @RequirePermissions(Permissions.SETTINGS_UPDATE)
  upsert(
    @Body() body: { key: string; value: unknown; description?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.settingsService.set(body.key, body.value, user.id);
  }

  @Patch('bulk')
  @RequirePermissions(Permissions.SETTINGS_UPDATE)
  bulkSet(
    @Body() body: Array<{ key: string; value: unknown }>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.settingsService.bulkSet(body, user.id);
  }

  @Delete(':key')
  @RequirePermissions(Permissions.SETTINGS_UPDATE)
  remove(@Param('key') key: string) {
    return this.settingsService.remove(key);
  }
}