import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../auth/email.service';

@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async processReminders() {
    const rules = await this.prisma.reminderRule.findMany({
      where: { isActive: true },
    });

    if (rules.length === 0) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const rule of rules) {
      try {
        await this.processRule(rule, today);
      } catch (error) {
        this.logger.error(`Reminder rule ${rule.id} failed:`, error);
      }
    }
  }

  private async processRule(rule: any, today: Date) {
    // Find charges that match this rule's criteria
    const targetDate = new Date(today);

    let charges: any[];

    if (rule.triggerType === 'BEFORE_DUE') {
      // Charges with dueDate - daysOffset <= today < dueDate
      const dueDateMin = new Date(today);
      dueDateMin.setDate(dueDateMin.getDate() + rule.daysOffset);
      const dueDateMax = new Date(dueDateMin);
      dueDateMax.setDate(dueDateMax.getDate() + 1);

      charges = await this.prisma.charge.findMany({
        where: {
          orgId: rule.orgId,
          status: { in: ['OPEN', 'PARTIALLY_PAID'] },
          dueDate: { gte: dueDateMin, lt: dueDateMax },
          membershipId: { not: null },
        },
        include: {
          membership: {
            select: {
              user: { select: { email: true } },
            },
          },
          org: { select: { name: true } },
        },
      });
    } else {
      // AFTER_DUE: charges with dueDate + daysOffset <= today
      targetDate.setDate(targetDate.getDate() - rule.daysOffset);
      const targetDateEnd = new Date(targetDate);
      targetDateEnd.setDate(targetDateEnd.getDate() + 1);

      charges = await this.prisma.charge.findMany({
        where: {
          orgId: rule.orgId,
          status: { in: ['OPEN', 'PARTIALLY_PAID'] },
          dueDate: { gte: targetDate, lt: targetDateEnd },
          membershipId: { not: null },
        },
        include: {
          membership: {
            select: {
              user: { select: { email: true } },
            },
          },
          org: { select: { name: true } },
        },
      });
    }

    let sentCount = 0;
    for (const charge of charges) {
      const email = charge.membership?.user?.email;
      if (!email) continue;

      // Check if already sent (unique on ruleId+chargeId)
      const existing = await this.prisma.reminderLog.findUnique({
        where: { ruleId_chargeId: { ruleId: rule.id, chargeId: charge.id } },
      });
      if (existing) continue;

      try {
        await this.emailService.sendOverdueReminder(
          email,
          charge.title,
          (charge.amountCents / 100).toFixed(2),
          charge.org.name,
          charge.dueDate ? charge.dueDate.toISOString().split('T')[0] : 'No due date',
        );

        await this.prisma.reminderLog.create({
          data: {
            orgId: rule.orgId,
            chargeId: charge.id,
            ruleId: rule.id,
            recipientEmail: email,
          },
        });

        sentCount++;
      } catch (error) {
        this.logger.error(`Failed to send reminder for charge ${charge.id}:`, error);
      }
    }

    if (sentCount > 0) {
      this.logger.log(`Rule ${rule.id}: sent ${sentCount} reminder(s)`);
    }
  }
}
