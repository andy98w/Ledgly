import { createTestContext, cleanupTestContext, TestContext } from '../../test/test-helpers';

jest.setTimeout(30_000);

describe('Custom columns API (integration)', () => {
  let ctx: TestContext;
  let memberMembershipId: string;

  beforeAll(async () => {
    ctx = await createTestContext();

    const user = await ctx.prisma.user.create({
      data: { email: `cc-member-${crypto.randomUUID()}@test.local`, name: 'CC Member' },
    });
    const m = await ctx.prisma.membership.create({
      data: { orgId: ctx.orgId, userId: user.id, role: 'MEMBER', status: 'ACTIVE', name: 'CC Member' },
    });
    memberMembershipId = m.id;
  }, 30_000);

  afterAll(async () => {
    await ctx.prisma.membership.deleteMany({ where: { id: memberMembershipId } });
    await cleanupTestContext(ctx);
  }, 15_000);

  it('getCustomColumns returns empty array for new org', async () => {
    const columns = await ctx.organizationsService.getCustomColumns(ctx.orgId);
    expect(columns).toEqual([]);
  });

  it('updateCustomColumns saves and returns columns', async () => {
    const input = [
      { id: 'col-1', label: 'Jersey Number', type: 'number' as const },
      { id: 'col-2', label: 'Notes', type: 'text' as const },
    ];

    const result = await ctx.organizationsService.updateCustomColumns(ctx.orgId, input);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 'col-1', label: 'Jersey Number', type: 'number' });
    expect(result[1]).toMatchObject({ id: 'col-2', label: 'Notes', type: 'text' });

    const fetched = await ctx.organizationsService.getCustomColumns(ctx.orgId);
    expect(fetched).toHaveLength(2);
    expect(fetched[0].id).toBe('col-1');
  });

  it('updateCustomField sets a value on a charge customFields', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [memberMembershipId],
      category: 'DUES' as any,
      title: 'Custom Field Test',
      amountCents: 1000,
    });
    const charge = charges[0];

    const fields = await ctx.organizationsService.updateCustomField(
      ctx.orgId, 'charge', charge.id, 'col-1', 42,
    );
    expect(fields['col-1']).toBe(42);

    const row = await ctx.prisma.charge.findUnique({ where: { id: charge.id } });
    expect((row?.customFields as any)?.['col-1']).toBe(42);

    await ctx.prisma.auditLog.deleteMany({ where: { orgId: ctx.orgId, entityId: charge.id } });
    await ctx.prisma.charge.delete({ where: { id: charge.id } });
  });

  it('updateCustomField with null removes the field', async () => {
    const charges = await ctx.chargesService.create(ctx.orgId, ctx.membershipId, {
      membershipIds: [memberMembershipId],
      category: 'DUES' as any,
      title: 'Null Field Test',
      amountCents: 2000,
    });
    const charge = charges[0];

    await ctx.organizationsService.updateCustomField(ctx.orgId, 'charge', charge.id, 'col-1', 99);
    const afterSet = await ctx.organizationsService.updateCustomField(
      ctx.orgId, 'charge', charge.id, 'col-1', null,
    );
    expect(afterSet).not.toHaveProperty('col-1');

    const row = await ctx.prisma.charge.findUnique({ where: { id: charge.id } });
    expect((row?.customFields as any)?.['col-1']).toBeUndefined();

    await ctx.prisma.auditLog.deleteMany({ where: { orgId: ctx.orgId, entityId: charge.id } });
    await ctx.prisma.charge.delete({ where: { id: charge.id } });
  });
});
