import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { GroupMeService } from '../groupme/groupme.service';

@Injectable()
export class NotificationChannelsService {
  private readonly logger = new Logger(NotificationChannelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly groupmeService: GroupMeService,
    private readonly configService: ConfigService,
  ) {}

  private getJoinLink(joinCode: string | null): string | null {
    if (!joinCode) return null;
    const webUrl = this.configService.get<string>('WEB_URL', 'http://localhost:3000');
    return `${webUrl}/join?code=${joinCode}`;
  }

  async broadcastToOrg(orgId: string, message: string): Promise<void> {
    await this.groupmeService.postMessage(orgId, message).catch(() => {});

    const discordConns = await this.prisma.discordConnection.findMany({
      where: { orgId, isActive: true },
    });
    for (const conn of discordConns) {
      try {
        await fetch(conn.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: message }),
        });
      } catch {}
    }

    const slackConns = await this.prisma.slackConnection.findMany({
      where: { orgId, isActive: true },
    });
    for (const conn of slackConns) {
      try {
        await fetch(conn.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: message }),
        });
      } catch {}
    }
  }

  async notifyPaymentReceived(orgId: string, payerName: string, amount: string, chargeTitle?: string): Promise<void> {
    const text = chargeTitle
      ? `\u2705 ${payerName} paid $${amount} for ${chargeTitle}`
      : `\u2705 ${payerName} paid $${amount}`;
    await this.broadcastToOrg(orgId, text);
  }

  async notifyOverdue(orgId: string, memberName: string, amount: string, chargeTitle: string): Promise<void> {
    await this.broadcastToOrg(orgId, `\u23F0 Reminder: ${memberName} owes $${amount} for ${chargeTitle}`);
  }

  async notifyWeeklySummary(orgId: string, stats: { paymentsCount: number; collectedDollars: string; outstandingDollars: string; overdueCount: number }): Promise<void> {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { joinCode: true } });
    const joinLink = this.getJoinLink(org?.joinCode ?? null);
    const lines = [
      `\uD83D\uDCCA Weekly Summary`,
      `\u2022 ${stats.paymentsCount} payments received ($${stats.collectedDollars})`,
      `\u2022 $${stats.outstandingDollars} outstanding`,
    ];
    if (stats.overdueCount > 0) {
      lines.push(`\u2022 ${stats.overdueCount} overdue charge${stats.overdueCount !== 1 ? 's' : ''}`);
    }
    if (joinLink) {
      lines.push(`\nJoin: ${joinLink}`);
    }
    await this.broadcastToOrg(orgId, lines.join('\n'));
  }

  async getDiscordConnections(orgId: string) {
    return this.prisma.discordConnection.findMany({
      where: { orgId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async connectDiscord(orgId: string, webhookUrl: string, channelName?: string) {
    return this.prisma.discordConnection.create({
      data: { orgId, webhookUrl, channelName },
    });
  }

  async disconnectDiscord(connectionId: string) {
    await this.prisma.discordConnection.delete({ where: { id: connectionId } });
  }

  async testDiscord(orgId: string) {
    const conns = await this.prisma.discordConnection.findMany({
      where: { orgId, isActive: true },
    });
    for (const conn of conns) {
      try {
        await fetch(conn.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: '\uD83C\uDF89 Ledgly is connected! Financial updates will appear here.' }),
        });
      } catch {}
    }
  }

  async getSlackConnections(orgId: string) {
    return this.prisma.slackConnection.findMany({
      where: { orgId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async connectSlack(orgId: string, webhookUrl: string, channelName?: string) {
    return this.prisma.slackConnection.create({
      data: { orgId, webhookUrl, channelName },
    });
  }

  async disconnectSlack(connectionId: string) {
    await this.prisma.slackConnection.delete({ where: { id: connectionId } });
  }

  async testSlack(orgId: string) {
    const conns = await this.prisma.slackConnection.findMany({
      where: { orgId, isActive: true },
    });
    for (const conn of conns) {
      try {
        await fetch(conn.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: '\uD83C\uDF89 Ledgly is connected! Financial updates will appear here.' }),
        });
      } catch {}
    }
  }
}
