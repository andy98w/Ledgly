import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { randomBytes } from 'crypto';

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

// Safe alphabet: no ambiguous chars (0/O, 1/I/L)
const JOIN_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode(length = 6): string {
  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += JOIN_CODE_CHARS[bytes[i] % JOIN_CODE_CHARS.length];
  }
  return code;
}

@Injectable()
export class OrganizationsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async create(userId: string, dto: CreateOrganizationDto) {
    // Prevent duplicate org names within user's memberships
    const existingMembership = await this.prisma.membership.findFirst({
      where: {
        userId,
        status: { in: ['ACTIVE', 'PENDING'] },
        org: {
          name: { equals: dto.name, mode: 'insensitive' },
        },
      },
    });
    if (existingMembership) {
      throw new ConflictException(
        `You're already a member of an organization named "${dto.name}". Leave that organization first or choose a different name.`,
      );
    }

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
            role: 'OWNER',
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
      joinCode: org.joinCode,
      joinCodeEnabled: org.joinCodeEnabled,
      joinRequiresApproval: org.joinRequiresApproval,
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
        org: { select: { id: true, name: true, timezone: true } },
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

  async generateJoinCode(orgId: string, actorId: string) {
    const code = generateCode();
    const org = await this.prisma.organization.update({
      where: { id: orgId },
      data: { joinCode: code, joinCodeEnabled: true },
    });

    await this.auditService.logUpdate(orgId, actorId, 'ORG_SETTINGS', orgId, {}, { joinCode: 'generated' });

    return { joinCode: org.joinCode, joinCodeEnabled: org.joinCodeEnabled, joinRequiresApproval: org.joinRequiresApproval };
  }

  async disableJoinCode(orgId: string, actorId: string) {
    await this.prisma.organization.update({
      where: { id: orgId },
      data: { joinCode: null, joinCodeEnabled: false },
    });

    await this.auditService.logUpdate(orgId, actorId, 'ORG_SETTINGS', orgId, { joinCode: 'active' }, { joinCode: 'disabled' });

    return { success: true };
  }

  async updateJoinCodeSettings(orgId: string, dto: { enabled?: boolean; requiresApproval?: boolean }, actorId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    const before: Record<string, any> = {};
    const after: Record<string, any> = {};

    if (dto.enabled !== undefined && dto.enabled !== org.joinCodeEnabled) {
      before.joinCodeEnabled = org.joinCodeEnabled;
      after.joinCodeEnabled = dto.enabled;
    }
    if (dto.requiresApproval !== undefined && dto.requiresApproval !== org.joinRequiresApproval) {
      before.joinRequiresApproval = org.joinRequiresApproval;
      after.joinRequiresApproval = dto.requiresApproval;
    }

    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(dto.enabled !== undefined && { joinCodeEnabled: dto.enabled }),
        ...(dto.requiresApproval !== undefined && { joinRequiresApproval: dto.requiresApproval }),
      },
    });

    if (Object.keys(after).length > 0) {
      await this.auditService.logUpdate(orgId, actorId, 'ORG_SETTINGS', orgId, before, after);
    }

    return { joinCode: updated.joinCode, joinCodeEnabled: updated.joinCodeEnabled, joinRequiresApproval: updated.joinRequiresApproval };
  }

  async resolveJoinCode(code: string) {
    const org = await this.prisma.organization.findUnique({
      where: { joinCode: code.toUpperCase() },
      select: { id: true, name: true, joinCodeEnabled: true },
    });

    if (!org || !org.joinCodeEnabled) {
      throw new NotFoundException('Invalid or disabled join code');
    }

    return { orgId: org.id, orgName: org.name };
  }

  async joinWithCode(code: string, userId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { joinCode: code.toUpperCase() },
    });

    if (!org || !org.joinCodeEnabled) {
      throw new BadRequestException('Invalid or disabled join code');
    }

    // Check if user is already a member
    const existing = await this.prisma.membership.findFirst({
      where: { orgId: org.id, userId },
    });

    if (existing) {
      if (existing.status === 'ACTIVE' || existing.status === 'PENDING') {
        throw new ConflictException('You are already a member of this organization');
      }
      // Reactivate LEFT/INACTIVE membership
      const status = org.joinRequiresApproval ? 'PENDING' : 'ACTIVE';
      const updated = await this.prisma.membership.update({
        where: { id: existing.id },
        data: { status, leftAt: null },
      });

      await this.auditService.logCreate(org.id, undefined, 'MEMBER', updated.id, {
        memberName: updated.name,
        joinMethod: 'code',
        status,
      });

      return { membershipId: updated.id, orgId: org.id, orgName: org.name, status };
    }

    // Look up user name
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    const status = org.joinRequiresApproval ? 'PENDING' : 'ACTIVE';
    const membership = await this.prisma.membership.create({
      data: {
        orgId: org.id,
        userId,
        role: 'MEMBER',
        status,
        name: user?.name || user?.email || null,
      },
    });

    await this.auditService.logCreate(org.id, undefined, 'MEMBER', membership.id, {
      memberName: membership.name,
      joinMethod: 'code',
      status,
    });

    return { membershipId: membership.id, orgId: org.id, orgName: org.name, status };
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
