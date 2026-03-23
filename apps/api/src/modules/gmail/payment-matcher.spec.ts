import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentMatcherService } from './payment-matcher.service';

jest.setTimeout(60_000);

describe('PaymentMatcherService (integration)', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let matcher: PaymentMatcherService;
  let orgId: string;
  let memberIds: Record<string, string>;
  let userIds: string[];

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
      providers: [PaymentMatcherService],
    }).compile();

    prisma = module.get(PrismaService);
    matcher = module.get(PaymentMatcherService);
    await prisma.$connect();

    const org = await prisma.organization.create({
      data: { name: `pm-test-${crypto.randomUUID()}` },
    });
    orgId = org.id;

    const adminUser = await prisma.user.create({
      data: { email: `pm-admin-${crypto.randomUUID()}@test.local`, name: 'PM Admin' },
    });
    await prisma.membership.create({
      data: { orgId, userId: adminUser.id, role: 'ADMIN', status: 'ACTIVE', name: 'PM Admin' },
    });

    const members = [
      { key: 'john', email: 'john.smith@test.local', name: 'John Smith', userName: 'John Smith', aliases: [] as string[] },
      { key: 'bob', email: 'bob.jones@test.local', name: 'Robert Jones', userName: 'Robert Jones', aliases: ['Bobby J'] },
      { key: 'jane', email: 'jane.doe@test.local', name: 'Jane Doe', userName: 'Jane Doe', aliases: [] as string[] },
      { key: 'will', email: 'will.johnson@test.local', name: 'William Johnson', userName: 'William Johnson', aliases: [] as string[] },
    ];

    memberIds = {};
    userIds = [adminUser.id];

    for (const m of members) {
      const user = await prisma.user.create({
        data: { email: `pm-${m.key}-${crypto.randomUUID()}@test.local`, name: m.userName },
      });
      userIds.push(user.id);
      const membership = await prisma.membership.create({
        data: {
          orgId,
          userId: user.id,
          role: 'MEMBER',
          status: 'ACTIVE',
          name: m.name,
          paymentAliases: m.aliases,
        },
      });
      memberIds[m.key] = membership.id;
    }
  }, 30_000);

  afterAll(async () => {
    await prisma.matchConfirmation.deleteMany({ where: { orgId } });
    await prisma.paymentAllocation.deleteMany({ where: { orgId } });
    await prisma.payment.deleteMany({ where: { orgId } });
    await prisma.charge.deleteMany({ where: { orgId } });
    await prisma.membership.deleteMany({ where: { orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
    await module.close();
  }, 15_000);

  // ── Name matching confidence tiers ──────────────────────────────────

  describe('name matching confidence', () => {
    it('exact match → 1.0', async () => {
      const result = await matcher.matchPayment(orgId, 'John Smith', null, null, 5000);
      expect(result.membershipId).toBe(memberIds['john']);
      expect(result.confidence).toBe(1.0);
    });

    it('extra middle name "John R Smith" vs "John Smith" → 0.95', async () => {
      const result = await matcher.matchPayment(orgId, 'John R Smith', null, null, 5000);
      expect(result.membershipId).toBe(memberIds['john']);
      expect(result.confidence).toBe(0.95);
    });

    it('alias match → 0.95', async () => {
      const result = await matcher.matchPayment(orgId, 'Bobby J', null, null, 5000);
      expect(result.membershipId).toBe(memberIds['bob']);
      expect(result.confidence).toBe(0.95);
    });

    it('extra middle name "John Michael Smith" vs "John Smith" → 0.95', async () => {
      const result = await matcher.matchPayment(orgId, 'John Michael Smith', null, null, 5000);
      expect(result.membershipId).toBe(memberIds['john']);
      expect(result.confidence).toBe(0.95);
    });

    it('nickname match "Bill" vs "William Johnson" → 0.85', async () => {
      const result = await matcher.matchPayment(orgId, 'Bill Johnson', null, null, 5000);
      expect(result.membershipId).toBe(memberIds['will']);
      expect(result.confidence).toBe(0.85);
    });

    it('first name only match → 0.6', async () => {
      const result = await matcher.matchPayment(orgId, 'John Xyzabc', null, null, 5000);
      expect(result.membershipId).toBe(memberIds['john']);
      expect(result.confidence).toBe(0.6);
    });

    it('rejects cross-position substring overlap (John Williams ≠ William Johnson)', async () => {
      const result = await matcher.matchPayment(orgId, 'John Williams', null, null, 5000);
      expect(result.confidence).toBeLessThan(0.9);
    });

    it('no match → null membership', async () => {
      const result = await matcher.matchPayment(orgId, 'Zzqwx Yyplm', null, null, 5000);
      expect(result.membershipId).toBeNull();
      expect(result.confidence).toBe(0);
    });
  });

  // ── History-based matching ──────────────────────────────────────────

  describe('history-based matching', () => {
    afterEach(async () => {
      await prisma.matchConfirmation.deleteMany({ where: { orgId } });
    });

    it('MatchConfirmation yields 0.98 confidence', async () => {
      await prisma.matchConfirmation.create({
        data: {
          orgId,
          rawPayerName: 'J. Smitherson',
          matchedMemberId: memberIds['john'],
        },
      });

      const result = await matcher.matchPayment(orgId, 'J. Smitherson', null, null, 5000);
      expect(result.membershipId).toBe(memberIds['john']);
      expect(result.confidence).toBe(0.98);
    });

    it('history match takes priority over name match', async () => {
      await prisma.matchConfirmation.create({
        data: {
          orgId,
          rawPayerName: 'Jane Doe',
          matchedMemberId: memberIds['bob'],
        },
      });

      const result = await matcher.matchPayment(orgId, 'Jane Doe', null, null, 5000);
      expect(result.membershipId).toBe(memberIds['bob']);
      expect(result.confidence).toBe(0.98);
    });
  });

  // ── Email matching ──────────────────────────────────────────────────

  describe('email matching', () => {
    it('exact email → 1.0 confidence', async () => {
      const user = await prisma.user.findFirst({ where: { id: { in: userIds } } });
      const membership = await prisma.membership.findFirst({
        where: { orgId, userId: user!.id },
        include: { user: true },
      });
      if (!membership?.user?.email) return;

      const result = await matcher.matchPayment(orgId, null, membership.user.email, null, 5000);
      expect(result.membershipId).toBe(membership.id);
      expect(result.confidence).toBe(1.0);
    });

    it('email matching is case-insensitive', async () => {
      const membership = await prisma.membership.findFirst({
        where: { orgId, id: memberIds['john'] },
        include: { user: true },
      });
      if (!membership?.user?.email) return;

      const result = await matcher.matchPayment(
        orgId,
        null,
        membership.user.email.toUpperCase(),
        null,
        5000,
      );
      expect(result.membershipId).toBe(memberIds['john']);
      expect(result.confidence).toBe(1.0);
    });
  });

  // ── findMatchingCharges ─────────────────────────────────────────────

  describe('findMatchingCharges', () => {
    let chargeIds: string[];
    let adminMembershipId: string;

    beforeAll(async () => {
      const admin = await prisma.membership.findFirst({ where: { orgId, role: 'ADMIN' } });
      adminMembershipId = admin!.id;
    });

    afterEach(async () => {
      if (chargeIds?.length) {
        await prisma.paymentAllocation.deleteMany({ where: { chargeId: { in: chargeIds } } });
        await prisma.charge.deleteMany({ where: { id: { in: chargeIds } } });
        chargeIds = [];
      }
    });

    it('finds OPEN charges by category for member', async () => {
      const charge = await prisma.charge.create({
        data: {
          orgId,
          membershipId: memberIds['john'],
          category: 'DUES',
          title: 'Spring Dues',
          amountCents: 5000,
          createdById: adminMembershipId,
        },
      });
      chargeIds = [charge.id];

      const result = await matcher.matchPayment(orgId, 'John Smith', null, 'spring dues', 5000);
      expect(result.suggestedChargeIds).toContain(charge.id);
    });

    it('skips fully-allocated charges', async () => {
      const charge = await prisma.charge.create({
        data: {
          orgId,
          membershipId: memberIds['john'],
          category: 'DUES',
          title: 'Paid Dues',
          amountCents: 5000,
          status: 'PAID',
          createdById: adminMembershipId,
        },
      });
      chargeIds = [charge.id];

      const result = await matcher.matchPayment(orgId, 'John Smith', null, 'dues', 5000);
      expect(result.suggestedChargeIds).not.toContain(charge.id);
    });

    it('respects remaining amount cap', async () => {
      const charge1 = await prisma.charge.create({
        data: {
          orgId,
          membershipId: memberIds['john'],
          category: 'DUES',
          title: 'Dues 1',
          amountCents: 3000,
          createdById: adminMembershipId,
          dueDate: new Date('2026-01-01'),
        },
      });
      const charge2 = await prisma.charge.create({
        data: {
          orgId,
          membershipId: memberIds['john'],
          category: 'DUES',
          title: 'Dues 2',
          amountCents: 3000,
          createdById: adminMembershipId,
          dueDate: new Date('2026-02-01'),
        },
      });
      chargeIds = [charge1.id, charge2.id];

      // Payment of $3000 should only pick up one charge
      const result = await matcher.matchPayment(orgId, 'John Smith', null, 'dues payment', 3000);
      expect(result.suggestedChargeIds).toHaveLength(1);
      expect(result.suggestedChargeIds).toContain(charge1.id);
    });

    it('returns empty when no category derived', async () => {
      const charge = await prisma.charge.create({
        data: {
          orgId,
          membershipId: memberIds['john'],
          category: 'DUES',
          title: 'Some Dues',
          amountCents: 5000,
          createdById: adminMembershipId,
        },
      });
      chargeIds = [charge.id];

      const result = await matcher.matchPayment(orgId, 'John Smith', null, 'thanks bro', 5000);
      expect(result.suggestedChargeIds).toHaveLength(0);
    });
  });

  // ── shouldAutoAllocate ──────────────────────────────────────────────

  describe('shouldAutoAllocate', () => {
    let chargeIds: string[];
    let adminMembershipId: string;

    beforeAll(async () => {
      const admin = await prisma.membership.findFirst({ where: { orgId, role: 'ADMIN' } });
      adminMembershipId = admin!.id;
    });

    afterEach(async () => {
      if (chargeIds?.length) {
        await prisma.paymentAllocation.deleteMany({ where: { chargeId: { in: chargeIds } } });
        await prisma.charge.deleteMany({ where: { id: { in: chargeIds } } });
        chargeIds = [];
      }
    });

    it('true when confidence >= 0.9 + category + charges', async () => {
      const charge = await prisma.charge.create({
        data: {
          orgId,
          membershipId: memberIds['john'],
          category: 'DUES',
          title: 'Spring Dues',
          amountCents: 5000,
          createdById: adminMembershipId,
        },
      });
      chargeIds = [charge.id];

      const result = await matcher.matchPayment(orgId, 'John Smith', null, 'spring dues', 5000);
      expect(result.shouldAutoAllocate).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('false when confidence is low', async () => {
      const result = await matcher.matchPayment(orgId, 'Unknown Person', null, 'dues', 5000);
      expect(result.shouldAutoAllocate).toBe(false);
    });

    it('false when no category derived', async () => {
      const result = await matcher.matchPayment(orgId, 'John Smith', null, 'thanks bro', 5000);
      expect(result.shouldAutoAllocate).toBe(false);
    });

    it('false when no matching charges', async () => {
      const result = await matcher.matchPayment(orgId, 'John Smith', null, 'spring dues', 5000);
      expect(result.shouldAutoAllocate).toBe(false);
    });
  });
});
