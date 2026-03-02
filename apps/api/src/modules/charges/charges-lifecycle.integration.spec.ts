import { BadRequestException } from '@nestjs/common';
import { createTestContext, cleanupTestContext, TestContext } from '../../test/test-helpers';

jest.setTimeout(30_000);

describe('Charge lifecycle edge cases (integration)', () => {
  let ctx: TestContext;
  let member: string;

  beforeAll(async () => {
    ctx = await createTestContext();

    const user = await ctx.prisma.user.create({
      data: { email: `lifecycle-${Date.now()}@test.local`, name: 'Lifecycle Tester' },
    });
    const m = await ctx.prisma.membership.create({
      data: { orgId: ctx.orgId, userId: user.id, role: 'MEMBER', status: 'ACTIVE', name: 'Lifecycle Tester' },
    });
    member = m.id;
  }, 30_000);

  afterAll(async () => {
    const ms = await ctx.prisma.membership.findMany({
      where: { orgId: ctx.orgId, id: member },
      select: { userId: true },
    });
    const userIds = ms.map((m) => m.userId).filter(Boolean) as string[];
    await ctx.prisma.membership.deleteMany({ where: { id: member } });
    if (userIds.length) await ctx.prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await cleanupTestContext(ctx);
  }, 15_000);

  async function cleanup(chargeIds: string[], paymentIds: string[] = []) {
    const allIds = [...chargeIds, ...paymentIds];
    await ctx.prisma.auditLog.deleteMany({ where: { orgId: ctx.orgId, entityId: { in: allIds } } });
    await ctx.prisma.auditLog.deleteMany({ where: { orgId: ctx.orgId, entityType: 'ALLOCATION' } });
    await ctx.prisma.paymentAllocation.deleteMany({ where: { orgId: ctx.orgId } });
    if (paymentIds.length) await ctx.prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    await ctx.prisma.charge.deleteMany({ where: { id: { in: chargeIds } } });
  }

  // ==================== update() edge cases ====================

  it('reducing amountCents to match allocated recalculates status to PAID', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member], category: 'DUES' as any, title: 'Reduce Test', amountCents: 10000,
    });
    const charge = charges[0];

    const payment = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 8000, paidAt: '2026-01-01', rawPayerName: 'Lifecycle Tester', membershipId: member,
    });

    // Allocate $80 to $100 charge → PARTIALLY_PAID
    await ctx.paymentsService.allocate(ctx.orgId, payment.id, ctx.membershipId, {
      allocations: [{ chargeId: charge.id, amountCents: 8000 }],
    });
    let c = await ctx.prisma.charge.findUnique({ where: { id: charge.id } });
    expect(c?.status).toBe('PARTIALLY_PAID');

    // Reduce charge amount to $80 (= allocated) → should become PAID
    await ctx.chargesService.update(ctx.orgId, charge.id, { amountCents: 8000 }, ctx.membershipId);
    c = await ctx.prisma.charge.findUnique({ where: { id: charge.id } });
    expect(c?.status).toBe('PAID');

    await cleanup([charge.id], [payment.id]);
  });

  it('increasing amountCents on PAID charge recalculates status to PARTIALLY_PAID', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member], category: 'DUES' as any, title: 'Increase Test', amountCents: 5000,
    });
    const charge = charges[0];

    const payment = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 5000, paidAt: '2026-01-02', rawPayerName: 'Lifecycle Tester', membershipId: member,
    });

    // Allocate $50 → charge becomes PAID
    await ctx.paymentsService.allocate(ctx.orgId, payment.id, ctx.membershipId, {
      allocations: [{ chargeId: charge.id, amountCents: 5000 }],
    });
    let c = await ctx.prisma.charge.findUnique({ where: { id: charge.id } });
    expect(c?.status).toBe('PAID');

    // Increase charge to $80 → should become PARTIALLY_PAID
    await ctx.chargesService.update(ctx.orgId, charge.id, { amountCents: 8000 }, ctx.membershipId);
    c = await ctx.prisma.charge.findUnique({ where: { id: charge.id } });
    expect(c?.status).toBe('PARTIALLY_PAID');

    await cleanup([charge.id], [payment.id]);
  });

  it('rejects reducing amountCents below allocated', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member], category: 'DUES' as any, title: 'Reject Test', amountCents: 10000,
    });
    const charge = charges[0];

    const payment = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 6000, paidAt: '2026-01-03', rawPayerName: 'Lifecycle Tester', membershipId: member,
    });

    await ctx.paymentsService.allocate(ctx.orgId, payment.id, ctx.membershipId, {
      allocations: [{ chargeId: charge.id, amountCents: 6000 }],
    });

    // Try to reduce to $40 (below $60 allocated) → should throw
    await expect(
      ctx.chargesService.update(ctx.orgId, charge.id, { amountCents: 4000 }, ctx.membershipId),
    ).rejects.toThrow(BadRequestException);

    // Verify charge amount is unchanged
    const c = await ctx.prisma.charge.findUnique({ where: { id: charge.id } });
    expect(c?.amountCents).toBe(10000);

    await cleanup([charge.id], [payment.id]);
  });

  // ==================== void() edge cases ====================

  it('voiding a charge deletes its allocations and frees payment funds', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member], category: 'DUES' as any, title: 'Void Alloc Test', amountCents: 7000,
    });
    const charge = charges[0];

    const payment = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 7000, paidAt: '2026-02-01', rawPayerName: 'Lifecycle Tester', membershipId: member,
    });

    await ctx.paymentsService.allocate(ctx.orgId, payment.id, ctx.membershipId, {
      allocations: [{ chargeId: charge.id, amountCents: 7000 }],
    });

    // Payment should be fully allocated
    let p = await ctx.paymentsService.findOne(ctx.orgId, payment.id);
    expect(p.unallocatedCents).toBe(0);

    // Void the charge
    await ctx.chargesService.void(ctx.orgId, charge.id, ctx.membershipId);

    // Payment funds should be freed
    p = await ctx.paymentsService.findOne(ctx.orgId, payment.id);
    expect(p.unallocatedCents).toBe(7000);
    expect(p.allocations).toHaveLength(0);

    // Charge should be VOID
    const c = await ctx.prisma.charge.findUnique({ where: { id: charge.id } });
    expect(c?.status).toBe('VOID');

    await cleanup([charge.id], [payment.id]);
  });

  it('voiding an already-VOID charge is idempotent', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member], category: 'DUES' as any, title: 'Double Void', amountCents: 1000,
    });
    const charge = charges[0];

    await ctx.chargesService.void(ctx.orgId, charge.id, ctx.membershipId);

    // Second void should not throw
    const result = await ctx.chargesService.void(ctx.orgId, charge.id, ctx.membershipId);
    expect(result.success).toBe(true);

    await cleanup([charge.id]);
  });

  // ==================== restore() edge cases ====================

  it('restore after void always returns to OPEN with zero allocations', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member], category: 'DUES' as any, title: 'Restore Test', amountCents: 5000,
    });
    const charge = charges[0];

    const payment = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 5000, paidAt: '2026-02-15', rawPayerName: 'Lifecycle Tester', membershipId: member,
    });

    // Allocate fully → PAID
    await ctx.paymentsService.allocate(ctx.orgId, payment.id, ctx.membershipId, {
      allocations: [{ chargeId: charge.id, amountCents: 5000 }],
    });
    let c = await ctx.prisma.charge.findUnique({ where: { id: charge.id } });
    expect(c?.status).toBe('PAID');

    // Void → deletes allocations
    await ctx.chargesService.void(ctx.orgId, charge.id, ctx.membershipId);

    // Restore → OPEN with no allocations
    await ctx.chargesService.restore(ctx.orgId, charge.id, ctx.membershipId);
    c = await ctx.prisma.charge.findUnique({ where: { id: charge.id } });
    expect(c?.status).toBe('OPEN');

    const allocs = await ctx.prisma.paymentAllocation.findMany({ where: { chargeId: charge.id } });
    expect(allocs).toHaveLength(0);

    // The charge's full balance is now due
    const detail = await ctx.chargesService.findOne(ctx.orgId, charge.id);
    expect(detail.balanceDueCents).toBe(5000);
    expect(detail.allocatedCents).toBe(0);

    await cleanup([charge.id], [payment.id]);
  });

  // ==================== removeAllocation() status transitions ====================

  it('removing allocation reverts PAID → OPEN', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member], category: 'DUES' as any, title: 'Remove Alloc', amountCents: 4000,
    });
    const charge = charges[0];

    const payment = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 4000, paidAt: '2026-03-01', rawPayerName: 'Lifecycle Tester', membershipId: member,
    });

    const allocs = await ctx.paymentsService.allocate(ctx.orgId, payment.id, ctx.membershipId, {
      allocations: [{ chargeId: charge.id, amountCents: 4000 }],
    });
    let c = await ctx.prisma.charge.findUnique({ where: { id: charge.id } });
    expect(c?.status).toBe('PAID');

    // Remove the only allocation → should revert to OPEN
    await ctx.paymentsService.removeAllocation(ctx.orgId, allocs[0].id, ctx.membershipId);
    c = await ctx.prisma.charge.findUnique({ where: { id: charge.id } });
    expect(c?.status).toBe('OPEN');

    await cleanup([charge.id], [payment.id]);
  });

  it('removing one of two allocations reverts PAID → PARTIALLY_PAID', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member], category: 'DUES' as any, title: 'Partial Remove', amountCents: 10000,
    });
    const charge = charges[0];

    const p1 = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 6000, paidAt: '2026-03-10', rawPayerName: 'Lifecycle Tester', membershipId: member,
    });
    const p2 = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 4000, paidAt: '2026-03-11', rawPayerName: 'Lifecycle Tester', membershipId: member,
    });

    // Two allocations to same charge: $60 + $40 = $100 → PAID
    const a1 = await ctx.paymentsService.allocate(ctx.orgId, p1.id, ctx.membershipId, {
      allocations: [{ chargeId: charge.id, amountCents: 6000 }],
    });
    const a2 = await ctx.paymentsService.allocate(ctx.orgId, p2.id, ctx.membershipId, {
      allocations: [{ chargeId: charge.id, amountCents: 4000 }],
    });

    let c = await ctx.prisma.charge.findUnique({ where: { id: charge.id } });
    expect(c?.status).toBe('PAID');

    // Remove p2's allocation ($40) → $60 allocated of $100 → PARTIALLY_PAID
    await ctx.paymentsService.removeAllocation(ctx.orgId, a2[0].id, ctx.membershipId);
    c = await ctx.prisma.charge.findUnique({ where: { id: charge.id } });
    expect(c?.status).toBe('PARTIALLY_PAID');

    // Verify exact allocated amount
    const detail = await ctx.chargesService.findOne(ctx.orgId, charge.id);
    expect(detail.allocatedCents).toBe(6000);
    expect(detail.balanceDueCents).toBe(4000);

    await cleanup([charge.id], [p1.id, p2.id]);
  });

  // ==================== allocation status transitions ====================

  it('incremental allocations transition OPEN → PARTIALLY_PAID → PAID', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member], category: 'DUES' as any, title: 'Incremental', amountCents: 9900,
    });
    const charge = charges[0];

    const payment = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 9900, paidAt: '2026-04-01', rawPayerName: 'Lifecycle Tester', membershipId: member,
    });

    // Step 1: $33 → PARTIALLY_PAID
    await ctx.paymentsService.allocate(ctx.orgId, payment.id, ctx.membershipId, {
      allocations: [{ chargeId: charge.id, amountCents: 3300 }],
    });
    let c = await ctx.prisma.charge.findUnique({ where: { id: charge.id } });
    expect(c?.status).toBe('PARTIALLY_PAID');

    // Step 2: $33 more → still PARTIALLY_PAID
    await ctx.paymentsService.allocate(ctx.orgId, payment.id, ctx.membershipId, {
      allocations: [{ chargeId: charge.id, amountCents: 3300 }],
    });
    c = await ctx.prisma.charge.findUnique({ where: { id: charge.id } });
    expect(c?.status).toBe('PARTIALLY_PAID');

    // Step 3: $33 more → exactly $99 → PAID
    await ctx.paymentsService.allocate(ctx.orgId, payment.id, ctx.membershipId, {
      allocations: [{ chargeId: charge.id, amountCents: 3300 }],
    });
    c = await ctx.prisma.charge.findUnique({ where: { id: charge.id } });
    expect(c?.status).toBe('PAID');

    await cleanup([charge.id], [payment.id]);
  });
});
