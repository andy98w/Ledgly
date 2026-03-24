import { createTestContext, cleanupTestContext, TestContext } from '../../test/test-helpers';

jest.setTimeout(60_000);

describe('Bulk auto-allocate edge cases (integration)', () => {
  let ctx: TestContext;
  let memberA: string;
  let memberB: string;

  beforeAll(async () => {
    ctx = await createTestContext();

    const userA = await ctx.prisma.user.create({
      data: { email: `alloc-a-${crypto.randomUUID()}@test.local`, name: 'Alice Allocator' },
    });
    const mA = await ctx.prisma.membership.create({
      data: { orgId: ctx.orgId, userId: userA.id, role: 'MEMBER', status: 'ACTIVE', name: 'Alice Allocator' },
    });
    memberA = mA.id;

    const userB = await ctx.prisma.user.create({
      data: { email: `alloc-b-${crypto.randomUUID()}@test.local`, name: 'Bob Builder' },
    });
    const mB = await ctx.prisma.membership.create({
      data: { orgId: ctx.orgId, userId: userB.id, role: 'MEMBER', status: 'ACTIVE', name: 'Bob Builder' },
    });
    memberB = mB.id;
  }, 30_000);

  afterAll(async () => {
    const memberships = await ctx.prisma.membership.findMany({
      where: { orgId: ctx.orgId, id: { in: [memberA, memberB] } },
      select: { userId: true },
    });
    const userIds = memberships.map((m) => m.userId).filter(Boolean) as string[];

    await ctx.prisma.membership.deleteMany({ where: { id: { in: [memberA, memberB] } } });
    if (userIds.length > 0) {
      await ctx.prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }

    await cleanupTestContext(ctx);
  }, 15_000);

  beforeEach(async () => {
    await ctx.prisma.auditLog.deleteMany({ where: { orgId: ctx.orgId, entityType: { in: ['ALLOCATION', 'CHARGE', 'PAYMENT'] } } });
    await ctx.prisma.paymentAllocation.deleteMany({ where: { orgId: ctx.orgId } });
    await ctx.prisma.charge.deleteMany({ where: { orgId: ctx.orgId } });
    await ctx.prisma.payment.deleteMany({ where: { orgId: ctx.orgId } });
  });

  async function cleanup(chargeIds: string[], paymentIds: string[]) {
    const allIds = [...chargeIds, ...paymentIds];
    await ctx.prisma.auditLog.deleteMany({ where: { orgId: ctx.orgId, entityId: { in: allIds } } });
    await ctx.prisma.auditLog.deleteMany({
      where: { orgId: ctx.orgId, entityType: 'ALLOCATION', entityId: { in: [...chargeIds, ...paymentIds] } },
    });
    await ctx.prisma.paymentAllocation.deleteMany({ where: { orgId: ctx.orgId } });
    await ctx.prisma.charge.deleteMany({ where: { id: { in: chargeIds } } });
    await ctx.prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
  }

  it('two payments for same member, one charge — second partially allocated', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [memberA],
      category: 'DUES' as any,
      title: 'Dues',
      amountCents: 10000,
    });
    const charge = charges[0];

    // Create payments without membershipId to skip auto-allocation in create(),
    // then link them to the member directly so bulkAutoAllocate can find charges
    const p1 = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 6000,
      paidAt: '2026-01-01',
      rawPayerName: 'No Match Payer 1',
    });
    await ctx.prisma.payment.update({ where: { id: p1.id }, data: { membershipId: memberA } });

    const p2 = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 6000,
      paidAt: '2026-01-02',
      rawPayerName: 'No Match Payer 2',
    });
    await ctx.prisma.payment.update({ where: { id: p2.id }, data: { membershipId: memberA } });

    const result = await ctx.paymentsService.bulkAutoAllocate(ctx.orgId, [p1.id, p2.id], ctx.membershipId);

    // P1 allocates $60, P2 allocates $40 (charge balance), $20 left on P2
    expect(result.totalAllocatedCents).toBe(10000);
    expect(result.successCount).toBe(2); // Both allocated something

    // Charge should be PAID
    const updatedCharge = await ctx.prisma.charge.findUnique({ where: { id: charge.id } });
    expect(updatedCharge?.status).toBe('PAID');

    // P2 should have $20 unallocated
    const p2Data = await ctx.paymentsService.findOne(ctx.orgId, p2.id);
    expect(p2Data.unallocatedCents).toBe(2000);

    await cleanup([charge.id], [p1.id, p2.id]);
  });

  it('payment already fully allocated is skipped', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [memberA],
      category: 'DUES' as any,
      title: 'Full Alloc',
      amountCents: 5000,
    });
    const charge = charges[0];

    const payment = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 5000,
      paidAt: '2026-02-01',
      rawPayerName: 'No Match Payer',
    });
    await ctx.prisma.payment.update({ where: { id: payment.id }, data: { membershipId: memberA } });

    await ctx.paymentsService.allocate(ctx.orgId, payment.id, ctx.membershipId, {
      allocations: [{ chargeId: charge.id, amountCents: 5000 }],
    });

    // Now bulk auto-allocate — should skip since payment is fully allocated
    const result = await ctx.paymentsService.bulkAutoAllocate(ctx.orgId, [payment.id], ctx.membershipId);
    expect(result.successCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.totalAllocatedCents).toBe(0);

    await cleanup([charge.id], [payment.id]);
  });

  it('no open charges for member — payment is skipped', async () => {
    const payment = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 3000,
      paidAt: '2026-02-15',
      rawPayerName: 'No Match Payer',
    });
    await ctx.prisma.payment.update({ where: { id: payment.id }, data: { membershipId: memberB } });

    // No charges created for memberB
    const result = await ctx.paymentsService.bulkAutoAllocate(ctx.orgId, [payment.id], ctx.membershipId);
    expect(result.successCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.totalAllocatedCents).toBe(0);

    await cleanup([], [payment.id]);
  });

  it('partial allocation when charge balance < payment amount', async () => {
    // Charge: $30
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [memberA],
      category: 'DUES' as any,
      title: 'Small Charge',
      amountCents: 3000,
    });
    const charge = charges[0];

    const payment = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 10000,
      paidAt: '2026-03-01',
      rawPayerName: 'No Match Payer',
    });
    await ctx.prisma.payment.update({ where: { id: payment.id }, data: { membershipId: memberA } });

    const result = await ctx.paymentsService.bulkAutoAllocate(ctx.orgId, [payment.id], ctx.membershipId);

    // Only $30 should be allocated (charge cap)
    expect(result.totalAllocatedCents).toBe(3000);
    expect(result.successCount).toBe(1);

    // Charge should be PAID
    const updatedCharge = await ctx.prisma.charge.findUnique({ where: { id: charge.id } });
    expect(updatedCharge?.status).toBe('PAID');

    // Payment should have $70 unallocated
    const paymentData = await ctx.paymentsService.findOne(ctx.orgId, payment.id);
    expect(paymentData.unallocatedCents).toBe(7000);

    await cleanup([charge.id], [payment.id]);
  });

  it('greedy FIFO: allocates to oldest charge first', async () => {
    // Create two charges at different times
    const charges1 = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [memberA],
      category: 'DUES' as any,
      title: 'Older Charge',
      amountCents: 4000,
    });
    // Small delay to ensure different createdAt
    await new Promise((r) => setTimeout(r, 50));
    const charges2 = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [memberA],
      category: 'DUES' as any,
      title: 'Newer Charge',
      amountCents: 4000,
    });

    const c1 = charges1[0];
    const c2 = charges2[0];

    const payment = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 5000,
      paidAt: '2026-03-15',
      rawPayerName: 'No Match Payer',
      memo: 'dues payment',
    });
    await ctx.prisma.payment.update({ where: { id: payment.id }, data: { membershipId: memberA } });

    const result = await ctx.paymentsService.bulkAutoAllocate(ctx.orgId, [payment.id], ctx.membershipId);

    expect(result.totalAllocatedCents).toBe(5000);

    // Older charge should be fully paid
    const updatedC1 = await ctx.prisma.charge.findUnique({ where: { id: c1.id } });
    expect(updatedC1?.status).toBe('PAID');

    // Newer charge should be partially paid ($10 of $40)
    const updatedC2 = await ctx.prisma.charge.findUnique({ where: { id: c2.id } });
    expect(updatedC2?.status).toBe('PARTIALLY_PAID');

    // Verify allocation amounts via DB
    const allocs = await ctx.prisma.paymentAllocation.findMany({
      where: { paymentId: payment.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(allocs).toHaveLength(2);
    expect(allocs[0].chargeId).toBe(c1.id);
    expect(allocs[0].amountCents).toBe(4000); // Full $40 to older
    expect(allocs[1].chargeId).toBe(c2.id);
    expect(allocs[1].amountCents).toBe(1000); // Remaining $10 to newer

    await cleanup([c1.id, c2.id], [payment.id]);
  });

  it('mixed: some payments allocate, some skip — counts are accurate', async () => {
    // Charge for memberA only
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [memberA],
      category: 'DUES' as any,
      title: 'Mixed Test',
      amountCents: 5000,
    });
    const charge = charges[0];

    const pA = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 5000,
      paidAt: '2026-04-01',
      rawPayerName: 'No Match Payer A',
    });
    await ctx.prisma.payment.update({ where: { id: pA.id }, data: { membershipId: memberA } });

    const pB = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 3000,
      paidAt: '2026-04-01',
      rawPayerName: 'No Match Payer B',
    });
    await ctx.prisma.payment.update({ where: { id: pB.id }, data: { membershipId: memberB } });

    const result = await ctx.paymentsService.bulkAutoAllocate(ctx.orgId, [pA.id, pB.id], ctx.membershipId);

    expect(result.successCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.totalAllocatedCents).toBe(5000);

    await cleanup([charge.id], [pA.id, pB.id]);
  });

  it('autoAllocateToCharge uses fresh data, not stale amounts', async () => {
    // Create a charge for $100
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [memberA],
      category: 'DUES' as any,
      title: 'Fresh Data Test',
      amountCents: 10000,
    });
    const charge = charges[0];

    const payment = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 8000,
      paidAt: '2026-05-01',
      rawPayerName: 'No Match Payer',
    });
    await ctx.prisma.payment.update({ where: { id: payment.id }, data: { membershipId: memberA } });

    await ctx.paymentsService.allocate(ctx.orgId, payment.id, ctx.membershipId, {
      allocations: [{ chargeId: charge.id, amountCents: 3000 }],
    });

    // Auto-allocate the charge — should only allocate the remaining $50 from payment
    // (not the full $80, since $30 is already allocated)
    const result = await ctx.paymentsService.autoAllocateToCharge(ctx.orgId, charge.id, ctx.membershipId);
    expect(result.allocatedCents).toBe(5000); // $80 - $30 = $50 remaining on payment, $100 - $30 = $70 on charge

    // Verify total allocations on the charge
    const allocs = await ctx.prisma.paymentAllocation.findMany({ where: { chargeId: charge.id } });
    const totalAllocated = allocs.reduce((sum, a) => sum + a.amountCents, 0);
    expect(totalAllocated).toBe(8000); // $30 + $50 = $80

    // Charge should be PARTIALLY_PAID (has $80 of $100)
    const updatedCharge = await ctx.prisma.charge.findUnique({ where: { id: charge.id } });
    expect(updatedCharge?.status).toBe('PARTIALLY_PAID');

    await cleanup([charge.id], [payment.id]);
  });

  it('over-allocation is prevented by the allocate service', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [memberA],
      category: 'DUES' as any,
      title: 'Over Alloc',
      amountCents: 5000,
    });
    const charge = charges[0];

    const payment = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 3000,
      paidAt: '2026-06-01',
      rawPayerName: 'No Match Payer',
    });

    // Try to allocate $50 from a $30 payment → should fail
    await expect(
      ctx.paymentsService.allocate(ctx.orgId, payment.id, ctx.membershipId, {
        allocations: [{ chargeId: charge.id, amountCents: 5000 }],
      }),
    ).rejects.toThrow();

    // Verify no allocations were created
    const allocs = await ctx.prisma.paymentAllocation.findMany({ where: { paymentId: payment.id } });
    expect(allocs).toHaveLength(0);

    await cleanup([charge.id], [payment.id]);
  });

  it('voided charges are excluded from auto-allocation', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [memberA],
      category: 'DUES' as any,
      title: 'Voided Charge',
      amountCents: 5000,
    });
    const charge = charges[0];

    await ctx.chargesService.void(ctx.orgId, charge.id, ctx.membershipId);

    const payment = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 5000,
      paidAt: '2026-06-15',
      rawPayerName: 'No Match Payer',
    });
    await ctx.prisma.payment.update({ where: { id: payment.id }, data: { membershipId: memberA } });

    // Auto-allocate should skip (no open charges)
    const result = await ctx.paymentsService.bulkAutoAllocate(ctx.orgId, [payment.id], ctx.membershipId);
    expect(result.successCount).toBe(0);
    expect(result.skippedCount).toBe(1);

    await cleanup([charge.id], [payment.id]);
  });
});
