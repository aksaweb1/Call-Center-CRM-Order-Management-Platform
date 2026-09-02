import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, CallStatus, CallOutcome } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { TelephonyFactory } from '../telephony/telephony.factory';
import { WebhookCallContext } from '../telephony/interfaces/telephony-provider.interface';
import { normalizeLimit, normalizePage } from '../../common/utils/pagination';
import { AuthUser } from '../../common/interfaces/auth.interface';
import { RoleType } from '../../common/enums/types.enum';
import { FollowUpsService } from '../followups/followups.service';

const callInclude = {
  lead: { select: { id: true, status: true } },
  customer: { select: { id: true, name: true, phone: true } },
  agent: { select: { id: true, fullName: true, phone: true, callDevice: true, telephonyAccountId: true } },
  recording: true,
  events: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.CallInclude;

/** Roles that may act on any call; everyone else only on their own. */
const CALL_SUPERVISOR_ROLES: string[] = [
  RoleType.SUPER_ADMIN,
  RoleType.ADMIN,
  RoleType.MANAGER,
  RoleType.TEAM_LEADER,
  RoleType.QA,
];

@Injectable()
export class CallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
    private readonly telephonyFactory: TelephonyFactory,
    private readonly followUpsService: FollowUpsService,
  ) {}

  /** Supervisors may act on any call; agents only on their own calls. */
  private assertCanActOnCall(user: AuthUser, agentId: string | null): void {
    if (CALL_SUPERVISOR_ROLES.includes(user.role as string)) return;
    if (agentId !== user.id) {
      throw new ForbiddenException('You can only manage your own calls');
    }
  }

  async initiate(leadId: string, userId: string, from?: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, deletedAt: null }, include: { customer: true } });
    if (!lead || !lead.customer) throw new NotFoundException('Lead not found');
    // Resolve the agent's preferred device — SUPER_ADMIN/ADMIN assign a real Tata account per-user
    // from the fetched Smartflow list (stored as telephonyAccountId). That assignment is the
    // single source of truth for real dialing — no more hardcoded env numbers.
    const agent = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true, callDevice: true, telephonyAccountId: true },
    });
    // Priority: explicit caller override > CRM-assigned Tata account > device fallback
    // NOTE: `agentPhone` is the number Smartflow rings to reach the agent (mobile or web extension).
    // `caller_id` (from) must stay as the whitelisted DID (TATA_CALLER_ID) — never the agent's mobile.
    const effectiveAgentPhone =
      from ?? agent?.telephonyAccountId ?? (agent?.callDevice === 'WEB_DIALER' ? undefined : agent?.phone ?? undefined);
    const provider = this.telephonyFactory.getProvider();
    const callResult = await provider.initiateCall({
      to: lead.customer.phone,
      agentPhone: effectiveAgentPhone,
      // Do not set `from` — let TataProvider default to TATA_CALLER_ID (whitelisted DID)
      callbackUrl: provider.buildWebhookUrl(this.baseUrl()),
    });
    const recording = await this.prisma.callRecording.create({ data: {} });
    // Only one CALLING lead per agent — clear any other CALLING leads for this agent before marking this one
    await this.prisma.lead.updateMany({ where: { agentId: userId, status: 'CALLING', id: { not: lead.id }, deletedAt: null }, data: { status: 'ASSIGNED', lastActivityAt: new Date() } });
    const call = await this.prisma.call.create({
      data: {
        provider: provider.name,
        providerCallId: callResult.providerCallId,
        callSid: callResult.providerCallId,
        leadId: lead.id,
        customerId: lead.customerId,
        agentId: userId,
        direction: 'OUTBOUND',
        status: 'INITIATED',
        dialedNumber: lead.customer.phone,
        recordingId: recording.id,
        metadata: { callDevice: agent?.callDevice ?? 'MOBILE', agentPhone: effectiveAgentPhone ?? null },
      },
      include: callInclude,
    });
    await this.prisma.lead.update({ where: { id: lead.id }, data: { status: 'CALLING', firstCallMadeAt: new Date(), lastActivityAt: new Date() } });
    await this.activityService.record({
      userId,
      customerId: lead.customerId,
      leadId: lead.id,
      action: 'Call Started',
      metadata: { provider: provider.name, providerCallId: callResult.providerCallId, callDevice: agent?.callDevice ?? 'MOBILE' },
    });
    return call;
  }

  async findAll(query: { page?: number; limit?: number; leadId?: string; customerId?: string; agentId?: string; status?: string }) {
    const page = normalizePage(query.page);
    const limit = normalizeLimit(query.limit);
    const where: Prisma.CallWhereInput = {
      deletedAt: null,
      ...(query.leadId ? { leadId: query.leadId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.agentId ? { agentId: query.agentId } : {}),
      ...(query.status ? { status: query.status as CallStatus } : {}),
    };
    const [total, items] = await this.prisma.$transaction([this.prisma.call.count({ where }), this.prisma.call.findMany({ where, include: callInclude, orderBy: { startedAt: 'desc' }, skip: (page - 1) * limit, take: limit })]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // Single source of truth: INITIATED (agent ringing) -> RINGING (customer ringing) -> CONNECTED (talk) -> COMPLETED/MISSED/BUSY/FAILED
  async findById(id: string) {
    const call = await this.prisma.call.findFirst({ where: { id, deletedAt: null }, include: callInclude });
    if (!call) throw new NotFoundException('Call not found');
    if (call.provider !== 'TATA' || !call.dialedNumber) return call;
    const token = process.env.TATA_TOKEN;
    if (!token) return call;
    try {
      // 1. Live check — distinguish Leg 1 (agent) vs Leg 2 (customer)
      const liveRes = await fetch(`https://api-smartflo.tatateleservices.com/v1/live_calls`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      if (liveRes.ok) {
        const live = (await liveRes.json()) as Array<Record<string, unknown>> | { data?: unknown[] };
        const arr = Array.isArray(live) ? live : ((live as { data?: unknown[] }).data ?? []);
        const dialed = call.dialedNumber.replace(/\D/g, '').slice(-10);
        const agentPhone = (call.agent as unknown as { phone?: string })?.phone?.replace(/\D/g, '').slice(-10);
        let hit: Record<string, unknown> | undefined;
        hit = arr.find((r) => String((r as Record<string, unknown>).destination ?? (r as Record<string, unknown>).customer_number ?? '').replace(/\D/g, '').endsWith(dialed)) as Record<string, unknown> | undefined;
        if (!hit && agentPhone) {
          hit = arr.find((r) => {
            const rec = r as Record<string, unknown>;
            return String(rec.destination ?? '').replace(/\D/g, '').endsWith(agentPhone) || String(rec.source ?? '').replace(/\D/g, '').endsWith(agentPhone);
          }) as Record<string, unknown> | undefined;
        }
        if (hit) {
          const state = String(hit.state ?? hit.status ?? '').toLowerCase();
          const isCustomerLeg = String(hit.destination ?? (hit as Record<string, unknown>).customer_number ?? '').replace(/\D/g, '').endsWith(dialed);
          let newStatus: string | null = null;
          if (isCustomerLeg) {
            newStatus = state.includes('answer') || state.includes('connect') ? 'CONNECTED' : 'RINGING';
          } else {
            newStatus = 'INITIATED';
          }
          const order: Record<string, number> = { INITIATED: 0, RINGING: 1, CONNECTED: 2, COMPLETED: 3, FAILED: 3, BUSY: 3, MISSED: 3 };
          if (newStatus && (order[newStatus] ?? 0) < (order[call.status] ?? 0)) newStatus = null; // don't regress
          if (newStatus && (order[newStatus] ?? 0) > (order[call.status] ?? 0) + 1) newStatus = null; // strict fallow: must go INITIATED->RINGING->CONNECTED, no skipping
          if (newStatus && newStatus !== call.status) {
            const updated = await this.prisma.call.update({ where: { id: call.id }, data: { status: newStatus as never }, include: callInclude });
            return updated;
          }
          if (newStatus) return { ...call, status: newStatus } as typeof call;
        }
      }
      // 2. If no live but was RINGING/INITIATED >40s ago, likely declined/missed
      if ((call.status === 'RINGING' || call.status === 'INITIATED') && Date.now() - call.startedAt.getTime() > 40_000) {
        const liveRes2 = await fetch(`https://api-smartflo.tatateleservices.com/v1/live_calls`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
        if (liveRes2.ok) {
          const live2 = (await liveRes2.json()) as Array<Record<string, unknown>> | { data?: unknown[] };
          const arr2 = Array.isArray(live2) ? live2 : ((live2 as { data?: unknown[] }).data ?? []);
          const dialed2 = call.dialedNumber.replace(/\D/g, '').slice(-10);
          const hasLive = arr2.some((r) => String((r as Record<string, unknown>).destination ?? (r as Record<string, unknown>).customer_number ?? '').replace(/\D/g, '').endsWith(dialed2));
          if (!hasLive) {
            const updated = await this.prisma.call.update({ where: { id: call.id }, data: { status: 'MISSED' as never, outcome: 'NO_ANSWER' as never }, include: callInclude });
            if (call.leadId) await this.prisma.lead.update({ where: { id: call.leadId }, data: { status: 'NO_ANSWER' as never, lastActivityAt: new Date() } }).catch(() => {});
            return updated;
          }
        }
      }
      // 2b. If was CONNECTED but now no live (either party hung up on phone), mark COMPLETED and keep live talk time
      if (call.status === 'CONNECTED' && Date.now() - call.startedAt.getTime() > 5_000) {
        const liveRes3 = await fetch(`https://api-smartflo.tatateleservices.com/v1/live_calls`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
        if (liveRes3.ok) {
          const live3 = (await liveRes3.json()) as Array<Record<string, unknown>> | { data?: unknown[] };
          const arr3 = Array.isArray(live3) ? live3 : ((live3 as { data?: unknown[] }).data ?? []);
          const dialed3 = call.dialedNumber.replace(/\D/g, '').slice(-10);
          const stillLive = arr3.some((r) => String((r as Record<string, unknown>).destination ?? (r as Record<string, unknown>).customer_number ?? '').replace(/\D/g, '').endsWith(dialed3));
          if (!stillLive) {
            // Use the live elapsed at hangup moment (callElapsed) as talk time, same as browser Hangup does
            const liveTalk = Math.max(0, Math.floor((Date.now() - call.startedAt.getTime()) / 1000) - 8); // subtract ~8s for agent leg setup
            const updated = await this.prisma.call.update({ where: { id: call.id }, data: { status: 'COMPLETED' as never, completedAt: new Date(), durationSecs: liveTalk > 0 ? liveTalk : call.durationSecs }, include: callInclude });
            // Also try to refine with Tata CDR in background (but keep liveTalk if CDR not yet ready)
            setTimeout(async () => {
              try {
                const from = new Date(call.startedAt); from.setHours(from.getHours() - 1);
                const to = new Date(call.startedAt); to.setHours(to.getHours() + 1);
                const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
                const url = `https://api-smartflo.tatateleservices.com/v1/call/records?from_date=${encodeURIComponent(fmt(from))}&to_date=${encodeURIComponent(fmt(to))}&limit=20`;
                const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
                if (res.ok) {
                  const body = (await res.json()) as { results?: Array<{ client_number?: string; answered_seconds?: number }> };
                  const rec = body.results?.find((r) => String(r.client_number ?? '').replace(/\D/g, '').endsWith(dialed3));
                  if (rec?.answered_seconds != null && rec.answered_seconds !== liveTalk) {
                    await this.prisma.call.update({ where: { id: call.id }, data: { durationSecs: rec.answered_seconds } }).catch(() => {});
                  }
                }
              } catch {}
            }, 4000);
            return updated;
          }
        }
      }
      // 3. CDR for final duration — only when COMPLETED and duration still null, and only for records after this call started
      if (call.status === 'COMPLETED' && call.durationSecs == null) {
        const from = new Date(call.startedAt); from.setHours(from.getHours() - 1);
        const to = new Date(call.startedAt); to.setHours(to.getHours() + 1);
        const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        const url = `https://api-smartflo.tatateleservices.com/v1/call/records?from_date=${encodeURIComponent(fmt(from))}&to_date=${encodeURIComponent(fmt(to))}&limit=20`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
        if (res.ok) {
          const body = (await res.json()) as { results?: Array<{ client_number?: string; call_duration?: number; answered_seconds?: number; status?: string; date?: string; time?: string }> };
          const targetMs = call.startedAt.getTime();
          let best: { rec: { client_number?: string; call_duration?: number; answered_seconds?: number; status?: string; date?: string; time?: string }; diff: number } | null = null;
          for (const r of body.results ?? []) {
            if (!r.client_number?.replace(/\D/g, '').endsWith(call.dialedNumber.replace(/\D/g, '').slice(-10))) continue;
            let recMs: number | null = null;
            if (r.date && r.time) { const p = new Date(`${r.date} ${r.time}`); if (!Number.isNaN(p.getTime())) recMs = p.getTime(); }
            if (recMs == null) continue;
            const diff = recMs - targetMs;
            if (diff < 0 || diff > 5 * 60 * 1000) continue;
            if (!best || diff < best.diff) best = { rec: r, diff };
          }
          const rec = best?.rec;
          if (rec && rec.answered_seconds != null) {
            const updated = await this.prisma.call.update({ where: { id: call.id }, data: { durationSecs: rec.answered_seconds }, include: callInclude });
            return updated;
          }
        }
      }
    } catch {}
    return call;
  }

  async handleWebhook(event: WebhookCallContext): Promise<void> {
    const existing = await this.prisma.call.findFirst({ where: { OR: [{ callSid: event.providerCallId }, { providerCallId: event.providerCallId }] } });
    if (!existing) return;
    const statusMap: Record<string, CallStatus> = { initiated: 'INITIATED', ringing: 'RINGING', connected: 'CONNECTED', completed: 'COMPLETED', busy: 'BUSY', failed: 'FAILED', missed: 'MISSED' };
    const data: Prisma.CallUpdateInput = {};
    if (event.eventType in statusMap) data.status = statusMap[event.eventType];
    if (event.durationSecs !== undefined) data.durationSecs = event.durationSecs;
    if (event.eventType === 'completed' || event.eventType === 'connected') data.completedAt = new Date();
    if (event.recordingUrl) data.recording = { update: { recordingUrl: event.recordingUrl, durationSecs: event.recordingDurationSecs, status: 'READY' } };
    if (event.eventType === 'completed') data.outcome = 'CONNECTED';
    else if (event.eventType === 'busy') data.outcome = 'BUSY';
    else if (event.eventType === 'missed') data.outcome = 'NO_ANSWER';
    else if (event.eventType === 'failed') {
      const rawStr = JSON.stringify(event.rawPayload ?? {}).toLowerCase();
      data.outcome = rawStr.includes('wrong number') || rawStr.includes('invalid') ? 'WRONG_NUMBER' : 'NO_ANSWER';
    }
    await this.prisma.call.update({ where: { id: existing.id }, data });
    await this.prisma.callEvent.create({ data: { callId: existing.id, eventType: event.eventType, metadata: event.rawPayload as object } });
    if (existing.leadId) {
      let leadStatus: string | null = null;
      if (event.eventType === 'busy') leadStatus = 'BUSY';
      else if (event.eventType === 'missed') leadStatus = 'NO_ANSWER';
      else if (event.eventType === 'failed') {
        const s = JSON.stringify(event.rawPayload ?? {}).toLowerCase();
        leadStatus = s.includes('wrong number') || s.includes('invalid') ? 'WRONG_NUMBER' : 'NO_ANSWER';
      }
      if (leadStatus) await this.prisma.lead.update({ where: { id: existing.leadId }, data: { status: leadStatus as never, lastActivityAt: new Date() } }).catch(() => {});
      else if (event.eventType === 'completed' || event.eventType === 'missed' || event.eventType === 'busy') {
        await this.prisma.lead.update({ where: { id: existing.leadId }, data: { lastActivityAt: new Date() } }).catch(() => {});
      }
    }
  }

  async hangup(id: string, user: AuthUser) {
    // Accept a CRM call id OR a provider reference (live-call wallboards
    // only have the provider's ref_id / call_id).
    const call = await this.prisma.call.findFirst({
      where: { deletedAt: null, OR: [{ id }, { providerCallId: id }, { callSid: id }] },
    });
    if (!call) throw new NotFoundException('Call not found');
    this.assertCanActOnCall(user, call.agentId);
    const provider = this.telephonyFactory.getProvider();
    if (provider.hangup && call.providerCallId) { try { await provider.hangup(call.providerCallId); } catch {} }
    const updated = await this.prisma.call.update({ where: { id: call.id }, data: { status: 'COMPLETED', completedAt: new Date() }, include: callInclude });
    setTimeout(async () => { try { await this.findById(call.id); } catch {} }, 4000);
    return updated;
  }

  async callOperation(id: string, user: AuthUser, type: number, target?: string) {
    const call = await this.prisma.call.findFirst({ where: { id, deletedAt: null } });
    if (!call) throw new NotFoundException('Call not found');
    this.assertCanActOnCall(user, call.agentId);
    const provider = this.telephonyFactory.getProvider();
    if (!provider.callOperation) throw new BadRequestException('Operation not supported');
    const isTransfer = type === 4;
    const params: Record<string, unknown> = { type };
    if (call.providerCallId) (params as Record<string, string>).refId = call.providerCallId;
    if (isTransfer && target) (params as Record<string, string>).intercom = target;
    else if (!isTransfer && target) (params as Record<string, string>).agentId = target;
    return provider.callOperation(params as never);
  }

  async liveCalls() {
    const provider = this.telephonyFactory.getProvider();
    if (provider.liveCalls) return provider.liveCalls();
    return [];
  }

  async cdrForCall(id: string) {
    const call = await this.prisma.call.findFirst({ where: { id, deletedAt: null } });
    if (!call || !call.dialedNumber) throw new NotFoundException('Call not found');
    const token = process.env.TATA_TOKEN;
    if (!token) throw new BadRequestException('TATA_TOKEN not configured');
    const from = new Date(call.startedAt); from.setHours(from.getHours() - 1);
    const to = new Date(call.startedAt); to.setHours(to.getHours() + 1);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    const url = `https://api-smartflo.tatateleservices.com/v1/call/records?from_date=${encodeURIComponent(fmt(from))}&to_date=${encodeURIComponent(fmt(to))}&limit=20`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    if (!res.ok) throw new BadRequestException(`CDR fetch failed: ${res.status}`);
    const body = (await res.json()) as { results?: Array<Record<string, unknown>> };
    const rec = body.results?.find((r) => String((r as Record<string, unknown>).client_number ?? '').replace(/\D/g, '').endsWith(call.dialedNumber.replace(/\D/g, '').slice(-10)));
    return rec ?? null;
  }

  async updateCall(
    id: string,
    user: AuthUser,
    outcome?: CallOutcome,
    notes?: string,
    durationSecs?: number,
  ) {
    const call = await this.prisma.call.findFirst({ where: { id, deletedAt: null } });
    if (!call) throw new NotFoundException('Call not found');
    this.assertCanActOnCall(user, call.agentId);

    const updated = await this.prisma.call.update({
      where: { id },
      data: {
        ...(outcome ? { outcome } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(durationSecs !== undefined ? { durationSecs } : {}),
      },
      include: callInclude,
    });

    // A call-back disposition must leave a trace: flip the lead status and
    // auto-schedule the promised follow-up so it is never lost.
    if (outcome === 'CALL_BACK_REQUESTED' && call.leadId) {
      const agentId = call.agentId ?? user.id;
      await this.prisma.lead.updateMany({
        where: { id: call.leadId, deletedAt: null, status: { notIn: ['ORDER_CREATED', 'CONVERTED', 'CANCELLED'] } },
        data: { status: 'CALL_BACK_REQUESTED', lastActivityAt: new Date() },
      }).catch(() => {});
      try {
        const existingFollowUp = await this.prisma.followUp.findFirst({
          where: { leadId: call.leadId, isDone: false, deletedAt: null, title: 'Call Back Requested' },
          select: { id: true },
        });
        if (!existingFollowUp) {
          await this.followUpsService.createCallBack(call.leadId, call.customerId, agentId);
        }
      } catch {}
    }

    return updated;
  }

  private baseUrl(): string { return process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`; }
}
