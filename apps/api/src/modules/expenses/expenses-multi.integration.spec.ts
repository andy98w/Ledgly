import { createTestContext, cleanupTestContext, TestContext } from '../../test/test-helpers';

jest.setTimeout(15_000);

describe('Multi-expense (parent-child) integration', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  }, 30_000);

  afterAll(async () => {
    await ctx.prisma.auditLog.deleteMany({ where: { orgId: ctx.orgId } });
    await ctx.prisma.expense.deleteMany({ where: { orgId: ctx.orgId } });
    await cleanupTestContext(ctx);
  }, 15_000);

  it('creates a parent expense with children', async () => {
    const result = await ctx.expensesService.createMultiExpense(ctx.orgId, ctx.membershipId, {
      category: 'SUPPLIES' as any,
      title: 'Party Supplies',
      date: '2026-03-01',
      vendor: 'Costco',
      children: [
        { title: 'Cups', amountCents: 1500 },
        { title: 'Plates', amountCents: 2000 },
        { title: 'Napkins', amountCents: 800 },
      ],
    });

    expect(result.parent).toBeDefined();
    expect(result.children).toHaveLength(3);

    // Parent amount = sum of children
    expect(result.parent.amountCents).toBe(4300);
    expect(result.parent.parentId).toBeNull();
    expect(result.parent.title).toBe('Party Supplies');
    expect(result.parent.vendor).toBe('Costco');

    // Children linked to parent
    for (const child of result.children) {
      expect(child.parentId).toBe(result.parent.id);
    }

    const titles = result.children.map((c) => c.title);
    expect(titles).toContain('Cups');
    expect(titles).toContain('Plates');
    expect(titles).toContain('Napkins');
  });

  it('findAll excludes children from top-level and includes them nested', async () => {
    const { data } = await ctx.expensesService.findAll(ctx.orgId, {});

    for (const expense of data) {
      expect(expense.parentId).toBeNull();
    }

    const parent = data.find((e: any) => e.title === 'Party Supplies' && e.children?.length > 0);
    expect(parent).toBeDefined();
    expect(parent.children).toHaveLength(3);
  });

  it('deleting parent cascades to children', async () => {
    const { parent } = await ctx.expensesService.createMultiExpense(ctx.orgId, ctx.membershipId, {
      category: 'FOOD' as any,
      title: 'Delete Test',
      date: '2026-03-02',
      children: [
        { title: 'Item A', amountCents: 1000 },
        { title: 'Item B', amountCents: 2000 },
      ],
    });

    await ctx.expensesService.delete(ctx.orgId, parent.id, ctx.membershipId);

    // Parent should be soft-deleted
    const deletedParent = await ctx.prisma.expense.findUnique({ where: { id: parent.id } });
    expect(deletedParent!.deletedAt).not.toBeNull();

    // Children should also be soft-deleted
    const children = await ctx.prisma.expense.findMany({ where: { parentId: parent.id } });
    for (const child of children) {
      expect(child.deletedAt).not.toBeNull();
    }
  });

  it('getSummary excludes children to prevent double-counting', async () => {
    // Create a multi-expense
    await ctx.expensesService.createMultiExpense(ctx.orgId, ctx.membershipId, {
      category: 'EVENT' as any,
      title: 'Summary Test',
      date: '2026-03-03',
      children: [
        { title: 'Line 1', amountCents: 5000 },
        { title: 'Line 2', amountCents: 3000 },
      ],
    });

    const summary = await ctx.expensesService.getSummary(ctx.orgId);

    // Count total expenses - parent is 8000, children total 8000 too
    // If children were counted, it would be doubled
    // The parent amount (8000) should appear once, not three times
    expect(summary.totalCents).toBeGreaterThan(0);

    // Verify count doesn't include children
    const allExpenses = await ctx.prisma.expense.findMany({
      where: { orgId: ctx.orgId, deletedAt: null },
    });
    const parentOnlyCount = allExpenses.filter((e) => e.parentId === null).length;
    expect(summary.count).toBe(parentOnlyCount);
  });
});
