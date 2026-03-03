import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { createTestContext, cleanupTestContext, TestContext } from '../../test/test-helpers';

jest.setTimeout(30_000);

describe('Join Code (integration)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  }, 30_000);

  afterAll(async () => {
    await cleanupTestContext(ctx);
  }, 15_000);

  // ==================== generateJoinCode ====================

  it('generates a 6-char uppercase join code', async () => {
    const result = await ctx.organizationsService.generateJoinCode(ctx.orgId, ctx.membershipId);

    expect(result.joinCode).toBeDefined();
    expect(result.joinCode).toHaveLength(6);
    expect(result.joinCode).toMatch(/^[A-Z2-9]+$/);
    expect(result.joinCodeEnabled).toBe(true);

    // Verify no ambiguous characters
    expect(result.joinCode).not.toMatch(/[0OIL1]/);
  });

  it('regenerating join code produces a different code', async () => {
    const first = await ctx.organizationsService.generateJoinCode(ctx.orgId, ctx.membershipId);
    const second = await ctx.organizationsService.generateJoinCode(ctx.orgId, ctx.membershipId);

    // Codes should be different (extremely unlikely to collide with 30^6 space)
    expect(first.joinCode).not.toBe(second.joinCode);
  });

  it('generates audit log when creating join code', async () => {
    await ctx.organizationsService.generateJoinCode(ctx.orgId, ctx.membershipId);

    const logs = await ctx.prisma.auditLog.findMany({
      where: { orgId: ctx.orgId, entityType: 'ORG_SETTINGS', action: 'UPDATE' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    expect(logs.length).toBe(1);
    expect((logs[0].diffJson as any)?.joinCode?.to).toBe('generated');

    // Cleanup audit
    await ctx.prisma.auditLog.deleteMany({ where: { orgId: ctx.orgId, entityType: 'ORG_SETTINGS' } });
  });

  // ==================== resolveJoinCode ====================

  it('resolves a valid enabled join code', async () => {
    const { joinCode } = await ctx.organizationsService.generateJoinCode(ctx.orgId, ctx.membershipId);
    const resolved = await ctx.organizationsService.resolveJoinCode(joinCode!);

    expect(resolved.orgId).toBe(ctx.orgId);
    expect(resolved.orgName).toBeDefined();
  });

  it('resolves case-insensitively', async () => {
    const { joinCode } = await ctx.organizationsService.generateJoinCode(ctx.orgId, ctx.membershipId);
    const resolved = await ctx.organizationsService.resolveJoinCode(joinCode!.toLowerCase());

    expect(resolved.orgId).toBe(ctx.orgId);
  });

  it('throws NotFoundException for invalid code', async () => {
    await expect(
      ctx.organizationsService.resolveJoinCode('ZZZZZZ'),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException for disabled code', async () => {
    const { joinCode } = await ctx.organizationsService.generateJoinCode(ctx.orgId, ctx.membershipId);
    await ctx.organizationsService.updateJoinCodeSettings(ctx.orgId, { enabled: false }, ctx.membershipId);

    await expect(
      ctx.organizationsService.resolveJoinCode(joinCode!),
    ).rejects.toThrow(NotFoundException);

    // Re-enable for subsequent tests
    await ctx.organizationsService.updateJoinCodeSettings(ctx.orgId, { enabled: true }, ctx.membershipId);
  });

  // ==================== joinWithCode ====================

  describe('joinWithCode', () => {
    let joinerUserId: string;

    beforeAll(async () => {
      const user = await ctx.prisma.user.create({
        data: { email: `joiner-${Date.now()}@test.local`, name: 'Joiner User' },
      });
      joinerUserId = user.id;
    });

    afterAll(async () => {
      // Clean up memberships and user
      await ctx.prisma.auditLog.deleteMany({ where: { orgId: ctx.orgId, entityType: 'MEMBER' } });
      await ctx.prisma.membership.deleteMany({ where: { userId: joinerUserId } });
      await ctx.prisma.user.delete({ where: { id: joinerUserId } });
    });

    it('creates ACTIVE membership when requiresApproval is false', async () => {
      const { joinCode } = await ctx.organizationsService.generateJoinCode(ctx.orgId, ctx.membershipId);
      await ctx.organizationsService.updateJoinCodeSettings(ctx.orgId, { requiresApproval: false }, ctx.membershipId);

      const result = await ctx.organizationsService.joinWithCode(joinCode!, joinerUserId);

      expect(result.orgId).toBe(ctx.orgId);
      expect(result.status).toBe('ACTIVE');
      expect(result.membershipId).toBeDefined();

      // Clean up for next test
      await ctx.prisma.membership.deleteMany({ where: { userId: joinerUserId, orgId: ctx.orgId } });
    });

    it('creates PENDING membership when requiresApproval is true', async () => {
      const { joinCode } = await ctx.organizationsService.generateJoinCode(ctx.orgId, ctx.membershipId);
      await ctx.organizationsService.updateJoinCodeSettings(ctx.orgId, { requiresApproval: true }, ctx.membershipId);

      const result = await ctx.organizationsService.joinWithCode(joinCode!, joinerUserId);

      expect(result.status).toBe('PENDING');

      // Clean up
      await ctx.organizationsService.updateJoinCodeSettings(ctx.orgId, { requiresApproval: false }, ctx.membershipId);
      await ctx.prisma.membership.deleteMany({ where: { userId: joinerUserId, orgId: ctx.orgId } });
    });

    it('throws ConflictException for already-active member', async () => {
      const { joinCode } = await ctx.organizationsService.generateJoinCode(ctx.orgId, ctx.membershipId);
      await ctx.organizationsService.joinWithCode(joinCode!, joinerUserId);

      await expect(
        ctx.organizationsService.joinWithCode(joinCode!, joinerUserId),
      ).rejects.toThrow(ConflictException);

      await ctx.prisma.membership.deleteMany({ where: { userId: joinerUserId, orgId: ctx.orgId } });
    });

    it('reactivates a LEFT member', async () => {
      const { joinCode } = await ctx.organizationsService.generateJoinCode(ctx.orgId, ctx.membershipId);

      // First join, then leave
      await ctx.organizationsService.joinWithCode(joinCode!, joinerUserId);
      const membership = await ctx.prisma.membership.findFirst({ where: { userId: joinerUserId, orgId: ctx.orgId } });
      await ctx.prisma.membership.update({ where: { id: membership!.id }, data: { status: 'LEFT' } });

      // Re-join via code
      const result = await ctx.organizationsService.joinWithCode(joinCode!, joinerUserId);
      expect(result.status).toBe('ACTIVE');

      const reactivated = await ctx.prisma.membership.findFirst({ where: { userId: joinerUserId, orgId: ctx.orgId } });
      expect(reactivated?.status).toBe('ACTIVE');
      expect(reactivated?.leftAt).toBeNull();

      await ctx.prisma.membership.deleteMany({ where: { userId: joinerUserId, orgId: ctx.orgId } });
    });

    it('throws BadRequestException for disabled code', async () => {
      const { joinCode } = await ctx.organizationsService.generateJoinCode(ctx.orgId, ctx.membershipId);
      await ctx.organizationsService.updateJoinCodeSettings(ctx.orgId, { enabled: false }, ctx.membershipId);

      await expect(
        ctx.organizationsService.joinWithCode(joinCode!, joinerUserId),
      ).rejects.toThrow(BadRequestException);

      await ctx.organizationsService.updateJoinCodeSettings(ctx.orgId, { enabled: true }, ctx.membershipId);
    });

    it('creates audit log on join', async () => {
      const { joinCode } = await ctx.organizationsService.generateJoinCode(ctx.orgId, ctx.membershipId);
      const result = await ctx.organizationsService.joinWithCode(joinCode!, joinerUserId);

      const logs = await ctx.prisma.auditLog.findMany({
        where: { orgId: ctx.orgId, entityId: result.membershipId, action: 'CREATE', entityType: 'MEMBER' },
      });
      expect(logs.length).toBe(1);
      expect((logs[0].diffJson as any)?.new?.joinMethod).toBe('code');

      await ctx.prisma.membership.deleteMany({ where: { userId: joinerUserId, orgId: ctx.orgId } });
    });
  });

  // ==================== disableJoinCode ====================

  it('disableJoinCode removes code and sets enabled=false', async () => {
    await ctx.organizationsService.generateJoinCode(ctx.orgId, ctx.membershipId);
    await ctx.organizationsService.disableJoinCode(ctx.orgId, ctx.membershipId);

    const org = await ctx.prisma.organization.findUnique({ where: { id: ctx.orgId } });
    expect(org?.joinCode).toBeNull();
    expect(org?.joinCodeEnabled).toBe(false);
  });

  // ==================== updateJoinCodeSettings ====================

  it('toggles joinCodeEnabled', async () => {
    await ctx.organizationsService.generateJoinCode(ctx.orgId, ctx.membershipId);

    const disabled = await ctx.organizationsService.updateJoinCodeSettings(ctx.orgId, { enabled: false }, ctx.membershipId);
    expect(disabled.joinCodeEnabled).toBe(false);

    const enabled = await ctx.organizationsService.updateJoinCodeSettings(ctx.orgId, { enabled: true }, ctx.membershipId);
    expect(enabled.joinCodeEnabled).toBe(true);
  });

  it('toggles joinRequiresApproval', async () => {
    const on = await ctx.organizationsService.updateJoinCodeSettings(ctx.orgId, { requiresApproval: true }, ctx.membershipId);
    expect(on.joinRequiresApproval).toBe(true);

    const off = await ctx.organizationsService.updateJoinCodeSettings(ctx.orgId, { requiresApproval: false }, ctx.membershipId);
    expect(off.joinRequiresApproval).toBe(false);
  });

  // ==================== approve (members service) ====================

  describe('approve pending member', () => {
    let pendingUserId: string;
    let pendingMembershipId: string;

    beforeAll(async () => {
      const user = await ctx.prisma.user.create({
        data: { email: `pending-${Date.now()}@test.local`, name: 'Pending User' },
      });
      pendingUserId = user.id;

      // Create a PENDING membership directly
      const m = await ctx.prisma.membership.create({
        data: { orgId: ctx.orgId, userId: user.id, role: 'MEMBER', status: 'PENDING', name: 'Pending User' },
      });
      pendingMembershipId = m.id;
    });

    afterAll(async () => {
      await ctx.prisma.auditLog.deleteMany({ where: { orgId: ctx.orgId, entityId: pendingMembershipId } });
      await ctx.prisma.membership.deleteMany({ where: { id: pendingMembershipId } });
      await ctx.prisma.user.delete({ where: { id: pendingUserId } });
    });

    it('approves a PENDING member to ACTIVE', async () => {
      const result = await ctx.membersService.approve(ctx.orgId, pendingMembershipId, ctx.membershipId);
      expect(result.success).toBe(true);

      const membership = await ctx.prisma.membership.findUnique({ where: { id: pendingMembershipId } });
      expect(membership?.status).toBe('ACTIVE');
    });

    it('throws NotFoundException when approving non-PENDING member', async () => {
      // The member is now ACTIVE from the previous test
      await expect(
        ctx.membersService.approve(ctx.orgId, pendingMembershipId, ctx.membershipId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // Cleanup audit logs at the end
  afterAll(async () => {
    await ctx.prisma.auditLog.deleteMany({ where: { orgId: ctx.orgId, entityType: 'ORG_SETTINGS' } });
  }, 15_000);
});
