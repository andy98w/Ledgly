import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../auth/email.service';
import { NotificationChannelsService } from '../notifications/notification-channels.service';

@Injectable()
export class DigestSchedulerService {
  private readonly logger = new Logger(DigestSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private configService: ConfigService,
    private notificationChannels: NotificationChannelsService,
  ) {}

  @Cron('0 9 * * 1')
  async sendWeeklyDigests() {
    const orgs = await this.prisma.organization.findMany({
      select: { id: true, name: true },
    });

    if (orgs.length === 0) return;

    const webUrl = this.configService.get<string>('WEB_URL', 'https://app.ledgly.app');
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    for (const org of orgs) {
      try {
        await this.processOrg(org.id, org.name, sevenDaysAgo, webUrl);
      } catch (error) {
        this.logger.error(`Weekly digest failed for org ${org.id}:`, error);
      }
    }
  }

  async sendDigestForOrg(orgId: string): Promise<{ sent: boolean }> {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
    if (!org) return { sent: false };
    const webUrl = this.configService.get<string>('WEB_URL', 'https://app.ledgly.app');
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    await this.processOrg(orgId, org.name, sevenDaysAgo, webUrl);
    return { sent: true };
  }

  private async processOrg(orgId: string, orgName: string, since: Date, webUrl: string) {
    const [payments, chargesCreated, expensesRecorded, newMembers, outstandingAgg, paidAgainstOutstanding, overdueCount] =
      await Promise.all([
        this.prisma.payment.aggregate({
          where: { orgId, deletedAt: null, paidAt: { gte: since } },
          _count: true,
          _sum: { amountCents: true },
        }),
        this.prisma.charge.count({
          where: { orgId, createdAt: { gte: since } },
        }),
        this.prisma.expense.count({
          where: { orgId, deletedAt: null, createdAt: { gte: since } },
        }),
        this.prisma.membership.count({
          where: { orgId, status: 'ACTIVE', joinedAt: { gte: since } },
        }),
        this.prisma.charge.aggregate({
          where: { orgId, status: { in: ['OPEN', 'PARTIALLY_PAID'] } },
          _sum: { amountCents: true },
        }),
        this.prisma.paymentAllocation.aggregate({
          where: { charge: { orgId, status: { in: ['OPEN', 'PARTIALLY_PAID'] } } },
          _sum: { amountCents: true },
        }),
        this.prisma.charge.count({
          where: { orgId, status: { in: ['OPEN', 'PARTIALLY_PAID'] }, dueDate: { lt: new Date() } },
        }),
      ]);

    const outstandingCents = (outstandingAgg._sum.amountCents || 0) - (paidAgainstOutstanding._sum.amountCents || 0);

    const stats = {
      paymentsCount: payments._count,
      paymentsTotalCents: payments._sum.amountCents || 0,
      chargesCreated,
      expensesRecorded,
      newMembers,
      outstandingCents,
      overdueCount,
    };

    try {
      await this.notificationChannels.notifyWeeklySummary(orgId, {
        paymentsCount: stats.paymentsCount,
        collectedDollars: (stats.paymentsTotalCents / 100).toFixed(2),
        outstandingDollars: (stats.outstandingCents / 100).toFixed(2),
        overdueCount: stats.overdueCount,
      });
    } catch {}

    const admins = await this.prisma.membership.findMany({
      where: {
        orgId,
        status: 'ACTIVE',
        role: { in: ['OWNER', 'ADMIN', 'TREASURER'] },
        userId: { not: null },
      },
      include: { user: { select: { email: true } } },
    });

    const dashboardUrl = `${webUrl}/dashboard`;
    let sentCount = 0;

    for (const admin of admins) {
      const email = admin.user?.email;
      if (!email) continue;

      try {
        await this.emailService.sendWeeklyDigest(email, orgName, stats, dashboardUrl);
        sentCount++;
      } catch (error) {
        this.logger.error(`Failed to send digest to ${email}:`, error);
      }
    }

    if (sentCount > 0) {
      this.logger.log(`Sent ${sentCount} weekly digest(s) for org "${orgName}"`);
    }

    // Send balance summaries to members who owe money
    await this.sendMemberBalanceSummaries(orgId, orgName, webUrl);
  }

  private async sendMemberBalanceSummaries(orgId: string, orgName: string, webUrl: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { paymentHandles: true, enabledPaymentSources: true },
    });

    const members = await this.prisma.membership.findMany({
      where: { orgId, status: 'ACTIVE', role: 'MEMBER', userId: { not: null } },
      include: { user: { select: { email: true, name: true } } },
    });

    if (members.length === 0) return;

    const balanceRows: Array<{
      membership_id: string;
      total_charged: bigint;
      total_paid: bigint;
    }> = await this.prisma.$queryRaw`
      SELECT
        m.id AS membership_id,
        COALESCE((SELECT SUM(c.amount_cents) FROM charges c WHERE c.membership_id = m.id AND c.status != 'VOID'), 0) AS total_charged,
        COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.membership_id = m.id AND p.deleted_at IS NULL), 0) AS total_paid
      FROM memberships m
      WHERE m.org_id = ${orgId} AND m.status = 'ACTIVE' AND m.role = 'MEMBER'
    `;

    const balanceMap = new Map(balanceRows.map((r) => [r.membership_id, Number(r.total_charged) - Number(r.total_paid)]));
    const handles = (org?.paymentHandles as Record<string, string>) ?? {};
    const sources = org?.enabledPaymentSources ?? [];
    const portalUrl = `${webUrl}/portal`;

    let sentCount = 0;
    for (const member of members) {
      const balance = balanceMap.get(member.id) || 0;
      if (balance <= 0) continue;

      const email = member.user?.email;
      if (!email) continue;

      const openCharges = await this.prisma.charge.findMany({
        where: { orgId, membershipId: member.id, status: { in: ['OPEN', 'PARTIALLY_PAID'] } },
        select: { title: true, amountCents: true, dueDate: true },
        orderBy: { dueDate: 'asc' },
        take: 10,
      });

      try {
        await this.emailService.sendBalanceSummary(
          email,
          member.name || member.user?.name || 'Member',
          orgName,
          balance,
          openCharges.map((c) => ({
            title: c.title,
            amountCents: c.amountCents,
            dueDate: c.dueDate ? c.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null,
          })),
          portalUrl,
          handles,
          sources,
        );
        sentCount++;
      } catch (error) {
        this.logger.error(`Failed to send balance summary to ${email}:`, error);
      }
    }

    if (sentCount > 0) {
      this.logger.log(`Sent ${sentCount} balance summary email(s) for org "${orgName}"`);
    }
  }
}
