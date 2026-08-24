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
import { FollowUpsService } from './followups.service';
import { CreateFollowUpDto, UpdateFollowUpDto } from './dto/followup.dto';
import { RequirePermissions } from '../../common/decorators/auth.decorator';
import { Permissions } from '../permissions/permissions.constants';

@ApiTags('Follow-ups')
@Controller('followups')
export class FollowUpsController {
  constructor(private readonly followUpsService: FollowUpsService) {}

  @Post()
  @RequirePermissions(Permissions.FOLLOWUP_CREATE)
  create(@Body() dto: CreateFollowUpDto, @CurrentUser() user: AuthUser) {
    return this.followUpsService.create(dto, user.id);
  }

  @Get()
  @RequirePermissions(Permissions.FOLLOWUP_READ)
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('leadId') leadId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.followUpsService.listForUser(user, leadId, page, limit);
  }

  @Get('today')
  @RequirePermissions(Permissions.FOLLOWUP_READ)
  today(@CurrentUser() user: AuthUser) {
    // leadId-scoped today still agent-only; team view uses list/range
    if (user.role === 'TEAM_LEADER' || user.role === 'MANAGER' || user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'QA') {
      return this.followUpsService.todaysForUser(user);
    }
    return this.followUpsService.todaysForAgent(user.id);
  }

  @Get('pending-count')
  @RequirePermissions(Permissions.FOLLOWUP_READ)
  pendingCount(@CurrentUser() user: AuthUser) {
    // TEAM_LEADER and above see team/all pending; agents see own
    if (user.role === 'TEAM_LEADER' || user.role === 'MANAGER' || user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'QA') {
      return this.followUpsService.pendingCountForUser(user);
    }
    return this.followUpsService.pendingCountForAgent(user.id);
  }

  @Get('overdue')
  @RequirePermissions(Permissions.FOLLOWUP_READ)
  overdue(@CurrentUser() user: AuthUser) {
    if (user.role === 'TEAM_LEADER' || user.role === 'MANAGER' || user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'QA') {
      return this.followUpsService.overdueForUser(user);
    }
    return this.followUpsService.overdueForAgent(user.id);
  }

  @Get('range')
  @RequirePermissions(Permissions.FOLLOWUP_READ)
  range(
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: AuthUser,
  ) {
    if (user.role === 'TEAM_LEADER' || user.role === 'MANAGER' || user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'QA') {
      return this.followUpsService.rangeForUser(user, new Date(from), new Date(to));
    }
    return this.followUpsService.range({
      agentId: user.id,
      from: new Date(from),
      to: new Date(to),
    });
  }

  @Patch(':id')
  @RequirePermissions(Permissions.FOLLOWUP_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateFollowUpDto, @CurrentUser() user: AuthUser) {
    return this.followUpsService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.FOLLOWUP_UPDATE)
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.followUpsService.remove(id, user);
  }
}