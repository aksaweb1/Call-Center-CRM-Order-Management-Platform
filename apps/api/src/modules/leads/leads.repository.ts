import { Injectable } from '@nestjs/common';
import { LeadPriority, LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CreateLeadDto, UpdateLeadDto } from './dto/lead.dto';

const leadInclude = {
  customer: true,
  agent: { select: { id: true, fullName: true, avatarUrl: true } },
  team: { select: { id: true, name: true } },
  sourceRef: { select: { id: true, name: true, code: true } },
  tags: { select: { id: true, name: true, color: true } },
  convertedOrder: { select: { id: true, orderNumber: true, total: true, status: true } },
} satisfies Prisma.LeadInclude;

export interface FindLeadsParams {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  priority?: string;
  sourceCode?: string;
  agentId?: string;
  customerId?: string;
  tag?: string;
  from?: Date;
  to?: Date;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

@Injectable()
export class LeadsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: {
      customerId: string;
      sourceId?: string;
      agentId?: string;
      priority?: LeadPriority;
      title?: string;
      description?: string;
      tags?: string[];
    },
    userId: string,
  ) {
    const payload: Prisma.LeadUncheckedCreateInput = {
      customerId: data.customerId,
      sourceId: data.sourceId ?? undefined,
      agentId: data.agentId ?? undefined,
      priority: data.priority ?? 'MEDIUM',
      title: data.title,
      description: data.description,
      status: data.agentId ? 'ASSIGNED' : 'NEW',
      assignedAt: data.agentId ? new Date() : null,
    };
    return this.prisma.lead.create({
      data: payload,
      include: leadInclude,
    });
  }

  findAll(params: FindLeadsParams) {
    const { page, limit, search, status, priority, sourceCode, agentId, customerId, tag, from, to, sortBy, sortOrder } = params;
    const where: Prisma.LeadWhereInput = {
      deletedAt: null,
      ...(status ? { status: status as LeadStatus } : {}),
      ...(priority ? { priority: priority as LeadPriority } : {}),
      ...(sourceCode ? { sourceRef: { code: sourceCode } } : {}),
      ...(agentId ? { agentId } : {}),
      ...(customerId ? { customerId } : {}),
      ...(tag ? { tags: { some: { name: tag } } } : {}),
      ...(from || to ? { createdAt: { gte: from, lte: to } } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { customer: { name: { contains: search, mode: 'insensitive' } } },
              { customer: { phone: { contains: search } } },
              { customer: { email: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    return this.prisma.$transaction([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        include: leadInclude,
        orderBy: this.parseSort(sortBy, sortOrder),
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
  }

  findById(id: string) {
    return this.prisma.lead.findFirst({ where: { id, deletedAt: null }, include: leadInclude });
  }

  findByIdRaw(id: string) {
    return this.prisma.lead.findFirst({ where: { id, deletedAt: null } });
  }

  update(id: string, dto: UpdateLeadDto) {
    return this.prisma.lead.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status as LeadStatus } : {}),
        ...(dto.priority ? { priority: dto.priority as LeadPriority } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
      include: leadInclude,
    });
  }

  assign(leadId: string, agentId: string) {
    return this.prisma.lead.update({
      where: { id: leadId },
      data: { agentId, status: 'ASSIGNED', assignedAt: new Date() },
      include: leadInclude,
    });
  }

  /** Lead statuses that must never be reassigned or re-opened. */
  static readonly TERMINAL_STATUSES: LeadStatus[] = [
    'ORDER_CREATED',
    'CONVERTED',
    'CANCELLED',
    'INVALID_NUMBER',
  ];

  assignMany(leadIds: string[], agentId: string) {
    return this.prisma.lead.updateMany({
      where: {
        id: { in: leadIds },
        deletedAt: null,
        status: { notIn: LeadsRepository.TERMINAL_STATUSES },
      },
      data: { agentId, status: 'ASSIGNED', assignedAt: new Date() },
    });
  }

  /**
   * Links a lead to its first order. The lead enters ORDER_CREATED; it is
   * promoted to CONVERTED when the order is delivered (see markConverted).
   * Callers must reject a second order for the same lead beforehand.
   */
  markOrderCreated(
    leadId: string,
    orderId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.lead.update({
      where: { id: leadId },
      data: {
        status: 'ORDER_CREATED',
        convertedOrderId: orderId,
        lastActivityAt: new Date(),
      },
    });
  }

  /** Terminal conversion — sets CONVERTED with convertedAt once. */
  markConverted(leadId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.lead.update({
      where: { id: leadId },
      data: { status: 'CONVERTED', convertedAt: new Date(), lastActivityAt: new Date() },
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private parseSort(
    sortBy?: string,
    sortOrder: 'asc' | 'desc' = 'desc',
  ): Prisma.LeadOrderByWithRelationInput {
    const allowed: Record<string, Prisma.LeadOrderByWithRelationInput> = {
      createdAt: { createdAt: sortOrder },
      updatedAt: { updatedAt: sortOrder },
      priority: { priority: sortOrder },
      assignedAt: { assignedAt: sortOrder },
    };
    return allowed[sortBy ?? 'createdAt'] ?? allowed.createdAt;
  }
}