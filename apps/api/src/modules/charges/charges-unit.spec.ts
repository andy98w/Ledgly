import { createTestContext, cleanupTestContext, TestContext } from '../../test/test-helpers';
import { EmailService } from '../auth/email.service';

jest.setTimeout(60_000);

describe('Charge unit tests', () => {
  let ctx: TestContext;
  let member: string;

  beforeAll(async () => {
    ctx = await createTestContext();

    const user = await ctx.prisma.user.create({
      data: { email: `unit-charge-${Date.now()}@test.local`, name: 'Unit Tester' },
    });
    const m = await ctx.prisma.membership.create({
      data: { orgId: ctx.orgId, userId: user.id, role: 'MEMBER', status: 'ACTIVE', name: 'Unit Tester' },
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

  it('creates a charge in OPEN status', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member],
      category: 'DUES' as any,
      title: 'Monthly Dues',
      amountCents: 5000,
    });

    expect(charges).toHaveLength(1);
    expect(charges[0].status).toBe('OPEN');
    expect(charges[0].amountCents).toBe(5000);
    expect(charges[0].title).toBe('Monthly Dues');

    await cleanup([charges[0].id]);
  });

  it('sends email notification when creating a charge for a member with email', async () => {
    const emailService = ctx.module.get(EmailService) as any;
    emailService.sendChargeNotification.mockClear();

    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member],
      category: 'DUES' as any,
      title: 'Notification Test',
      amountCents: 2500,
    });

    // Fire-and-forget — give it a tick to resolve
    await new Promise((r) => setTimeout(r, 500));

    expect(emailService.sendChargeNotification).toHaveBeenCalledWith(
      expect.stringContaining('@'),
      expect.any(String),
      'Notification Test',
      '25.00',
      expect.any(String),
      null,
      expect.any(Object),
      expect.any(Array),
    );

    await cleanup([charges[0].id]);
  });

  it('creates charges for multiple members at once', async () => {
    const user2 = await ctx.prisma.user.create({
      data: { email: `multi-${Date.now()}@test.local`, name: 'Multi Tester' },
    });
    const m2 = await ctx.prisma.membership.create({
      data: { orgId: ctx.orgId, userId: user2.id, role: 'MEMBER', status: 'ACTIVE', name: 'Multi Tester' },
    });

    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member, m2.id],
      category: 'EVENT' as any,
      title: 'Event Fee',
      amountCents: 2500,
    });

    expect(charges).toHaveLength(2);
    expect(charges.every((c: any) => c.status === 'OPEN')).toBe(true);
    expect(charges.every((c: any) => c.amountCents === 2500)).toBe(true);

    await cleanup(charges.map((c: any) => c.id));
    await ctx.prisma.membership.delete({ where: { id: m2.id } });
    await ctx.prisma.user.delete({ where: { id: user2.id } });
  });

  it('creates charges with different categories', async () => {
    const categories = ['DUES', 'EVENT', 'FINE', 'MERCH', 'OTHER'] as const;

    for (const category of categories) {
      const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
        membershipIds: [member],
        category: category as any,
        title: `${category} charge`,
        amountCents: 1000,
      });

      expect(charges[0].category).toBe(category);
      await cleanup([charges[0].id]);
    }
  });

  it('creates charge with a due date', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member],
      category: 'DUES' as any,
      title: 'Due Date Charge',
      amountCents: 3000,
      dueDate: '2026-06-15',
    });

    const charge = await ctx.prisma.charge.findUnique({ where: { id: charges[0].id } });
    expect(charge?.dueDate).toBeTruthy();

    await cleanup([charges[0].id]);
  });

  // ==================== findAll() filters ====================

  it('findAll filters by status', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member],
      category: 'DUES' as any,
      title: 'Filter Test',
      amountCents: 1000,
    });

    const open = await ctx.chargesService.findAll(ctx.orgId, { status: 'OPEN' as any });
    expect(open.data.some((c: any) => c.id === charges[0].id)).toBe(true);

    const paid = await ctx.chargesService.findAll(ctx.orgId, { status: 'PAID' as any });
    expect(paid.data.some((c: any) => c.id === charges[0].id)).toBe(false);

    await cleanup([charges[0].id]);
  });

  it('findAll filters by category', async () => {
    const duesCharges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member],
      category: 'DUES' as any,
      title: 'Dues Filter',
      amountCents: 1000,
    });

    const eventCharges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member],
      category: 'EVENT' as any,
      title: 'Event Filter',
      amountCents: 2000,
    });

    const duesResult = await ctx.chargesService.findAll(ctx.orgId, { category: 'DUES' as any });
    expect(duesResult.data.some((c: any) => c.id === duesCharges[0].id)).toBe(true);
    expect(duesResult.data.some((c: any) => c.id === eventCharges[0].id)).toBe(false);

    await cleanup([duesCharges[0].id, eventCharges[0].id]);
  });

  it('findAll excludes VOID charges by default', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member],
      category: 'DUES' as any,
      title: 'Void Exclusion',
      amountCents: 1000,
    });

    await ctx.chargesService.void(ctx.orgId, charges[0].id, ctx.membershipId);

    const result = await ctx.chargesService.findAll(ctx.orgId, {});
    expect(result.data.some((c: any) => c.id === charges[0].id)).toBe(false);

    // But explicitly requesting VOID status should include it
    const voidResult = await ctx.chargesService.findAll(ctx.orgId, { status: 'VOID' as any });
    expect(voidResult.data.some((c: any) => c.id === charges[0].id)).toBe(true);

    await cleanup([charges[0].id]);
  });

  // ==================== findOne() ====================

  it('findOne returns charge with computed fields', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member],
      category: 'DUES' as any,
      title: 'Detail Test',
      amountCents: 8000,
    });

    const detail = await ctx.chargesService.findOne(ctx.orgId, charges[0].id);
    expect(detail.id).toBe(charges[0].id);
    expect(detail.amountCents).toBe(8000);
    expect(detail.balanceDueCents).toBe(8000);
    expect(detail.allocatedCents).toBe(0);

    await cleanup([charges[0].id]);
  });

  // ==================== void + restore ====================

  it('void sets status to VOID', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member],
      category: 'DUES' as any,
      title: 'Void Test',
      amountCents: 3000,
    });

    await ctx.chargesService.void(ctx.orgId, charges[0].id, ctx.membershipId);

    const charge = await ctx.prisma.charge.findUnique({ where: { id: charges[0].id } });
    expect(charge?.status).toBe('VOID');

    await cleanup([charges[0].id]);
  });

  it('restore returns VOID charge to OPEN', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member],
      category: 'DUES' as any,
      title: 'Restore Test',
      amountCents: 3000,
    });

    await ctx.chargesService.void(ctx.orgId, charges[0].id, ctx.membershipId);
    await ctx.chargesService.restore(ctx.orgId, charges[0].id, ctx.membershipId);

    const charge = await ctx.prisma.charge.findUnique({ where: { id: charges[0].id } });
    expect(charge?.status).toBe('OPEN');

    await cleanup([charges[0].id]);
  });

  // ==================== bulkCreate ====================

  it('bulkCreate creates multiple charges in one call', async () => {
    const result = await ctx.chargesService.bulkCreate(ctx.orgId, ctx.membershipId, [
      { membershipId: member, category: 'DUES' as any, title: 'Bulk 1', amountCents: 1000 },
      { membershipId: member, category: 'EVENT' as any, title: 'Bulk 2', amountCents: 2000 },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Bulk 1');
    expect(result[1].title).toBe('Bulk 2');

    await cleanup(result.map((c: any) => c.id));
  });

  // ==================== bulkVoid ====================

  it('bulkVoid voids multiple charges', async () => {
    const c1 = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member], category: 'DUES' as any, title: 'BV1', amountCents: 1000,
    });
    const c2 = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member], category: 'DUES' as any, title: 'BV2', amountCents: 2000,
    });

    const result = await ctx.chargesService.bulkVoid(ctx.orgId, [c1[0].id, c2[0].id], ctx.membershipId);
    expect(result.voidedCount).toBe(2);

    const ch1 = await ctx.prisma.charge.findUnique({ where: { id: c1[0].id } });
    const ch2 = await ctx.prisma.charge.findUnique({ where: { id: c2[0].id } });
    expect(ch1?.status).toBe('VOID');
    expect(ch2?.status).toBe('VOID');

    await cleanup([c1[0].id, c2[0].id]);
  });

  // ==================== allocation status transitions ====================

  it('partial allocation transitions OPEN → PARTIALLY_PAID', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member], category: 'DUES' as any, title: 'Partial', amountCents: 10000,
    });

    const payment = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 5000, paidAt: '2026-01-01', rawPayerName: 'No Match Payer',
    });

    await ctx.paymentsService.allocate(ctx.orgId, payment.id, ctx.membershipId, {
      allocations: [{ chargeId: charges[0].id, amountCents: 5000 }],
    });

    const charge = await ctx.prisma.charge.findUnique({ where: { id: charges[0].id } });
    expect(charge?.status).toBe('PARTIALLY_PAID');

    await cleanup([charges[0].id], [payment.id]);
  });

  it('full allocation transitions OPEN → PAID', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [member], category: 'DUES' as any, title: 'Full', amountCents: 5000,
    });

    const payment = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 5000, paidAt: '2026-01-02', rawPayerName: 'No Match Payer',
    });

    await ctx.paymentsService.allocate(ctx.orgId, payment.id, ctx.membershipId, {
      allocations: [{ chargeId: charges[0].id, amountCents: 5000 }],
    });

    const charge = await ctx.prisma.charge.findUnique({ where: { id: charges[0].id } });
    expect(charge?.status).toBe('PAID');

    await cleanup([charges[0].id], [payment.id]);
  });
});
