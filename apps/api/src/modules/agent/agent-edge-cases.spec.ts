import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditModule } from '../audit/audit.module';
import { MembersModule } from '../members/members.module';
import { MembersService } from '../members/members.service';
import { ChargesModule } from '../charges/charges.module';
import { PaymentsModule } from '../payments/payments.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { EmailService } from '../auth/email.service';
import { AgentService } from './agent.service';

jest.setTimeout(30_000);

describe('AgentService edge cases', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let agentService: AgentService;
  let membersService: MembersService;
  let orgId: string;
  let adminUserId: string;
  let adminMembershipId: string;

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
      providers: [AgentService],
    })
      .overrideProvider(EmailService)
      .useValue({ sendAdminInvitation: jest.fn(), sendMagicLink: jest.fn() })
      .compile();

    prisma = module.get(PrismaService);
    await prisma.$connect();
    agentService = module.get(AgentService);
    membersService = module.get(MembersService);

    const org = await prisma.organization.create({
      data: { name: `edge-test-${Date.now()}` },
    });
    orgId = org.id;

    const user = await prisma.user.create({
      data: { email: `edge-${Date.now()}@test.local`, name: 'Edge Admin' },
    });
    adminUserId = user.id;

    const membership = await prisma.membership.create({
      data: { orgId, userId: user.id, role: 'ADMIN', status: 'ACTIVE', name: 'Edge Admin' },
    });
    adminMembershipId = membership.id;
  }, 30_000);

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await prisma.paymentAllocation.deleteMany({ where: { orgId } });
    await prisma.payment.deleteMany({ where: { orgId } });
    await prisma.charge.deleteMany({ where: { orgId } });
    await prisma.expense.deleteMany({ where: { orgId } });
    await prisma.membership.deleteMany({ where: { orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.user.deleteMany({ where: { id: adminUserId } });
    await prisma.$disconnect();
    await module.close();
  }, 15_000);

  // ─── Negative / zero amounts ──────────────────────────────

  it('rejects negative amountCents for charges', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      {
        toolName: 'create_charges',
        args: {
          membershipIds: [adminMembershipId],
          category: 'DUES',
          title: 'Negative Charge',
          amountCents: -5000,
        },
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('positive');
  });

  it('rejects zero amountCents for charges', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      {
        toolName: 'create_charges',
        args: {
          membershipIds: [adminMembershipId],
          category: 'DUES',
          title: 'Zero Charge',
          amountCents: 0,
        },
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('positive');
  });

  it('rejects negative amountCents for expenses', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      {
        toolName: 'create_expense',
        args: { category: 'SUPPLIES', title: 'Neg Expense', amountCents: -100, date: '2026-03-01' },
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('positive');
  });

  it('rejects negative amountCents in payments', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      {
        toolName: 'record_payments',
        args: {
          payments: [{ amountCents: -500, paidAt: '2026-03-01', rawPayerName: 'Test' }],
        },
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('positive');
  });

  // ─── Nonexistent member IDs ───────────────────────────────

  it('rejects charges for nonexistent member IDs', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      {
        toolName: 'create_charges',
        args: {
          membershipIds: ['nonexistent-id-1', 'nonexistent-id-2'],
          category: 'DUES',
          title: 'Ghost Charge',
          amountCents: 1000,
        },
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('invalid');
  });

  // ─── Admin protection ─────────────────────────────────────

  it('cannot remove the last admin via agent', async () => {
    // adminMembershipId is the only admin in this org
    // bulkRemove is graceful — swallows the "cannot remove yourself" error
    // and returns deletedCount: 0
    const results = await agentService.confirm(orgId, adminMembershipId, [
      { toolName: 'remove_members', args: { memberIds: [adminMembershipId] } },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].details?.deletedCount).toBe(0);

    // Verify admin is still active
    const admin = await prisma.membership.findUnique({ where: { id: adminMembershipId } });
    expect(admin?.status).toBe('ACTIVE');
  });

  it('cannot remove yourself via agent', async () => {
    // Create a second admin so the "last admin" guard doesn't fire first
    const user2 = await prisma.user.create({
      data: { email: `admin2-${Date.now()}@test.local`, name: 'Admin Two' },
    });
    const m2 = await prisma.membership.create({
      data: { orgId, userId: user2.id, role: 'ADMIN', status: 'ACTIVE', name: 'Admin Two' },
    });

    const results = await agentService.confirm(orgId, adminMembershipId, [
      { toolName: 'remove_members', args: { memberIds: [adminMembershipId] } },
    ]);

    expect(results).toHaveLength(1);
    // bulkRemove swallows individual errors but the actor self-removal check prevents it
    // The overall result still succeeds because bulkRemove is graceful — but deletedCount is 0
    expect(results[0].success).toBe(true);
    expect(results[0].details?.deletedCount).toBe(0);

    // Verify admin is still active
    const admin = await prisma.membership.findUnique({ where: { id: adminMembershipId } });
    expect(admin?.status).toBe('ACTIVE');

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { entityId: m2.id } });
    await prisma.membership.delete({ where: { id: m2.id } });
    await prisma.user.delete({ where: { id: user2.id } });
  });

  // ─── Empty arrays / missing fields ────────────────────────

  it('rejects empty members array', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      { toolName: 'add_members', args: { members: [] } },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('empty');
  });

  it('rejects member with empty name', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      { toolName: 'add_members', args: { members: [{ name: '' }] } },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('name');
  });

  it('rejects charge with empty title', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      {
        toolName: 'create_charges',
        args: { membershipIds: [adminMembershipId], category: 'DUES', title: '', amountCents: 1000 },
      },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('title');
  });

  it('rejects empty chargeIds array for void', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      { toolName: 'void_charges', args: { chargeIds: [] } },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('empty');
  });

  it('rejects empty payments array', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      { toolName: 'record_payments', args: { payments: [] } },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('empty');
  });

  it('rejects import_csv with invalid type', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      { toolName: 'import_csv', args: { type: 'users', rows: [{ name: 'test' }] } },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('type must be');
  });

  it('rejects import_csv with empty rows', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      { toolName: 'import_csv', args: { type: 'members', rows: [] } },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('empty');
  });

  // ─── Payment missing date ─────────────────────────────────

  it('rejects payment without paidAt date', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      {
        toolName: 'record_payments',
        args: { payments: [{ amountCents: 1000 }] },
      },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('paidAt');
  });

  // ─── Extremely large amounts ──────────────────────────────

  it('rejects charge exceeding $100,000', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      {
        toolName: 'create_charges',
        args: {
          membershipIds: [adminMembershipId],
          category: 'DUES',
          title: 'Huge',
          amountCents: 100_000_01, // $100,000.01
        },
      },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('cannot exceed');
  });

  it('rejects payment exceeding $100,000', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      {
        toolName: 'record_payments',
        args: { payments: [{ amountCents: 999_999_99, paidAt: '2026-03-01' }] },
      },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('cannot exceed');
  });

  it('rejects expense exceeding $100,000', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      {
        toolName: 'create_expense',
        args: { category: 'OTHER', title: 'Big', amountCents: 50_000_000, date: '2026-03-01' },
      },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('cannot exceed');
  });

  // ─── Fractional cents ─────────────────────────────────────

  it('rejects fractional amountCents', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      {
        toolName: 'create_charges',
        args: {
          membershipIds: [adminMembershipId],
          category: 'DUES',
          title: 'Fraction',
          amountCents: 50.5,
        },
      },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('whole number');
  });

  it('rejects Infinity amountCents', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      {
        toolName: 'create_charges',
        args: {
          membershipIds: [adminMembershipId],
          category: 'DUES',
          title: 'Inf',
          amountCents: Infinity,
        },
      },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('finite');
  });

  // ─── Invalid date formats ─────────────────────────────────

  it('rejects non-ISO date string for charge dueDate', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      {
        toolName: 'create_charges',
        args: {
          membershipIds: [adminMembershipId],
          category: 'DUES',
          title: 'Bad Date',
          amountCents: 1000,
          dueDate: 'March 15th',
        },
      },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('ISO format');
  });

  it('rejects garbage date for expense', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      {
        toolName: 'create_expense',
        args: { category: 'OTHER', title: 'Bad', amountCents: 100, date: 'not-a-date' },
      },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('ISO format');
  });

  it('rejects invalid date for payment paidAt', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      {
        toolName: 'record_payments',
        args: { payments: [{ amountCents: 1000, paidAt: 'yesterday' }] },
      },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('ISO format');
  });

  // ─── String length limits ─────────────────────────────────

  it('rejects charge title exceeding 500 chars', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      {
        toolName: 'create_charges',
        args: {
          membershipIds: [adminMembershipId],
          category: 'DUES',
          title: 'x'.repeat(501),
          amountCents: 1000,
        },
      },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('500 characters');
  });

  it('rejects member name exceeding 500 chars', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      {
        toolName: 'add_members',
        args: { members: [{ name: 'A'.repeat(501) }] },
      },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('500 characters');
  });

  // ─── update_member edge cases ───────────────────────────

  it('rejects update_member without membershipId', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      { toolName: 'update_member', args: { name: 'New Name' } },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('membershipId is required');
  });

  // ─── update_charge edge cases ──────────────────────────

  it('rejects update_charge without chargeId', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      { toolName: 'update_charge', args: { title: 'New Title' } },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('chargeId is required');
  });

  it('rejects update_charge with negative amountCents', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      { toolName: 'update_charge', args: { chargeId: 'some-id', amountCents: -500 } },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('positive');
  });

  // ─── update_expense edge cases ─────────────────────────

  it('rejects update_expense without expenseId', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      { toolName: 'update_expense', args: { title: 'New Title' } },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('expenseId is required');
  });

  it('rejects update_expense with invalid date', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      { toolName: 'update_expense', args: { expenseId: 'some-id', date: 'not-a-date' } },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('ISO format');
  });

  // ─── delete_expenses edge cases ────────────────────────

  it('rejects delete_expenses with empty array', async () => {
    const results = await agentService.confirm(orgId, adminMembershipId, [
      { toolName: 'delete_expenses', args: { expenseIds: [] } },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('empty');
  });

  it('rejects delete_expenses exceeding 200 batch size', async () => {
    const expenseIds = Array.from({ length: 201 }, (_, i) => `fake-expense-${i}`);
    const results = await agentService.confirm(orgId, adminMembershipId, [
      { toolName: 'delete_expenses', args: { expenseIds } },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('200');
  });

  // ─── Batch size limits ────────────────────────────────────

  it('rejects adding more than 200 members at once', async () => {
    const members = Array.from({ length: 201 }, (_, i) => ({ name: `Batch ${i}` }));
    const results = await agentService.confirm(orgId, adminMembershipId, [
      { toolName: 'add_members', args: { members } },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('200');
  });

  it('rejects CSV import exceeding 500 rows', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({ name: `Row ${i}` }));
    const results = await agentService.confirm(orgId, adminMembershipId, [
      { toolName: 'import_csv', args: { type: 'members', rows } },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('500');
  });

  it('rejects voiding more than 200 charges at once', async () => {
    const chargeIds = Array.from({ length: 201 }, (_, i) => `fake-id-${i}`);
    const results = await agentService.confirm(orgId, adminMembershipId, [
      { toolName: 'void_charges', args: { chargeIds } },
    ]);

    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain('200');
  });
});
