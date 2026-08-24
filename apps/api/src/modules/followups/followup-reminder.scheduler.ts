import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Dispatches due follow-up reminders as in-app notifications (+ FCM push
 * when configured). Runs every minute.
 *
 * Dedupe strategy: a reminder is considered dispatched when a notification
 * with entity=FOLLOW_UP_REMINDER / entityId=<followUp.id> exists that was
 * created at or after the reminder's timestamp — so retries never spam the
 * agent, but a newly-due later reminder still fires.
 */
@Injectable()
export class FollowUpReminderScheduler {
  private readonly logger = new Logger(FollowUpReminderScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async dispatchDueReminders(): Promise<void> {
    try {
      const now = new Date();
      // Bounded scan: only open follow-ups scheduled within the last 30 days
      // can have a due reminder worth firing.
      const windowStart = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
      const candidates = await this.prisma.followUp.findMany({
        where: {
          deletedAt: null,
          isDone: false,
          reminders: { isEmpty: false },
          scheduledFor: { gte: windowStart },
        },
        select: {
          id: true,
          agentId: true,
          customerId: true,
          title: true,
          reminders: true,
          customer: { select: { name: true } },
        },
      });
      if (candidates.length === 0) return;

      // followUpId -> most recent reminder that has become due
      const dueByFollowUp = new Map<string, Date>();
      for (const fu of candidates) {
        let latestDue: Date | null = null;
        for (const reminder of fu.reminders) {
          if (reminder.getTime() <= now.getTime() && (!latestDue || reminder > latestDue)) {
            latestDue = reminder;
          }
        }
        if (latestDue) dueByFollowUp.set(fu.id, latestDue);
      }
      if (dueByFollowUp.size === 0) return;

      const dueIds = [...dueByFollowUp.keys()];
      const previouslySent = await this.prisma.notification.findMany({
        where: { entity: 'FOLLOW_UP_REMINDER', entityId: { in: dueIds } },
        select: { entityId: true, createdAt: true },
      });
      const alreadyDispatched = new Set(
        previouslySent
          .filter((n) => {
            const dueAt = n.entityId ? dueByFollowUp.get(n.entityId) : undefined;
            return dueAt && n.createdAt >= dueAt;
          })
          .map((n) => n.entityId),
      );

      const pending = candidates.filter(
        (fu) => fu.agentId && !alreadyDispatched.has(fu.id),
      );
      for (const fu of pending) {
        const title = fu.title?.trim() || 'Follow-up';
        await this.notificationsService.notify({
          userIds: [fu.agentId!],
          type: 'SYSTEM',
          title: 'Follow-up reminder',
          body: `${title}${fu.customer?.name ? ` — ${fu.customer.name}` : ''} is due`,
          entity: 'FOLLOW_UP_REMINDER',
          entityId: fu.id,
          data: { customerId: fu.customerId, scheduledFor: fu.reminders[fu.reminders.length - 1]?.toISOString() },
        });
        await this.notificationsService.sendPush(
          fu.agentId!,
          'Follow-up reminder',
          `${title}${fu.customer?.name ? ` — ${fu.customer.name}` : ''} is due`,
          { customerId: fu.customerId },
        );
      }

      if (pending.length > 0) {
        this.logger.log(`Dispatched ${pending.length} follow-up reminder(s)`);
      }
    } catch (e) {
      this.logger.error(`Follow-up reminder dispatch failed: ${(e as Error).message}`);
    }
  }
}
