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
import { LeadsService } from './leads.service';
import {
  AssignManyLeadsDto,
  AssignLeadDto,
  BulkImportLeadDto,
  CreateLeadDto,
  UpdateLeadDto,
} from './dto/lead.dto';
import { RequirePermissions } from '../../common/decorators/auth.decorator';
import { Permissions } from '../permissions/permissions.constants';

@ApiTags('Leads')
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @RequirePermissions(Permissions.LEAD_CREATE)
  create(@Body() dto: CreateLeadDto, @CurrentUser() user: AuthUser) {
    return this.leadsService.create(dto, user.id);
  }

  @Post('bulk-import')
  @RequirePermissions(Permissions.LEAD_CREATE)
  bulkImport(@Body() dto: BulkImportLeadDto, @CurrentUser() user: AuthUser) {
    return this.leadsService.bulkImport(dto.items, user.id);
  }

  @Get()
  @RequirePermissions(Permissions.LEAD_READ)
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('sourceCode') sourceCode?: string,
    @Query('agentId') agentId?: string,
    @Query('customerId') customerId?: string,
    @Query('tag') tag?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.leadsService.findAll(
      {
        page, limit, search, status, priority, sourceCode, agentId, customerId, tag, from, to, sortBy, sortOrder,
      },
      user,
    );
  }

  @Get('sources')
  sources() {
    return this.leadsService.listSources();
  }

  @Get('tags')
  tags() {
    return this.leadsService.listTags();
  }

  @Get(':id')
  @RequirePermissions(Permissions.LEAD_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.leadsService.findById(id, user);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.LEAD_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto, @CurrentUser() user: AuthUser) {
    return this.leadsService.update(id, dto, user.id, user);
  }

  @Post(':id/assign')
  @RequirePermissions(Permissions.LEAD_ASSIGN)
  assign(@Param('id') id: string, @Body() dto: AssignLeadDto, @CurrentUser() user: AuthUser) {
    return this.leadsService.assign(id, dto.agentId, user.id);
  }

  @Post('assign-many')
  @RequirePermissions(Permissions.LEAD_ASSIGN)
  assignMany(@Body() dto: AssignManyLeadsDto, @CurrentUser() user: AuthUser) {
    return this.leadsService.assignMany(dto.leadIds, dto.agentId, user.id);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.LEAD_DELETE)
  remove(@Param('id') id: string) {
    return this.leadsService.remove(id);
  }
}