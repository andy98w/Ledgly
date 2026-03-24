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
  enabledPaymentSources?: string[];
  paymentInstructions?: string | null;
  paymentHandles?: Record<string, string> | null;
  gmailSyncAfter?: string;
  notificationTemplates?: Record<string, string>;
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
      enabledPaymentSources: org.enabledPaymentSources,
      paymentInstructions: org.paymentInstructions,
      paymentHandles: org.paymentHandles ?? {},
      notificationTemplates: org.notificationTemplates ?? {},
      gmailSyncAfter: org.gmailSyncAfter,
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
        ...(dto.enabledPaymentSources !== undefined && { enabledPaymentSources: dto.enabledPaymentSources }),
        ...(dto.paymentInstructions !== undefined && { paymentInstructions: dto.paymentInstructions }),
        ...(dto.paymentHandles !== undefined && { paymentHandles: dto.paymentHandles as any }),
        ...(dto.gmailSyncAfter !== undefined && { gmailSyncAfter: new Date(dto.gmailSyncAfter) }),
        ...(dto.notificationTemplates !== undefined && { notificationTemplates: dto.notificationTemplates as any }),
      },
    });

    return org;
  }

  async getDashboard(orgId: string) {
    // Aggregate charge stats in a single SQL query instead of loading all charges
    const [chargeStats, totalPaymentsCents, payments, memberCount, org] = await Promise.all([
      this.prisma.$queryRaw<
        [{ total_charged_cents: bigint; open_charges_count: bigint; overdue_count: bigint }]
      >`
        SELECT
          COALESCE(SUM(c.amount_cents), 0) AS total_charged_cents,
          COUNT(*) FILTER (WHERE c.status != 'PAID') AS open_charges_count,
          COUNT(*) FILTER (WHERE c.status != 'PAID' AND c.due_date IS NOT NULL AND c.due_date < NOW()) AS overdue_count
        FROM charges c
        WHERE c.org_id = ${orgId} AND c.status != 'VOID'
      `,
      this.prisma.payment.aggregate({
        where: { orgId, deletedAt: null },
        _sum: { amountCents: true },
      }).then((r) => r._sum.amountCents || 0),
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
      this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { paymentHandles: true, enabledPaymentSources: true },
      }),
    ]);

    const stats = chargeStats[0];
    const totalChargedCents = Number(stats.total_charged_cents);

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

    const handles = (org?.paymentHandles as Record<string, string>) ?? {};
    const hasPaymentHandles = Object.values(handles).some((v) => v?.trim());

    return {
      totalOutstandingCents: Math.max(0, totalChargedCents - totalPaymentsCents),
      totalCollectedCents: totalPaymentsCents,
      overdueCount: Number(stats.overdue_count),
      memberCount,
      openChargesCount: Number(stats.open_charges_count),
      paymentsCount: payments.length > 0 || totalPaymentsCents > 0,
      hasPaymentHandles,
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

    const existing = await this.prisma.membership.findFirst({
      where: { orgId: org.id, userId },
    });

    if (existing) {
      if (existing.status === 'ACTIVE' || existing.status === 'PENDING') {
        throw new ConflictException('You are already a member of this organization');
      }
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

  async getInsights(orgId: string) {
    const insights: Array<{ type: string; severity: 'warning' | 'info'; title: string; detail: string }> = [];
    const now = new Date();
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1) Members with no payment in 60+ days
    const delinquentMembers = await this.prisma.$queryRaw<
      Array<{ member_id: string; member_name: string }>
    >`
      SELECT m.id as member_id, COALESCE(m.name, u.name, u.email, 'Unknown') as member_name
      FROM memberships m
      LEFT JOIN users u ON m.user_id = u.id
      WHERE m.org_id = ${orgId} AND m.status = 'ACTIVE'
      AND NOT EXISTS (
        SELECT 1 FROM payments p
        WHERE p.membership_id = m.id
        AND p.deleted_at IS NULL
        AND p.paid_at >= ${sixtyDaysAgo}
      )
      AND EXISTS (
        SELECT 1 FROM charges c
        WHERE c.membership_id = m.id
        AND c.status IN ('OPEN', 'PARTIALLY_PAID')
      )
    `;

    if (delinquentMembers.length > 0) {
      insights.push({
        type: 'delinquent_members',
        severity: 'warning',
        title: `${delinquentMembers.length} member${delinquentMembers.length > 1 ? 's' : ''} with no payment in 60+ days`,
        detail: delinquentMembers.slice(0, 5).map((m) => m.member_name).join(', ') +
          (delinquentMembers.length > 5 ? ` and ${delinquentMembers.length - 5} more` : ''),
      });
    }

    // 2) Charges overdue > 30 days
    const overdueCharges = await this.prisma.charge.count({
      where: {
        orgId,
        status: { in: ['OPEN', 'PARTIALLY_PAID'] },
        dueDate: { lt: thirtyDaysAgo },
      },
    });

    if (overdueCharges > 0) {
      insights.push({
        type: 'overdue_charges',
        severity: 'warning',
        title: `${overdueCharges} charge${overdueCharges > 1 ? 's' : ''} overdue by 30+ days`,
        detail: 'Consider sending reminders or following up with members.',
      });
    }

    // 3) Large unallocated payments
    const unallocatedPayments = await this.prisma.$queryRaw<
      Array<{ payment_id: string; amount_cents: number; unallocated_cents: number; raw_payer_name: string }>
    >`
      SELECT p.id as payment_id, p.amount_cents,
        p.amount_cents - COALESCE(SUM(pa.amount_cents), 0) as unallocated_cents,
        COALESCE(p.raw_payer_name, 'Unknown') as raw_payer_name
      FROM payments p
      LEFT JOIN payment_allocations pa ON pa.payment_id = p.id
      WHERE p.org_id = ${orgId} AND p.deleted_at IS NULL
      GROUP BY p.id
      HAVING p.amount_cents - COALESCE(SUM(pa.amount_cents), 0) >= 10000
    `;

    if (unallocatedPayments.length > 0) {
      const totalUnallocated = unallocatedPayments.reduce((sum, p) => sum + Number(p.unallocated_cents), 0);
      insights.push({
        type: 'unallocated_payments',
        severity: 'info',
        title: `$${(totalUnallocated / 100).toFixed(0)} in unallocated payments`,
        detail: `${unallocatedPayments.length} payment${unallocatedPayments.length > 1 ? 's' : ''} of $100+ not matched to charges.`,
      });
    }

    // 4) Collection rate trend (current vs previous month)
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const [currentMonthPayments, prevMonthPayments] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { orgId, deletedAt: null, paidAt: { gte: thisMonthStart } },
        _sum: { amountCents: true },
      }),
      this.prisma.payment.aggregate({
        where: { orgId, deletedAt: null, paidAt: { gte: prevMonthStart, lte: prevMonthEnd } },
        _sum: { amountCents: true },
      }),
    ]);

    const currentTotal = currentMonthPayments._sum.amountCents || 0;
    const prevTotal = prevMonthPayments._sum.amountCents || 0;

    if (prevTotal > 0) {
      const changePercent = Math.round(((currentTotal - prevTotal) / prevTotal) * 100);
      if (Math.abs(changePercent) >= 20) {
        insights.push({
          type: 'collection_trend',
          severity: changePercent < 0 ? 'warning' : 'info',
          title: `Collections ${changePercent > 0 ? 'up' : 'down'} ${Math.abs(changePercent)}% vs last month`,
          detail: `This month: $${(currentTotal / 100).toFixed(0)} vs last month: $${(prevTotal / 100).toFixed(0)}`,
        });
      }
    }

    return insights;
  }

  async getCustomColumns(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { customColumns: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return (org.customColumns as any[]) ?? [];
  }

  async updateCustomColumns(orgId: string, columns: Array<{ id: string; label: string; type: 'text' | 'number' }>) {
    const org = await this.prisma.organization.update({
      where: { id: orgId },
      data: { customColumns: columns as any },
      select: { customColumns: true },
    });
    return (org.customColumns as any[]) ?? [];
  }

  async updateCustomField(
    orgId: string,
    entityType: 'charge' | 'expense' | 'payment',
    entityId: string,
    columnId: string,
    value: string | number | null,
  ) {
    const delegate = this.prisma[entityType] as any;
    const entity = await delegate.findFirst({
      where: { id: entityId, orgId },
      select: { customFields: true },
    });
    if (!entity) throw new NotFoundException(`${entityType} not found`);

    const fields = (entity.customFields as Record<string, any>) ?? {};
    if (value === null) {
      delete fields[columnId];
    } else {
      fields[columnId] = value;
    }

    await delegate.update({
      where: { id: entityId },
      data: { customFields: fields as any },
    });

    return fields;
  }

  async delete(orgId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.paymentAllocation.deleteMany({ where: { orgId } });
      await tx.payment.deleteMany({ where: { orgId } });
      await tx.charge.deleteMany({ where: { orgId } });
      await tx.expense.deleteMany({ where: { orgId } });
      await tx.emailImport.deleteMany({ where: { orgId } });
      await tx.gmailConnection.deleteMany({ where: { orgId } });
      await tx.auditLog.deleteMany({ where: { orgId } });
      await tx.membership.deleteMany({ where: { orgId } });
      await tx.organization.delete({ where: { id: orgId } });
    });

    return { success: true };
  }
}
