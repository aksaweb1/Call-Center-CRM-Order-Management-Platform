import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AssignmentStrategy, RoleType } from '../../common/enums/types.enum';
import { AuthUser } from '../../common/interfaces/auth.interface';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AssignmentService } from './assignment.service';
import { CreateLeadDto, UpdateLeadDto } from './dto/lead.dto';
import { LeadsRepository } from './leads.repository';
import { normalizeLimit, normalizePage } from '../../common/utils/pagination';

const DEFAULT_STRATEGY: AssignmentStrategy = 'ROUND_ROBIN';

@Injectable()
export class LeadsService {
  constructor(
    private readonly repository: LeadsRepository,
    private readonly assignmentService: AssignmentService,
    private readonly activityService: ActivityService,
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Creates a customer (if needed) then a lead. Detects duplicates by phone. */
  async create(dto: CreateLeadDto, userId: string) {
    // Resolve or create the customer record
    let customerId = dto.customerId;
    if (!customerId) {
      const existing = await this.prisma.customer.findFirst({
        where: {
          OR: [
            { phone: dto.phone.replace(/\s+/g, '') },
            ...(dto.email ? [{ email: dto.email.toLowerCase() }] : []),
          ],
        },
      });

      if (existing) {
        customerId = existing.id;
      } else {
        const customer = await this.prisma.customer.create({
          data: {
            name: (dto.customerName ?? '').trim() || 'unknown',
            phone: dto.phone,
            alternatePhone: dto.alternatePhone,
            email: dto.email,
            city: dto.city,
            state: dto.state,
            country: 'IN',
            pincode: dto.pincode,
            createdById: userId,
          },
        });
        customerId = customer.id;
      }
    }

    // Guard against duplicate leads for the same customer within 1 hour, so
    // rapid re-adds (e.g. re-pasting from WhatsApp) don't create duplicates.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await this.prisma.lead.findFirst({
      where: {
        customerId,
        deletedAt: null,
        createdAt: { gte: oneHourAgo },
      },
      select: { id: true, createdAt: true, status: true },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      const ist = recent.createdAt.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      throw new ConflictException(
        `A lead for this customer was already added recently (${ist} IST). Please wait at least 1 hour before adding another.`,
      );
    }

    const source = dto.sourceCode
      ? await this.prisma.leadSource.findUnique({ where: { code: dto.sourceCode } })
      : null;

    const lead = await this.repository.create(
      {
        customerId,
        sourceId: source?.id,
        priority: dto.priority,
        title: dto.title,
        description: dto.description,
      },
      userId,
    );

    // Manual assignment if a specific agent was chosen, else auto per strategy
    if (dto.tags?.length) {
      await this.syncTags(lead.id, dto.tags);
    }

    let agentId: string | null = dto.agentId ?? null;
    if (!agentId) {
      // Customer affinity: if this customer already has a lead handled by an
      // agent, route the new lead to the same agent so one customer stays with
      // one agent instead of being split across the round-robin pool.
      const existing = await this.prisma.lead.findFirst({
        where: { customerId, agentId: { not: null }, deletedAt: null },
        select: { agentId: true },
        orderBy: { createdAt: 'desc' },
      });
      agentId = existing?.agentId ?? (await this.assignmentService.assign(DEFAULT_STRATEGY, lead.id));
    }
    if (agentId) {
      await this.repository.assign(lead.id, agentId);
    }

    await this.activityService.record({
      userId,
      customerId: lead.customerId,
      leadId: lead.id,
      action: 'Lead Created',
      metadata: { source: dto.sourceCode ?? 'MANUAL' },
    });

    return this.repository.findById(lead.id);
  }

  /** Bulk create leads (CSV/JSON import). Skips exact phone duplicates. */
  async bulkImport(items: Array<{
    customerName?: string;
    phone: string;
    email?: string;
    sourceCode?: string;
    priority?: string;
    tags?: string[];
  }>, userId: string) {
    let created = 0;
    const results: Array<{ phone: string; status: 'created' | 'duplicate' | 'error'; error?: string }> = [];

    for (const item of items) {
      try {
        const existing = await this.prisma.customer.findFirst({
          where: { phone: item.phone.replace(/\s+/g, '') },
        });
        if (existing) {
          results.push({ phone: item.phone, status: 'duplicate' });
          continue;
        }
        await this.create(
          {
            customerName: item.customerName,
            phone: item.phone,
            email: item.email,
            sourceCode: item.sourceCode ?? 'CSV Import'.toLowerCase().replace(/ /g, '_'),
            priority: item.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | undefined,
            tags: item.tags,
          },
          userId,
        );
        created++;
        results.push({ phone: item.phone, status: 'created' });
      } catch (e) {
        results.push({ phone: item.phone, status: 'error', error: (e as Error).message });
      }
    }
    return { created, results };
  }

