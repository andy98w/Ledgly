import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { AuditModule } from '../modules/audit/audit.module';
import { AuditService } from '../modules/audit/audit.service';
import { ChargesModule } from '../modules/charges/charges.module';
import { ChargesService } from '../modules/charges/charges.service';
import { PaymentsModule } from '../modules/payments/payments.module';
import { PaymentsService } from '../modules/payments/payments.service';
import { ExpensesModule } from '../modules/expenses/expenses.module';
import { ExpensesService } from '../modules/expenses/expenses.service';
import { MembersModule } from '../modules/members/members.module';
import { MembersService } from '../modules/members/members.service';
import { OrganizationsModule } from '../modules/organizations/organizations.module';
import { OrganizationsService } from '../modules/organizations/organizations.service';
import { EmailService } from '../modules/auth/email.service';

export interface TestContext {
  module: TestingModule;
  prisma: PrismaService;
  auditService: AuditService;
  chargesService: ChargesService;
  paymentsService: PaymentsService;
  expensesService: ExpensesService;
  membersService: MembersService;
  organizationsService: OrganizationsService;
  orgId: string;
  userId: string;
  membershipId: string;
}

export async function createTestContext(): Promise<TestContext> {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      PrismaModule,
      AuditModule,
      ChargesModule,
      PaymentsModule,
      ExpensesModule,
      MembersModule,
      OrganizationsModule,
    ],
  })
    .overrideProvider(EmailService)
    .useValue({ sendAdminInvitation: jest.fn(), sendMagicLink: jest.fn(), sendChargeNotification: jest.fn() })
    .compile();

  const prisma = module.get(PrismaService);
  await prisma.$connect();

  // Create a test org + user + membership
  const org = await prisma.organization.create({
    data: { name: `test-org-${Date.now()}` },
  });

  const user = await prisma.user.create({
    data: {
      email: `test-${Date.now()}@test.local`,
      name: 'Test User',
    },
  });

  const membership = await prisma.membership.create({
    data: {
      orgId: org.id,
      userId: user.id,
      role: 'ADMIN',
      status: 'ACTIVE',
      name: 'Test User',
    },
  });

  return {
    module,
    prisma,
    auditService: module.get(AuditService),
    chargesService: module.get(ChargesService),
    paymentsService: module.get(PaymentsService),
    expensesService: module.get(ExpensesService),
    membersService: module.get(MembersService),
    organizationsService: module.get(OrganizationsService),
    orgId: org.id,
    userId: user.id,
    membershipId: membership.id,
  };
}

export async function cleanupTestContext(ctx: TestContext) {
  const { prisma, orgId } = ctx;

  // Grab user IDs before deleting memberships
  const memberships = await prisma.membership.findMany({
    where: { orgId },
    select: { userId: true },
  });
  const userIds = memberships.map((m) => m.userId).filter((id): id is string => id !== null);

  // Delete in dependency order
  await prisma.auditLog.deleteMany({ where: { orgId } });
  await prisma.paymentAllocation.deleteMany({ where: { orgId } });
  await prisma.payment.deleteMany({ where: { orgId } });
  await prisma.charge.deleteMany({ where: { orgId } });
  await prisma.expense.deleteMany({ where: { orgId } });
  await prisma.membership.deleteMany({ where: { orgId } });
  await prisma.organization.delete({ where: { id: orgId } });

  // Clean up test users
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  await prisma.$disconnect();
  await ctx.module.close();
}
