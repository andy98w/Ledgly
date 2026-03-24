import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditModule } from '../audit/audit.module';
import { AuditService } from '../audit/audit.service';
import { MembersModule } from '../members/members.module';
import { MembersService } from '../members/members.service';
import { ChargesModule } from '../charges/charges.module';
import { ChargesService } from '../charges/charges.service';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentsService } from '../payments/payments.service';
import { ExpensesModule } from '../expenses/expenses.module';
import { ExpensesService } from '../expenses/expenses.service';
import { EmailService } from '../auth/email.service';
import { AnnouncementsService } from '../announcements/announcements.service';
import { NotificationChannelsService } from '../notifications/notification-channels.service';
import { DigestSchedulerService } from '../reports/digest-scheduler.service';
import { GmailService } from '../gmail/gmail.service';
import { PlaidService } from '../plaid/plaid.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { AgentService } from './agent.service';

jest.setTimeout(60_000);

/**
 * Integration tests for AgentService.
 *
 * These test the confirm/executeWriteTool and executeReadTool paths using
 * a real database and real service instances. The Anthropic SDK is not called
 * because we test the service methods directly (chat streaming is covered
 * separately via mocking).
 */
describe('AgentService integration', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let agentService: AgentService;
  let chargesService: ChargesService;
  let membersService: MembersService;
  let paymentsService: PaymentsService;
  let orgId: string;
  let userId: string;
  let membershipId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuditModule,
        MembersModule,
        ChargesModule,
        PaymentsModule,
        ExpensesModule,
      ],
      providers: [
        AgentService,
        { provide: AnnouncementsService, useValue: { create: jest.fn(), findAll: jest.fn(), broadcast: jest.fn(), delete: jest.fn() } },
        { provide: NotificationChannelsService, useValue: { broadcastToOrg: jest.fn() } },
        { provide: DigestSchedulerService, useValue: {} },
        { provide: GmailService, useValue: { syncEmails: jest.fn() } },
        { provide: PlaidService, useValue: { syncTransactions: jest.fn() } },
        { provide: OrganizationsService, useValue: { getCustomColumns: jest.fn().mockResolvedValue([]), updateCustomColumns: jest.fn(), updateCustomField: jest.fn() } },
      ],
    })
      .overrideProvider(EmailService)
      .useValue({ sendAdminInvitation: jest.fn(), sendMagicLink: jest.fn(), sendChargeNotification: jest.fn() })
      .compile();

    prisma = module.get(PrismaService);
    await prisma.$connect();

    agentService = module.get(AgentService);
    chargesService = module.get(ChargesService);
    membersService = module.get(MembersService);
    paymentsService = module.get(PaymentsService);

    // Seed test org + admin
    const org = await prisma.organization.create({
      data: { name: `agent-test-${crypto.randomUUID()}` },
    });
    orgId = org.id;

    const user = await prisma.user.create({
      data: { email: `agent-${crypto.randomUUID()}@test.local`, name: 'Agent Admin' },
    });
    userId = user.id;

    const membership = await prisma.membership.create({
      data: { orgId, userId: user.id, role: 'ADMIN', status: 'ACTIVE', name: 'Agent Admin' },
    });
    membershipId = membership.id;
  }, 30_000);

  afterAll(async () => {
    // Clean up in dependency order
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await prisma.paymentAllocation.deleteMany({ where: { orgId } });
    await prisma.payment.deleteMany({ where: { orgId } });
    await prisma.charge.deleteMany({ where: { orgId } });
    await prisma.expense.deleteMany({ where: { orgId } });
    await prisma.membership.deleteMany({ where: { orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
    const userIds = [userId];
    // Also clean up any users created by add_members tests
    const allMemberships = await prisma.membership.findMany({
      where: { orgId },
      select: { userId: true },
    });
    for (const m of allMemberships) {
      if (m.userId) userIds.push(m.userId);
    }
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
    await module.close();
  }, 15_000);

  // ─── confirm: add_members ──────────────────────────────────

  it('confirm: add_members creates new members', async () => {
    const results = await agentService.confirm(orgId, membershipId, [
      {
        toolName: 'add_members',
        args: {
          members: [
            { name: 'Agent Test Alice' },
            { name: 'Agent Test Bob', role: 'MEMBER' },
          ],
        },
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].message).toContain('2 member');

    // Verify members actually exist
    const memberList = await membersService.findAll(orgId, { search: 'Agent Test' });
    const names = memberList.data.map((m: any) => m.name || m.user?.name);
    expect(names).toContain('Agent Test Alice');
    expect(names).toContain('Agent Test Bob');
  });

  // ─── confirm: create_charges ───────────────────────────────

  it('confirm: create_charges creates charges for members', async () => {
    // Get a member ID first
    const members = await membersService.findAll(orgId, { search: 'Agent Test Alice' });
    const aliceId = members.data[0]?.id;
    expect(aliceId).toBeTruthy();

    const results = await agentService.confirm(orgId, membershipId, [
      {
        toolName: 'create_charges',
        args: {
          membershipIds: [aliceId],
          category: 'DUES',
          title: 'Agent Spring Dues',
          amountCents: 5000,
        },
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);

    // Verify charge exists
    const charges = await chargesService.findAll(orgId, { membershipId: aliceId });
    const agentCharge = charges.data.find((c: any) => c.title === 'Agent Spring Dues');
    expect(agentCharge).toBeTruthy();
    expect(agentCharge!.amountCents).toBe(5000);
    expect(agentCharge!.status).toBe('OPEN');
  });

  // ─── confirm: create_expense ───────────────────────────────

  it('confirm: create_expense records an expense', async () => {
    const results = await agentService.confirm(orgId, membershipId, [
      {
        toolName: 'create_expense',
        args: {
          category: 'SUPPLIES',
          title: 'Agent Test Paper',
          amountCents: 1500,
          date: '2026-03-01',
          vendor: 'Office Store',
        },
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);

    const expense = await prisma.expense.findFirst({
      where: { orgId, title: 'Agent Test Paper' },
    });
    expect(expense).toBeTruthy();
    expect(expense!.amountCents).toBe(1500);
  });

  // ─── confirm: record_payments ──────────────────────────────

  it('confirm: record_payments creates payments', async () => {
    const results = await agentService.confirm(orgId, membershipId, [
      {
        toolName: 'record_payments',
        args: {
          payments: [
            { amountCents: 2500, paidAt: '2026-03-01', rawPayerName: 'Agent Test Alice' },
            { amountCents: 3000, paidAt: '2026-03-02', rawPayerName: 'Agent Test Bob' },
          ],
        },
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].message).toContain('2 payment');
  });

  // ─── confirm: void_charges ─────────────────────────────────

  it('confirm: void_charges voids charges', async () => {
    // Create a charge to void
    const members = await membersService.findAll(orgId, { search: 'Agent Test Alice' });
    const aliceId = members.data[0]?.id;

    const created = await chargesService.create(orgId, membershipId, {
      membershipIds: [aliceId],
      category: 'OTHER' as any,
      title: 'To Be Voided',
      amountCents: 999,
    });

    const results = await agentService.confirm(orgId, membershipId, [
      { toolName: 'void_charges', args: { chargeIds: [created[0].id] } },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);

    const charge = await prisma.charge.findUnique({ where: { id: created[0].id } });
    expect(charge?.status).toBe('VOID');
  });

  // ─── confirm: remove_members ───────────────────────────────

  it('confirm: remove_members removes members', async () => {
    // Create a throwaway member to remove
    const user = await prisma.user.create({
      data: { email: `remove-${crypto.randomUUID()}@test.local`, name: 'Remove Me' },
    });
    const m = await prisma.membership.create({
      data: { orgId, userId: user.id, role: 'MEMBER', status: 'ACTIVE', name: 'Remove Me' },
    });

    const results = await agentService.confirm(orgId, membershipId, [
      { toolName: 'remove_members', args: { memberIds: [m.id] } },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);

    // Cleanup user (membership already removed/soft-deleted by service)
    await prisma.auditLog.deleteMany({ where: { entityId: m.id } });
    await prisma.membership.deleteMany({ where: { id: m.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  // ─── confirm: import_csv (members type) ────────────────────

  it('confirm: import_csv imports member rows', async () => {
    const results = await agentService.confirm(orgId, membershipId, [
      {
        toolName: 'import_csv',
        args: {
          type: 'members',
          rows: [
            { name: 'CSV Import Charlie' },
            { name: 'CSV Import Diana', role: 'MEMBER' },
          ],
        },
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);

    const memberList = await membersService.findAll(orgId, { search: 'CSV Import' });
    const names = memberList.data.map((m: any) => m.name || m.user?.name);
    expect(names).toContain('CSV Import Charlie');
    expect(names).toContain('CSV Import Diana');
  });

  // ─── confirm: update_member ──────────────────────────────

  it('confirm: update_member updates a member name', async () => {
    // Create a member to update
    const user = await prisma.user.create({
      data: { email: `update-member-${crypto.randomUUID()}@test.local`, name: 'Before Update' },
    });
    const m = await prisma.membership.create({
      data: { orgId, userId: user.id, role: 'MEMBER', status: 'ACTIVE', name: 'Before Update' },
    });

    const results = await agentService.confirm(orgId, membershipId, [
      {
        toolName: 'update_member',
        args: { membershipId: m.id, name: 'After Update' },
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);

    const updated = await prisma.membership.findUnique({ where: { id: m.id } });
    expect(updated?.name).toBe('After Update');

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { entityId: m.id } });
    await prisma.membership.delete({ where: { id: m.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  // ─── confirm: update_charge ─────────────────────────────

  it('confirm: update_charge updates charge title and amount', async () => {
    const members = await membersService.findAll(orgId, { search: 'Agent Test Alice' });
    const aliceId = members.data[0]?.id;
    expect(aliceId).toBeTruthy();

    // Create a charge to update
    const created = await chargesService.create(orgId, membershipId, {
      membershipIds: [aliceId],
      category: 'OTHER' as any,
      title: 'Original Title',
      amountCents: 3000,
    });

    const results = await agentService.confirm(orgId, membershipId, [
      {
        toolName: 'update_charge',
        args: { chargeId: created[0].id, title: 'Updated Title', amountCents: 4000 },
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);

    const charge = await prisma.charge.findUnique({ where: { id: created[0].id } });
    expect(charge?.title).toBe('Updated Title');
    expect(charge?.amountCents).toBe(4000);
  });

  // ─── confirm: update_expense ────────────────────────────

  it('confirm: update_expense updates expense title', async () => {
    // Create an expense to update
    const expense = await prisma.expense.create({
      data: {
        orgId,
        category: 'SUPPLIES',
        title: 'Old Expense Title',
        amountCents: 2000,
        date: new Date('2026-03-01'),
        createdById: membershipId,
      },
    });

    const results = await agentService.confirm(orgId, membershipId, [
      {
        toolName: 'update_expense',
        args: { expenseId: expense.id, title: 'New Expense Title' },
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);

    const updated = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(updated?.title).toBe('New Expense Title');
  });

  // ─── confirm: delete_expenses ───────────────────────────

  it('confirm: delete_expenses soft-deletes an expense', async () => {
    // Create an expense to delete
    const expense = await prisma.expense.create({
      data: {
        orgId,
        category: 'FOOD',
        title: 'To Be Deleted',
        amountCents: 1000,
        date: new Date('2026-03-01'),
        createdById: membershipId,
      },
    });

    const results = await agentService.confirm(orgId, membershipId, [
      { toolName: 'delete_expenses', args: { expenseIds: [expense.id] } },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].details?.deletedCount).toBe(1);

    // Verify soft-deleted (deletedAt is set)
    const deleted = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(deleted?.deletedAt).toBeTruthy();
  });

  // ─── confirm: allocate_payment ──────────────────────────────

  it('confirm: allocate_payment allocates payment to charges', async () => {
    // Create a member, charge, and payment
    const members = await membersService.findAll(orgId, { search: 'Agent Test Alice' });
    const aliceId = members.data[0]?.id;
    expect(aliceId).toBeTruthy();

    const charges = await chargesService.create(orgId, membershipId, {
      membershipIds: [aliceId],
      category: 'DUES' as any,
      title: 'Allocate Test Charge',
      amountCents: 3000,
    });
    const chargeId = charges[0].id;

    const paymentResult = await paymentsService.bulkCreate(orgId, membershipId, [
      { amountCents: 3000, paidAt: '2026-03-01', rawPayerName: 'No Match Payer' },
    ]);
    const paymentId = paymentResult.created[0].id;

    const results = await agentService.confirm(orgId, membershipId, [
      {
        toolName: 'allocate_payment',
        args: {
          paymentId,
          allocations: [{ chargeId, amountCents: 3000 }],
        },
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);

    // Verify the charge is now paid
    const updatedCharge = await prisma.charge.findUnique({ where: { id: chargeId } });
    expect(updatedCharge?.status).toBe('PAID');
  });

  // ─── confirm: auto_allocate_payment ────────────────────────

  it('confirm: auto_allocate_payment auto-allocates payment', async () => {
    // Create a charge and payment for auto-allocation
    const members = await membersService.findAll(orgId, { search: 'Agent Test Alice' });
    const aliceId = members.data[0]?.id;
    expect(aliceId).toBeTruthy();

    const charges = await chargesService.create(orgId, membershipId, {
      membershipIds: [aliceId],
      category: 'DUES' as any,
      title: 'Auto Allocate Test',
      amountCents: 2000,
    });

    const paymentResult = await paymentsService.bulkCreate(orgId, membershipId, [
      { amountCents: 2000, paidAt: '2026-03-01', rawPayerName: 'Agent Test Alice' },
    ]);
    const paymentId = paymentResult.created[0].id;

    const results = await agentService.confirm(orgId, membershipId, [
      {
        toolName: 'auto_allocate_payment',
        args: { paymentId },
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
  });

  // ─── confirm: create_multi_charge ──────────────────────────

  it('confirm: create_multi_charge creates parent with children', async () => {
    const members = await membersService.findAll(orgId, { search: 'Agent Test' });
    const memberIds = members.data.slice(0, 2).map((m: any) => m.id);
    expect(memberIds.length).toBeGreaterThanOrEqual(2);

    const results = await agentService.confirm(orgId, membershipId, [
      {
        toolName: 'create_multi_charge',
        args: {
          membershipIds: memberIds,
          category: 'EVENT',
          title: 'Multi Charge Test',
          amountCents: 2500,
        },
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);

    // Verify parent charge exists
    const parentCharge = await prisma.charge.findFirst({
      where: { orgId, title: 'Multi Charge Test', parentId: null, membershipId: null },
    });
    expect(parentCharge).toBeTruthy();

    // Verify children
    const children = await prisma.charge.findMany({
      where: { parentId: parentCharge!.id },
    });
    expect(children.length).toBe(memberIds.length);
  });

  // ─── confirm: create_multi_expense ─────────────────────────

  it('confirm: create_multi_expense creates parent with line items', async () => {
    const results = await agentService.confirm(orgId, membershipId, [
      {
        toolName: 'create_multi_expense',
        args: {
          category: 'FOOD',
          title: 'Multi Expense Test',
          date: '2026-03-05',
          children: [
            { title: 'Cups', amountCents: 1500 },
            { title: 'Plates', amountCents: 2000 },
          ],
        },
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);

    // Verify parent expense
    const parentExpense = await prisma.expense.findFirst({
      where: { orgId, title: 'Multi Expense Test', parentId: null },
    });
    expect(parentExpense).toBeTruthy();
    expect(parentExpense!.amountCents).toBe(3500); // 1500 + 2000

    // Verify children
    const children = await prisma.expense.findMany({
      where: { parentId: parentExpense!.id },
    });
    expect(children.length).toBe(2);
  });

  // ─── confirm: multiple actions in one batch ────────────────

  it('confirm: executes multiple actions and returns per-action results', async () => {
    const results = await agentService.confirm(orgId, membershipId, [
      {
        toolName: 'add_members',
        args: { members: [{ name: 'Batch Member Eve' }] },
      },
      {
        toolName: 'create_expense',
        args: {
          category: 'FOOD',
          title: 'Batch Pizza',
          amountCents: 4500,
          date: '2026-03-03',
        },
      },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[0].toolName).toBe('add_members');
    expect(results[1].success).toBe(true);
    expect(results[1].toolName).toBe('create_expense');
  });

  // ─── confirm: handles errors gracefully ────────────────────

  it('confirm: handles nonexistent charge IDs gracefully', async () => {
    // bulkVoid silently skips nonexistent IDs (voidedCount=0)
    const results = await agentService.confirm(orgId, membershipId, [
      {
        toolName: 'void_charges',
        args: { chargeIds: ['nonexistent-charge-id'] },
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].details).toEqual({ success: true, voidedCount: 0 });
  });

  it('confirm: returns failure for unknown tool name', async () => {
    const results = await agentService.confirm(orgId, membershipId, [
      { toolName: 'nonexistent_tool', args: {} },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('Unknown write tool');
  });
});