  findAll(
    query: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      priority?: string;
      sourceCode?: string;
      agentId?: string;
      customerId?: string;
      tag?: string;
      from?: string;
      to?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
    actor?: AuthUser,
  ) {
    // Frontline roles only see leads assigned to themselves.
    const ownOnly =
      actor &&
      (actor.role === RoleType.AGENT ||
        actor.role === RoleType.SUPPORT ||
        actor.role === RoleType.VIEWER);
    const where = {
      search: query.search,
      status: query.status,
      priority: query.priority,
      sourceCode: query.sourceCode,
      agentId: ownOnly && !query.customerId ? actor?.id : query.agentId,
      customerId: query.customerId,
      tag: query.tag,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    };
    const page = normalizePage(query.page);
    const limit = normalizeLimit(query.limit);
    return this.repository.findAll({
      page,
      limit,
      ...where,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    }).then(([total, items]) => ({
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }));
  }

  async findById(id: string, actor?: AuthUser) {
    const lead = await this.repository.findById(id);
    if (!lead) throw new NotFoundException('Lead not found');

    const ownOnly =
      actor &&
      (actor.role === RoleType.AGENT ||
        actor.role === RoleType.SUPPORT ||
        actor.role === RoleType.VIEWER);
    if (ownOnly && lead.agentId !== actor.id) {
      throw new NotFoundException('Lead not found');
    }
    return lead;
  }

  /** Frontline roles (agents/support/viewers) may only touch their own leads. */
  private isOwnOnly(actor?: AuthUser): boolean {
    return !!actor &&
      (actor.role === RoleType.AGENT ||
        actor.role === RoleType.SUPPORT ||
        actor.role === RoleType.VIEWER);
  }

  async update(id: string, dto: UpdateLeadDto, userId: string, actor?: AuthUser) {
    const existing = await this.repository.findByIdRaw(id);
    if (!existing) throw new NotFoundException('Lead not found');
    if (this.isOwnOnly(actor) && existing.agentId !== userId) {
      // Same shape as findById so agents can't probe other agents' lead ids.
      throw new NotFoundException('Lead not found');
    }
    if (
      LeadsRepository.TERMINAL_STATUSES.includes(
        existing.status as (typeof LeadsRepository.TERMINAL_STATUSES)[number],
      ) &&
      dto.status &&
      dto.status !== existing.status
    ) {
      throw new ConflictException(
        `Lead is ${existing.status} — its status can no longer change`,
      );
    }

    if (dto.tags) await this.syncTags(id, dto.tags);

    const lead = await this.repository.update(id, dto);
    await this.activityService.record({
      userId,
      customerId: lead.customerId,
      leadId: lead.id,
      action: 'Lead Updated',
      metadata: { status: lead.status },
    });
    return lead;
  }

  async assign(id: string, agentId: string, userId: string) {
    const existing = await this.repository.findByIdRaw(id);
    if (!existing) throw new NotFoundException('Lead not found');
    if (
      LeadsRepository.TERMINAL_STATUSES.includes(
        existing.status as (typeof LeadsRepository.TERMINAL_STATUSES)[number],
      )
    ) {
      throw new ConflictException(
        `Lead is ${existing.status} and cannot be reassigned`,
      );
    }
    const lead = await this.repository.assign(id, agentId);
    await this.activityService.record({
      userId,
      customerId: lead.customerId,
      leadId: lead.id,
      action: 'Lead Assigned',
      metadata: { agentId },
    });
    await this.notificationsService.notify({
      userIds: [agentId],
      type: 'SYSTEM',
      title: 'New lead assigned',
      body: `${lead.customer?.name ?? 'A customer'} — ${lead.title ?? 'lead'} was assigned to you.`,
      entity: 'LEAD',
      entityId: lead.id,
    });
    return lead;
  }

