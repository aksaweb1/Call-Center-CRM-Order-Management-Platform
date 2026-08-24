import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/auth.decorator';
import { AuthUser } from '../../common/interfaces/auth.interface';
import { Permissions } from '../permissions/permissions.constants';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('agent')
  @RequirePermissions(Permissions.DASHBOARD_READ)
  agentDashboard(@CurrentUser() user: AuthUser) {
    return this.dashboardService.agentDashboard(user.id);
  }

  @Get('agent/:agentId')
  @RequirePermissions(Permissions.REPORT_READ)
  agentDashboardById(@Param('agentId') agentId: string) {
    return this.dashboardService.agentDashboard(agentId);
  }

  @Get('manager')
  @RequirePermissions(Permissions.REPORT_READ)
  managerDashboard(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.dashboardService.managerDashboard({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      teamId: user.teamId,
      role: user.role,
    });
  }

  @Get('calls')
  @RequirePermissions(Permissions.REPORT_READ)
  callAnalytics(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.dashboardService.callAnalytics({ from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined, teamId: user.teamId, role: user.role });
  }

  @Get('ceo')
  @RequirePermissions(Permissions.REPORT_READ)
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  ceoDashboard(@Query('from') from?: string, @Query('to') to?: string) {
    return this.dashboardService.ceoDashboard({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }
}