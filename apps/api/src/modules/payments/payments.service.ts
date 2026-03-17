import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ChargesService } from '../charges/charges.service';
import { ExpensesService } from '../expenses/expenses.service';
import { AuditService } from '../audit/audit.service';
import { sanitizeText } from '../../common/utils/sanitize';
import { deriveCategoryFromMemo } from '../../common/utils/category-matcher';

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
  search?: string;
  page?: number;
  limit?: number;
  cursor?: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private chargesService: ChargesService,
    private expensesService: ExpensesService,
    private auditService: AuditService,
  ) {}

  async findAll(orgId: string, filters: PaymentFilters = {}) {
    const { membershipId, unallocated, search, page = 1, limit = 50, cursor } = filters;

    const where: any = { orgId, deletedAt: null };

    if (membershipId) {
      where.membershipId = membershipId;
    }

    if (search) {
      where.OR = [
        { rawPayerName: { contains: search, mode: 'insensitive' } },
        { memo: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Move unallocated filter into the where clause so pagination counts are correct.
    // Pre-fetch IDs of payments with unallocated funds and constrain via `id: { in: ... }`.
    if (unallocated === true) {
      const unallocatedIds = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT p.id FROM payments p
        WHERE p.org_id = ${orgId}
          AND p.deleted_at IS NULL
          AND p.amount_cents > (
            SELECT COALESCE(SUM(pa.amount_cents), 0)
            FROM payment_allocations pa
            WHERE pa.payment_id = p.id
          )
      `;
      where.id = { in: unallocatedIds.map((r) => r.id) };
    }

    const includeOpts = {
      allocations: {
        include: {
          charge: {
            select: { id: true, title: true, membershipId: true },
          },
        },
      },
    };

    const mapPayment = (p: any) => {
      const allocatedCents = p.allocations.reduce((sum: number, a: any) => sum + a.amountCents, 0);
      return {
        id: p.id, orgId: p.orgId, membershipId: p.membershipId,
        amountCents: p.amountCents, paidAt: p.paidAt, source: p.source,
        rawPayerName: p.rawPayerName, memo: p.memo, createdAt: p.createdAt,
        allocatedCents, unallocatedCents: p.amountCents - allocatedCents,
        allocations: p.allocations.map((a: any) => ({
          id: a.id, chargeId: a.chargeId, chargeTitle: a.charge.title, amountCents: a.amountCents,
        })),
      };
    };

    // Cursor-based pagination mode
    if (cursor) {
      const items = await this.prisma.payment.findMany({
        where,
        include: includeOpts,
        cursor: { id: cursor },
        skip: 1,
        take: limit + 1,
        orderBy: { paidAt: 'desc' },
      });

      const hasMore = items.length > limit;
      const data = items.slice(0, limit).map(mapPayment);

      return {
        data,
        meta: { limit, nextCursor: hasMore ? data[data.length - 1]?.id : null, hasMore },
      };
    }

    // Offset-based pagination mode (default)
    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: includeOpts,
        orderBy: { paidAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    const data = payments.map(mapPayment);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
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
          membership: a.charge.membership ? {
            id: a.charge.membership.id,
            displayName: a.charge.membership.name || a.charge.membership.user?.name || a.charge.membership.user?.email || 'Unknown',
          } : null,
        },
      })),
    };
  }

  async create(orgId: string, createdById: string, dto: CreatePaymentDto) {
    dto.rawPayerName = sanitizeText(dto.rawPayerName) ?? undefined;
    dto.memo = sanitizeText(dto.memo) ?? undefined;

    const paidAtDate = new Date(dto.paidAt + 'T12:00:00');
    const startOfDay = new Date(paidAtDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(paidAtDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Wrap duplicate check + create in a transaction to prevent TOCTOU race
    const payment = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findFirst({
        where: {
          orgId,
          rawPayerName: dto.rawPayerName || null,
          amountCents: dto.amountCents,
          paidAt: { gte: startOfDay, lte: endOfDay },
          deletedAt: null,
        },
      });

      if (existing) {
        throw new ConflictException(
          'A payment with the same payer, amount, and date already exists',
        );
      }

      // Hard-delete any soft-deleted duplicates to prevent restore from creating duplicates later
      await tx.payment.deleteMany({
        where: {
          orgId,
          rawPayerName: dto.rawPayerName || null,
          amountCents: dto.amountCents,
          paidAt: { gte: startOfDay, lte: endOfDay },
          deletedAt: { not: null },
        },
      });

      // Validate membership if provided
      if (dto.membershipId) {
        const membership = await tx.membership.findFirst({
          where: { id: dto.membershipId, orgId },
        });

        if (!membership) {
          throw new BadRequestException('Invalid member');
        }
      }

      return tx.payment.create({
        data: {
          orgId,
          membershipId: dto.membershipId,
          amountCents: dto.amountCents,
          paidAt: paidAtDate,
          source: 'manual',
          rawPayerName: dto.rawPayerName,
          memo: dto.memo,
          createdById,
        },
      });
    });

    // Audit log (best-effort, outside tx)
    await this.auditService.logCreate(orgId, createdById, 'PAYMENT', payment.id, {
      amountCents: payment.amountCents,
      paidAt: payment.paidAt,
      rawPayerName: payment.rawPayerName,
      memo: payment.memo,
    });

    // Auto-allocate to matching charges (best-effort)
    let allocationResult: { allocated: boolean; allocatedCents?: number; chargeCount?: number } = { allocated: false };
    try {
      allocationResult = await this.autoAllocatePayment(orgId, payment.id, createdById);
    } catch {
      // Allocation failure must not block payment creation
    }

    return { ...payment, allocationResult };
  }

  async bulkCreate(orgId: string, createdById: string, items: CreatePaymentDto[]) {
    const results: any[] = [];
    const errors: string[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const payment = await this.create(orgId, createdById, items[i]);
        results.push(payment);
      } catch (error: any) {
        errors.push(`Row ${i + 1}: ${error.message || 'Failed'}`);
      }
    }

    return { created: results, createdCount: results.length, errorCount: errors.length, errors };
  }

  async allocate(orgId: string, paymentId: string, createdById: string, dto: AllocatePaymentDto) {
    const chargeIds = dto.allocations.map((a) => a.chargeId);

    const { createdAllocations, charges, paymentRawPayerName } = await this.prisma.$transaction(async (tx) => {
      // Lock the payment row
      await tx.$queryRaw`SELECT 1 FROM payments WHERE id = ${paymentId} FOR UPDATE`;

      // Lock all charge rows
      for (const cId of chargeIds) {
        await tx.$queryRaw`SELECT 1 FROM charges WHERE id = ${cId} FOR UPDATE`;
      }

      const payment = await tx.payment.findFirst({
        where: { id: paymentId, orgId, deletedAt: null },
        include: { allocations: { select: { amountCents: true } } },
      });

      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      const currentAllocated = payment.allocations.reduce((sum, a) => sum + a.amountCents, 0);
      const requestedAllocation = dto.allocations.reduce((sum, a) => sum + a.amountCents, 0);
      const availableToAllocate = payment.amountCents - currentAllocated;

      if (requestedAllocation > availableToAllocate) {
        throw new BadRequestException(
          `Cannot allocate ${requestedAllocation} cents. Only ${availableToAllocate} cents available.`,
        );
      }

      const txCharges = await tx.charge.findMany({
        where: { id: { in: chargeIds }, orgId, status: { not: 'VOID' } },
        include: { allocations: { select: { amountCents: true } } },
      });

      if (txCharges.length !== chargeIds.length) {
        throw new BadRequestException('Some charges are invalid or voided');
      }

      for (const alloc of dto.allocations) {
        const charge = txCharges.find((c) => c.id === alloc.chargeId);
        if (!charge) continue;

        const chargeAllocated = charge.allocations.reduce((sum, a) => sum + a.amountCents, 0);
        const chargeBalance = charge.amountCents - chargeAllocated;

        if (alloc.amountCents > chargeBalance) {
          throw new BadRequestException(
            `Cannot allocate ${alloc.amountCents} to charge "${charge.title}". Only ${chargeBalance} cents remaining.`,
          );
        }
      }

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

      // Update charge statuses inside the transaction
      for (const cId of chargeIds) {
        await this.chargesService.updateChargeStatus(cId, createdById, tx);
      }

      return { createdAllocations: allocations, charges: txCharges, paymentRawPayerName: payment.rawPayerName };
    });

    // Audit log (best-effort, outside tx)
    const batch = createdAllocations.length > 1
      ? this.auditService.createBatchContext(`Allocated payment to ${createdAllocations.length} charges`)
      : undefined;
    for (const alloc of createdAllocations) {
      const charge = charges.find((c) => c.id === alloc.chargeId);
      await this.auditService.logCreate(orgId, createdById, 'ALLOCATION', alloc.id, {
        paymentId,
        chargeId: alloc.chargeId,
        chargeTitle: charge?.title,
        amountCents: alloc.amountCents,
        rawPayerName: paymentRawPayerName,
      }, batch);
    }

    return createdAllocations;
  }

  async update(orgId: string, paymentId: string, dto: UpdatePaymentDto, actorId?: string) {
    if (dto.rawPayerName !== undefined) dto.rawPayerName = sanitizeText(dto.rawPayerName) ?? undefined;
    if (dto.memo !== undefined) dto.memo = sanitizeText(dto.memo) ?? undefined;

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

  async delete(orgId: string, paymentId: string, actorId?: string, batch?: { batchId: string; batchDescription: string }) {
    const { affectedChargeIds, paymentData } = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { id: paymentId, orgId, deletedAt: null },
        include: { allocations: { select: { chargeId: true } } },
      });

      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      const chargeIds = payment.allocations.map((a) => a.chargeId);

      // Delete allocations and soft-delete payment
      await tx.paymentAllocation.deleteMany({ where: { paymentId } });
      await tx.payment.update({
        where: { id: paymentId },
        data: { deletedAt: new Date() },
      });

      // Update charge statuses inside the transaction
      for (const chargeId of chargeIds) {
        await this.chargesService.updateChargeStatus(chargeId, actorId, tx);
      }

      return {
        affectedChargeIds: chargeIds,
        paymentData: { amountCents: payment.amountCents, paidAt: payment.paidAt, rawPayerName: payment.rawPayerName },
      };
    });

    // Audit log (best-effort, outside tx)
    if (actorId) {
      await this.auditService.logDelete(orgId, actorId, 'PAYMENT', paymentId, paymentData, batch);
    }

    return { success: true };
  }

  async bulkDelete(orgId: string, paymentIds: string[], actorId: string) {
    if (paymentIds.length === 0) return { success: true, deletedCount: 0 };

    const batch = paymentIds.length > 1
      ? this.auditService.createBatchContext(`Deleted ${paymentIds.length} payments`)
      : undefined;

    const results = await Promise.allSettled(
      paymentIds.map((paymentId) => this.delete(orgId, paymentId, actorId, batch)),
    );

    const deletedCount = results.filter((r) => r.status === 'fulfilled').length;
    return { success: true, deletedCount };
  }

  async restore(orgId: string, paymentId: string, actorId?: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, orgId, deletedAt: { not: null } },
    });

    if (!payment) {
      throw new NotFoundException('Deleted payment not found');
    }

    // Check for an existing active payment with the same fingerprint to prevent duplicates
    const paidAtDate = new Date(payment.paidAt);
    const startOfDay = new Date(paidAtDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(paidAtDate);
    endOfDay.setHours(23, 59, 59, 999);

    const activeDuplicate = await this.prisma.payment.findFirst({
      where: {
        orgId,
        id: { not: paymentId },
        rawPayerName: payment.rawPayerName,
        amountCents: payment.amountCents,
        paidAt: { gte: startOfDay, lte: endOfDay },
        deletedAt: null,
      },
    });

    if (activeDuplicate) {
      throw new ConflictException(
        'An active payment with the same payer, amount, and date already exists',
      );
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

  async removeAllocation(orgId: string, allocationId: string, actorId?: string, batch?: { batchId: string; batchDescription: string }) {
    const allocationData = await this.prisma.$transaction(async (tx) => {
      const allocation = await tx.paymentAllocation.findFirst({
        where: { id: allocationId, orgId },
        include: {
          charge: { select: { title: true } },
          payment: { select: { rawPayerName: true } },
        },
      });

      if (!allocation) {
        throw new NotFoundException('Allocation not found');
      }

      await tx.paymentAllocation.delete({ where: { id: allocationId } });

      // Update charge status inside the transaction
      await this.chargesService.updateChargeStatus(allocation.chargeId, actorId, tx);

      return {
        paymentId: allocation.paymentId,
        chargeId: allocation.chargeId,
        chargeTitle: allocation.charge.title,
        amountCents: allocation.amountCents,
        rawPayerName: allocation.payment?.rawPayerName,
      };
    });

    // Audit log (best-effort, outside tx)
    if (actorId) {
      await this.auditService.logDelete(orgId, actorId, 'ALLOCATION', allocationId, allocationData, batch);
    }

    return { success: true };
  }

  async restoreAllocation(orgId: string, allocationId: string, data: { paymentId: string; chargeId: string; amountCents: number; createdById: string }) {
    // Check if allocation already exists (prevents duplicate on double-redo)
    const existing = await this.prisma.paymentAllocation.findUnique({
      where: { id: allocationId },
    });

    if (existing) {
      // Already exists, just update charge status and return
      await this.chargesService.updateChargeStatus(data.chargeId, data.createdById);
      return existing;
    }

    // Re-create the allocation with its original ID
    const allocation = await this.prisma.paymentAllocation.create({
      data: {
        id: allocationId,
        orgId,
        paymentId: data.paymentId,
        chargeId: data.chargeId,
        amountCents: data.amountCents,
        createdById: data.createdById,
      },
    });

    // Update charge status
    await this.chargesService.updateChargeStatus(data.chargeId, data.createdById);

    // Audit log for the restored allocation
    const charge = await this.prisma.charge.findUnique({
      where: { id: data.chargeId },
      select: { title: true },
    });
    const payment = await this.prisma.payment.findUnique({
      where: { id: data.paymentId },
      select: { rawPayerName: true },
    });

    await this.auditService.logCreate(orgId, data.createdById, 'ALLOCATION', allocationId, {
      paymentId: data.paymentId,
      chargeId: data.chargeId,
      chargeTitle: charge?.title,
      amountCents: data.amountCents,
      rawPayerName: payment?.rawPayerName,
      restored: true,
    });

    return allocation;
  }

  async bulkRemoveAllocations(orgId: string, allocationIds: string[], actorId: string) {
    if (allocationIds.length === 0) {
      return { success: true, removedCount: 0 };
    }

    const batch = allocationIds.length > 1
      ? this.auditService.createBatchContext(`Removed ${allocationIds.length} allocations`)
      : undefined;

    const results = await Promise.allSettled(
      allocationIds.map((allocationId) => this.removeAllocation(orgId, allocationId, actorId, batch)),
    );

    const removedCount = results.filter((r) => r.status === 'fulfilled').length;
    return { success: true, removedCount };
  }

  private calculateNameSimilarity(a: string, b: string): number {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    const na = normalize(a);
    const nb = normalize(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    // Check if one contains the other
    if (na.includes(nb) || nb.includes(na)) return 0.85;
    // Check if all parts of one name appear in the other
    const partsA = na.split(/\s+/).filter(Boolean);
    const partsB = nb.split(/\s+/).filter(Boolean);
    const matchingParts = partsA.filter((p) => partsB.some((q) => q.includes(p) || p.includes(q)));
    if (matchingParts.length > 0) return matchingParts.length / Math.max(partsA.length, partsB.length);
    return 0;
  }

  async autoAllocatePayment(orgId: string, paymentId: string, createdById: string) {
    // Pre-tx: read-only member matching (idempotent, safe outside tx)
    const prePayment = await this.prisma.payment.findFirst({
      where: { id: paymentId, orgId, deletedAt: null },
      include: { allocations: { select: { amountCents: true } } },
    });

    if (!prePayment) return { allocated: false, reason: 'Payment not found' };

    const preAllocated = prePayment.allocations.reduce((sum, a) => sum + a.amountCents, 0);
    if (prePayment.amountCents - preAllocated <= 0) return { allocated: false, reason: 'Fully allocated' };

    let membershipId = prePayment.membershipId;

    if (!membershipId && prePayment.rawPayerName) {
      const memberships = await this.prisma.membership.findMany({
        where: { orgId, status: 'ACTIVE' },
        include: { user: { select: { name: true } } },
      });

      let bestMatch: { id: string; score: number } | null = null;
      for (const m of memberships) {
        const memberName = m.name || m.user?.name || '';
        if (!memberName) continue;
        const score = this.calculateNameSimilarity(prePayment.rawPayerName, memberName);
        if (score >= 0.7 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { id: m.id, score };
        }
      }

      if (bestMatch) {
        membershipId = bestMatch.id;
        // Link the payment to the member (can happen before tx)
        await this.prisma.payment.update({
          where: { id: paymentId },
          data: { membershipId },
        });
      }
    }

    if (!membershipId) return { allocated: false, reason: 'No matching member found' };

    const finalMembershipId = membershipId;

    // Transaction: lock payment, read charges, create allocations, update statuses
    const result = await this.prisma.$transaction(async (tx) => {
      // Lock the payment row
      await tx.$queryRaw`SELECT 1 FROM payments WHERE id = ${paymentId} FOR UPDATE`;

      const payment = await tx.payment.findFirst({
        where: { id: paymentId, orgId, deletedAt: null },
        include: { allocations: { select: { amountCents: true } } },
      });

      if (!payment) return { allocated: false as const, reason: 'Payment not found' };

      const allocatedCents = payment.allocations.reduce((sum, a) => sum + a.amountCents, 0);
      let remainingCents = payment.amountCents - allocatedCents;

      if (remainingCents <= 0) return { allocated: false as const, reason: 'Fully allocated' };

      // Derive category from memo to filter charges when possible
      const derivedCategory = payment.memo ? deriveCategoryFromMemo(payment.memo) : null;

      const charges = await tx.charge.findMany({
        where: {
          orgId,
          membershipId: finalMembershipId,
          status: { in: ['OPEN', 'PARTIALLY_PAID'] },
          ...(derivedCategory ? { category: derivedCategory } : {}),
        },
        include: { allocations: { select: { amountCents: true } } },
        orderBy: { createdAt: 'asc' },
      });

      if (charges.length === 0) return { allocated: false as const, reason: 'No open charges for member' };

      let totalAllocated = 0;
      const allocatedChargeIds: string[] = [];

      for (const charge of charges) {
        if (remainingCents <= 0) break;

        const chargeAllocated = charge.allocations.reduce((sum, a) => sum + a.amountCents, 0);
        const chargeBalance = charge.amountCents - chargeAllocated;
        if (chargeBalance <= 0) continue;

        const toAllocate = Math.min(remainingCents, chargeBalance);

        await tx.paymentAllocation.create({
          data: {
            orgId,
            paymentId,
            chargeId: charge.id,
            amountCents: toAllocate,
            createdById,
          },
        });

        allocatedChargeIds.push(charge.id);
        totalAllocated += toAllocate;
        remainingCents -= toAllocate;
      }

      // Update charge statuses inside the transaction
      for (const chargeId of allocatedChargeIds) {
        await this.chargesService.updateChargeStatus(chargeId, createdById, tx);
      }

      return { allocated: true as const, allocatedCents: totalAllocated, chargeCount: allocatedChargeIds.length, allocatedChargeIds, rawPayerName: payment.rawPayerName };
    });

    if (!result.allocated) return { allocated: false, reason: (result as any).reason };

    // Audit log (best-effort, outside tx)
    if (result.allocatedCents > 0) {
      await this.auditService.logCreate(orgId, createdById, 'ALLOCATION', paymentId, {
        paymentId,
        amountCents: result.allocatedCents,
        chargeIds: result.allocatedChargeIds,
        autoAllocated: true,
        rawPayerName: result.rawPayerName,
      });
    }

    return { allocated: true, allocatedCents: result.allocatedCents, chargeCount: result.chargeCount };
  }

  async bulkAutoAllocate(orgId: string, paymentIds: string[], createdById: string) {
    let totalAllocatedCents = 0;
    let successCount = 0;
    let skippedCount = 0;

    for (const paymentId of paymentIds) {
      try {
        const result = await this.autoAllocatePayment(orgId, paymentId, createdById);
        if (result.allocated) {
          totalAllocatedCents += result.allocatedCents || 0;
          successCount++;
        } else {
          skippedCount++;
        }
      } catch {
        skippedCount++;
      }
    }

    return { totalAllocatedCents, successCount, skippedCount };
  }

  async getUnallocatedForMember(orgId: string, membershipId: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const payments = await db.payment.findMany({
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
    const result = await this.prisma.$transaction(async (tx) => {
      // Lock the charge row
      await tx.$queryRaw`SELECT 1 FROM charges WHERE id = ${chargeId} FOR UPDATE`;

      const charge = await tx.charge.findFirst({
        where: { id: chargeId, orgId, status: { not: 'VOID' } },
        include: { allocations: { select: { amountCents: true } } },
      });

      if (!charge) {
        throw new NotFoundException('Charge not found');
      }

      const chargeAllocated = charge.allocations.reduce((sum, a) => sum + a.amountCents, 0);
      let chargeBalance = charge.amountCents - chargeAllocated;

      if (chargeBalance <= 0) {
        return { allocatedCents: 0, message: 'Charge is already fully paid', chargeTitle: charge.title };
      }

      // Get unallocated payments for this member (inside tx)
      const { payments } = await this.getUnallocatedForMember(orgId, charge.membershipId!, tx);

      if (payments.length === 0) {
        return { allocatedCents: 0, message: 'No unallocated payments for this member', chargeTitle: charge.title };
      }

      let totalAllocated = 0;

      for (const payment of payments) {
        if (chargeBalance <= 0) break;

        const toAllocate = Math.min(payment.unallocatedCents, chargeBalance);

        await tx.paymentAllocation.create({
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

      // Update charge status inside the transaction
      await this.chargesService.updateChargeStatus(chargeId, createdById, tx);

      return { allocatedCents: totalAllocated, chargeTitle: charge.title };
    });

    // Audit log (best-effort, outside tx)
    if (result.allocatedCents > 0) {
      await this.auditService.logCreate(orgId, createdById, 'ALLOCATION', chargeId, {
        chargeId,
        chargeTitle: result.chargeTitle,
        amountCents: result.allocatedCents,
        autoAllocated: true,
      });
    }

    return { allocatedCents: result.allocatedCents, message: result.message };
  }
}
