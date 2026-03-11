import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ChargesService } from '../charges/charges.service';
import { SchedulesService } from './schedules.service';

@Injectable()
export class ScheduleRunnerService {
  private readonly logger = new Logger(ScheduleRunnerService.name);

  constructor(
    private prisma: PrismaService,
    private chargesService: ChargesService,
    private schedulesService: SchedulesService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runDueSchedules() {
    const now = new Date();

    const dueSchedules = await this.prisma.chargeSchedule.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: now },
      },
    });

    if (dueSchedules.length === 0) return;

    this.logger.log(`Processing ${dueSchedules.length} due schedule(s)`);

    for (const schedule of dueSchedules) {
      try {
        // Resolve target member IDs
        let membershipIds: string[];

        if (schedule.targetScope === 'SPECIFIC' && schedule.targetIds.length > 0) {
          membershipIds = schedule.targetIds;
        } else {
          // ALL_ACTIVE — query active members
          const members = await this.prisma.membership.findMany({
            where: { orgId: schedule.orgId, status: 'ACTIVE' },
            select: { id: true },
          });
          membershipIds = members.map((m) => m.id);
        }

        if (membershipIds.length === 0) {
          this.logger.warn(`Schedule ${schedule.id}: no target members found, skipping`);
          continue;
        }

        // Create charges using existing multi-charge service
        await this.chargesService.createMultiCharge(schedule.orgId, schedule.createdById, {
          membershipIds,
          category: schedule.category,
          title: schedule.title,
          amountCents: schedule.amountCents,
        });

        // Update schedule: lastRunAt + next run
        const nextRunAt = this.schedulesService.calculateNextRun(
          schedule.frequency,
          schedule.dayOfMonth,
          schedule.monthOfYear,
        );

        await this.prisma.chargeSchedule.update({
          where: { id: schedule.id },
          data: { lastRunAt: now, nextRunAt },
        });

        this.logger.log(`Schedule ${schedule.id}: created charges for ${membershipIds.length} members, next run: ${nextRunAt.toISOString()}`);
      } catch (error) {
        this.logger.error(`Schedule ${schedule.id} failed:`, error);
      }
    }
  }
}
