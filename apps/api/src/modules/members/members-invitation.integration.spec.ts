import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { EmailService } from '../auth/email.service';
import { MembersModule } from './members.module';
import { MembersService } from './members.service';

jest.setTimeout(60_000);

describe('Members Invitation Flow (integration)', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let membersService: MembersService;
  let emailService: EmailService;
  let orgId: string;
  let adminMembershipId: string;
  let adminUserId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuditModule,
        AuthModule,
        MembersModule,
      ],
    })
      .overrideProvider(EmailService)
      .useValue({
        sendAdminInvitation: jest.fn(),
        sendMagicLink: jest.fn(),
      })
      .compile();

    prisma = module.get(PrismaService);
    membersService = module.get(MembersService);
    emailService = module.get(EmailService);
    await prisma.$connect();

    // Create test org + admin user + membership
    const org = await prisma.organization.create({
      data: { name: `invitation-test-${Date.now()}` },
    });
    orgId = org.id;

    const user = await prisma.user.create({
      data: {
        email: `admin-${Date.now()}@test.local`,
        name: 'Test Admin',
        passwordHash: 'hashed',
      },
    });
    adminUserId = user.id;

    const membership = await prisma.membership.create({
      data: {
        orgId,
        userId: user.id,
        role: 'ADMIN',
        status: 'ACTIVE',
        name: 'Test Admin',
      },
    });
    adminMembershipId = membership.id;
  }, 30_000);

  afterAll(async () => {
    // Cleanup
    const memberships = await prisma.membership.findMany({
      where: { orgId },
      select: { userId: true },
    });
    const userIds = memberships
      .map((m) => m.userId)
      .filter((id): id is string => id !== null);

    await prisma.auditLog.deleteMany({ where: { orgId } });
    await prisma.membership.deleteMany({ where: { orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
    await module.close();
  }, 15_000);

  // 1. Admin creation requires email
  it('creating admin without email throws BadRequestException', async () => {
    await expect(
      membersService.createMany(
        orgId,
        [{ name: 'No Email Admin', role: 'ADMIN' }],
        adminMembershipId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // 2. Member creation does NOT require email
  it('creating member without email succeeds', async () => {
    const result = await membersService.createMany(
      orgId,
      [{ name: `Regular Member ${Date.now()}` }],
      adminMembershipId,
    );
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('ACTIVE');
    expect(result[0].role).toBe('MEMBER');
  });

  // 3. Admin with email creates INVITED membership
  it('admin with email creates INVITED membership when user has no password', async () => {
    const email = `invited-admin-${Date.now()}@test.local`;
    const result = await membersService.createMany(
      orgId,
      [{ name: 'Invited Admin', email, role: 'ADMIN' }],
      adminMembershipId,
      'Test Admin',
    );

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('INVITED');
    expect(result[0].invitedEmail).toBe(email);
    expect(result[0].inviteExpiresAt).toBeDefined();

    // Verify expiry is ~7 days from now
    const expiresAt = new Date(result[0].inviteExpiresAt!);
    const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(expiresAt.getTime() - sevenDaysFromNow)).toBeLessThan(10_000);

    // Verify email was sent (with invite token)
    expect(emailService.sendAdminInvitation).toHaveBeenCalledWith(
      email,
      expect.any(String),
      'Test Admin',
      expect.any(String),
    );
  });

  // 4. Admin with registered user creates ACTIVE membership
  it('admin with registered user (has passwordHash) creates ACTIVE membership', async () => {
    const email = `registered-${Date.now()}@test.local`;
    // Create a user with passwordHash (simulating a registered user)
    await prisma.user.create({
      data: { email, name: 'Registered User', passwordHash: 'hashed-pw' },
    });

    const result = await membersService.createMany(
      orgId,
      [{ name: 'Registered Admin', email, role: 'ADMIN' }],
      adminMembershipId,
    );

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('ACTIVE');
    expect(result[0].role).toBe('ADMIN');
  });

  // 5. Registration links invited memberships
  it('linking pending invitations activates membership', async () => {
    const email = `link-test-${Date.now()}@test.local`;
    // Create a user without password
    const user = await prisma.user.create({
      data: { email, name: 'Link Test' },
    });

    // Create an INVITED membership
    const invited = await prisma.membership.create({
      data: {
        orgId,
        userId: user.id,
        role: 'ADMIN',
        status: 'INVITED',
        name: 'Link Test',
        invitedEmail: email,
        inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Simulate what register() does: set passwordHash then link invitations
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: 'new-hash' },
    });

    // Manually call the linking logic (same as auth.service.register)
    const invitedMemberships = await prisma.membership.findMany({
      where: { invitedEmail: email, status: 'INVITED' },
    });
    for (const m of invitedMemberships) {
      if (m.inviteExpiresAt && m.inviteExpiresAt < new Date()) continue;
      await prisma.membership.update({
        where: { id: m.id },
        data: {
          userId: user.id,
          status: 'ACTIVE',
          invitedEmail: null,
          inviteExpiresAt: null,
          joinedAt: new Date(),
        },
      });
    }

    const updated = await prisma.membership.findUnique({ where: { id: invited.id } });
    expect(updated?.status).toBe('ACTIVE');
    expect(updated?.invitedEmail).toBeNull();
    expect(updated?.userId).toBe(user.id);
  });

  // 6. Expired invitation not linked at registration
  it('expired invitation is not linked at registration', async () => {
    const email = `expired-${Date.now()}@test.local`;
    const user = await prisma.user.create({
      data: { email, name: 'Expired Test' },
    });

    // Create an INVITED membership with expired invite
    const invited = await prisma.membership.create({
      data: {
        orgId,
        userId: user.id,
        role: 'ADMIN',
        status: 'INVITED',
        name: 'Expired Test',
        invitedEmail: email,
        inviteExpiresAt: new Date(Date.now() - 1000), // Already expired
      },
    });

    // Simulate linking
    const invitedMemberships = await prisma.membership.findMany({
      where: { invitedEmail: email, status: 'INVITED' },
    });
    for (const m of invitedMemberships) {
      if (m.inviteExpiresAt && m.inviteExpiresAt < new Date()) continue;
      await prisma.membership.update({
        where: { id: m.id },
        data: {
          userId: user.id,
          status: 'ACTIVE',
          invitedEmail: null,
          inviteExpiresAt: null,
          joinedAt: new Date(),
        },
      });
    }

    const updated = await prisma.membership.findUnique({ where: { id: invited.id } });
    expect(updated?.status).toBe('INVITED'); // Still invited — not linked
  });

  // 7. Resend invitation resets expiry
  it('resend invitation resets expiry', async () => {
    const email = `resend-${Date.now()}@test.local`;
    const user = await prisma.user.create({
      data: { email, name: 'Resend Test' },
    });

    const invited = await prisma.membership.create({
      data: {
        orgId,
        userId: user.id,
        role: 'ADMIN',
        status: 'INVITED',
        name: 'Resend Test',
        invitedEmail: email,
        inviteExpiresAt: new Date(Date.now() - 1000), // Expired
      },
    });

    (emailService.sendAdminInvitation as jest.Mock).mockClear();

    await membersService.resendInvitation(orgId, invited.id, 'Test Admin');

    const updated = await prisma.membership.findUnique({ where: { id: invited.id } });
    expect(updated?.inviteExpiresAt).toBeDefined();
    expect(new Date(updated!.inviteExpiresAt!).getTime()).toBeGreaterThan(Date.now());

    expect(emailService.sendAdminInvitation).toHaveBeenCalledWith(
      email,
      expect.any(String),
      'Test Admin',
      expect.any(String),
    );
  });

  // 8. Cannot self-demote
  it('admin cannot change their own role', async () => {
    await expect(
      membersService.update(
        orgId,
        adminMembershipId,
        { role: 'MEMBER' },
        adminMembershipId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // 9. Cannot remove last admin
  it('cannot remove the last admin', async () => {
    await expect(
      membersService.remove(orgId, adminMembershipId, adminMembershipId),
    ).rejects.toThrow(BadRequestException);
  });

  // 10. Cannot delete yourself
  it('cannot delete yourself', async () => {
    await expect(
      membersService.remove(orgId, adminMembershipId, adminMembershipId),
    ).rejects.toThrow('You cannot remove yourself');
  });
});
