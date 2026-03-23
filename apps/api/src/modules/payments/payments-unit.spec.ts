import { createTestContext, cleanupTestContext, TestContext } from '../../test/test-helpers';

jest.setTimeout(60_000);

describe('Payment allocation unit tests', () => {
  let ctx: TestContext;
  let member: string;

  beforeAll(async () => {
    ctx = await createTestContext();

    const user = await ctx.prisma.user.create({
      data: { email: `unit-payment-${crypto.randomUUID()}@test.local`, name: 'Payment Tester' },
    });
    const m = await ctx.prisma.membership.create({
      data: { orgId: ctx.orgId, userId: user.id, role: 'MEMBER', status: 'ACTIVE', name: 'Payment Tester' },
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
    await ctx.prisma.auditLog.deleteMany({ where: { orgId: ctx.orgId, entityId: { in: [...chargeIds, ...paymentIds] } } });
    await ctx.prisma.auditLog.deleteMany({ where: { orgId: ctx.orgId, entityType: 'ALLOCATION' } });
    await ctx.prisma.paymentAllocation.deleteMany({ where: { orgId: ctx.orgId } });
    if (paymentIds.length) await ctx.prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    await ctx.prisma.charge.deleteMany({ where: { id: { in: chargeIds } } });
  }

  // ==================== create() ====================

  it('creates a payment with unallocated funds', async () => {
    const payment = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 5000,
      paidAt: '2026-01-15',
      rawPayerName: 'Payment Tester',
      membershipId: member,
    });

    expect(payment.amountCents).toBe(5000);
    expect(payment.rawPayerName).toBe('Payment Tester');

    // Verify unallocatedCents via findOne (computed field)
    const detail = await ctx.paymentsService.findOne(ctx.orgId, payment.id);
    expect(detail.unallocatedCents).toBe(5000);

    await cleanup([], [payment.id]);
  });

  // ==================== allocate() ====================

  it('allocates payment to a charge and tracks unallocated amount', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member],
      category: 'DUES' as any,
      title: 'Alloc Test',
      amountCents: 5000,
    });

    const payment = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 8000,
      paidAt: '2026-02-01',
      rawPayerName: 'No Match Payer',
    });

    await ctx.paymentsService.allocate(ctx.orgId, payment.id, ctx.membershipId, {
      allocations: [{ chargeId: charges[0].id, amountCents: 5000 }],
    });

    const p = await ctx.paymentsService.findOne(ctx.orgId, payment.id);
    expect(p.unallocatedCents).toBe(3000);
    expect(p.allocations).toHaveLength(1);
    expect(p.allocations[0].amountCents).toBe(5000);

    await cleanup([charges[0].id], [payment.id]);
  });

  it('allocates one payment across multiple charges', async () => {
    const c1 = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member], category: 'DUES' as any, title: 'Multi-Alloc 1', amountCents: 3000,
    });
    const c2 = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member], category: 'DUES' as any, title: 'Multi-Alloc 2', amountCents: 4000,
    });

    const payment = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 7000,
      paidAt: '2026-02-10',
      rawPayerName: 'No Match Payer',
    });

    await ctx.paymentsService.allocate(ctx.orgId, payment.id, ctx.membershipId, {
      allocations: [
        { chargeId: c1[0].id, amountCents: 3000 },
        { chargeId: c2[0].id, amountCents: 4000 },
      ],
    });

    const p = await ctx.paymentsService.findOne(ctx.orgId, payment.id);
    expect(p.unallocatedCents).toBe(0);
    expect(p.allocations).toHaveLength(2);

    // Both charges should be PAID
    const ch1 = await ctx.prisma.charge.findUnique({ where: { id: c1[0].id } });
    const ch2 = await ctx.prisma.charge.findUnique({ where: { id: c2[0].id } });
    expect(ch1?.status).toBe('PAID');
    expect(ch2?.status).toBe('PAID');

    await cleanup([c1[0].id, c2[0].id], [payment.id]);
  });

  // ==================== removeAllocation() ====================

  it('removing allocation frees payment funds and reverts charge status', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member], category: 'DUES' as any, title: 'Remove Test', amountCents: 6000,
    });

    const payment = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 6000, paidAt: '2026-03-01', rawPayerName: 'No Match Payer',
    });

    const allocs = await ctx.paymentsService.allocate(ctx.orgId, payment.id, ctx.membershipId, {
      allocations: [{ chargeId: charges[0].id, amountCents: 6000 }],
    });

    // Verify PAID
    let charge = await ctx.prisma.charge.findUnique({ where: { id: charges[0].id } });
    expect(charge?.status).toBe('PAID');

    // Remove allocation
    await ctx.paymentsService.removeAllocation(ctx.orgId, allocs[0].id, ctx.membershipId);

    // Charge should revert to OPEN
    charge = await ctx.prisma.charge.findUnique({ where: { id: charges[0].id } });
    expect(charge?.status).toBe('OPEN');

    // Payment should have full funds back
    const p = await ctx.paymentsService.findOne(ctx.orgId, payment.id);
    expect(p.unallocatedCents).toBe(6000);

    await cleanup([charges[0].id], [payment.id]);
  });

  // ==================== findAll() ====================

  it('findAll returns payments with computed unallocatedCents', async () => {
    const payment = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 10000, paidAt: '2026-04-01', rawPayerName: 'Payment Tester', membershipId: member,
    });

    const result = await ctx.paymentsService.findAll(ctx.orgId, {});
    const found = result.data.find((p: any) => p.id === payment.id);
    expect(found).toBeTruthy();
    expect(found!.unallocatedCents).toBe(10000);

    await cleanup([], [payment.id]);
  });

  // ==================== delete + restore ====================

  it('soft deletes and restores a payment', async () => {
    const payment = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 3000, paidAt: '2026-05-01', rawPayerName: 'Payment Tester', membershipId: member,
    });

    await ctx.paymentsService.delete(ctx.orgId, payment.id, ctx.membershipId);

    // Should not appear in default findAll
    let result = await ctx.paymentsService.findAll(ctx.orgId, {});
    expect(result.data.find((p: any) => p.id === payment.id)).toBeFalsy();

    // Restore
    await ctx.paymentsService.restore(ctx.orgId, payment.id, ctx.membershipId);

    result = await ctx.paymentsService.findAll(ctx.orgId, {});
    expect(result.data.find((p: any) => p.id === payment.id)).toBeTruthy();

    await cleanup([], [payment.id]);
  });
});
