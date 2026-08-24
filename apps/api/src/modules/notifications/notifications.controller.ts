import { Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/interfaces/auth.interface';
import { NotificationsService } from './notifications.service';
import { RequirePermissions } from '../../common/decorators/auth.decorator';
import { Permissions } from '../permissions/permissions.constants';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @RequirePermissions(Permissions.NOTIFICATION_READ)
  list(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notificationsService.findForUser(user.id, {
      page,
      limit,
      unreadOnly: unreadOnly === 'true',
    });
  }

  @Get('unread-count')
  @RequirePermissions(Permissions.NOTIFICATION_READ)
  async unreadCount(@CurrentUser() user: AuthUser) {
    return { count: await this.notificationsService.unreadCount(user.id) };
  }

  @Patch(':id/read')
  @RequirePermissions(Permissions.NOTIFICATION_READ)
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notificationsService.markRead(user.id, id);
  }

  @Post('read-all')
  @RequirePermissions(Permissions.NOTIFICATION_READ)
  async markAllRead(@CurrentUser() user: AuthUser) {
    await this.notificationsService.markAllRead(user.id);
    return { ok: true };
  }
}