  async assignMany(leadIds: string[], agentId: string, userId: string) {
    const leads = await this.prisma.lead.findMany({
      where: { id: { in: leadIds }, deletedAt: null },
      select: { id: true, status: true },
    });
    const blocked = leads.filter((l) =>
      LeadsRepository.TERMINAL_STATUSES.includes(
        l.status as (typeof LeadsRepository.TERMINAL_STATUSES)[number],
      ),
    );
    if (blocked.length > 0) {
      throw new ConflictException(
        `${blocked.length} lead(s) are in a terminal status (${[...new Set(blocked.map((l) => l.status))].join(', ')}) and cannot be reassigned`,
      );
    }

    const result = await this.repository.assignMany(leadIds, agentId);

    if (result.count > 0) {
      await this.notificationsService.notify({
        userIds: [agentId],
        type: 'SYSTEM',
        title: 'Leads assigned to you',
        body: `${result.count} lead(s) were assigned to you.`,
      });
    }
    for (const lead of leads) {
      await this.activityService.record({
        userId,
        leadId: lead.id,
        action: 'Lead Assigned',
        metadata: { agentId },
      });
    }
    return { assigned: result.count };
  }

  /** Bulk status change. Terminal-status leads are rejected up front. */
  async bulkStatus(
    leadIds: string[],
    status: LeadStatus,
    userId: string,
    actor?: AuthUser,
  ) {
    // Terminal states are only reachable through real flows (order
    // placement/delivery, cancellation) — never via bulk edit.
    const allowedTargets: LeadStatus[] = [
      'NEW', 'ASSIGNED', 'CALLING', 'INTERESTED', 'NO_ANSWER',
      'BUSY', 'WRONG_NUMBER', 'CALL_BACK_REQUESTED', 'NOT_INTERESTED',
    ];
    if (!allowedTargets.includes(status)) {
      throw new ConflictException(`Leads cannot be bulk-set to ${status}`);
    }

    const leads = await this.prisma.lead.findMany({
      where: { id: { in: leadIds }, deletedAt: null },
      select: { id: true, status: true, customerId: true },
    });
    if (leads.length === 0) throw new NotFoundException('No matching leads found');
    const blocked = leads.filter((l) =>
      LeadsRepository.TERMINAL_STATUSES.includes(l.status as (typeof LeadsRepository.TERMINAL_STATUSES)[number]),
    );
    if (blocked.length > 0) {
      throw new ConflictException(
        `${blocked.length} lead(s) are in a terminal status (${[...new Set(blocked.map((l) => l.status))].join(', ')}) and cannot be updated`,
      );
    }
    // Frontline roles may only bulk-update their own leads.
    if (actor && this.isOwnOnly(actor)) {
      const own = await this.prisma.lead.findMany({
        where: { id: { in: leads.map((l) => l.id) }, agentId: actor.id },
        select: { id: true },
      });
      if (own.length !== leads.length) {
        throw new ConflictException('You can only update leads assigned to you');
      }
    }

    const result = await this.prisma.lead.updateMany({
      where: { id: { in: leads.map((l) => l.id) }, deletedAt: null },
      data: { status, lastActivityAt: new Date() },
    });

    for (const l of leads) {
      await this.activityService.record({
        userId,
        customerId: l.customerId,
        leadId: l.id,
        action: 'Lead Status Changed',
        metadata: { to: status, bulk: true },
      });
    }
    return { updated: result.count };
  }

  async remove(id: string): Promise<void> {
    const existing = await this.repository.findByIdRaw(id);
    if (!existing) throw new NotFoundException('Lead not found');
    await this.repository.softDelete(id);
  }

  /** Connects/creates tags on a lead (implicit many-to-many). */
  private async syncTags(leadId: string, tags: string[]): Promise<void> {
    const ids: string[] = [];
    for (const tagName of tags) {
      const tag = await this.prisma.leadTag.upsert({
        where: { name: tagName },
        update: {},
        create: { name: tagName },
      });
      ids.push(tag.id);
    }
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { tags: { connect: ids.map((id) => ({ id })) } },
    });
  }

  async listSources() {
    return this.prisma.leadSource.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async listTags() {
    return this.prisma.leadTag.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { leads: true } } },
    });
  }
}