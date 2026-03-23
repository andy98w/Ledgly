import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { ExpenseMatcherService } from './expense-matcher.service';

jest.setTimeout(60_000);

describe('ExpenseMatcherService (integration)', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let matcher: ExpenseMatcherService;
  let orgId: string;

  const baseDate = new Date('2026-03-01T12:00:00Z');

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
      providers: [ExpenseMatcherService],
    }).compile();

    prisma = module.get(PrismaService);
    matcher = module.get(ExpenseMatcherService);
    await prisma.$connect();

    const org = await prisma.organization.create({
      data: { name: `em-test-${crypto.randomUUID()}` },
    });
    orgId = org.id;
  }, 30_000);

  afterAll(async () => {
    await prisma.expense.deleteMany({ where: { orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.$disconnect();
    await module.close();
  }, 15_000);

  afterEach(async () => {
    await prisma.expense.deleteMany({ where: { orgId } });
  });

  async function createExpense(overrides: {
    amountCents?: number;
    date?: Date;
    vendor?: string | null;
    title?: string;
    description?: string | null;
  } = {}) {
    return prisma.expense.create({
      data: {
        orgId,
        category: 'OTHER',
        title: overrides.title ?? 'Test Expense',
        amountCents: overrides.amountCents ?? 5000,
        date: overrides.date ?? baseDate,
        vendor: overrides.vendor ?? 'Test Vendor',
        description: overrides.description ?? null,
      },
    });
  }

  // ── Date window ─────────────────────────────────────────────────────

  describe('date window', () => {
    it('matches expense within ±7 days', async () => {
      const expense = await createExpense({ date: new Date('2026-03-03T12:00:00Z') });

      const result = await matcher.matchExpense(orgId, 5000, baseDate, 'Test Vendor', null);
      expect(result.potentialMatches.some((m) => m.id === expense.id)).toBe(true);
    });

    it('excludes expense outside ±7 days', async () => {
      await createExpense({ date: new Date('2026-03-20T12:00:00Z') });

      const result = await matcher.matchExpense(orgId, 5000, baseDate, 'Test Vendor', null);
      expect(result.potentialMatches).toHaveLength(0);
    });
  });

  // ── Confidence scoring ──────────────────────────────────────────────

  describe('confidence scoring', () => {
    it('exact amount match contributes 0.5 weight', async () => {
      await createExpense({ amountCents: 5000 });

      const result = await matcher.matchExpense(orgId, 5000, baseDate, null, null);
      // amount exact = 0.5, date same day = 0.25 → total = 0.75/1.0
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('amount within ±$1 contributes 0.4 weight', async () => {
      await createExpense({ amountCents: 5050 });

      const result = await matcher.matchExpense(orgId, 5000, baseDate, null, null);
      // amount ±100 cents = 0.4, date same = 0.25 → 0.65/1.0
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('amount within ±$5 scores lower than exact', async () => {
      await createExpense({ amountCents: 5400, vendor: 'Costco' });

      const result = await matcher.matchExpense(orgId, 5000, baseDate, 'Costco', null);
      // amount ±500 = 0.2, date same = 0.25, vendor exact = 0.15 → 0.6
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
      expect(result.confidence).toBeLessThan(0.75);
    });

    it('same-day date contributes 0.25 weight', async () => {
      await createExpense({ amountCents: 5000, date: baseDate });

      const result = await matcher.matchExpense(orgId, 5000, baseDate, null, null);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('±1 day date contributes 0.2 weight', async () => {
      const nextDay = new Date(baseDate);
      nextDay.setDate(nextDay.getDate() + 1);
      await createExpense({ amountCents: 5000, date: nextDay });

      const result = await matcher.matchExpense(orgId, 5000, baseDate, null, null);
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('exact vendor match contributes to confidence', async () => {
      await createExpense({ vendor: 'Costco' });

      const result = await matcher.matchExpense(orgId, 5000, baseDate, 'Costco', null);
      const resultNoVendor = await matcher.matchExpense(orgId, 5000, baseDate, null, null);
      expect(result.confidence).toBeGreaterThan(resultNoVendor.confidence);
    });

    it('memo word overlap contributes to confidence', async () => {
      await createExpense({ description: 'party supplies for formal' });

      const result = await matcher.matchExpense(orgId, 5000, baseDate, null, 'party supplies');
      const resultNoMemo = await matcher.matchExpense(orgId, 5000, baseDate, null, null);
      expect(result.confidence).toBeGreaterThan(resultNoMemo.confidence);
    });
  });

  // ── Thresholds ──────────────────────────────────────────────────────

  describe('thresholds', () => {
    it('>= 0.95 → isDuplicate: true', async () => {
      await createExpense({ vendor: 'Costco', description: 'party supplies' });

      const result = await matcher.matchExpense(orgId, 5000, baseDate, 'Costco', 'party supplies');
      expect(result.isDuplicate).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.95);
    });

    it('>= 0.7 → matchedExpenseId populated', async () => {
      const expense = await createExpense();

      const result = await matcher.matchExpense(orgId, 5000, baseDate, null, null);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(result.matchedExpenseId).toBe(expense.id);
    });

    it('< 0.5 → excluded from potentialMatches', async () => {
      await createExpense({ amountCents: 99999, date: new Date('2026-03-06T12:00:00Z') });

      const result = await matcher.matchExpense(orgId, 1000, baseDate, 'Unrelated', 'unrelated memo');
      expect(result.potentialMatches).toHaveLength(0);
    });
  });

  // ── Ordering ────────────────────────────────────────────────────────

  describe('ordering', () => {
    it('returns top 3 sorted by confidence desc', async () => {
      await createExpense({ amountCents: 5000, vendor: 'Exact Match', title: 'E1' });
      await createExpense({ amountCents: 5050, vendor: 'Close Match', title: 'E2' });
      await createExpense({ amountCents: 5200, vendor: 'Okay Match', title: 'E3' });
      await createExpense({ amountCents: 5400, vendor: 'Far Match', title: 'E4' });

      const result = await matcher.matchExpense(orgId, 5000, baseDate, 'Exact Match', null);
      expect(result.potentialMatches.length).toBeLessThanOrEqual(3);

      for (let i = 1; i < result.potentialMatches.length; i++) {
        expect(result.potentialMatches[i - 1].confidence).toBeGreaterThanOrEqual(
          result.potentialMatches[i].confidence,
        );
      }
    });
  });
});
