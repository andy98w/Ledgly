import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ChargeCategory, ScheduleFrequency } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

interface CreateScheduleDto {
  title: string;
  category: ChargeCategory;
  amountCents: number;
  frequency: ScheduleFrequency;
  dayOfMonth: number;
  monthOfYear?: number;
  targetScope?: string;
  targetIds?: string[];
}

interface UpdateScheduleDto {
  title?: string;
  amountCents?: number;
  frequency?: ScheduleFrequency;
  dayOfMonth?: number;
  monthOfYear?: number;
  targetScope?: string;
  targetIds?: string[];
  isActive?: boolean;
}

@Injectable()
export class SchedulesService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId: string) {
    return this.prisma.chargeSchedule.findMany({
      where: { orgId },
      orderBy: [{ isActive: 'desc' }, { nextRunAt: 'asc' }],
    });
  }

  async create(orgId: string, createdById: string, dto: CreateScheduleDto) {
    if (dto.dayOfMonth < 1 || dto.dayOfMonth > 28) {
      throw new BadRequestException('Day of month must be between 1 and 28');
    }

    if (dto.frequency === 'YEARLY' && (!dto.monthOfYear || dto.monthOfYear < 1 || dto.monthOfYear > 12)) {
      throw new BadRequestException('Yearly schedules require monthOfYear (1-12)');
    }

    const nextRunAt = this.calculateNextRun(dto.frequency, dto.dayOfMonth, dto.monthOfYear);

    return this.prisma.chargeSchedule.create({
      data: {
        orgId,
        title: dto.title,
        category: dto.category,
        amountCents: dto.amountCents,
        frequency: dto.frequency,
        dayOfMonth: dto.dayOfMonth,
        monthOfYear: dto.monthOfYear,
        targetScope: dto.targetScope || 'ALL_ACTIVE',
        targetIds: dto.targetIds || [],
        createdById,
        nextRunAt,
      },
    });
  }

  async update(orgId: string, id: string, dto: UpdateScheduleDto) {
    const schedule = await this.prisma.chargeSchedule.findFirst({
      where: { id, orgId },
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    if (dto.dayOfMonth !== undefined && (dto.dayOfMonth < 1 || dto.dayOfMonth > 28)) {
      throw new BadRequestException('Day of month must be between 1 and 28');
    }

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.amountCents !== undefined) data.amountCents = dto.amountCents;
    if (dto.frequency !== undefined) data.frequency = dto.frequency;
    if (dto.dayOfMonth !== undefined) data.dayOfMonth = dto.dayOfMonth;
    if (dto.monthOfYear !== undefined) data.monthOfYear = dto.monthOfYear;
    if (dto.targetScope !== undefined) data.targetScope = dto.targetScope;
    if (dto.targetIds !== undefined) data.targetIds = dto.targetIds;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    // Recalculate nextRunAt if schedule timing changed
    if (dto.frequency !== undefined || dto.dayOfMonth !== undefined || dto.monthOfYear !== undefined) {
      const freq = dto.frequency ?? schedule.frequency;
      const day = dto.dayOfMonth ?? schedule.dayOfMonth;
      const month = dto.monthOfYear ?? schedule.monthOfYear;
      data.nextRunAt = this.calculateNextRun(freq, day, month);
    }

    return this.prisma.chargeSchedule.update({
      where: { id },
      data,
    });
  }

  async deactivate(orgId: string, id: string) {
    const schedule = await this.prisma.chargeSchedule.findFirst({
      where: { id, orgId },
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    return this.prisma.chargeSchedule.update({
      where: { id },
      data: { isActive: false },
    });
  }

  calculateNextRun(
    frequency: ScheduleFrequency,
    dayOfMonth: number,
    monthOfYear?: number | null,
  ): Date {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed

    let next: Date;

    switch (frequency) {
      case 'MONTHLY': {
        next = new Date(year, month, dayOfMonth, 12, 0, 0);
        if (next <= now) {
          next = new Date(year, month + 1, dayOfMonth, 12, 0, 0);
        }
        break;
      }
      case 'QUARTERLY': {
        // Quarters: Jan, Apr, Jul, Oct (months 0, 3, 6, 9)
        const quarterStarts = [0, 3, 6, 9];
        let found = false;
        for (const qMonth of quarterStarts) {
          next = new Date(year, qMonth, dayOfMonth, 12, 0, 0);
          if (next > now) {
            found = true;
            break;
          }
        }
        if (!found!) {
          next = new Date(year + 1, 0, dayOfMonth, 12, 0, 0);
        }
        break;
      }
      case 'YEARLY': {
        const targetMonth = (monthOfYear || 1) - 1; // Convert to 0-indexed
        next = new Date(year, targetMonth, dayOfMonth, 12, 0, 0);
        if (next <= now) {
          next = new Date(year + 1, targetMonth, dayOfMonth, 12, 0, 0);
        }
        break;
      }
      default:
        next = new Date(year, month + 1, dayOfMonth, 12, 0, 0);
    }

    return next!;
  }
}
