import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../auth/email.service';

@Injectable()
export class DigestSchedulerService {
  private readonly logger = new Logger(DigestSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private configService: ConfigService,
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
  }
}
