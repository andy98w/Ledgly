import { createTestContext, cleanupTestContext, TestContext } from '../../test/test-helpers';

jest.setTimeout(30_000);

describe('Audit batch grouping (integration)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  }, 30_000);

  afterAll(async () => {
    await cleanupTestContext(ctx);
  }, 15_000);

  // ==================== Batch creation grouping ====================

  it('bulk charge creation groups logs under a single batch entry', async () => {
    const { chargesService, auditService, prisma, orgId, membershipId } = ctx;

    // Create charges for 2 members → should batch
    const secondUser = await prisma.user.create({
      data: { email: `batch-member-${Date.now()}@test.local`, name: 'Batch Member' },
    });
    const secondMembership = await prisma.membership.create({
      data: { orgId, userId: secondUser.id, role: 'MEMBER', status: 'ACTIVE', name: 'Batch Member' },
    });

    const charges = await chargesService.create(orgId, membershipId, {
      membershipIds: [membershipId, secondMembership.id],
      category: 'DUES' as any,
      title: 'Batch Group Test',
      amountCents: 5000,
    });
    expect(charges.length).toBe(2);

    // Fetch logs with groupByBatch=true
    const result = await auditService.findByOrg(orgId, { groupByBatch: true });
    const data = result.data as any[];

    // Find the batch entry for our charges
    const batchEntry = data.find(
      (entry) => entry.isBatch && entry.items?.some((i: any) => i.entityId === charges[0].id),
    );

    expect(batchEntry).toBeDefined();
    expect(batchEntry.isBatch).toBe(true);
    expect(batchEntry.itemCount).toBe(2);
    expect(batchEntry.items).toHaveLength(2);
    expect(batchEntry.batchDescription).toContain('2');

    // Both item entityIds should be our charge IDs
    const itemIds = batchEntry.items.map((i: any) => i.entityId);
    expect(itemIds).toContain(charges[0].id);
    expect(itemIds).toContain(charges[1].id);

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { orgId, entityId: { in: charges.map((c) => c.id) } } });
    await prisma.charge.deleteMany({ where: { id: { in: charges.map((c) => c.id) } } });
    await prisma.membership.delete({ where: { id: secondMembership.id } });
    await prisma.user.delete({ where: { id: secondUser.id } });
  });

  it('single charge creation does NOT create a batch entry', async () => {
    const { chargesService, auditService, prisma, orgId, membershipId } = ctx;

    const charges = await chargesService.create(orgId, membershipId, {
      membershipIds: [membershipId],
      category: 'DUES' as any,
      title: 'Single Charge No Batch',
      amountCents: 1000,
    });

    const result = await auditService.findByOrg(orgId, { groupByBatch: true });
    const data = result.data as any[];

    // Should appear as a standalone (non-batch) entry
    const entry = data.find(
      (e) => !e.isBatch && e.entityId === charges[0].id,
    );
    expect(entry).toBeDefined();
    expect(entry.isBatch).toBe(false);

    // Should NOT appear in any batch
    const inBatch = data.find(
      (e) => e.isBatch && e.items?.some((i: any) => i.entityId === charges[0].id),
    );
    expect(inBatch).toBeUndefined();

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { orgId, entityId: charges[0].id } });
    await prisma.charge.delete({ where: { id: charges[0].id } });
  });

  // ==================== Batch void grouping ====================

  it('bulk void groups logs into a single batch entry', async () => {
    const { chargesService, auditService, prisma, orgId, membershipId } = ctx;

    // Create 3 individual charges
    const c1 = (await chargesService.create(orgId, membershipId, {
      membershipIds: [membershipId], category: 'DUES' as any, title: 'BV1', amountCents: 1000,
    }))[0];
    const c2 = (await chargesService.create(orgId, membershipId, {
      membershipIds: [membershipId], category: 'DUES' as any, title: 'BV2', amountCents: 2000,
    }))[0];
    const c3 = (await chargesService.create(orgId, membershipId, {
      membershipIds: [membershipId], category: 'DUES' as any, title: 'BV3', amountCents: 3000,
    }))[0];

    // Bulk void
    await chargesService.bulkVoid(orgId, [c1.id, c2.id, c3.id], membershipId);

    const result = await auditService.findByOrg(orgId, { groupByBatch: true });
    const data = result.data as any[];

    // Find batch entry for the void operations (bulkVoid uses logDelete)
    const voidBatch = data.find(
      (entry) => entry.isBatch && entry.action === 'DELETE' && entry.items?.some((i: any) => i.entityId === c1.id),
    );

    expect(voidBatch).toBeDefined();
    expect(voidBatch.itemCount).toBe(3);
    expect(voidBatch.batchDescription).toContain('3');

    // Cleanup
    const ids = [c1.id, c2.id, c3.id];
    await prisma.auditLog.deleteMany({ where: { orgId, entityId: { in: ids } } });
    await prisma.charge.deleteMany({ where: { id: { in: ids } } });
  });

  // ==================== Batch member add grouping ====================

  it('bulk member creation groups logs into a single batch entry', async () => {
    const { membersService, auditService, prisma, orgId, membershipId } = ctx;

    const created = await membersService.createMany(orgId, [
      { name: 'Batch A', role: 'MEMBER' as any },
      { name: 'Batch B', role: 'MEMBER' as any },
      { name: 'Batch C', role: 'MEMBER' as any },
    ], membershipId);
    expect(created.length).toBe(3);
    const createdIds = created.map((m) => m.id);

    const auditResult = await auditService.findByOrg(orgId, { groupByBatch: true });
    const data = auditResult.data as any[];

    const memberBatch = data.find(
      (entry) => entry.isBatch && entry.entityType === 'MEMBER' && entry.items?.some((i: any) => createdIds.includes(i.entityId)),
    );

    expect(memberBatch).toBeDefined();
    expect(memberBatch.itemCount).toBe(3);
    expect(memberBatch.batchDescription).toContain('3');

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { orgId, entityId: { in: createdIds } } });
    await prisma.membership.deleteMany({ where: { id: { in: createdIds } } });
  });

  // ==================== Batch member remove grouping ====================

  it('bulk member remove groups logs into a single batch entry', async () => {
    const { membersService, auditService, prisma, orgId, membershipId } = ctx;

    // Create members to remove
    const created = await membersService.createMany(orgId, [
      { name: 'Remove A', role: 'MEMBER' as any },
      { name: 'Remove B', role: 'MEMBER' as any },
    ], membershipId);
    const ids = created.map((m) => m.id);

    // Clear creation audit logs
    await prisma.auditLog.deleteMany({ where: { orgId, entityId: { in: ids } } });

    // Bulk remove
    await membersService.bulkRemove(orgId, ids, membershipId);

    const auditResult = await auditService.findByOrg(orgId, { groupByBatch: true });
    const data = auditResult.data as any[];

    const removeBatch = data.find(
      (entry) => entry.isBatch && entry.items?.some((i: any) => ids.includes(i.entityId) && i.action === 'DELETE'),
    );

    expect(removeBatch).toBeDefined();
    expect(removeBatch.itemCount).toBe(2);

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { orgId, entityId: { in: ids } } });
    await prisma.membership.deleteMany({ where: { id: { in: ids } } });
  });

  // ==================== groupByBatch=false returns flat list ====================

  it('groupByBatch=false returns flat list without batching', async () => {
    const { chargesService, auditService, prisma, orgId, membershipId } = ctx;

    // Create a batch of charges
    const secondUser = await prisma.user.create({
      data: { email: `flat-${Date.now()}@test.local`, name: 'Flat Test' },
    });
    const secondMembership = await prisma.membership.create({
      data: { orgId, userId: secondUser.id, role: 'MEMBER', status: 'ACTIVE', name: 'Flat Test' },
    });

    const charges = await chargesService.create(orgId, membershipId, {
      membershipIds: [membershipId, secondMembership.id],
      category: 'DUES' as any,
      title: 'Flat List Test',
      amountCents: 5000,
    });

    // Without grouping
    const flat = await auditService.findByOrg(orgId, { groupByBatch: false });
    const flatData = flat.data as any[];

    // Should have individual entries, not batch wrappers
    const chargeEntries = flatData.filter(
      (e) => charges.some((c) => c.id === e.entityId),
    );
    expect(chargeEntries.length).toBe(2);
    expect(chargeEntries.every((e: any) => !e.isBatch)).toBe(true);

    // With grouping
    const grouped = await auditService.findByOrg(orgId, { groupByBatch: true });
    const groupedData = grouped.data as any[];

    const batchEntry = groupedData.find(
      (e) => e.isBatch && e.items?.some((i: any) => i.entityId === charges[0].id),
    );
    expect(batchEntry).toBeDefined();
    expect(batchEntry.itemCount).toBe(2);

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { orgId, entityId: { in: charges.map((c) => c.id) } } });
    await prisma.charge.deleteMany({ where: { id: { in: charges.map((c) => c.id) } } });
    await prisma.membership.delete({ where: { id: secondMembership.id } });
    await prisma.user.delete({ where: { id: secondUser.id } });
  });

  // ==================== Batch undo/redo marks all items ====================

  it('markBatchAsUndone marks all items in a batch', async () => {
    const { auditService, prisma, orgId, membershipId } = ctx;

    // Manually create a batch of audit logs
    const batch = auditService.createBatchContext('Test undo batch');
    await auditService.logCreate(orgId, membershipId, 'CHARGE', 'fake-1', { title: 'A' }, batch);
    await auditService.logCreate(orgId, membershipId, 'CHARGE', 'fake-2', { title: 'B' }, batch);
    await auditService.logCreate(orgId, membershipId, 'CHARGE', 'fake-3', { title: 'C' }, batch);

    // Mark batch as undone
    await auditService.markBatchAsUndone(orgId, batch.batchId);

    const logs = await auditService.findByBatchId(orgId, batch.batchId);
    expect(logs.length).toBe(3);
    expect(logs.every((l) => l.undone === true)).toBe(true);

    // Redo
    await auditService.markBatchAsRedone(orgId, batch.batchId);
    const redone = await auditService.findByBatchId(orgId, batch.batchId);
    expect(redone.every((l) => l.undone === false)).toBe(true);

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { orgId, batchId: batch.batchId } });
  });

  // ==================== Batch undone state shows in grouping ====================

  it('batch undone state is reflected in grouped view', async () => {
    const { auditService, prisma, orgId, membershipId } = ctx;

    const batch = auditService.createBatchContext('Undone grouping test');
    await auditService.logCreate(orgId, membershipId, 'CHARGE', 'ug-1', { title: 'X' }, batch);
    await auditService.logCreate(orgId, membershipId, 'CHARGE', 'ug-2', { title: 'Y' }, batch);

    // Mark undone
    await auditService.markBatchAsUndone(orgId, batch.batchId);

    const result = await auditService.findByOrg(orgId, { groupByBatch: true });
    const data = result.data as any[];
    const batchEntry = data.find((e) => e.isBatch && e.id === batch.batchId);

    expect(batchEntry).toBeDefined();
    expect(batchEntry.undone).toBe(true);

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { orgId, batchId: batch.batchId } });
  });
});
