import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { CreateFollowUpDto, UpdateFollowUpDto } from './dto/followup.dto';
import { AuthUser } from '../../common/interfaces/auth.interface';
import { RoleType } from '../../common/enums/types.enum';

const followUpInclude = {
  lead: { select: { id: true, title: true, status: true } },
  customer: { select: { id: true, name: true, phone: true } },
  agent: { select: { id: true, fullName: true } },
} satisfies Prisma.FollowUpInclude;

export interface FollowUpRange {
  agentId?: string;
  from: Date;
  to: Date;
  customerId?: string;
}

@Injectable()
export class FollowUpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
  ) {}

  async create(dto: CreateFollowUpDto, userId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, deletedAt: null },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const followUp = await this.prisma.followUp.create({
      data: {
        customerId: dto.customerId,
        leadId: dto.leadId,
        agentId: userId,
        scheduledFor: new Date(dto.scheduledFor),
        title: dto.title ?? 'Follow-up',
        description: dto.description,
        reminders: dto.reminders ?? [],
        isDone: false,
      },
      include: followUpInclude,
    });

    await this.activityService.record({
      userId,
      customerId: dto.customerId,
      leadId: dto.leadId,
      action: 'Follow Up Created',
      metadata: { scheduledFor: dto.scheduledFor },
    });
    return followUp;
  }

  /** Auto-create a follow-up when a lead requests a call-back. */
  async createCallBack(leadId: string, customerId: string, agentId: string, hours = 24) {
    const scheduledFor = new Date(Date.now() + hours * 3600 * 1000);
    return this.prisma.followUp.create({
      data: {
        leadId,
        customerId,
        agentId,
        scheduledFor,
        title: 'Call Back Requested',
        isDone: false,
      },
      include: followUpInclude,
    });
  }

  private buildScopeFilter(user: AuthUser): Prisma.FollowUpWhereInput {
    if (user.role === RoleType.AGENT || user.role === RoleType.SUPPORT || user.role === RoleType.VIEWER) {
      return { agentId: user.id };
    }
    if (user.role === RoleType.TEAM_LEADER && user.teamId) {
      return { agent: { teamId: user.teamId } };
    }
    // SUPER_ADMIN, ADMIN, MANAGER, QA etc see all
    return {};
  }

  async listForAgent(agentId: string, leadId?: string, page = 1, limit = 20) {
    const p = Math.max(1, Math.floor(Number(page) || 1));
    const l = Math.max(1, Math.floor(Number(limit) || 20));
    const where = {
      deletedAt: null,
      agentId,
      ...(leadId ? { leadId } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.followUp.count({ where }),
      this.prisma.followUp.findMany({
        where,
        include: followUpInclude,
        orderBy: { scheduledFor: 'asc' },
        ...(p === 1 ? {} : { skip: (p - 1) * l }),
        take: l,
      }),
    ]);
    return { items, total, page: p, limit: l, totalPages: Math.ceil(total / l) };
  }

  async listForUser(user: AuthUser, leadId?: string, page = 1, limit = 20) {
    const p = Math.max(1, Math.floor(Number(page) || 1));
    const l = Math.max(1, Math.floor(Number(limit) || 20));
    const scope = this.buildScopeFilter(user);
    const where: Prisma.FollowUpWhereInput = {
      deletedAt: null,
      ...scope,
      ...(leadId ? { leadId } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.followUp.count({ where }),
      this.prisma.followUp.findMany({
        where,
        include: followUpInclude,
        orderBy: { scheduledFor: 'asc' },
        ...(p === 1 ? {} : { skip: (p - 1) * l }),
        take: l,
      }),
    ]);
    return { items, total, page: p, limit: l, totalPages: Math.ceil(total / l) };
  }

  async range(report: FollowUpRange) {
    return this.prisma.followUp.findMany({
      where: {
        deletedAt: null,
        isDone: false,
        scheduledFor: { gte: report.from, lte: report.to },
        ...(report.agentId ? { agentId: report.agentId } : {}),
        ...(report.customerId ? { customerId: report.customerId } : {}),
      },
      include: followUpInclude,
      orderBy: { scheduledFor: 'asc' },
    });
  }

  async todaysForAgent(agentId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return this.range({ agentId, from: start, to: end });
  }

  async todaysForUser(user: AuthUser) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const scope = this.buildScopeFilter(user);
    return this.prisma.followUp.findMany({
      where: { deletedAt: null, isDone: false, scheduledFor: { gte: start, lte: end }, ...scope },
      include: followUpInclude,
      orderBy: { scheduledFor: 'asc' },
    });
  }

  async pendingCountForAgent(agentId: string): Promise<{ count: number }> {
    const count = await this.prisma.followUp.count({
      where: { agentId, isDone: false, deletedAt: null },
    });
    return { count };
  }

  async pendingCountForUser(user: AuthUser): Promise<{ count: number }> {
    const scope = this.buildScopeFilter(user);
    const count = await this.prisma.followUp.count({
      where: { isDone: false, deletedAt: null, ...scope },
    });
    return { count };
  }

  async upcomingForAgent(agentId: string, days = 7) {
    const from = new Date();
    const to = new Date(Date.now() + days * 24 * 3600 * 1000);
    return this.range({ agentId, from, to });
  }

  async overdueForAgent(agentId: string) {
    return this.prisma.followUp.findMany({
      where: {
        agentId,
        deletedAt: null,
        isDone: false,
        scheduledFor: { lt: new Date() },
      },
      include: followUpInclude,
      orderBy: { scheduledFor: 'asc' },
    });
  }

  async overdueForUser(user: AuthUser) {
    const scope = this.buildScopeFilter(user);
    return this.prisma.followUp.findMany({
      where: { deletedAt: null, isDone: false, scheduledFor: { lt: new Date() }, ...scope },
      include: followUpInclude,
      orderBy: { scheduledFor: 'asc' },
    });
  }

  async rangeForUser(user: AuthUser, from: Date, to: Date) {
    const scope = this.buildScopeFilter(user);
    return this.prisma.followUp.findMany({
      where: { deletedAt: null, isDone: false, scheduledFor: { gte: from, lte: to }, ...scope },
      include: followUpInclude,
      orderBy: { scheduledFor: 'asc' },
    });
  }

  async update(id: string, dto: UpdateFollowUpDto, actor: AuthUser) {
    // Scope the lookup by the caller's role so agents can only touch
    // their own follow-ups (mirrors listForUser).
    const existing = await this.prisma.followUp.findFirst({
      where: { id, deletedAt: null, ...this.buildScopeFilter(actor) },
    });
    if (!existing) throw new NotFoundException('Follow-up not found');

    const followUp = await this.prisma.followUp.update({
      where: { id },
      data: {
        ...(dto.scheduledFor ? { scheduledFor: new Date(dto.scheduledFor) } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.isDone !== undefined
          ? { isDone: dto.isDone, completedAt: dto.isDone ? new Date() : null }
          : {}),
      },
      include: followUpInclude,
    });

    if (dto.isDone) {
      await this.activityService.record({
        userId: actor.id,
        customerId: followUp.customerId,
        ...(followUp.leadId ? { leadId: followUp.leadId } : {}),
        action: 'Follow Up Completed',
      });
    }
    return followUp;
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const existing = await this.prisma.followUp.findFirst({
      where: { id, deletedAt: null, ...this.buildScopeFilter(actor) },
    });
    if (!existing) throw new NotFoundException('Follow-up not found');
    await this.prisma.followUp.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}