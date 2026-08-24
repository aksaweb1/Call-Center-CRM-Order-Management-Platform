import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { Prisma } from '@prisma/client';

export interface RecordActivityInput {
  userId?: string | null;
  customerId?: string;
  leadId?: string;
  orderId?: string;
  action: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Central timeline writer. Every module records activity through this service
 * so customers/leads/orders always carry an audit-friendly timeline.
 */
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordActivityInput, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.activity.create({
      data: {
        userId: input.userId ?? null,
        customerId: input.customerId,
        leadId: input.leadId,
        orderId: input.orderId,
        action: input.action,
        entityId: input.entityId,
        metadata: (input.metadata ?? {}) as object,
      },
    });
  }

  findForCustomer(customerId: string, page = 1, limit = 50) {
    return this.prisma.activity.findMany({
      where: { customerId, deletedAt: null },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  findForLead(leadId: string, page = 1, limit = 50) {
    return this.prisma.activity.findMany({
      where: { leadId, deletedAt: null },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  findForOrder(orderId: string, page = 1, limit = 50) {
    return this.prisma.activity.findMany({
      where: { orderId, deletedAt: null },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }
}