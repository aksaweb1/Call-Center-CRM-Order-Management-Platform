import { Injectable } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

export interface AuditRecordInput {
  userId: string;
  action: AuditAction;
  entity: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditRecordInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        oldValue: (input.oldValue as object) ?? undefined,
        newValue: (input.newValue as object) ?? undefined,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        reason: input.reason,
      },
    });
  }

  find(params: {
    page: number;
    limit: number;
    entity?: string;
    entityId?: string;
    userId?: string;
    from?: Date;
    to?: Date;
  }) {
    const { page, limit, entity, entityId, userId, from, to } = params;
    return this.prisma.$transaction([
      this.prisma.auditLog.count({
        where: {
          ...(entity ? { entity } : {}),
          ...(entityId ? { entityId } : {}),
          ...(userId ? { userId } : {}),
          ...(from || to
            ? { createdAt: { gte: from, lte: to } }
            : {}),
        },
      }),
      this.prisma.auditLog.findMany({
        where: {
          ...(entity ? { entity } : {}),
          ...(entityId ? { entityId } : {}),
          ...(userId ? { userId } : {}),
          ...(from || to ? { createdAt: { gte: from, lte: to } } : {}),
        },
        include: { user: { select: { id: true, fullName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
  }
}