import { BadRequestException } from '@nestjs/common';
import { createTestContext, cleanupTestContext, TestContext } from '../../test/test-helpers';

jest.setTimeout(15_000);

describe('Charges bulkCreate (integration)', () => {
  let ctx: TestContext;
  let memberA: string;
  let memberB: string;

  beforeAll(async () => {
    ctx = await createTestContext();

    // Create two extra members for multi-member tests
    const userA = await ctx.prisma.user.create({
      data: { email: `bulk-a-${Date.now()}@test.local`, name: 'Alice' },
    });
    const mA = await ctx.prisma.membership.create({
      data: { orgId: ctx.orgId, userId: userA.id, role: 'MEMBER', status: 'ACTIVE', name: 'Alice' },
    });
    memberA = mA.id;

    const userB = await ctx.prisma.user.create({
      data: { email: `bulk-b-${Date.now()}@test.local`, name: 'Bob' },
    });
    const mB = await ctx.prisma.membership.create({
      data: { orgId: ctx.orgId, userId: userB.id, role: 'MEMBER', status: 'ACTIVE', name: 'Bob' },
    });
    memberB = mB.id;
  }, 30_000);

  afterAll(async () => {
    // Clean up extra members and users
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

  it('creates one charge per spec and returns them in order', async () => {
    const charges = await ctx.chargesService.bulkCreate(ctx.orgId, ctx.membershipId, [
      { membershipId: memberA, category: 'DUES' as any, title: 'Spring Dues', amountCents: 5000 },
      { membershipId: memberB, category: 'EVENT' as any, title: 'Spring Dues', amountCents: 5000 },
    ]);

    expect(charges).toHaveLength(2);
    expect(charges[0].membershipId).toBe(memberA);
    expect(charges[1].membershipId).toBe(memberB);
    expect(charges[0].amountCents).toBe(5000);
    expect(charges[1].amountCents).toBe(5000);
    expect(charges[0].title).toBe('Spring Dues');

    // Cleanup
    await ctx.prisma.auditLog.deleteMany({ where: { orgId: ctx.orgId, entityId: { in: charges.map((c) => c.id) } } });
    await ctx.prisma.charge.deleteMany({ where: { id: { in: charges.map((c) => c.id) } } });
  });

  it('creates a batch audit log when multiple charges', async () => {
    const charges = await ctx.chargesService.bulkCreate(ctx.orgId, ctx.membershipId, [
      { membershipId: memberA, category: 'DUES' as any, title: 'Batch Test', amountCents: 3000 },
      { membershipId: memberB, category: 'DUES' as any, title: 'Batch Test', amountCents: 3000 },
    ]);

    const logs = await ctx.prisma.auditLog.findMany({
      where: { orgId: ctx.orgId, entityId: { in: charges.map((c) => c.id) }, action: 'CREATE' },
    });

    expect(logs).toHaveLength(2);
    // Both logs should share the same batchId
    expect(logs[0].batchId).toBeTruthy();
    expect(logs[0].batchId).toBe(logs[1].batchId);
    expect(logs[0].batchDescription).toContain('2 charges');

    // Cleanup
    await ctx.prisma.auditLog.deleteMany({ where: { orgId: ctx.orgId, entityId: { in: charges.map((c) => c.id) } } });
    await ctx.prisma.charge.deleteMany({ where: { id: { in: charges.map((c) => c.id) } } });
  });

  it('single-charge bulk create has no batch context', async () => {
    const charges = await ctx.chargesService.bulkCreate(ctx.orgId, ctx.membershipId, [
      { membershipId: memberA, category: 'DUES' as any, title: 'Solo', amountCents: 2500 },
    ]);

    expect(charges).toHaveLength(1);

    const logs = await ctx.prisma.auditLog.findMany({
      where: { orgId: ctx.orgId, entityId: charges[0].id, action: 'CREATE' },
    });

    expect(logs).toHaveLength(1);
    expect(logs[0].batchId).toBeNull();

    // Cleanup
    await ctx.prisma.auditLog.deleteMany({ where: { orgId: ctx.orgId, entityId: charges[0].id } });
    await ctx.prisma.charge.delete({ where: { id: charges[0].id } });
  });

  it('rejects when any membershipId is invalid', async () => {
    await expect(
      ctx.chargesService.bulkCreate(ctx.orgId, ctx.membershipId, [
        { membershipId: memberA, category: 'DUES' as any, title: 'Valid', amountCents: 1000 },
        { membershipId: 'non-existent-id', category: 'DUES' as any, title: 'Invalid', amountCents: 1000 },
      ]),
    ).rejects.toThrow(BadRequestException);

    // Verify no charges were created (all-or-nothing validation)
    const charges = await ctx.prisma.charge.findMany({
      where: { orgId: ctx.orgId, title: { in: ['Valid', 'Invalid'] } },
    });
    // Note: validation happens before creation, so no charges should exist
    // However, since we use Promise.all after validation, if validation passes
    // but one of the membershipIds was filtered, this test catches the gap
    expect(charges).toHaveLength(0);
  });

  it('returns empty array for empty input', async () => {
    const charges = await ctx.chargesService.bulkCreate(ctx.orgId, ctx.membershipId, []);
    expect(charges).toEqual([]);
  });

  it('correctly parses dueDate', async () => {
    const charges = await ctx.chargesService.bulkCreate(ctx.orgId, ctx.membershipId, [
      { membershipId: memberA, category: 'DUES' as any, title: 'Due Test', amountCents: 1000, dueDate: '2026-06-15' },
    ]);

    expect(charges).toHaveLength(1);
    expect(charges[0].dueDate).not.toBeNull();
    const dueDate = new Date(charges[0].dueDate!);
    expect(dueDate.getFullYear()).toBe(2026);
    expect(dueDate.getMonth()).toBe(5); // June = 5 (0-indexed)
    expect(dueDate.getDate()).toBe(15);

    // Cleanup
    await ctx.prisma.auditLog.deleteMany({ where: { orgId: ctx.orgId, entityId: charges[0].id } });
    await ctx.prisma.charge.delete({ where: { id: charges[0].id } });
  });
});
