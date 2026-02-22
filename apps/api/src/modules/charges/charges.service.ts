import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ChargeCategory, ChargeStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

interface CreateChargeDto {
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
  ) {}

  async findAll(orgId: string, filters: ChargeFilters = {}) {
    const { status, category, membershipId, overdue, page = 1, limit = 50, cursor } = filters;
    const now = new Date();

    const where: any = { orgId };

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
          user: { select: { name: true, email: true } },
        },
      },
      allocations: {
        select: { amountCents: true },
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

      const data = charges.map((c) => {
        const allocatedCents = c.allocations.reduce((sum, a) => sum + a.amountCents, 0);
        return {
          id: c.id, orgId: c.orgId, membershipId: c.membershipId, category: c.category,
          title: c.title, amountCents: c.amountCents, dueDate: c.dueDate, status: c.status, createdAt: c.createdAt,
          membership: { id: c.membership.id, name: c.membership.name, displayName: c.membership.name || c.membership.user?.name || c.membership.user?.email || 'Unknown' },
          allocatedCents, balanceDueCents: c.amountCents - allocatedCents,
        };
      });

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

    const data = charges.map((c) => {
      const allocatedCents = c.allocations.reduce((sum, a) => sum + a.amountCents, 0);
      return {
        id: c.id, orgId: c.orgId, membershipId: c.membershipId, category: c.category,
        title: c.title, amountCents: c.amountCents, dueDate: c.dueDate, status: c.status, createdAt: c.createdAt,
        membership: { id: c.membership.id, name: c.membership.name, displayName: c.membership.name || c.membership.user?.name || c.membership.user?.email || 'Unknown' },
        allocatedCents, balanceDueCents: c.amountCents - allocatedCents,
      };
    });

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(orgId: string, chargeId: string) {
    const charge = await this.prisma.charge.findFirst({
      where: { id: chargeId, orgId },
      include: {
        membership: {
          select: {
            id: true,
            name: true,
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
      membership: {
        id: charge.membership.id,
        name: charge.membership.name,
        displayName: charge.membership.name || charge.membership.user?.name || charge.membership.user?.email || 'Unknown',
      },
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
          memberName: memberNameMap.get(charge.membershipId) || 'Unknown',
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

    return updated;
  }

  async void(orgId: string, chargeId: string, actorId?: string) {
    const charge = await this.prisma.charge.findFirst({
      where: { id: chargeId, orgId },
      include: {
        allocations: true,
      },
    });

    if (!charge) {
      throw new NotFoundException('Charge not found');
    }

    // Delete allocations and void the charge
    await this.prisma.$transaction([
      this.prisma.paymentAllocation.deleteMany({
        where: { chargeId },
      }),
      this.prisma.charge.update({
        where: { id: chargeId },
        data: { status: 'VOID' },
      }),
    ]);

    // Log audit entry for void/delete
    if (actorId) {
      await this.auditService.logDelete(orgId, actorId, 'CHARGE', chargeId, {
        title: charge.title,
        amountCents: charge.amountCents,
        category: charge.category,
      });
    }

    return { success: true };
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

  async updateChargeStatus(chargeId: string) {
    const charge = await this.prisma.charge.findUnique({
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
      await this.prisma.charge.update({
        where: { id: chargeId },
        data: { status: newStatus },
      });
    }
  }
}
