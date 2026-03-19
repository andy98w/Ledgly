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

  private async appendFooter(orgId: string, message: string): Promise<string> {
    try {
      const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { joinCode: true, name: true } });
      const joinLink = this.getJoinLink(org?.joinCode ?? null);
      const divider = '\n━━━━━━━━━━━━━━━━━━━━';
      const footer = joinLink
        ? `${divider}\n📋 *${org?.name || 'Ledgly'}* · Powered by Ledgly\n🔗 Join: ${joinLink}`
        : `${divider}\n📋 Powered by Ledgly`;
      return message + footer;
    } catch {
      return message + '\n━━━━━━━━━━━━━━━━━━━━\n📋 Powered by Ledgly';
    }
  }

  async broadcastToOrg(orgId: string, message: string): Promise<void> {
    const fullMessage = await this.appendFooter(orgId, message);
    await this.groupmeService.postMessage(orgId, fullMessage).catch(() => {});

    const discordConns = await this.prisma.discordConnection.findMany({
      where: { orgId, isActive: true },
    });
    for (const conn of discordConns) {
      try {
        const discordMsg = fullMessage.length > 2000 ? fullMessage.slice(0, 1997) + '...' : fullMessage;
        const res = await fetch(conn.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: discordMsg }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          this.logger.error(`Discord webhook failed (${res.status}): ${body}`);
        }
      } catch (err: any) {
        this.logger.error(`Discord webhook error: ${err.message}`);
      }
    }

    const slackConns = await this.prisma.slackConnection.findMany({
      where: { orgId, isActive: true },
    });
    for (const conn of slackConns) {
      try {
        const res = await fetch(conn.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: fullMessage }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          this.logger.error(`Slack webhook failed (${res.status}): ${body}`);
        }
      } catch (err: any) {
        this.logger.error(`Slack webhook error: ${err.message}`);
      }
    }
  }

  private async getTemplate(orgId: string, type: string, vars: Record<string, string>): Promise<string> {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { notificationTemplates: true },
      });
      const templates = (org?.notificationTemplates as Record<string, string>) || {};
      const template = templates[type];
      if (!template) return this.applyDefaults(type, vars);
      return Object.entries(vars).reduce(
        (text, [key, value]) => text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value),
        template,
      );
    } catch {
      return this.applyDefaults(type, vars);
    }
  }

  private applyDefaults(type: string, vars: Record<string, string>): string {
    const defaults: Record<string, string> = {
      payment_received: '\u2705 {{payerName}} paid ${{amount}} for {{chargeTitle}}',
      overdue_reminder: '\u23F0 Reminder: {{memberName}} owes ${{amount}} for {{chargeTitle}}',
      weekly_summary: '\uD83D\uDCCA Weekly Summary\n\u2022 {{paymentsCount}} payments received (${{collected}})\n\u2022 ${{outstanding}} outstanding',
    };
    const template = defaults[type] || '';
    return Object.entries(vars).reduce(
      (text, [key, value]) => text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value),
      template,
    );
  }

  async notifyPaymentReceived(orgId: string, payerName: string, amount: string, chargeTitle?: string): Promise<void> {
    const text = await this.getTemplate(orgId, 'payment_received', {
      payerName,
      amount,
      chargeTitle: chargeTitle || 'payment',
    });
    await this.broadcastToOrg(orgId, text);
  }

  async notifyOverdue(orgId: string, memberName: string, amount: string, chargeTitle: string): Promise<void> {
    const text = await this.getTemplate(orgId, 'overdue_reminder', {
      memberName,
      amount,
      chargeTitle,
    });

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { paymentHandles: true, enabledPaymentSources: true },
    });
    const handles = (org?.paymentHandles as Record<string, string>) || {};
    const sources = org?.enabledPaymentSources || [];
    const payLinks: string[] = [];
    if (sources.includes('venmo') && handles.venmo) payLinks.push(`Venmo: ${handles.venmo}`);
    if (sources.includes('zelle') && handles.zelle) payLinks.push(`Zelle: ${handles.zelle}`);
    if (sources.includes('cashapp') && handles.cashapp) payLinks.push(`Cash App: ${handles.cashapp}`);
    if (sources.includes('paypal') && handles.paypal) payLinks.push(`PayPal: ${handles.paypal}`);

    const fullText = payLinks.length > 0
      ? `${text}\n💳 ${payLinks.join(' | ')}`
      : text;
    await this.broadcastToOrg(orgId, fullText);
  }

  async notifyWeeklySummary(orgId: string, stats: { paymentsCount: number; collectedDollars: string; outstandingDollars: string; overdueCount: number }): Promise<void> {
    const text = await this.getTemplate(orgId, 'weekly_summary', {
      paymentsCount: String(stats.paymentsCount),
      collected: stats.collectedDollars,
      outstanding: stats.outstandingDollars,
      overdueCount: String(stats.overdueCount),
    });
    await this.broadcastToOrg(orgId, text);
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
    if (conns.length === 0) {
      this.logger.warn(`No active Discord connections for org ${orgId}`);
      return;
    }
    for (const conn of conns) {
      try {
        const res = await fetch(conn.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: '\uD83C\uDF89 Ledgly is connected! Financial updates will appear here.' }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          this.logger.error(`Discord test failed (${res.status}): ${body}`);
          throw new Error(`Discord returned ${res.status}: ${body}`);
        }
      } catch (err: any) {
        this.logger.error(`Discord test error: ${err.message}`);
        throw err;
      }
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
