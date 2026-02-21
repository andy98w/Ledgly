import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface CreateOrganizationDto {
  name: string;
  timezone?: string;
}

interface UpdateOrganizationDto {
  name?: string;
  timezone?: string;
}

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateOrganizationDto) {
    const org = await this.prisma.organization.create({
      data: {
        name: dto.name,
        timezone: dto.timezone || 'America/New_York',
        memberships: {
          create: {
            userId,
            role: 'ADMIN',
            status: 'ACTIVE',
          },
        },
      },
      include: {
        memberships: {
          where: { userId },
          select: { id: true, role: true },
        },
      },
    });

    return {
      id: org.id,
      name: org.name,
      timezone: org.timezone,
      createdAt: org.createdAt,
      membership: org.memberships[0],
    };
  }

  async findOne(orgId: string, userId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        memberships: {
          where: { userId, status: 'ACTIVE' },
          select: { id: true, role: true },
        },
        _count: {
          select: {
            memberships: { where: { status: 'ACTIVE' } },
            charges: { where: { status: { not: 'VOID' } } },
          },
        },
      },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    if (org.memberships.length === 0) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    return {
      id: org.id,
      name: org.name,
      timezone: org.timezone,
      createdAt: org.createdAt,
      membership: org.memberships[0],
      memberCount: org._count.memberships,
      chargeCount: org._count.charges,
    };
  }

  async update(orgId: string, dto: UpdateOrganizationDto) {
    const org = await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.timezone && { timezone: dto.timezone }),
      },
    });

    return org;
  }

  async getDashboard(orgId: string) {
    const now = new Date();

    // Get aggregate stats
    const [charges, payments, memberCount] = await Promise.all([
      this.prisma.charge.findMany({
        where: { orgId, status: { not: 'VOID' } },
        include: {
          allocations: {
            select: { amountCents: true },
          },
        },
      }),
      this.prisma.payment.findMany({
        where: { orgId, deletedAt: null },
        include: {
          allocations: {
            select: { amountCents: true },
          },
        },
        orderBy: { paidAt: 'desc' },
        take: 5,
      }),
      this.prisma.membership.count({
        where: { orgId, status: 'ACTIVE' },
      }),
    ]);

    // Calculate totals
    let totalChargedCents = 0;
    let totalAllocatedCents = 0;
    let overdueCount = 0;
    let openChargesCount = 0;

    for (const charge of charges) {
      totalChargedCents += charge.amountCents;
      const allocated = charge.allocations.reduce((sum, a) => sum + a.amountCents, 0);
      totalAllocatedCents += allocated;

      if (charge.status !== 'PAID') {
        openChargesCount++;
        if (charge.dueDate && charge.dueDate < now) {
          overdueCount++;
        }
      }
    }

    const recentPayments = payments.map((p) => {
      const allocatedCents = p.allocations.reduce((sum, a) => sum + a.amountCents, 0);
      return {
        id: p.id,
        amountCents: p.amountCents,
        paidAt: p.paidAt,
        source: p.source,
        rawPayerName: p.rawPayerName,
        allocatedCents,
        unallocatedCents: p.amountCents - allocatedCents,
      };
    });

    return {
      totalOutstandingCents: totalChargedCents - totalAllocatedCents,
      totalCollectedCents: totalAllocatedCents,
      overdueCount,
      memberCount,
      openChargesCount,
      recentPayments,
    };
  }

  async getUserOrganizations(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId, status: 'ACTIVE' },
      include: {
        org: true,
      },
      orderBy: { joinedAt: 'desc' },
    });

    return memberships.map((m) => ({
      id: m.org.id,
      name: m.org.name,
      timezone: m.org.timezone,
      membership: {
        id: m.id,
        role: m.role,
      },
    }));
  }
}
