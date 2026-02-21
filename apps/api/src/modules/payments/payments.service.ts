import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChargesService } from '../charges/charges.service';
import { AuditService } from '../audit/audit.service';

interface CreatePaymentDto {
  membershipId?: string;
  amountCents: number;
  paidAt: string;
  rawPayerName?: string;
  memo?: string;
}

interface AllocatePaymentDto {
  allocations: Array<{
    chargeId: string;
    amountCents: number;
  }>;
}

interface UpdatePaymentDto {
  membershipId?: string;
  amountCents?: number;
  paidAt?: string;
  rawPayerName?: string;
  memo?: string;
}

interface PaymentFilters {
  membershipId?: string;
  unallocated?: boolean;
  page?: number;
  limit?: number;
}

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private chargesService: ChargesService,
    private auditService: AuditService,
  ) {}

  async findAll(orgId: string, filters: PaymentFilters = {}) {
    const { membershipId, unallocated, page = 1, limit = 50 } = filters;

    const where: any = { orgId, deletedAt: null };

    if (membershipId) {
      where.membershipId = membershipId;
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: {
          allocations: {
            include: {
              charge: {
                select: { id: true, title: true, membershipId: true },
              },
            },
          },
        },
        orderBy: { paidAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    let data = payments.map((p) => {
      const allocatedCents = p.allocations.reduce((sum, a) => sum + a.amountCents, 0);
      return {
        id: p.id,
        orgId: p.orgId,
        membershipId: p.membershipId,
        amountCents: p.amountCents,
        paidAt: p.paidAt,
        source: p.source,
        rawPayerName: p.rawPayerName,
        memo: p.memo,
        createdAt: p.createdAt,
        allocatedCents,
        unallocatedCents: p.amountCents - allocatedCents,
        allocations: p.allocations.map((a) => ({
          id: a.id,
          chargeId: a.chargeId,
          chargeTitle: a.charge.title,
          amountCents: a.amountCents,
        })),
      };
    });

    // Filter by unallocated if requested
    if (unallocated === true) {
      data = data.filter((p) => p.unallocatedCents > 0);
    }

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(orgId: string, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, orgId, deletedAt: null },
      include: {
        allocations: {
          include: {
            charge: {
              select: {
                id: true,
                title: true,
                category: true,
                amountCents: true,
                membershipId: true,
                membership: {
                  select: {
                    id: true,
                    name: true,
                    user: { select: { name: true, email: true } },
                  },
                },
              },
            },
          },
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

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const allocatedCents = payment.allocations.reduce((sum, a) => sum + a.amountCents, 0);

    return {
      id: payment.id,
      orgId: payment.orgId,
      membershipId: payment.membershipId,
      amountCents: payment.amountCents,
      paidAt: payment.paidAt,
      source: payment.source,
      rawPayerName: payment.rawPayerName,
      memo: payment.memo,
      externalId: payment.externalId,
      createdAt: payment.createdAt,
      createdBy: payment.createdBy
        ? {
            id: payment.createdBy.id,
            name: payment.createdBy.name || payment.createdBy.user?.name || 'Unknown',
          }
        : null,
      allocatedCents,
      unallocatedCents: payment.amountCents - allocatedCents,
      allocations: payment.allocations.map((a) => ({
        id: a.id,
        chargeId: a.chargeId,
        amountCents: a.amountCents,
        createdAt: a.createdAt,
        charge: {
          id: a.charge.id,
          title: a.charge.title,
          category: a.charge.category,
          amountCents: a.charge.amountCents,
          membership: {
            id: a.charge.membership.id,
            displayName: a.charge.membership.name || a.charge.membership.user?.name || a.charge.membership.user?.email || 'Unknown',
          },
        },
      })),
    };
  }

  async create(orgId: string, createdById: string, dto: CreatePaymentDto) {
    // Validate membership if provided
    if (dto.membershipId) {
      const membership = await this.prisma.membership.findFirst({
        where: { id: dto.membershipId, orgId },
      });

      if (!membership) {
        throw new BadRequestException('Invalid member');
      }
    }

    const payment = await this.prisma.payment.create({
      data: {
        orgId,
        membershipId: dto.membershipId,
        amountCents: dto.amountCents,
        paidAt: new Date(dto.paidAt + 'T12:00:00'),
        source: 'manual',
        rawPayerName: dto.rawPayerName,
        memo: dto.memo,
        createdById,
      },
    });

    // Log audit entry for create
    await this.auditService.logCreate(orgId, createdById, 'PAYMENT', payment.id, {
      amountCents: payment.amountCents,
      paidAt: payment.paidAt,
      rawPayerName: payment.rawPayerName,
      memo: payment.memo,
    });

    return payment;
  }

  async allocate(orgId: string, paymentId: string, createdById: string, dto: AllocatePaymentDto) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, orgId, deletedAt: null },
      include: {
        allocations: {
          select: { amountCents: true },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Calculate current allocated and requested
    const currentAllocated = payment.allocations.reduce((sum, a) => sum + a.amountCents, 0);
    const requestedAllocation = dto.allocations.reduce((sum, a) => sum + a.amountCents, 0);
    const availableToAllocate = payment.amountCents - currentAllocated;

    if (requestedAllocation > availableToAllocate) {
      throw new BadRequestException(
        `Cannot allocate ${requestedAllocation} cents. Only ${availableToAllocate} cents available.`,
      );
    }

    // Validate all charges exist and belong to this org
    const chargeIds = dto.allocations.map((a) => a.chargeId);
    const charges = await this.prisma.charge.findMany({
      where: { id: { in: chargeIds }, orgId, status: { not: 'VOID' } },
      include: {
        allocations: {
          select: { amountCents: true },
        },
      },
    });

    if (charges.length !== chargeIds.length) {
      throw new BadRequestException('Some charges are invalid or voided');
    }

    // Validate allocation amounts don't exceed charge balances
    for (const alloc of dto.allocations) {
      const charge = charges.find((c) => c.id === alloc.chargeId);
      if (!charge) continue;

      const chargeAllocated = charge.allocations.reduce((sum, a) => sum + a.amountCents, 0);
      const chargeBalance = charge.amountCents - chargeAllocated;

      if (alloc.amountCents > chargeBalance) {
        throw new BadRequestException(
          `Cannot allocate ${alloc.amountCents} to charge "${charge.title}". Only ${chargeBalance} cents remaining.`,
        );
      }
    }

    // Create allocations in a transaction
    const createdAllocations = await this.prisma.$transaction(async (tx) => {
      const allocations = await Promise.all(
        dto.allocations.map((alloc) =>
          tx.paymentAllocation.create({
            data: {
              orgId,
              paymentId,
              chargeId: alloc.chargeId,
              amountCents: alloc.amountCents,
              createdById,
            },
          }),
        ),
      );

      return allocations;
    });

    // Update charge statuses
    for (const chargeId of chargeIds) {
      await this.chargesService.updateChargeStatus(chargeId);
    }

    return createdAllocations;
  }

  async update(orgId: string, paymentId: string, dto: UpdatePaymentDto, actorId?: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, orgId, deletedAt: null },
      include: {
        allocations: {
          select: { amountCents: true },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // If changing amount, make sure it's not less than allocated
    if (dto.amountCents !== undefined) {
      const allocatedCents = payment.allocations.reduce((sum, a) => sum + a.amountCents, 0);
      if (dto.amountCents < allocatedCents) {
        throw new BadRequestException('Cannot reduce amount below allocated amounts');
      }
    }

    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        ...(dto.membershipId !== undefined && { membershipId: dto.membershipId }),
        ...(dto.amountCents !== undefined && { amountCents: dto.amountCents }),
        ...(dto.paidAt && { paidAt: new Date(dto.paidAt + 'T12:00:00') }),
        ...(dto.rawPayerName !== undefined && { rawPayerName: dto.rawPayerName }),
        ...(dto.memo !== undefined && { memo: dto.memo }),
      },
    });

    // Log audit entry for update
    if (actorId) {
      const before: Record<string, any> = {};
      const after: Record<string, any> = {};

      if (dto.amountCents !== undefined && dto.amountCents !== payment.amountCents) {
        before.amountCents = payment.amountCents;
        after.amountCents = dto.amountCents;
      }
      if (dto.paidAt !== undefined) {
        before.paidAt = payment.paidAt;
        after.paidAt = dto.paidAt;
      }
      if (dto.rawPayerName !== undefined && dto.rawPayerName !== payment.rawPayerName) {
        before.rawPayerName = payment.rawPayerName;
        after.rawPayerName = dto.rawPayerName;
      }
      if (dto.memo !== undefined && dto.memo !== payment.memo) {
        before.memo = payment.memo;
        after.memo = dto.memo;
      }

      if (Object.keys(after).length > 0) {
        await this.auditService.logUpdate(orgId, actorId, 'PAYMENT', paymentId, before, after);
      }
    }

    return updated;
  }

  async delete(orgId: string, paymentId: string, actorId?: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, orgId, deletedAt: null },
      include: {
        allocations: {
          select: { chargeId: true },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const affectedChargeIds = payment.allocations.map((a) => a.chargeId);

    // Soft delete payment and delete allocations
    await this.prisma.$transaction([
      this.prisma.paymentAllocation.deleteMany({ where: { paymentId } }),
      this.prisma.payment.update({
        where: { id: paymentId },
        data: { deletedAt: new Date() },
      }),
    ]);

    // Update charge statuses
    for (const chargeId of affectedChargeIds) {
      await this.chargesService.updateChargeStatus(chargeId);
    }

    // Log audit entry for delete
    if (actorId) {
      await this.auditService.logDelete(orgId, actorId, 'PAYMENT', paymentId, {
        amountCents: payment.amountCents,
        paidAt: payment.paidAt,
        rawPayerName: payment.rawPayerName,
      });
    }

    return { success: true };
  }

  async restore(orgId: string, paymentId: string, actorId?: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, orgId, deletedAt: { not: null } },
    });

    if (!payment) {
      throw new NotFoundException('Deleted payment not found');
    }

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { deletedAt: null },
    });

    // Log audit entry for restore
    if (actorId) {
      await this.auditService.logCreate(orgId, actorId, 'PAYMENT', paymentId, {
        amountCents: payment.amountCents,
        paidAt: payment.paidAt,
        rawPayerName: payment.rawPayerName,
        restored: true,
      });
    }

    return { success: true };
  }

  async removeAllocation(orgId: string, allocationId: string) {
    const allocation = await this.prisma.paymentAllocation.findFirst({
      where: { id: allocationId, orgId },
    });

    if (!allocation) {
      throw new NotFoundException('Allocation not found');
    }

    await this.prisma.paymentAllocation.delete({ where: { id: allocationId } });

    // Update charge status
    await this.chargesService.updateChargeStatus(allocation.chargeId);

    return { success: true };
  }

  async getUnallocatedForMember(orgId: string, membershipId: string) {
    const payments = await this.prisma.payment.findMany({
      where: { orgId, membershipId, deletedAt: null },
      include: {
        allocations: {
          select: { amountCents: true },
        },
      },
    });

    let totalUnallocatedCents = 0;
    const unallocatedPayments: Array<{ id: string; unallocatedCents: number }> = [];

    for (const payment of payments) {
      const allocatedCents = payment.allocations.reduce((sum, a) => sum + a.amountCents, 0);
      const unallocatedCents = payment.amountCents - allocatedCents;
      if (unallocatedCents > 0) {
        totalUnallocatedCents += unallocatedCents;
        unallocatedPayments.push({ id: payment.id, unallocatedCents });
      }
    }

    return { totalUnallocatedCents, payments: unallocatedPayments };
  }

  async autoAllocateToCharge(
    orgId: string,
    chargeId: string,
    createdById: string,
  ) {
    // Get the charge with its member
    const charge = await this.prisma.charge.findFirst({
      where: { id: chargeId, orgId, status: { not: 'VOID' } },
      include: {
        allocations: { select: { amountCents: true } },
      },
    });

    if (!charge) {
      throw new NotFoundException('Charge not found');
    }

    const chargeAllocated = charge.allocations.reduce((sum, a) => sum + a.amountCents, 0);
    let chargeBalance = charge.amountCents - chargeAllocated;

    if (chargeBalance <= 0) {
      return { allocatedCents: 0, message: 'Charge is already fully paid' };
    }

    // Get unallocated payments for this member
    const { payments } = await this.getUnallocatedForMember(orgId, charge.membershipId);

    if (payments.length === 0) {
      return { allocatedCents: 0, message: 'No unallocated payments for this member' };
    }

    let totalAllocated = 0;

    // Allocate from each unallocated payment
    for (const payment of payments) {
      if (chargeBalance <= 0) break;

      const toAllocate = Math.min(payment.unallocatedCents, chargeBalance);

      await this.prisma.paymentAllocation.create({
        data: {
          orgId,
          paymentId: payment.id,
          chargeId,
          amountCents: toAllocate,
          createdById,
        },
      });

      totalAllocated += toAllocate;
      chargeBalance -= toAllocate;
    }

    // Update charge status
    await this.chargesService.updateChargeStatus(chargeId);

    return { allocatedCents: totalAllocated };
  }
}
