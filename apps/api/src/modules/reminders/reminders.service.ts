import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface CreateReminderRuleDto {
  triggerType: string; // BEFORE_DUE or AFTER_DUE
  daysOffset: number;
}

@Injectable()
export class RemindersService {
  constructor(private prisma: PrismaService) {}

  async findAllRules(orgId: string) {
    return this.prisma.reminderRule.findMany({
      where: { orgId },
      orderBy: [{ isActive: 'desc' }, { triggerType: 'asc' }, { daysOffset: 'asc' }],
    });
  }

  async createRule(orgId: string, dto: CreateReminderRuleDto) {
    return this.prisma.reminderRule.create({
      data: {
        orgId,
        triggerType: dto.triggerType,
        daysOffset: dto.daysOffset,
      },
    });
  }

  async updateRule(orgId: string, id: string, dto: { isActive?: boolean; daysOffset?: number }) {
    const rule = await this.prisma.reminderRule.findFirst({ where: { id, orgId } });
    if (!rule) throw new NotFoundException('Reminder rule not found');

    return this.prisma.reminderRule.update({
      where: { id },
      data: {
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.daysOffset !== undefined && { daysOffset: dto.daysOffset }),
      },
    });
  }

  async deleteRule(orgId: string, id: string) {
    const rule = await this.prisma.reminderRule.findFirst({ where: { id, orgId } });
    if (!rule) throw new NotFoundException('Reminder rule not found');

    await this.prisma.reminderRule.delete({ where: { id } });
    return { success: true };
  }
}
