import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class GroupMeService {
  private readonly logger = new Logger(GroupMeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async connect(orgId: string, botId: string, groupName?: string) {
    return this.prisma.groupMeConnection.create({
      data: { orgId, botId, groupName },
    });
  }

  async disconnect(connectionId: string): Promise<void> {
    await this.prisma.groupMeConnection.delete({ where: { id: connectionId } });
  }

  async getConnections(orgId: string) {
    return this.prisma.groupMeConnection.findMany({
      where: { orgId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async postMessage(orgId: string, text: string): Promise<void> {
    const connections = await this.prisma.groupMeConnection.findMany({
      where: { orgId, isActive: true },
    });

    for (const conn of connections) {
      try {
        await fetch('https://api.groupme.com/v3/bots/post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bot_id: conn.botId, text }),
        });
      } catch (err: any) {
        this.logger.error(`Failed to post to GroupMe: ${err.message}`);
      }
    }
  }

  async notifyPaymentReceived(orgId: string, payerName: string, amount: string, chargeTitle?: string): Promise<void> {
    const text = chargeTitle
      ? `\u2705 ${payerName} paid $${amount} for ${chargeTitle}`
      : `\u2705 ${payerName} paid $${amount}`;
    await this.postMessage(orgId, text);
  }

  async notifyOverdue(orgId: string, memberName: string, amount: string, chargeTitle: string): Promise<void> {
    await this.postMessage(orgId, `\u23F0 Reminder: ${memberName} owes $${amount} for ${chargeTitle}`);
  }

  async notifyWeeklySummary(orgId: string, stats: { paymentsCount: number; collectedDollars: string; outstandingDollars: string; overdueCount: number }): Promise<void> {
    const lines = [
      `\uD83D\uDCCA Weekly Summary`,
      `\u2022 ${stats.paymentsCount} payments received ($${stats.collectedDollars})`,
      `\u2022 $${stats.outstandingDollars} outstanding`,
    ];
    if (stats.overdueCount > 0) {
      lines.push(`\u2022 ${stats.overdueCount} overdue charge${stats.overdueCount !== 1 ? 's' : ''}`);
    }
    await this.postMessage(orgId, lines.join('\n'));
  }
}
