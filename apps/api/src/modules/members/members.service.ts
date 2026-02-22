import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

interface CreateMemberDto {
  email?: string;
  name: string;
  role?: MembershipRole;
}

interface UpdateMemberDto {
  name?: string;
  role?: MembershipRole;
  status?: MembershipStatus;
}

interface MemberFilters {
  status?: MembershipStatus;
  hasBalance?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class MembersService {
  constructor(private prisma: PrismaService) {}

  private async getMemberBalances(orgId: string): Promise<
    Map<string, { totalChargedCents: number; totalPaidCents: number; overdueCharges: number }>
  > {
    const rows: Array<{
      membership_id: string;
      total_charged_cents: bigint;
      total_paid_cents: bigint;
      overdue_charges: bigint;
    }> = await this.prisma.$queryRaw`
      SELECT
        c.membership_id,
        COALESCE(SUM(c.amount_cents), 0) AS total_charged_cents,
        COALESCE(SUM(pa_sum.allocated_cents), 0) AS total_paid_cents,
        COUNT(CASE WHEN c.status != 'PAID' AND c.due_date < NOW() THEN 1 END) AS overdue_charges
      FROM charges c
      LEFT JOIN (
        SELECT charge_id, SUM(amount_cents) AS allocated_cents
        FROM payment_allocations GROUP BY charge_id
      ) pa_sum ON pa_sum.charge_id = c.id
      WHERE c.org_id = ${orgId} AND c.status != 'VOID'
      GROUP BY c.membership_id
    `;

    const map = new Map<string, { totalChargedCents: number; totalPaidCents: number; overdueCharges: number }>();
    for (const row of rows) {
      map.set(row.membership_id, {
        totalChargedCents: Number(row.total_charged_cents),
        totalPaidCents: Number(row.total_paid_cents),
        overdueCharges: Number(row.overdue_charges),
      });
    }
    return map;
  }

  async findAll(orgId: string, filters: MemberFilters = {}) {
    const { status, hasBalance, search, page = 1, limit = 50 } = filters;

    const where: any = { orgId };

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [members, total, balanceMap] = await Promise.all([
      this.prisma.membership.findMany({
        where,
        include: {
          user: {
            select: { id: true, email: true, name: true },
          },
        },
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.membership.count({ where }),
      this.getMemberBalances(orgId),
    ]);

    const membersWithBalance = members.map((m) => {
      const balance = balanceMap.get(m.id) || { totalChargedCents: 0, totalPaidCents: 0, overdueCharges: 0 };
      const balanceCents = balance.totalChargedCents - balance.totalPaidCents;

      return {
        id: m.id,
        orgId: m.orgId,
        userId: m.userId,
        role: m.role,
        status: m.status,
        name: m.name,
        displayName: m.name || m.user?.name || m.user?.email || 'Unknown',
        joinedAt: m.joinedAt,
        user: m.user,
        balanceCents,
        totalChargedCents: balance.totalChargedCents,
        totalPaidCents: balance.totalPaidCents,
        overdueCharges: balance.overdueCharges,
      };
    });

    // Filter by balance if requested
    let filtered = membersWithBalance;
    if (hasBalance === true) {
      filtered = membersWithBalance.filter((m) => m.balanceCents > 0);
    } else if (hasBalance === false) {
      filtered = membersWithBalance.filter((m) => m.balanceCents <= 0);
    }

    return {
      data: filtered,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(orgId: string, membershipId: string) {
    const member = await this.prisma.membership.findFirst({
      where: { id: membershipId, orgId },
      include: {
        user: {
          select: { id: true, email: true, name: true, phone: true },
        },
        chargesAssigned: {
          where: { status: { not: 'VOID' } },
          include: {
            allocations: {
              select: { id: true, amountCents: true, createdAt: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Get payments for this member
    const payments = await this.prisma.payment.findMany({
      where: { orgId, membershipId, deletedAt: null },
      include: {
        allocations: {
          include: {
            charge: {
              select: { id: true, title: true },
            },
          },
        },
      },
      orderBy: { paidAt: 'desc' },
    });

    let totalChargedCents = 0;
    let totalPaidCents = 0;
    let overdueCharges = 0;
    const now = new Date();

    const charges = member.chargesAssigned.map((c) => {
      const allocatedCents = c.allocations.reduce((sum, a) => sum + a.amountCents, 0);
      totalChargedCents += c.amountCents;
      totalPaidCents += allocatedCents;

      if (c.status !== 'PAID' && c.dueDate && c.dueDate < now) {
        overdueCharges++;
      }

      return {
        id: c.id,
        category: c.category,
        title: c.title,
        amountCents: c.amountCents,
        dueDate: c.dueDate,
        status: c.status,
        createdAt: c.createdAt,
        allocatedCents,
        balanceDueCents: c.amountCents - allocatedCents,
      };
    });

    return {
      id: member.id,
      orgId: member.orgId,
      userId: member.userId,
      role: member.role,
      status: member.status,
      name: member.name,
      displayName: member.name || member.user?.name || member.user?.email || 'Unknown',
      joinedAt: member.joinedAt,
      user: member.user,
      balanceCents: totalChargedCents - totalPaidCents,
      totalChargedCents,
      totalPaidCents,
      overdueCharges,
      charges,
      payments: payments.map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        paidAt: p.paidAt,
        source: p.source,
        memo: p.memo,
        allocations: p.allocations.map((a) => ({
          id: a.id,
          amountCents: a.amountCents,
          chargeId: a.chargeId,
          chargeTitle: a.charge.title,
        })),
      })),
    };
  }

  async createMany(orgId: string, members: CreateMemberDto[]) {
    const created = [];

    for (const dto of members) {
      let userId: string | null = null;

      // If email provided, find or create user
      if (dto.email) {
        const normalizedEmail = dto.email.toLowerCase().trim();
        let user = await this.prisma.user.findUnique({
          where: { email: normalizedEmail },
        });

        if (!user) {
          user = await this.prisma.user.create({
            data: {
              email: normalizedEmail,
              name: dto.name,
            },
          });
        }

        userId = user.id;

        // Check if membership already exists
        const existing = await this.prisma.membership.findFirst({
          where: { orgId, userId },
        });

        if (existing) {
          // Reactivate if inactive
          if (existing.status !== 'ACTIVE') {
            const updated = await this.prisma.membership.update({
              where: { id: existing.id },
              data: {
                status: 'ACTIVE',
                role: dto.role || 'MEMBER',
                name: dto.name || existing.name,
                leftAt: null,
              },
            });
            created.push(updated);
            continue;
          }
          // Skip if already active
          continue;
        }
      }

      // Create membership
      const membership = await this.prisma.membership.create({
        data: {
          orgId,
          userId,
          name: dto.name,
          role: dto.role || 'MEMBER',
          status: 'ACTIVE',
        },
      });

      created.push(membership);
    }

    return created;
  }

  async update(orgId: string, membershipId: string, dto: UpdateMemberDto) {
    const member = await this.prisma.membership.findFirst({
      where: { id: membershipId, orgId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    const updated = await this.prisma.membership.update({
      where: { id: membershipId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.role && { role: dto.role }),
        ...(dto.status && { status: dto.status }),
        ...(dto.status === 'LEFT' && { leftAt: new Date() }),
      },
    });

    return updated;
  }

  async remove(orgId: string, membershipId: string) {
    const member = await this.prisma.membership.findFirst({
      where: { id: membershipId, orgId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Soft delete - mark as left
    await this.prisma.membership.update({
      where: { id: membershipId },
      data: {
        status: 'LEFT',
        leftAt: new Date(),
      },
    });

    return { success: true };
  }

  async restore(orgId: string, membershipId: string) {
    const member = await this.prisma.membership.findFirst({
      where: { id: membershipId, orgId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Restore - set status back to ACTIVE
    await this.prisma.membership.update({
      where: { id: membershipId },
      data: {
        status: 'ACTIVE',
        leftAt: null,
      },
    });

    return { success: true };
  }
}
