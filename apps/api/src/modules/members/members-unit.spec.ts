import { NotFoundException } from '@nestjs/common';
import { createTestContext, cleanupTestContext, TestContext } from '../../test/test-helpers';

jest.setTimeout(30_000);

describe('Members unit tests', () => {
  let ctx: TestContext;
  let memberUserId: string;
  let memberMembershipId: string;

  beforeAll(async () => {
    ctx = await createTestContext();

    const user = await ctx.prisma.user.create({
      data: { email: `member-unit-${crypto.randomUUID()}@test.local`, name: 'Portal Member' },
    });
    memberUserId = user.id;

    const m = await ctx.prisma.membership.create({
      data: { orgId: ctx.orgId, userId: user.id, role: 'MEMBER', status: 'ACTIVE', name: 'Portal Member' },
    });
    memberMembershipId = m.id;
  }, 30_000);

  afterAll(async () => {
    await ctx.prisma.membership.deleteMany({ where: { id: memberMembershipId } });
    await ctx.prisma.user.deleteMany({ where: { id: memberUserId } });
    await cleanupTestContext(ctx);
  }, 15_000);

  // ==================== findByUserId() ====================

  it('findByUserId returns member detail for a valid user', async () => {
    const result = await ctx.membersService.findByUserId(ctx.orgId, memberUserId);

    expect(result.id).toBe(memberMembershipId);
    expect(result.displayName).toBe('Portal Member');
    expect(result.role).toBe('MEMBER');
    expect(result.status).toBe('ACTIVE');
    expect(result).toHaveProperty('balanceCents');
    expect(result).toHaveProperty('totalChargedCents');
    expect(result).toHaveProperty('totalPaidCents');
    expect(result).toHaveProperty('charges');
    expect(result).toHaveProperty('payments');
  });

  it('findByUserId throws NotFoundException for unknown user', async () => {
    await expect(
      ctx.membersService.findByUserId(ctx.orgId, 'nonexistent-user-id'),
    ).rejects.toThrow(NotFoundException);
  });

  it('findByUserId throws NotFoundException for user not in org', async () => {
    // Create a user with no membership in the test org
    const otherUser = await ctx.prisma.user.create({
      data: { email: `other-${crypto.randomUUID()}@test.local`, name: 'Other User' },
    });

    await expect(
      ctx.membersService.findByUserId(ctx.orgId, otherUser.id),
    ).rejects.toThrow(NotFoundException);

    await ctx.prisma.user.delete({ where: { id: otherUser.id } });
  });

  it('findByUserId throws NotFoundException for inactive member', async () => {
    const user = await ctx.prisma.user.create({
      data: { email: `left-${crypto.randomUUID()}@test.local`, name: 'Left Member' },
    });
    await ctx.prisma.membership.create({
      data: { orgId: ctx.orgId, userId: user.id, role: 'MEMBER', status: 'LEFT', name: 'Left Member' },
    });

    await expect(
      ctx.membersService.findByUserId(ctx.orgId, user.id),
    ).rejects.toThrow(NotFoundException);

    await ctx.prisma.membership.deleteMany({ where: { userId: user.id } });
    await ctx.prisma.user.delete({ where: { id: user.id } });
  });

  // ==================== createMany() partial success ====================

  it('createMany succeeds for valid members and reports errors for duplicates', async () => {
    const uid = crypto.randomUUID();
    const result = await ctx.membersService.createMany(ctx.orgId, [
      { name: `Good Member ${uid}` },
      { name: 'Portal Member' }, // duplicate name — already exists
      { name: `Another Good ${uid}` },
    ], ctx.membershipId);

    expect(result.created).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain('already exists');

    // Cleanup
    const ids = result.created.map((m) => m.id);
    await ctx.prisma.auditLog.deleteMany({ where: { orgId: ctx.orgId, entityId: { in: ids } } });
    await ctx.prisma.membership.deleteMany({ where: { id: { in: ids } } });
  });

  it('createMany detects duplicate emails within the same batch', async () => {
    const uid2 = crypto.randomUUID();
    const email = `dupe-batch-${uid2}@test.local`;
    const result = await ctx.membersService.createMany(ctx.orgId, [
      { name: `First ${uid2}`, email },
      { name: `Second ${uid2}`, email },
    ], ctx.membershipId);

    expect(result.created).toHaveLength(1);
    expect(result.created[0].name).toBe(`First ${uid2}`);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain('already used');

    // Cleanup
    const ids = result.created.map((m) => m.id);
    await ctx.prisma.auditLog.deleteMany({ where: { orgId: ctx.orgId, entityId: { in: ids } } });
    await ctx.prisma.membership.deleteMany({ where: { id: { in: ids } } });
    await ctx.prisma.user.deleteMany({ where: { email } });
  });

  // ==================== findByUserId() with charges/payments ====================

  it('findByUserId returns charges and payments for the member', async () => {
    // Create a charge for this member
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [memberMembershipId],
      category: 'DUES' as any,
      title: 'Portal Test Charge',
      amountCents: 5000,
    });

    const payment = await ctx.paymentsService.create(ctx.orgId, ctx.membershipId, {
      amountCents: 3000,
      paidAt: '2026-01-15',
      rawPayerName: 'No Match Payer',
    });
    await ctx.prisma.payment.update({ where: { id: payment.id }, data: { membershipId: memberMembershipId } });

    const result = await ctx.membersService.findByUserId(ctx.orgId, memberUserId);

    expect(result.totalChargedCents).toBe(5000);
    expect(result.charges.length).toBeGreaterThanOrEqual(1);
    expect(result.charges.some((c: any) => c.id === charges[0].id)).toBe(true);
    expect(result.payments.length).toBeGreaterThanOrEqual(1);
    expect(result.payments.some((p: any) => p.id === payment.id)).toBe(true);
    expect(result.balanceCents).toBe(5000); // No allocations yet

    // Cleanup
    await ctx.prisma.auditLog.deleteMany({ where: { orgId: ctx.orgId, entityId: { in: [charges[0].id, payment.id] } } });
    await ctx.prisma.payment.deleteMany({ where: { id: payment.id } });
    await ctx.prisma.charge.deleteMany({ where: { id: charges[0].id } });
  });
});
