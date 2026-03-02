import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    orgId: string,
    options: { read?: boolean; limit?: number; offset?: number } = {},
  ) {
    const { read, limit = 50, offset = 0 } = options;

    const where: any = { orgId };
    if (read !== undefined) where.read = read;

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.notification.count({ where }),
    ]);

    const unreadCount = await this.prisma.notification.count({
      where: { orgId, read: false },
    });

    return { data, total, unreadCount };
  }

  async markAsRead(orgId: string, notificationId: string) {
    return this.prisma.notification.update({
      where: { id: notificationId, orgId },
      data: { read: true },
    });
  }

  async markAllAsRead(orgId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { orgId, read: false },
      data: { read: true },
    });
    return { updatedCount: result.count };
  }

  async getUnreadCount(orgId: string) {
    const count = await this.prisma.notification.count({
      where: { orgId, read: false },
    });
    return { count };
  }

  async create(data: {
    orgId: string;
    type: NotificationType;
    title: string;
    body?: string;
    linkUrl?: string;
    userId?: string;
  }) {
    return this.prisma.notification.create({ data });
  }

  async createPaymentNotification(orgId: string, payerName: string, amountCents: number) {
    const amount = (amountCents / 100).toFixed(2);
    return this.create({
      orgId,
      type: NotificationType.PAYMENT_RECEIVED,
      title: 'Payment Received',
      body: `${payerName} paid $${amount}`,
      linkUrl: '/payments',
    });
  }

  async createChargeOverdueNotification(orgId: string, chargeTitle: string, memberName: string) {
    return this.create({
      orgId,
      type: NotificationType.CHARGE_OVERDUE,
      title: 'Charge Overdue',
      body: `${chargeTitle} for ${memberName} is past due`,
      linkUrl: '/charges',
    });
  }

  async createMemberJoinedNotification(orgId: string, memberName: string) {
    return this.create({
      orgId,
      type: NotificationType.MEMBER_JOINED,
      title: 'Member Joined',
      body: `${memberName} joined the organization`,
      linkUrl: '/members',
    });
  }

  async createExpenseNotification(orgId: string, title: string, amountCents: number) {
    const amount = (amountCents / 100).toFixed(2);
    return this.create({
      orgId,
      type: NotificationType.EXPENSE_CREATED,
      title: 'Expense Recorded',
      body: `${title} — $${amount}`,
      linkUrl: '/expenses',
    });
  }
}
