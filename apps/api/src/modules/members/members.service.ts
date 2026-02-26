import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, type BatchContext } from '../audit/audit.service';
import { EmailService } from '../auth/email.service';

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
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private emailService: EmailService,
  ) {}

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
    } else {
      // By default, exclude removed members
      where.status = { not: 'LEFT' };
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

    const now = new Date();
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
        invitedEmail: m.invitedEmail,
        inviteExpiresAt: m.inviteExpiresAt,
        inviteExpired: m.status === 'INVITED' && m.inviteExpiresAt ? m.inviteExpiresAt < now : false,
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

  async createMany(orgId: string, members: CreateMemberDto[], actorId?: string, actorName?: string) {
    const created = [];
    const isPrivilegedRole = (role?: MembershipRole) => role === 'ADMIN' || role === 'TREASURER';

    // Get org name for invitation emails
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });

    for (const dto of members) {
      const trimmedName = dto.name.trim();
      let userId: string | null = null;

      // Enforce email for admin/treasurer roles
      if (isPrivilegedRole(dto.role) && !dto.email) {
        throw new BadRequestException('Email is required when adding an admin or treasurer');
      }

      // Check for duplicate name in org (active/invited members only)
      const nameMatch = await this.prisma.membership.findFirst({
        where: { orgId, name: trimmedName, status: { in: ['ACTIVE', 'INVITED'] } },
      });
      if (nameMatch) {
        throw new ConflictException(`A member named "${trimmedName}" already exists`);
      }

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
              name: trimmedName,
            },
          });
        }

        userId = user.id;

        // Check if membership already exists for this user
        const existing = await this.prisma.membership.findFirst({
          where: { orgId, userId },
        });

        if (existing) {
          // If already INVITED, reset expiry and resend email
          if (existing.status === 'INVITED') {
            const inviteToken = randomBytes(24).toString('hex');
            const updated = await this.prisma.membership.update({
              where: { id: existing.id },
              data: {
                role: dto.role || existing.role,
                name: trimmedName || existing.name,
                inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                inviteToken,
              },
            });
            await this.emailService.sendAdminInvitation(
              normalizedEmail,
              org?.name || 'your organization',
              actorName || 'An admin',
              inviteToken,
            );
            created.push(updated);
            continue;
          }
          // Reactivate if inactive/left
          if (existing.status !== 'ACTIVE') {
            const updated = await this.prisma.membership.update({
              where: { id: existing.id },
              data: {
                status: 'ACTIVE',
                role: dto.role || 'MEMBER',
                name: trimmedName || existing.name,
                leftAt: null,
              },
            });
            created.push(updated);
            continue;
          }
          throw new ConflictException(`A member with email "${normalizedEmail}" already exists`);
        }

        // Determine if we should create as INVITED
        // Admin/Treasurer roles where the user hasn't registered (no password) → invitation
        if (isPrivilegedRole(dto.role) && !user.passwordHash) {
          const inviteToken = randomBytes(24).toString('hex');
          const membership = await this.prisma.membership.create({
            data: {
              orgId,
              userId,
              name: trimmedName,
              role: dto.role!,
              status: 'INVITED',
              invitedEmail: normalizedEmail,
              inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              inviteToken,
            },
          });

          await this.emailService.sendAdminInvitation(
            normalizedEmail,
            org?.name || 'your organization',
            actorName || 'An admin',
            inviteToken,
          );

          created.push(membership);
          continue;
        }
      }

      // Create membership (direct add — ACTIVE)
      const membership = await this.prisma.membership.create({
        data: {
          orgId,
          userId,
          name: trimmedName,
          role: dto.role || 'MEMBER',
          status: 'ACTIVE',
        },
      });

      created.push(membership);
    }

    // Audit log
    if (actorId && created.length > 0) {
      const batch = created.length > 1 ? this.auditService.createBatchContext(`Added ${created.length} members`) : undefined;
      for (const m of created) {
        await this.auditService.logCreate(orgId, actorId, 'MEMBER', m.id, { memberName: m.name, role: m.role }, batch);
      }
    }

    return created;
  }

  async resendInvitation(orgId: string, membershipId: string, actorName?: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, orgId, status: 'INVITED' },
    });

    if (!membership) {
      throw new NotFoundException('Invited membership not found');
    }

    if (!membership.invitedEmail) {
      throw new BadRequestException('No invitation email on record');
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });

    const inviteToken = randomBytes(24).toString('hex');
    await this.prisma.membership.update({
      where: { id: membershipId },
      data: {
        inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        inviteToken,
      },
    });

    await this.emailService.sendAdminInvitation(
      membership.invitedEmail,
      org?.name || 'your organization',
      actorName || 'An admin',
      inviteToken,
    );

    return { success: true };
  }

  private async assertNotLastAdmin(orgId: string, membershipId: string) {
    const member = await this.prisma.membership.findFirst({
      where: { id: membershipId, orgId },
    });
    if (member?.role !== 'ADMIN') return;

    const adminCount = await this.prisma.membership.count({
      where: { orgId, role: 'ADMIN', status: 'ACTIVE' },
    });
    if (adminCount <= 1) {
      throw new BadRequestException('Cannot remove or demote the last admin. Promote another member first.');
    }
  }

  async update(orgId: string, membershipId: string, dto: UpdateMemberDto, actorId?: string) {
    const member = await this.prisma.membership.findFirst({
      where: { id: membershipId, orgId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Guard: prevent self-demotion
    if (actorId === membershipId && dto.role && dto.role !== member.role) {
      throw new BadRequestException('You cannot change your own role');
    }

    // Guard: prevent demoting or removing the last admin
    const isDemoting = dto.role && dto.role !== 'ADMIN' && member.role === 'ADMIN';
    const isLeaving = dto.status === 'LEFT' && member.status === 'ACTIVE' && member.role === 'ADMIN';
    if (isDemoting || isLeaving) {
      await this.assertNotLastAdmin(orgId, membershipId);
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

    // When name changes, update rawPayerName on all linked payments
    if (dto.name !== undefined) {
      await this.prisma.payment.updateMany({
        where: { membershipId, orgId, deletedAt: null },
        data: { rawPayerName: dto.name },
      });
    }

    // Audit log
    if (actorId) {
      const before: Record<string, any> = {};
      const after: Record<string, any> = {};
      if (dto.name !== undefined && dto.name !== member.name) {
        before.name = member.name;
        after.name = dto.name;
      }
      if (dto.role && dto.role !== member.role) {
        before.role = member.role;
        after.role = dto.role;
      }
      if (dto.status && dto.status !== member.status) {
        before.status = member.status;
        after.status = dto.status;
      }
      if (Object.keys(after).length > 0) {
        await this.auditService.logUpdate(orgId, actorId, 'MEMBER', membershipId, before, after);
      }
    }

    return updated;
  }

  async remove(orgId: string, membershipId: string, actorId?: string, batch?: BatchContext) {
    // Prevent self-deletion
    if (actorId && actorId === membershipId) {
      throw new BadRequestException('You cannot remove yourself');
    }

    const member = await this.prisma.membership.findFirst({
      where: { id: membershipId, orgId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Guard: prevent removing the last admin
    if (member.role === 'ADMIN') {
      await this.assertNotLastAdmin(orgId, membershipId);
    }

    // Soft delete - mark as left
    await this.prisma.membership.update({
      where: { id: membershipId },
      data: {
        status: 'LEFT',
        leftAt: new Date(),
      },
    });

    if (actorId) {
      await this.auditService.logDelete(orgId, actorId, 'MEMBER', membershipId, {
        memberName: member.name,
        role: member.role,
      }, batch);
    }

    return { success: true };
  }

  async bulkRemove(orgId: string, memberIds: string[], actorId: string) {
    if (memberIds.length === 0) return { success: true, deletedCount: 0 };

    const batch = memberIds.length > 1
      ? this.auditService.createBatchContext(`Removed ${memberIds.length} members`)
      : undefined;

    let deletedCount = 0;
    for (const memberId of memberIds) {
      try {
        await this.remove(orgId, memberId, actorId, batch);
        deletedCount++;
      } catch {
        // Skip not-found or protected members
      }
    }

    return { success: true, deletedCount };
  }

  async restore(orgId: string, membershipId: string, actorId?: string) {
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

    if (actorId) {
      await this.auditService.logCreate(orgId, actorId, 'MEMBER', membershipId, {
        memberName: member.name,
        role: member.role,
        restored: true,
      });
    }

    return { success: true };
  }
}
