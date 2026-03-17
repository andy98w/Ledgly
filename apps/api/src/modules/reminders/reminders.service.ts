import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_RULES_PER_ORG = 3;

interface CreateReminderRuleDto {
  triggerType: string;
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
    const existing = await this.prisma.reminderRule.findMany({ where: { orgId } });

    if (existing.length >= MAX_RULES_PER_ORG) {
      throw new BadRequestException(`Maximum of ${MAX_RULES_PER_ORG} reminder rules per organization`);
    }

    const duplicate = existing.find(r => r.triggerType === dto.triggerType && r.daysOffset === dto.daysOffset);
    if (duplicate) {
      throw new BadRequestException('A rule with the same trigger and days already exists');
    }

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
