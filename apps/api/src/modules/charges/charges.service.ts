import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ChargeCategory, ChargeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../auth/email.service';

interface CreateChargeDto {
  membershipIds: string[];
  category: ChargeCategory;
  title: string;
  amountCents: number;
  dueDate?: string | null;
}

interface CreateMultiChargeDto {
  membershipIds: string[];
  category: ChargeCategory;
  title: string;
  amountCents: number;
  dueDate?: string | null;
}

interface UpdateChargeDto {
  title?: string;
  amountCents?: number;
  dueDate?: string | null;
  status?: ChargeStatus;
}

interface ChargeFilters {
  status?: ChargeStatus;
  category?: ChargeCategory;
  membershipId?: string;
  overdue?: boolean;
  page?: number;
  limit?: number;
  cursor?: string;
}

@Injectable()
export class ChargesService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private emailService: EmailService,
  ) {}

  async findAll(orgId: string, filters: ChargeFilters = {}) {
    const { status, category, membershipId, overdue, page = 1, limit = 50, cursor } = filters;
    const now = new Date();

    const where: any = { orgId, parentId: null };

    if (status) {
      where.status = status;
    } else {
      // By default, exclude voided charges
      where.status = { not: 'VOID' };
    }

    if (category) {
      where.category = category;
    }

    if (membershipId) {
      where.membershipId = membershipId;
    }

    if (overdue === true) {
      where.status = { in: ['OPEN', 'PARTIALLY_PAID'] };
      where.dueDate = { lt: now };
    }

    const includeOpts = {
      membership: {
        select: {
          id: true,
          name: true,
          status: true,
          user: { select: { name: true, email: true } },
        },
      },
      allocations: {
        select: {
          id: true,
          amountCents: true,
          payment: { select: { id: true, rawPayerName: true, paidAt: true } },
        },
      },
      children: {
        where: { status: { not: 'VOID' as const } },
        include: {
          membership: {
            select: {
              id: true,
              name: true,
              status: true,
              user: { select: { name: true, email: true } },
            },
          },
          allocations: {
            select: {
              id: true,
              amountCents: true,
              payment: { select: { id: true, rawPayerName: true, paidAt: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' as const },
      },
    };

    const orderBy = [{ status: 'asc' as const }, { dueDate: 'asc' as const }, { createdAt: 'desc' as const }];

    // Cursor-based pagination mode
    if (cursor) {
      const items = await this.prisma.charge.findMany({
        where,
        include: includeOpts,
        cursor: { id: cursor },
        skip: 1,
        take: limit + 1,
        orderBy,
      });

      const hasMore = items.length > limit;
      const charges = items.slice(0, limit);

      const data = charges.map((c) => this.mapChargeRow(c));

      return {
        data,
        meta: { limit, nextCursor: hasMore ? data[data.length - 1].id : null, hasMore },
      };
    }

    // Offset-based pagination mode (default)
    const [charges, total] = await Promise.all([
      this.prisma.charge.findMany({
        where,
        include: includeOpts,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.charge.count({ where }),
    ]);

    const data = charges.map((c) => this.mapChargeRow(c));

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private mapChargeRow(c: any) {
    const allocatedCents = c.allocations.reduce((sum: number, a: any) => sum + a.amountCents, 0);
    const membership = c.membership
      ? { id: c.membership.id, name: c.membership.name, status: c.membership.status, displayName: c.membership.name || c.membership.user?.name || c.membership.user?.email || 'Unknown' }
      : null;

    const row: any = {
      id: c.id, orgId: c.orgId, membershipId: c.membershipId, category: c.category,
      title: c.title, amountCents: c.amountCents, dueDate: c.dueDate, status: c.status,
      createdAt: c.createdAt, parentId: c.parentId || null,
      membership,
      allocatedCents, balanceDueCents: c.amountCents - allocatedCents,
      allocations: c.allocations.map((a: any) => ({
        id: a.id, amountCents: a.amountCents,
        paymentId: a.payment.id, payerName: a.payment.rawPayerName, paidAt: a.payment.paidAt,
      })),
    };

    if (c.children && c.children.length > 0) {
      row.children = c.children.map((child: any) => this.mapChargeRow(child));
    }

    return row;
  }

  async createMultiCharge(orgId: string, createdById: string, dto: CreateMultiChargeDto) {
    // Validate all membership IDs belong to this org
    const memberships = await this.prisma.membership.findMany({
      where: { id: { in: dto.membershipIds }, orgId, status: 'ACTIVE' },
      include: { user: { select: { name: true, email: true } } },
    });

    if (memberships.length !== dto.membershipIds.length) {
      throw new BadRequestException('Some member IDs are invalid');
    }

    let parsedDueDate: Date | null = null;
    if (dto.dueDate) {
      const dateValue = new Date(dto.dueDate + 'T12:00:00');
      if (!isNaN(dateValue.getTime())) parsedDueDate = dateValue;
    }

    const memberNameMap = new Map(
      memberships.map((m) => [m.id, m.name || m.user?.name || m.user?.email || 'Unknown']),
    );

    // Create parent charge (no membership — it's the group header)
    const parent = await this.prisma.charge.create({
      data: {
        orgId,
        membershipId: null,
        category: dto.category,
        title: dto.title,
        amountCents: dto.amountCents,
        dueDate: parsedDueDate,
        createdById,
      },
    });

    // Create child charges for each member
    const children = await Promise.all(
      dto.membershipIds.map((membershipId) =>
        this.prisma.charge.create({
          data: {
            orgId,
            membershipId,
            category: dto.category,
            title: dto.title,
            amountCents: dto.amountCents,
            dueDate: parsedDueDate,
            createdById,
            parentId: parent.id,
          },
        }),
      ),
    );

    // Audit logging
    const batch = this.auditService.createBatchContext(
      `Multi-charge "${dto.title}" for ${dto.membershipIds.length} members`,
    );

    await this.auditService.logCreate(orgId, createdById, 'CHARGE', parent.id, {
      title: parent.title,
      amountCents: parent.amountCents,
      category: parent.category,
      isMultiCharge: true,
      childCount: children.length,
    }, batch);

    await Promise.all(
      children.map((child) =>
        this.auditService.logCreate(orgId, createdById, 'CHARGE', child.id, {
          title: child.title,
          amountCents: child.amountCents,
          category: child.category,
          membershipId: child.membershipId,
          memberName: memberNameMap.get(child.membershipId!) || 'Unknown',
          parentId: parent.id,
        }, batch),
      ),
    );

    return { parent, children };
  }

  async findOne(orgId: string, chargeId: string) {
    const charge = await this.prisma.charge.findFirst({
      where: { id: chargeId, orgId },
      include: {
        membership: {
          select: {
            id: true,
            name: true,
            status: true,
            user: { select: { name: true, email: true } },
          },
        },
        allocations: {
          include: {
            payment: {
              select: { id: true, paidAt: true, source: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            user: { select: { name: true } },
          },
        },
      },
    });

    if (!charge) {
      throw new NotFoundException('Charge not found');
    }

    const allocatedCents = charge.allocations.reduce((sum, a) => sum + a.amountCents, 0);

    return {
      id: charge.id,
      orgId: charge.orgId,
      membershipId: charge.membershipId,
      category: charge.category,
      title: charge.title,
      amountCents: charge.amountCents,
      dueDate: charge.dueDate,
      status: charge.status,
      createdAt: charge.createdAt,
      membership: charge.membership
        ? {
            id: charge.membership.id,
            name: charge.membership.name,
            status: charge.membership.status,
            displayName: charge.membership.name || charge.membership.user?.name || charge.membership.user?.email || 'Unknown',
          }
        : null,
      createdBy: {
        id: charge.createdBy.id,
        name: charge.createdBy.name || charge.createdBy.user?.name || 'Unknown',
      },
      allocatedCents,
      balanceDueCents: charge.amountCents - allocatedCents,
      allocations: charge.allocations.map((a) => ({
        id: a.id,
        amountCents: a.amountCents,
        createdAt: a.createdAt,
        payment: {
          id: a.payment.id,
          paidAt: a.payment.paidAt,
          source: a.payment.source,
        },
      })),
    };
  }

  async create(orgId: string, createdById: string, dto: CreateChargeDto) {
    // Validate all membership IDs belong to this org
    const memberships = await this.prisma.membership.findMany({
      where: {
        id: { in: dto.membershipIds },
        orgId,
        status: 'ACTIVE',
      },
      include: {
        user: { select: { name: true, email: true } },
      },
    });

    if (memberships.length !== dto.membershipIds.length) {
      throw new BadRequestException('Some member IDs are invalid');
    }

    // Parse and validate dueDate
    let parsedDueDate: Date | null = null;
    if (dto.dueDate) {
      const dateValue = new Date(dto.dueDate + 'T12:00:00');
      if (!isNaN(dateValue.getTime())) {
        parsedDueDate = dateValue;
      }
    }

    // Build a membership name lookup for audit logs
    const memberNameMap = new Map(
      memberships.map((m) => [m.id, m.name || m.user?.name || m.user?.email || 'Unknown']),
    );

    // Create charges for each member
    const charges = await Promise.all(
      dto.membershipIds.map((membershipId) =>
        this.prisma.charge.create({
          data: {
            orgId,
            membershipId,
            category: dto.category,
            title: dto.title,
            amountCents: dto.amountCents,
            dueDate: parsedDueDate,
            createdById,
          },
        }),
      ),
    );

    // Use batch context when charging multiple members
    const batch = dto.membershipIds.length > 1
      ? this.auditService.createBatchContext(
          `Charged ${dto.membershipIds.length} members: ${dto.title}`,
        )
      : undefined;

    // Log audit entries for each charge created
    await Promise.all(
      charges.map((charge) =>
        this.auditService.logCreate(orgId, createdById, 'CHARGE', charge.id, {
          title: charge.title,
          amountCents: charge.amountCents,
          category: charge.category,
          membershipId: charge.membershipId,
          memberName: memberNameMap.get(charge.membershipId!) || 'Unknown',
        }, batch),
      ),
    );

    return charges;
  }

  async update(orgId: string, chargeId: string, dto: UpdateChargeDto, actorId?: string) {
    const charge = await this.prisma.charge.findFirst({
      where: { id: chargeId, orgId },
      include: {
        allocations: {
          select: { amountCents: true },
        },
      },
    });

    if (!charge) {
      throw new NotFoundException('Charge not found');
    }

    // If changing amount, make sure it's not less than allocated
    if (dto.amountCents !== undefined) {
      const allocatedCents = charge.allocations.reduce((sum, a) => sum + a.amountCents, 0);
      if (dto.amountCents < allocatedCents) {
        throw new BadRequestException('Cannot reduce amount below allocated payments');
      }
    }

    // Parse and validate dueDate for update
    let updateDueDate: Date | null | undefined = undefined;
    if (dto.dueDate !== undefined) {
      if (dto.dueDate) {
        const dateValue = new Date(dto.dueDate + 'T12:00:00');
        updateDueDate = !isNaN(dateValue.getTime()) ? dateValue : null;
      } else {
        updateDueDate = null;
      }
    }

    const updated = await this.prisma.charge.update({
      where: { id: chargeId },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.amountCents !== undefined && { amountCents: dto.amountCents }),
        ...(updateDueDate !== undefined && { dueDate: updateDueDate }),
        ...(dto.status && { status: dto.status }),
      },
    });

    // Log audit entry for update
    if (actorId) {
      const before: Record<string, any> = {};
      const after: Record<string, any> = {};

      if (dto.title && dto.title !== charge.title) {
        before.title = charge.title;
        after.title = dto.title;
      }
      if (dto.amountCents !== undefined && dto.amountCents !== charge.amountCents) {
        before.amountCents = charge.amountCents;
        after.amountCents = dto.amountCents;
      }
      if (dto.dueDate !== undefined) {
        before.dueDate = charge.dueDate;
        after.dueDate = dto.dueDate;
      }
      if (dto.status && dto.status !== charge.status) {
        before.status = charge.status;
        after.status = dto.status;
      }

      if (Object.keys(after).length > 0) {
        await this.auditService.logUpdate(orgId, actorId, 'CHARGE', chargeId, before, after);
      }
    }

    // Recalculate status when amount changes (allocated may now cover more/less)
    if (dto.amountCents !== undefined && dto.amountCents !== charge.amountCents) {
      await this.updateChargeStatus(chargeId, actorId);
    }

    return updated;
  }

  async void(orgId: string, chargeId: string, actorId?: string, batch?: { batchId: string; batchDescription: string }) {
    const charge = await this.prisma.charge.findFirst({
      where: { id: chargeId, orgId },
      include: {
        allocations: { select: { id: true } },
        children: { where: { status: { not: 'VOID' } }, select: { id: true } },
      },
    });

    if (!charge) {
      throw new NotFoundException('Charge not found');
    }

    // Already voided — idempotent
    if (charge.status === 'VOID') {
      return { success: true };
    }

    // Collect all charge IDs to void (parent + children)
    const childIds = charge.children.map((c) => c.id);
    const allIds = [chargeId, ...childIds];

    // Delete allocations and void the charge (and children if parent)
    await this.prisma.$transaction([
      this.prisma.paymentAllocation.deleteMany({
        where: { chargeId: { in: allIds } },
      }),
      this.prisma.charge.updateMany({
        where: { id: { in: allIds } },
        data: { status: 'VOID' },
      }),
    ]);

    // Log audit entry for void/delete
    if (actorId) {
      await this.auditService.logDelete(orgId, actorId, 'CHARGE', chargeId, {
        title: charge.title,
        amountCents: charge.amountCents,
        category: charge.category,
        childrenVoided: childIds.length,
      }, batch);
    }

    return { success: true };
  }

  async bulkVoid(orgId: string, chargeIds: string[], actorId: string) {
    if (chargeIds.length === 0) return { success: true, voidedCount: 0 };

    // Fetch all target charges in one query, including children
    const charges = await this.prisma.charge.findMany({
      where: { id: { in: chargeIds }, orgId, status: { not: 'VOID' } },
      select: { id: true, title: true, amountCents: true, category: true, children: { where: { status: { not: 'VOID' } }, select: { id: true } } },
    });

    if (charges.length === 0) return { success: true, voidedCount: 0 };

    // Collect all IDs including children of any parent charges
    const childIds = charges.flatMap((c) => c.children.map((ch) => ch.id));
    const validIds = [...charges.map((c) => c.id), ...childIds];

    // Batch: delete allocations, void charges + children, and log audit in one transaction
    await this.prisma.$transaction([
      this.prisma.paymentAllocation.deleteMany({
        where: { chargeId: { in: validIds } },
      }),
      this.prisma.charge.updateMany({
        where: { id: { in: validIds } },
        data: { status: 'VOID' },
      }),
    ]);

    // Batch audit logs
    const batch = charges.length > 1
      ? this.auditService.createBatchContext(`Voided ${charges.length} charges`)
      : undefined;

    await Promise.all(
      charges.map((charge) =>
        this.auditService.logDelete(orgId, actorId, 'CHARGE', charge.id, {
          title: charge.title,
          amountCents: charge.amountCents,
          category: charge.category,
        }, batch),
      ),
    );

    return { success: true, voidedCount: charges.length };
  }

  async bulkCreate(
    orgId: string,
    createdById: string,
    charges: Array<{ membershipId: string; category: ChargeCategory; title: string; amountCents: number; dueDate?: string | null }>,
  ) {
    if (charges.length === 0) return [];

    // Validate all membership IDs belong to this org
    const membershipIds = charges.map((c) => c.membershipId);
    const memberships = await this.prisma.membership.findMany({
      where: { id: { in: membershipIds }, orgId, status: 'ACTIVE' },
      include: { user: { select: { name: true, email: true } } },
    });

    const validIds = new Set(memberships.map((m) => m.id));
    const invalidIds = membershipIds.filter((id) => !validIds.has(id));
    if (invalidIds.length > 0) {
      throw new BadRequestException('Some member IDs are invalid');
    }

    const memberNameMap = new Map(
      memberships.map((m) => [m.id, m.name || m.user?.name || m.user?.email || 'Unknown']),
    );

    // Create each charge
    const createdCharges = await Promise.all(
      charges.map((spec) => {
        let parsedDueDate: Date | null = null;
        if (spec.dueDate) {
          const dateValue = new Date(spec.dueDate + 'T12:00:00');
          if (!isNaN(dateValue.getTime())) parsedDueDate = dateValue;
        }
        return this.prisma.charge.create({
          data: {
            orgId,
            membershipId: spec.membershipId,
            category: spec.category,
            title: spec.title,
            amountCents: spec.amountCents,
            dueDate: parsedDueDate,
            createdById,
          },
        });
      }),
    );

    // Batch audit log
    const batch = createdCharges.length > 1
      ? this.auditService.createBatchContext(`Created ${createdCharges.length} charges from payments`)
      : undefined;

    await Promise.all(
      createdCharges.map((charge) =>
        this.auditService.logCreate(orgId, createdById, 'CHARGE', charge.id, {
          title: charge.title,
          amountCents: charge.amountCents,
          category: charge.category,
          membershipId: charge.membershipId,
          memberName: memberNameMap.get(charge.membershipId!) || 'Unknown',
        }, batch),
      ),
    );

    return createdCharges;
  }

  async restore(orgId: string, chargeId: string, actorId?: string) {
    const charge = await this.prisma.charge.findFirst({
      where: { id: chargeId, orgId, status: 'VOID' },
    });

    if (!charge) {
      throw new NotFoundException('Voided charge not found');
    }

    await this.prisma.charge.update({
      where: { id: chargeId },
      data: { status: 'OPEN' },
    });

    // Log audit entry for restore (as a CREATE since it's being un-deleted)
    if (actorId) {
      await this.auditService.logCreate(orgId, actorId, 'CHARGE', chargeId, {
        title: charge.title,
        amountCents: charge.amountCents,
        category: charge.category,
        restored: true,
      });
    }

    return { success: true };
  }

  async updateChargeStatus(chargeId: string, actorId?: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const charge = await db.charge.findUnique({
      where: { id: chargeId },
      include: {
        allocations: {
          select: { amountCents: true },
        },
      },
    });

    if (!charge || charge.status === 'VOID') {
      return;
    }

    const allocatedCents = charge.allocations.reduce((sum, a) => sum + a.amountCents, 0);

    let newStatus: ChargeStatus;
    if (allocatedCents >= charge.amountCents) {
      newStatus = 'PAID';
    } else if (allocatedCents > 0) {
      newStatus = 'PARTIALLY_PAID';
    } else {
      newStatus = 'OPEN';
    }

    if (newStatus !== charge.status) {
      const oldStatus = charge.status;
      await db.charge.update({
        where: { id: chargeId },
        data: { status: newStatus },
      });

      // Audit log stays outside tx (best-effort, non-critical)
      await this.auditService.logUpdate(
        charge.orgId,
        actorId,
        'CHARGE',
        chargeId,
        { status: oldStatus },
        { status: newStatus },
      );
    }
  }

  async sendReminders(
    orgId: string,
    chargeIds: string[],
  ): Promise<{ sent: number; skipped: number }> {
    const charges = await this.prisma.charge.findMany({
      where: {
        id: { in: chargeIds },
        orgId,
        status: { in: ['OPEN', 'PARTIALLY_PAID'] },
        membershipId: { not: null },
      },
      include: {
        membership: {
          select: {
            user: { select: { email: true } },
          },
        },
        org: { select: { name: true } },
      },
    });

    const emailTasks = charges.map((charge) => {
      const email = charge.membership?.user?.email;
      if (!email) return null;
      return this.emailService.sendOverdueReminder(
        email,
        charge.title,
        (charge.amountCents / 100).toFixed(2),
        charge.org.name,
        charge.dueDate ? charge.dueDate.toISOString().split('T')[0] : 'No due date',
      );
    });

    const noEmail = emailTasks.filter((t) => t === null).length;
    const results = await Promise.allSettled(emailTasks.filter(Boolean) as Promise<any>[]);

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const skipped = noEmail + results.filter((r) => r.status === 'rejected').length;

    return { sent, skipped };
  }
}
