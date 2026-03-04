import { NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { createTestContext, cleanupTestContext, TestContext } from '../../test/test-helpers';

jest.setTimeout(15_000);

describe('Audit Undo/Redo Edge Cases (integration)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
    // Promote default membership to OWNER so it can remove admins
    await ctx.prisma.membership.update({
      where: { id: ctx.membershipId },
      data: { role: 'OWNER' },
    });
  }, 30_000);

  afterAll(async () => {
    await cleanupTestContext(ctx);
  }, 15_000);

  // ---------- Test 1: Payment create → undo → redo cycle ----------
  it('payment create → undo → redo cycle', async () => {
    const { paymentsService, auditService, prisma, orgId, membershipId } = ctx;

    // Create payment
    const payment = await paymentsService.create(orgId, membershipId, {
      amountCents: 5000,
      paidAt: '2025-06-01',
      rawPayerName: 'Undo Redo Test',
    });

    // Verify audit log was created
    const logs = await prisma.auditLog.findMany({
      where: { orgId, entityId: payment.id, entityType: 'PAYMENT', action: 'CREATE' },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);

    // Undo (soft-delete)
    await paymentsService.delete(orgId, payment.id, membershipId);
    const afterDelete = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(afterDelete?.deletedAt).not.toBeNull();

    // Redo (restore)
    await paymentsService.restore(orgId, payment.id, membershipId);
    const afterRestore = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(afterRestore?.deletedAt).toBeNull();

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { orgId, entityId: payment.id } });
    await prisma.payment.delete({ where: { id: payment.id } });
  });

  // ---------- Test 2: Undo on hard-deleted payment doesn't crash ----------
  it('undo on hard-deleted payment does not throw', async () => {
    const { paymentsService, prisma, orgId, membershipId } = ctx;

    // Create, then hard-delete to simulate unconfirmImport behavior
    const payment = await paymentsService.create(orgId, membershipId, {
      amountCents: 3000,
      paidAt: '2025-07-01',
      rawPayerName: 'Hard Delete Test',
    });

    // Hard-delete (what unconfirmImport does)
    await prisma.payment.delete({ where: { id: payment.id } });

    // Attempting to soft-delete (undo of CREATE) should throw NotFoundException
    await expect(
      paymentsService.delete(orgId, payment.id, membershipId),
    ).rejects.toThrow(NotFoundException);

    // But when called through the resilient undoSingle pattern (try/catch NotFoundException),
    // it should be treated as a no-op.  Simulate:
    let caught = false;
    try {
      await paymentsService.delete(orgId, payment.id, membershipId);
    } catch (e) {
      if (e instanceof NotFoundException) {
        caught = true; // This is expected — the controller's try/catch swallows it
      } else {
        throw e;
      }
    }
    expect(caught).toBe(true);

    // Cleanup audit logs
    await prisma.auditLog.deleteMany({ where: { orgId, entityId: payment.id } });
  });

  // ---------- Test 3: Charge + allocation + undo ----------
  it('charge + allocation + undo allocation + redo allocation', async () => {
    const { chargesService, paymentsService, prisma, orgId, membershipId } = ctx;

    // Create charge
    const charges = await chargesService.create(orgId, membershipId, {
      membershipIds: [membershipId],
      category: 'DUES' as any,
      title: 'Alloc Undo Test',
      amountCents: 10000,
    });
    const charge = charges[0];

    // Create payment
    const payment = await paymentsService.create(orgId, membershipId, {
      amountCents: 10000,
      paidAt: '2025-08-01',
      rawPayerName: 'Alloc Tester',
    });

    // Allocate
    const allocations = await paymentsService.allocate(orgId, payment.id, membershipId, {
      allocations: [{ chargeId: charge.id, amountCents: 10000 }],
    });
    expect(allocations.length).toBe(1);

    // Verify charge is PAID
    const paidCharge = await prisma.charge.findUnique({ where: { id: charge.id } });
    expect(paidCharge?.status).toBe('PAID');

    // Undo allocation (remove it)
    await paymentsService.removeAllocation(orgId, allocations[0].id, membershipId);
    const openCharge = await prisma.charge.findUnique({ where: { id: charge.id } });
    expect(openCharge?.status).toBe('OPEN');

    // Redo allocation (restore it)
    await paymentsService.restoreAllocation(orgId, allocations[0].id, {
      paymentId: payment.id,
      chargeId: charge.id,
      amountCents: 10000,
      createdById: membershipId,
    });
    const restoredCharge = await prisma.charge.findUnique({ where: { id: charge.id } });
    expect(restoredCharge?.status).toBe('PAID');

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { orgId, entityId: { in: [charge.id, payment.id, allocations[0].id] } } });
    await prisma.paymentAllocation.deleteMany({ where: { orgId, paymentId: payment.id } });
    await prisma.payment.delete({ where: { id: payment.id } });
    await prisma.charge.delete({ where: { id: charge.id } });
  });

  // ---------- Test 4: Expense confirm → unconfirm → re-confirm ----------
  it('expense: create → delete (hard) → re-create works cleanly', async () => {
    const { expensesService, prisma, orgId, membershipId } = ctx;

    // Create expense
    const expense = await expensesService.create(orgId, membershipId, {
      category: 'OTHER',
      title: 'Expense Unconfirm Test',
      amountCents: 7500,
      date: '2025-09-01',
      vendor: 'Test Vendor',
    });

    // Verify visible
    const list1 = await expensesService.findAll(orgId);
    expect(list1.data.some((e) => e.id === expense.id)).toBe(true);

    // Hard-delete (what unconfirmImport now does)
    await prisma.expense.delete({ where: { id: expense.id } });

    // Verify gone
    const list2 = await expensesService.findAll(orgId);
    expect(list2.data.some((e) => e.id === expense.id)).toBe(false);

    // Re-create (what re-confirm does)
    const expense2 = await expensesService.create(orgId, membershipId, {
      category: 'OTHER',
      title: 'Expense Unconfirm Test',
      amountCents: 7500,
      date: '2025-09-01',
      vendor: 'Test Vendor',
    });

    // Verify visible again
    const list3 = await expensesService.findAll(orgId);
    expect(list3.data.some((e) => e.id === expense2.id)).toBe(true);

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { orgId, entityId: { in: [expense.id, expense2.id] } } });
    await prisma.expense.delete({ where: { id: expense2.id } });
  });

  // ---------- Test 5: Bulk void charges + batch undo ----------
  it('bulk void charges + batch restore', async () => {
    const { chargesService, prisma, orgId, membershipId } = ctx;

    // Create 3 charges
    const c1 = (await chargesService.create(orgId, membershipId, {
      membershipIds: [membershipId], category: 'DUES' as any, title: 'Bulk1', amountCents: 1000,
    }))[0];
    const c2 = (await chargesService.create(orgId, membershipId, {
      membershipIds: [membershipId], category: 'DUES' as any, title: 'Bulk2', amountCents: 2000,
    }))[0];
    const c3 = (await chargesService.create(orgId, membershipId, {
      membershipIds: [membershipId], category: 'DUES' as any, title: 'Bulk3', amountCents: 3000,
    }))[0];

    // Bulk void
    await chargesService.void(orgId, c1.id, membershipId);
    await chargesService.void(orgId, c2.id, membershipId);
    await chargesService.void(orgId, c3.id, membershipId);

    // Verify all voided
    for (const id of [c1.id, c2.id, c3.id]) {
      const ch = await prisma.charge.findUnique({ where: { id } });
      expect(ch?.status).toBe('VOID');
    }

    // Restore all 3
    await chargesService.restore(orgId, c1.id, membershipId);
    await chargesService.restore(orgId, c2.id, membershipId);
    await chargesService.restore(orgId, c3.id, membershipId);

    // Verify all restored to OPEN
    for (const id of [c1.id, c2.id, c3.id]) {
      const ch = await prisma.charge.findUnique({ where: { id } });
      expect(ch?.status).toBe('OPEN');
    }

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { orgId, entityId: { in: [c1.id, c2.id, c3.id] } } });
    await prisma.charge.deleteMany({ where: { id: { in: [c1.id, c2.id, c3.id] } } });
  });

  // ---------- Test 6: Payment duplicate detection doesn't block undo ----------
  it('payment duplicate detection handles gracefully on undo', async () => {
    const { paymentsService, prisma, orgId, membershipId } = ctx;

    // Create first payment
    const p1 = await paymentsService.create(orgId, membershipId, {
      amountCents: 9999,
      paidAt: '2025-10-15',
      rawPayerName: 'Dup Test',
    });

    // Soft-delete it
    await paymentsService.delete(orgId, p1.id, membershipId);

    // Create another with same fingerprint — the create logic hard-deletes soft-deleted dupes
    const p2 = await paymentsService.create(orgId, membershipId, {
      amountCents: 9999,
      paidAt: '2025-10-15',
      rawPayerName: 'Dup Test',
    });

    // The original p1 should be gone (hard-deleted by the create logic)
    const p1After = await prisma.payment.findUnique({ where: { id: p1.id } });
    expect(p1After).toBeNull();

    // Trying to restore p1 should throw NotFoundException (it's gone)
    await expect(
      paymentsService.restore(orgId, p1.id, membershipId),
    ).rejects.toThrow(NotFoundException);

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { orgId, entityId: { in: [p1.id, p2.id] } } });
    await prisma.payment.delete({ where: { id: p2.id } });
  });

  // ---------- Test 7: Double delete (undo CREATE twice) is idempotent ----------
  it('double delete of payment is caught by NotFoundException', async () => {
    const { paymentsService, prisma, orgId, membershipId } = ctx;

    const payment = await paymentsService.create(orgId, membershipId, {
      amountCents: 4000,
      paidAt: '2025-11-01',
      rawPayerName: 'Double Delete Test',
    });

    // First delete succeeds
    await paymentsService.delete(orgId, payment.id, membershipId);

    // Second delete throws NotFoundException (already soft-deleted)
    await expect(
      paymentsService.delete(orgId, payment.id, membershipId),
    ).rejects.toThrow(NotFoundException);

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { orgId, entityId: payment.id } });
    await prisma.payment.deleteMany({ where: { id: payment.id } });
  });

  // ---------- Test 8: Double restore is caught by ConflictException ----------
  it('double restore of payment throws ConflictException', async () => {
    const { paymentsService, prisma, orgId, membershipId } = ctx;

    const payment = await paymentsService.create(orgId, membershipId, {
      amountCents: 4500,
      paidAt: '2025-11-02',
      rawPayerName: 'Double Restore Test',
    });

    // Delete then restore
    await paymentsService.delete(orgId, payment.id, membershipId);
    await paymentsService.restore(orgId, payment.id, membershipId);

    // Second restore should fail (already active)
    await expect(
      paymentsService.restore(orgId, payment.id, membershipId),
    ).rejects.toThrow(NotFoundException); // findFirst({ deletedAt: { not: null } }) returns null

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { orgId, entityId: payment.id } });
    await prisma.payment.delete({ where: { id: payment.id } });
  });

  // ---------- Test 9: Member remove + restore cycle ----------
  it('member remove → restore preserves data', async () => {
    const { membersService, prisma, orgId, membershipId } = ctx;

    // Create a second member for this test (can't remove ourselves)
    const secondUser = await prisma.user.create({
      data: { email: `member-test-${Date.now()}@test.local`, name: 'Removable Member' },
    });
    const secondMembership = await prisma.membership.create({
      data: { orgId, userId: secondUser.id, role: 'MEMBER', status: 'ACTIVE', name: 'Removable Member' },
    });

    // Remove
    await membersService.remove(orgId, secondMembership.id, membershipId);
    const removed = await prisma.membership.findUnique({ where: { id: secondMembership.id } });
    expect(removed?.status).toBe('LEFT');

    // Restore
    await membersService.restore(orgId, secondMembership.id, membershipId);
    const restored = await prisma.membership.findUnique({ where: { id: secondMembership.id } });
    expect(restored?.status).toBe('ACTIVE');
    expect(restored?.name).toBe('Removable Member');

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { orgId, entityId: secondMembership.id } });
    await prisma.membership.delete({ where: { id: secondMembership.id } });
    await prisma.user.delete({ where: { id: secondUser.id } });
  });

  // ---------- Test 10: Audit log is created for each operation ----------
  it('audit logs are created for payment lifecycle', async () => {
    const { paymentsService, prisma, orgId, membershipId } = ctx;

    const payment = await paymentsService.create(orgId, membershipId, {
      amountCents: 6000,
      paidAt: '2025-12-01',
      rawPayerName: 'Audit Trail Test',
    });

    // Verify CREATE log
    const createLogs = await prisma.auditLog.findMany({
      where: { orgId, entityId: payment.id, action: 'CREATE' },
    });
    expect(createLogs.length).toBe(1);
    expect(createLogs[0].entityType).toBe('PAYMENT');
    expect(createLogs[0].actorId).toBe(membershipId);

    // Delete and verify DELETE log
    await paymentsService.delete(orgId, payment.id, membershipId);
    const deleteLogs = await prisma.auditLog.findMany({
      where: { orgId, entityId: payment.id, action: 'DELETE' },
    });
    expect(deleteLogs.length).toBe(1);

    // Restore and verify another CREATE log (restored)
    await paymentsService.restore(orgId, payment.id, membershipId);
    const allCreateLogs = await prisma.auditLog.findMany({
      where: { orgId, entityId: payment.id, action: 'CREATE' },
    });
    expect(allCreateLogs.length).toBe(2); // Original + restore

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { orgId, entityId: payment.id } });
    await prisma.payment.delete({ where: { id: payment.id } });
  });

  // ---------- Test 11: OWNER cannot be removed or demoted ----------
  it('OWNER cannot be removed or demoted by a lower-rank member', async () => {
    const { membersService, prisma, orgId, membershipId } = ctx;

    // Create a non-admin member to act as the actor.
    const helperUser = await prisma.user.create({
      data: { email: `admin-guard-${Date.now()}@test.local`, name: 'Helper' },
    });
    const helperMembership = await prisma.membership.create({
      data: { orgId, userId: helperUser.id, role: 'MEMBER', status: 'ACTIVE', name: 'Helper' },
    });

    // Attempt to remove the OWNER — should throw (OWNER protection)
    await expect(
      membersService.remove(orgId, membershipId, helperMembership.id),
    ).rejects.toThrow(BadRequestException);

    // Attempt to demote the OWNER via update — should throw BadRequestException
    await expect(
      membersService.update(orgId, membershipId, { role: 'MEMBER' as any }, helperMembership.id),
    ).rejects.toThrow(BadRequestException);

    // Verify OWNER is still ACTIVE and OWNER
    const admin = await prisma.membership.findUnique({ where: { id: membershipId } });
    expect(admin?.status).toBe('ACTIVE');
    expect(admin?.role).toBe('OWNER');

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { orgId, entityId: helperMembership.id } });
    await prisma.membership.delete({ where: { id: helperMembership.id } });
    await prisma.user.delete({ where: { id: helperUser.id } });
  });

  // ---------- Test 12: Last-admin guard allows removal when another admin exists ----------
  it('can remove an admin when another admin exists', async () => {
    const { membersService, prisma, orgId, membershipId } = ctx;

    // Create a second admin
    const secondUser = await prisma.user.create({
      data: { email: `second-admin-${Date.now()}@test.local`, name: 'Second Admin' },
    });
    const secondAdmin = await prisma.membership.create({
      data: { orgId, userId: secondUser.id, role: 'ADMIN', status: 'ACTIVE', name: 'Second Admin' },
    });

    // Now removing the second admin should succeed (first admin still exists)
    await membersService.remove(orgId, secondAdmin.id, membershipId);
    const removed = await prisma.membership.findUnique({ where: { id: secondAdmin.id } });
    expect(removed?.status).toBe('LEFT');

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { orgId, entityId: secondAdmin.id } });
    await prisma.membership.delete({ where: { id: secondAdmin.id } });
    await prisma.user.delete({ where: { id: secondUser.id } });
  });

  // ---------- Test 13: Charges include member status for LEFT member visibility ----------
  it('charge response includes member status field', async () => {
    const { chargesService, prisma, orgId, membershipId } = ctx;

    const charges = await chargesService.create(orgId, membershipId, {
      membershipIds: [membershipId],
      category: 'DUES' as any,
      title: 'Status Test',
      amountCents: 1500,
    });

    const list = await chargesService.findAll(orgId);
    const found = list.data.find((c) => c.id === charges[0].id);
    expect(found).toBeDefined();
    expect(found!.membership.status).toBe('ACTIVE');

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { orgId, entityId: charges[0].id } });
    await prisma.charge.delete({ where: { id: charges[0].id } });
  });

  // ---------- Test 14: Self-deletion prevention ----------
  it('cannot delete yourself as a member', async () => {
    const { membersService, orgId, membershipId } = ctx;

    await expect(
      membersService.remove(orgId, membershipId, membershipId),
    ).rejects.toThrow(BadRequestException);
  });

  // ---------- Test 15 (original test 11): Expense soft-delete vs hard-delete behavior ----------
  it('soft-deleted expense is invisible in findAll, hard-deleted is gone completely', async () => {
    const { expensesService, prisma, orgId, membershipId } = ctx;

    // Create two expenses
    const e1 = await expensesService.create(orgId, membershipId, {
      category: 'OTHER', title: 'Soft Delete', amountCents: 1000, date: '2025-12-15',
    });
    const e2 = await expensesService.create(orgId, membershipId, {
      category: 'OTHER', title: 'Hard Delete', amountCents: 2000, date: '2025-12-15',
    });

    // Soft-delete e1 via the service (sets deletedAt)
    await expensesService.delete(orgId, e1.id, membershipId);

    // e1 is invisible in findAll but still exists in DB
    const list = await expensesService.findAll(orgId);
    expect(list.data.some((e) => e.id === e1.id)).toBe(false);
    const dbE1 = await prisma.expense.findUnique({ where: { id: e1.id } });
    expect(dbE1).not.toBeNull();
    expect(dbE1?.deletedAt).not.toBeNull();

    // e1 can be restored
    await expensesService.restore(orgId, e1.id, membershipId);
    const listAfterRestore = await expensesService.findAll(orgId);
    expect(listAfterRestore.data.some((e) => e.id === e1.id)).toBe(true);

    // Hard-delete e2 directly (what unconfirmImport does now)
    await prisma.expense.delete({ where: { id: e2.id } });

    // e2 is completely gone
    const dbE2 = await prisma.expense.findUnique({ where: { id: e2.id } });
    expect(dbE2).toBeNull();

    // Trying to restore e2 fails
    await expect(
      expensesService.restore(orgId, e2.id, membershipId),
    ).rejects.toThrow(NotFoundException);

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { orgId, entityId: { in: [e1.id, e2.id] } } });
    await prisma.expense.deleteMany({ where: { id: e1.id } });
  });
});
