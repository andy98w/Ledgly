import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationChannelsService } from '../notifications/notification-channels.service';

@Injectable()
export class AnnouncementsService {
  constructor(
    private prisma: PrismaService,
    private channels: NotificationChannelsService,
  ) {}

  async findAll(orgId: string) {
    return this.prisma.announcement.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: {
          select: { id: true, name: true, user: { select: { name: true } } },
        },
      },
    });
  }

  async create(
    orgId: string,
    actorId: string,
    title: string,
    body: string,
    broadcastToChat = false,
  ) {
    const announcement = await this.prisma.announcement.create({
      data: { orgId, title, body, createdById: actorId },
      include: {
        createdBy: {
          select: { id: true, name: true, user: { select: { name: true } } },
        },
      },
    });

    if (broadcastToChat) {
      const message = body && body !== title
        ? `\uD83D\uDCE2 ${title}\n\n${body}`
        : `\uD83D\uDCE2 ${title}`;
      await this.channels.broadcastToOrg(orgId, message).catch(() => {});
    }

    return announcement;
  }

  async broadcast(orgId: string, id: string) {
    const announcement = await this.prisma.announcement.findFirst({ where: { id, orgId } });
    if (!announcement) return { success: false };
    const message = announcement.body && announcement.body !== announcement.title
      ? `\uD83D\uDCE2 ${announcement.title}\n\n${announcement.body}`
      : `\uD83D\uDCE2 ${announcement.title}`;
    await this.channels.broadcastToOrg(orgId, message);
    return { success: true };
  }

  async delete(orgId: string, id: string) {
    await this.prisma.announcement.deleteMany({
      where: { id, orgId },
    });
    return { success: true };
  }
}
