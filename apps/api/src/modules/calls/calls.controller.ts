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
import { CallsService } from './calls.service';
import { InitiateCallDto, UpdateCallDto } from './dto/call.dto';
import { RequirePermissions, Public } from '../../common/decorators/auth.decorator';
import { Permissions } from '../permissions/permissions.constants';
import { TelephonyFactory } from '../telephony/telephony.factory';

@ApiTags('Calls')
@Controller('calls')
export class CallsController {
  constructor(
    private readonly callsService: CallsService,
    private readonly telephonyFactory: TelephonyFactory,
  ) {}

  @Post('initiate')
  @RequirePermissions(Permissions.CALL_CREATE)
  initiate(@Body() dto: InitiateCallDto, @CurrentUser() user: AuthUser) {
    return this.callsService.initiate(dto.leadId, user.id, dto.from);
  }

  @Get('live/all')
  @RequirePermissions(Permissions.CALL_READ)
  live() {
    return this.callsService.liveCalls();
  }

  @Get()
  @RequirePermissions(Permissions.CALL_READ)
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('leadId') leadId?: string,
    @Query('customerId') customerId?: string,
    @Query('agentId') agentId?: string,
    @Query('status') status?: string,
  ) {
    return this.callsService.findAll({ page, limit, leadId, customerId, agentId, status });
  }

  @Get(':id')
  @RequirePermissions(Permissions.CALL_READ)
  findOne(@Param('id') id: string) {
    return this.callsService.findById(id);
  }

  @Post(':id/hangup')
  @RequirePermissions(Permissions.CALL_CREATE)
  hangup(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.callsService.hangup(id, user);
  }

  @Post(':id/operation')
  @RequirePermissions(Permissions.CALL_CREATE)
  operation(@Param('id') id: string, @Body() body: { type: number; target?: string }, @CurrentUser() user: AuthUser) {
    return this.callsService.callOperation(id, user, body.type, body.target);
  }

  @Get(':id/cdr')
  @RequirePermissions(Permissions.CALL_READ)
  cdr(@Param('id') id: string) {
    return this.callsService.cdrForCall(id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.CALL_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateCallDto, @CurrentUser() user: AuthUser) {
    return this.callsService.updateCall(id, user, dto.outcome, dto.notes, dto.durationSecs);
  }

  // ── Provider webhooks (public, signature-validated at provider level) ──
  @Public()
  @Post('webhook/exotel')
  async exotelWebhook(@Body() body: Record<string, unknown>) {
    const provider = this.telephonyFactory.getProvider();
    const event = provider.parseWebhook(body);
    await this.callsService.handleWebhook(event);
    return { received: true };
  }

  @Public()
  @Post('webhook/twilio')
  async twilioWebhook(@Body() body: Record<string, unknown>) {
    const provider = this.telephonyFactory.getProvider();
    const event = provider.parseWebhook(body);
    await this.callsService.handleWebhook(event);
    return { received: true };
  }

  @Public()
  @Post('webhook/knowlarity')
  async knowlarityWebhook(@Body() body: Record<string, unknown>) {
    const provider = this.telephonyFactory.getProvider();
    const event = provider.parseWebhook(body);
    await this.callsService.handleWebhook(event);
    return { received: true };
  }

  @Public()
  @Post('webhook/tata')
  async tataWebhook(@Body() body: Record<string, unknown>) {
    const provider = this.telephonyFactory.getProvider();
    const event = provider.parseWebhook(body);
    await this.callsService.handleWebhook(event);
    return { received: true };
  }
}