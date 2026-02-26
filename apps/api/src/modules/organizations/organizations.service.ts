import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface CreateOrganizationDto {
  name: string;
  timezone?: string;
}

interface UpdateOrganizationDto {
  name?: string;
  timezone?: string;
  autoApprovePayments?: boolean;
  autoApproveExpenses?: boolean;
  enabledPaymentSources?: string[];
}

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateOrganizationDto) {
    // Look up the user's name so the membership record has it
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    const org = await this.prisma.organization.create({
      data: {
        name: dto.name,
        timezone: dto.timezone || 'America/New_York',
        memberships: {
          create: {
            userId,
            role: 'ADMIN',
            status: 'ACTIVE',
            name: user?.name || user?.email || null,
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
      autoApprovePayments: org.autoApprovePayments,
      autoApproveExpenses: org.autoApproveExpenses,
      enabledPaymentSources: org.enabledPaymentSources,
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
        ...(dto.autoApprovePayments !== undefined && { autoApprovePayments: dto.autoApprovePayments }),
        ...(dto.autoApproveExpenses !== undefined && { autoApproveExpenses: dto.autoApproveExpenses }),
        ...(dto.enabledPaymentSources !== undefined && { enabledPaymentSources: dto.enabledPaymentSources }),
      },
    });

    return org;
  }

  async getDashboard(orgId: string) {
    // Aggregate charge stats in a single SQL query instead of loading all charges
    const [chargeStats, payments, memberCount] = await Promise.all([
      this.prisma.$queryRaw<
        [{ total_charged_cents: bigint; total_allocated_cents: bigint; open_charges_count: bigint; overdue_count: bigint }]
      >`
        SELECT
          COALESCE(SUM(c.amount_cents), 0) AS total_charged_cents,
          COALESCE(SUM(pa_sum.allocated), 0) AS total_allocated_cents,
          COUNT(*) FILTER (WHERE c.status != 'PAID') AS open_charges_count,
          COUNT(*) FILTER (WHERE c.status != 'PAID' AND c.due_date IS NOT NULL AND c.due_date < NOW()) AS overdue_count
        FROM charges c
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(pa.amount_cents), 0) AS allocated
          FROM payment_allocations pa
          WHERE pa.charge_id = c.id
        ) pa_sum ON true
        WHERE c.org_id = ${orgId} AND c.status != 'VOID'
      `,
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

    const stats = chargeStats[0];
    const totalChargedCents = Number(stats.total_charged_cents);
    const totalAllocatedCents = Number(stats.total_allocated_cents);

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
      overdueCount: Number(stats.overdue_count),
      memberCount,
      openChargesCount: Number(stats.open_charges_count),
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

  async delete(orgId: string) {
    // Delete all related data in a transaction
    await this.prisma.$transaction(async (tx) => {
      // Delete payment allocations
      await tx.paymentAllocation.deleteMany({ where: { orgId } });

      // Delete payments
      await tx.payment.deleteMany({ where: { orgId } });

      // Delete charges
      await tx.charge.deleteMany({ where: { orgId } });

      // Delete expenses
      await tx.expense.deleteMany({ where: { orgId } });

      // Delete email imports
      await tx.emailImport.deleteMany({ where: { orgId } });

      // Delete gmail connections
      await tx.gmailConnection.deleteMany({ where: { orgId } });

      // Delete audit logs
      await tx.auditLog.deleteMany({ where: { orgId } });

      // Delete memberships
      await tx.membership.deleteMany({ where: { orgId } });

      // Delete the organization
      await tx.organization.delete({ where: { id: orgId } });
    });

    return { success: true };
  }
}
