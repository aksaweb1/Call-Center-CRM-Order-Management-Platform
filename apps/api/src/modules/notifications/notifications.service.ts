import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { NotificationType } from '../../common/enums/types.enum';
import { normalizeLimit, normalizePage } from '../../common/utils/pagination';

export interface NotifyInput {
  userIds: string[];
  type: NotificationType;
  title: string;
  body: string;
  entity?: string;
  entityId?: string;
  data?: Record<string, unknown>;
}

/**
 * Central notification service. Persists in-app notifications (Notification
 * Center with unread counts) and dispatches FCM push when configured.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notify(input: NotifyInput): Promise<number> {
    const data = input.userIds.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      entity: input.entity,
      entityId: input.entityId,
      data: (input.data as object) ?? undefined,
    }));
    const created = await this.prisma.notification.createMany({ data });
    return created.count;
  }

  async findForUser(userId: string, query: { page?: number; limit?: number; unreadOnly?: boolean }) {
    const page = normalizePage(query.page);
    const limit = normalizeLimit(query.limit);
    const where: Prisma.NotificationWhereInput = {
      userId,
      deletedAt: null,
      ...(query.unreadOnly ? { readAt: null } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, readAt: null, deletedAt: null },
    });
  }

  async markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  /** FCM push — uses the legacy FCM HTTP API; no-op without a server key. */
  async sendPush(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const serverKey = process.env.FCM_SERVER_KEY;
    if (!serverKey) return;

    const tokenRow = await this.prisma.pushToken.findUnique({ where: { userId } });
    if (!tokenRow?.token) return;

    try {
      await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          Authorization: `key=${serverKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: tokenRow.token,
          notification: { title, body },
          data: (data as Record<string, string>) ?? {},
        }),
      });
    } catch (e) {
      this.logger.error(`FCM push failed for user ${userId}: ${(e as Error).message}`);
    }
  }
}