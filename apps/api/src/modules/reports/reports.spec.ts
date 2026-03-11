import { createTestContext, cleanupTestContext, TestContext } from '../../test/test-helpers';
import { ReportsService } from './reports.service';

jest.setTimeout(60_000);

describe('ReportsService (integration)', () => {
  let ctx: TestContext;
  let reports: ReportsService;
  let memberIds: string[];
  let extraUserIds: string[];
  let adminMembershipId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    reports = new ReportsService(ctx.prisma);
    adminMembershipId = ctx.membershipId;

    memberIds = [];
    extraUserIds = [];

    const members = [
      { name: 'Alice Tester', email: `rpt-alice-${Date.now()}@test.local` },
      { name: 'Bob Tester', email: `rpt-bob-${Date.now()}@test.local` },
    ];

    for (const m of members) {
      const user = await ctx.prisma.user.create({ data: { email: m.email, name: m.name } });
      extraUserIds.push(user.id);
      const membership = await ctx.prisma.membership.create({
        data: { orgId: ctx.orgId, userId: user.id, role: 'MEMBER', status: 'ACTIVE', name: m.name },
      });
      memberIds.push(membership.id);
    }
  }, 30_000);

  afterAll(async () => {
    await ctx.prisma.auditLog.deleteMany({ where: { orgId: ctx.orgId } });
    await ctx.prisma.paymentAllocation.deleteMany({ where: { orgId: ctx.orgId } });
    await ctx.prisma.payment.deleteMany({ where: { orgId: ctx.orgId } });
    await ctx.prisma.charge.deleteMany({ where: { orgId: ctx.orgId } });
    await ctx.prisma.membership.deleteMany({ where: { id: { in: memberIds } } });
    await ctx.prisma.user.deleteMany({ where: { id: { in: extraUserIds } } });
    await cleanupTestContext(ctx);
  }, 15_000);

  afterEach(async () => {
    await ctx.prisma.paymentAllocation.deleteMany({ where: { orgId: ctx.orgId } });
    await ctx.prisma.payment.deleteMany({ where: { orgId: ctx.orgId } });
    await ctx.prisma.charge.deleteMany({ where: { orgId: ctx.orgId } });
  });

  // ── getCollectionReport ─────────────────────────────────────────────

  describe('getCollectionReport', () => {
    it('returns correct totals, collection rate, and monthly breakdown', async () => {
      const charge1 = await ctx.prisma.charge.create({
        data: {
          orgId: ctx.orgId,
          membershipId: memberIds[0],
          category: 'DUES',
          title: 'Jan Dues',
          amountCents: 5000,
          createdById: adminMembershipId,
          createdAt: new Date('2026-01-15'),
        },
      });
      const charge2 = await ctx.prisma.charge.create({
        data: {
          orgId: ctx.orgId,
          membershipId: memberIds[1],
          category: 'DUES',
          title: 'Feb Dues',
          amountCents: 5000,
          createdById: adminMembershipId,
          createdAt: new Date('2026-02-15'),
        },
      });

      const payment = await ctx.prisma.payment.create({
        data: {
          orgId: ctx.orgId,
          amountCents: 5000,
          paidAt: new Date('2026-01-20'),
          rawPayerName: 'No Match Payer',
        },
      });
      await ctx.prisma.paymentAllocation.create({
        data: {
          orgId: ctx.orgId,
          paymentId: payment.id,
          chargeId: charge1.id,
          amountCents: 5000,
          createdById: adminMembershipId,
        },
      });

      const result = await reports.getCollectionReport(ctx.orgId, '2026-01-01', '2026-12-31');

      expect(result.totalChargedCents).toBe(10000);
      expect(result.totalCollectedCents).toBe(5000);
      expect(result.outstandingCents).toBe(5000);
      expect(result.collectionRate).toBe(50);
      expect(result.monthly).toHaveLength(2);
      expect(result.monthly[0].month).toBe('2026-01');
      expect(result.monthly[0].collected).toBe(5000);
      expect(result.monthly[1].month).toBe('2026-02');
      expect(result.monthly[1].collected).toBe(0);
    });

    it('excludes VOID charges', async () => {
      await ctx.prisma.charge.create({
        data: {
          orgId: ctx.orgId,
          membershipId: memberIds[0],
          category: 'DUES',
          title: 'Voided Charge',
          amountCents: 5000,
          status: 'VOID',
          createdById: adminMembershipId,
          createdAt: new Date('2026-01-15'),
        },
      });

      const result = await reports.getCollectionReport(ctx.orgId, '2026-01-01', '2026-12-31');
      expect(result.totalChargedCents).toBe(0);
    });

    it('zero-charge edge case returns rate 0 (not NaN)', async () => {
      const result = await reports.getCollectionReport(ctx.orgId, '2026-01-01', '2026-12-31');
      expect(result.collectionRate).toBe(0);
      expect(Number.isNaN(result.collectionRate)).toBe(false);
    });
  });

  // ── getOutstandingReport ────────────────────────────────────────────

  describe('getOutstandingReport', () => {
    it('sorted by balance desc', async () => {
      await ctx.prisma.charge.create({
        data: {
          orgId: ctx.orgId,
          membershipId: memberIds[0],
          category: 'DUES',
          title: 'Small Charge',
          amountCents: 2000,
          createdById: adminMembershipId,
        },
      });
      await ctx.prisma.charge.create({
        data: {
          orgId: ctx.orgId,
          membershipId: memberIds[1],
          category: 'DUES',
          title: 'Big Charge',
          amountCents: 8000,
          createdById: adminMembershipId,
        },
      });

      const result = await reports.getOutstandingReport(ctx.orgId);
      const alice = result.find((r) => r.membershipId === memberIds[0]);
      const bob = result.find((r) => r.membershipId === memberIds[1]);
      expect(bob!.balanceCents).toBeGreaterThan(alice!.balanceCents);

      const idx1 = result.indexOf(bob!);
      const idx2 = result.indexOf(alice!);
      expect(idx1).toBeLessThan(idx2);
    });

    it('uses name fallback chain', async () => {
      const result = await reports.getOutstandingReport(ctx.orgId);
      const alice = result.find((r) => r.membershipId === memberIds[0]);
      expect(alice?.name).toBe('Alice Tester');
    });
  });

  // ── getPeriodComparison ─────────────────────────────────────────────

  describe('getPeriodComparison', () => {
    it('two periods with correct deltas', async () => {
      await ctx.prisma.charge.create({
        data: {
          orgId: ctx.orgId,
          membershipId: memberIds[0],
          category: 'DUES',
          title: 'Jan Charge',
          amountCents: 5000,
          createdById: adminMembershipId,
          createdAt: new Date('2026-01-15'),
        },
      });
      await ctx.prisma.charge.create({
        data: {
          orgId: ctx.orgId,
          membershipId: memberIds[0],
          category: 'DUES',
          title: 'Feb Charge 1',
          amountCents: 3000,
          createdById: adminMembershipId,
          createdAt: new Date('2026-02-10'),
        },
      });
      await ctx.prisma.charge.create({
        data: {
          orgId: ctx.orgId,
          membershipId: memberIds[1],
          category: 'DUES',
          title: 'Feb Charge 2',
          amountCents: 4000,
          createdById: adminMembershipId,
          createdAt: new Date('2026-02-20'),
        },
      });

      const result = await reports.getPeriodComparison(
        ctx.orgId,
        '2026-02-01', '2026-02-28',
        '2026-01-01', '2026-01-31',
      );

      expect(result.current.chargesCreated).toBe(2);
      expect(result.previous.chargesCreated).toBe(1);
      expect(result.changes.chargesCreated).toBe(1);
      expect(result.current.totalChargedCents).toBe(7000);
      expect(result.previous.totalChargedCents).toBe(5000);
      expect(result.changes.totalChargedCents).toBe(2000);
    });

    it('empty period returns zeroes', async () => {
      const result = await reports.getPeriodComparison(
        ctx.orgId,
        '2025-06-01', '2025-06-30',
        '2025-05-01', '2025-05-31',
      );

      expect(result.current.chargesCreated).toBe(0);
      expect(result.current.totalChargedCents).toBe(0);
      expect(result.current.collectionRate).toBe(0);
      expect(result.previous.chargesCreated).toBe(0);
      expect(result.changes.chargesCreated).toBe(0);
    });
  });
});
