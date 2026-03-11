import { createTestContext, cleanupTestContext, TestContext } from '../../test/test-helpers';

jest.setTimeout(60_000);

describe('Multi-charge (parent-child) integration', () => {
  let ctx: TestContext;
  let memberA: string;
  let memberB: string;
  let memberC: string;

  beforeAll(async () => {
    ctx = await createTestContext();

    const createMember = async (email: string, name: string) => {
      const user = await ctx.prisma.user.create({
        data: { email: `${email}-${Date.now()}@test.local`, name },
      });
      const m = await ctx.prisma.membership.create({
        data: { orgId: ctx.orgId, userId: user.id, role: 'MEMBER', status: 'ACTIVE', name },
      });
      return m.id;
    };

    memberA = await createMember('multi-a', 'Alice');
    memberB = await createMember('multi-b', 'Bob');
    memberC = await createMember('multi-c', 'Carol');
  }, 30_000);

  afterAll(async () => {
    // Clean up charges and members
    await ctx.prisma.auditLog.deleteMany({ where: { orgId: ctx.orgId } });
    await ctx.prisma.charge.deleteMany({ where: { orgId: ctx.orgId } });

    const memberships = await ctx.prisma.membership.findMany({
      where: { orgId: ctx.orgId, id: { in: [memberA, memberB, memberC] } },
      select: { userId: true },
    });
    const userIds = memberships.map((m) => m.userId).filter(Boolean) as string[];
    await ctx.prisma.membership.deleteMany({ where: { id: { in: [memberA, memberB, memberC] } } });
    if (userIds.length > 0) {
      await ctx.prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }

    await cleanupTestContext(ctx);
  }, 15_000);

  it('creates a parent charge with children for each member', async () => {
    const result = await ctx.chargesService.createMultiCharge(ctx.orgId, ctx.membershipId, {
      membershipIds: [memberA, memberB],
      category: 'DUES' as any,
      title: 'Spring 2026 Dues',
      amountCents: 5000,
      dueDate: null,
    });

    expect(result.parent).toBeDefined();
    expect(result.children).toHaveLength(2);

    // Parent has no membershipId
    expect(result.parent.membershipId).toBeNull();
    expect(result.parent.parentId).toBeNull();
    expect(result.parent.title).toBe('Spring 2026 Dues');
    expect(result.parent.amountCents).toBe(5000); // per-member amount

    // Children linked to parent
    for (const child of result.children) {
      expect(child.parentId).toBe(result.parent.id);
      expect(child.amountCents).toBe(5000);
      expect(child.title).toBe('Spring 2026 Dues');
    }

    const childMemberIds = result.children.map((c) => c.membershipId);
    expect(childMemberIds).toContain(memberA);
    expect(childMemberIds).toContain(memberB);
  });

  it('findAll excludes children from top-level and includes them nested', async () => {
    const { data } = await ctx.chargesService.findAll(ctx.orgId, {});

    // Every top-level charge should have parentId null
    for (const charge of data) {
      expect(charge.parentId).toBeNull();
    }

    // Find the multi-charge parent
    const parent = data.find((c: any) => c.title === 'Spring 2026 Dues' && c.children?.length > 0);
    expect(parent).toBeDefined();
    expect(parent.children).toHaveLength(2);
  });

  it('voiding parent cascades to children', async () => {
    // Create a fresh multi-charge to void
    const { parent } = await ctx.chargesService.createMultiCharge(ctx.orgId, ctx.membershipId, {
      membershipIds: [memberA, memberC],
      category: 'EVENT' as any,
      title: 'Void Test',
      amountCents: 3000,
      dueDate: null,
    });

    await ctx.chargesService.void(ctx.orgId, parent.id, ctx.membershipId);

    // Parent should be voided
    const voidedParent = await ctx.prisma.charge.findUnique({ where: { id: parent.id } });
    expect(voidedParent!.status).toBe('VOID');

    // Children should also be voided
    const children = await ctx.prisma.charge.findMany({ where: { parentId: parent.id } });
    for (const child of children) {
      expect(child.status).toBe('VOID');
    }
  });

  it('bulkVoid with parent charge cascades to children', async () => {
    const { parent, children } = await ctx.chargesService.createMultiCharge(ctx.orgId, ctx.membershipId, {
      membershipIds: [memberB],
      category: 'FINE' as any,
      title: 'Bulk Void Test',
      amountCents: 2000,
      dueDate: null,
    });

    await ctx.chargesService.bulkVoid(ctx.orgId, [parent.id], ctx.membershipId);

    const allCharges = await ctx.prisma.charge.findMany({
      where: { id: { in: [parent.id, ...children.map((c) => c.id)] } },
    });
    for (const charge of allCharges) {
      expect(charge.status).toBe('VOID');
    }
  });
});
