import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { createTestContext, cleanupTestContext, TestContext } from '../../test/test-helpers';

jest.setTimeout(30_000);

describe('OWNER role — hierarchy & transfer', () => {
  let ctx: TestContext;
  let ownerUserId: string;
  let ownerMembershipId: string;
  let adminUserId: string;
  let adminMembershipId: string;
  let memberUserId: string;
  let memberMembershipId: string;
  let admin2UserId: string;
  let admin2MembershipId: string;

  beforeAll(async () => {
    ctx = await createTestContext();

    // Promote the default test membership to OWNER
    await ctx.prisma.membership.update({
      where: { id: ctx.membershipId },
      data: { role: 'OWNER' },
    });
    ownerUserId = ctx.userId;
    ownerMembershipId = ctx.membershipId;

    // Create an ADMIN member
    const adminUser = await ctx.prisma.user.create({
      data: { email: `admin-owner-test-${Date.now()}@test.local`, name: 'Test Admin' },
    });
    adminUserId = adminUser.id;
    const adminMembership = await ctx.prisma.membership.create({
      data: { orgId: ctx.orgId, userId: adminUserId, role: 'ADMIN', status: 'ACTIVE', name: 'Test Admin' },
    });
    adminMembershipId = adminMembership.id;

    // Create a second ADMIN
    const admin2User = await ctx.prisma.user.create({
      data: { email: `admin2-owner-test-${Date.now()}@test.local`, name: 'Test Admin 2' },
    });
    admin2UserId = admin2User.id;
    const admin2Membership = await ctx.prisma.membership.create({
      data: { orgId: ctx.orgId, userId: admin2UserId, role: 'ADMIN', status: 'ACTIVE', name: 'Test Admin 2' },
    });
    admin2MembershipId = admin2Membership.id;

    // Create a MEMBER
    const memberUser = await ctx.prisma.user.create({
      data: { email: `member-owner-test-${Date.now()}@test.local`, name: 'Test Member' },
    });
    memberUserId = memberUser.id;
    const memberMembership = await ctx.prisma.membership.create({
      data: { orgId: ctx.orgId, userId: memberUserId, role: 'MEMBER', status: 'ACTIVE', name: 'Test Member' },
    });
    memberMembershipId = memberMembership.id;
  }, 30_000);

  afterAll(async () => {
    await cleanupTestContext(ctx);
  }, 15_000);

  // ── OWNER can remove ADMIN ────────────────────────────────────

  describe('OWNER removing members', () => {
    let removableMembershipId: string;
    let removableUserId: string;

    beforeAll(async () => {
      const u = await ctx.prisma.user.create({
        data: { email: `removable-${Date.now()}@test.local`, name: 'Removable Admin' },
      });
      removableUserId = u.id;
      const m = await ctx.prisma.membership.create({
        data: { orgId: ctx.orgId, userId: u.id, role: 'ADMIN', status: 'ACTIVE', name: 'Removable Admin' },
      });
      removableMembershipId = m.id;
    });

    it('OWNER can remove an ADMIN', async () => {
      const result = await ctx.membersService.remove(ctx.orgId, removableMembershipId, ownerMembershipId);
      expect(result.success).toBe(true);

      const removed = await ctx.prisma.membership.findUnique({ where: { id: removableMembershipId } });
      expect(removed?.status).toBe('LEFT');
    });

    it('OWNER can remove a regular MEMBER', async () => {
      // Create a throwaway member
      const u = await ctx.prisma.user.create({
        data: { email: `removable-member-${Date.now()}@test.local`, name: 'Removable Member' },
      });
      const m = await ctx.prisma.membership.create({
        data: { orgId: ctx.orgId, userId: u.id, role: 'MEMBER', status: 'ACTIVE', name: 'Removable Member' },
      });

      const result = await ctx.membersService.remove(ctx.orgId, m.id, ownerMembershipId);
      expect(result.success).toBe(true);
    });
  });

  // ── OWNER cannot be removed ───────────────────────────────────

  describe('OWNER protection', () => {
    it('OWNER cannot be removed by an ADMIN', async () => {
      await expect(
        ctx.membersService.remove(ctx.orgId, ownerMembershipId, adminMembershipId),
      ).rejects.toThrow(BadRequestException);
    });

    it('OWNER cannot be removed by self', async () => {
      await expect(
        ctx.membersService.remove(ctx.orgId, ownerMembershipId, ownerMembershipId),
      ).rejects.toThrow(BadRequestException);
    });

    it('OWNER role cannot be changed via update (must use transfer)', async () => {
      await expect(
        ctx.membersService.update(ctx.orgId, ownerMembershipId, { role: 'ADMIN' }, adminMembershipId),
      ).rejects.toThrow(BadRequestException);
    });

    it('cannot promote to OWNER via update', async () => {
      await expect(
        ctx.membersService.update(ctx.orgId, adminMembershipId, { role: 'OWNER' as any }, ownerMembershipId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── ADMIN cannot remove/demote other ADMINs ──────────────────

  describe('ADMIN hierarchy enforcement', () => {
    it('ADMIN cannot remove another ADMIN', async () => {
      await expect(
        ctx.membersService.remove(ctx.orgId, admin2MembershipId, adminMembershipId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ADMIN cannot change another ADMIN role', async () => {
      await expect(
        ctx.membersService.update(ctx.orgId, admin2MembershipId, { role: 'MEMBER' }, adminMembershipId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ADMIN can remove a regular MEMBER', async () => {
      const u = await ctx.prisma.user.create({
        data: { email: `admin-removes-${Date.now()}@test.local`, name: 'Admin Removes Me' },
      });
      const m = await ctx.prisma.membership.create({
        data: { orgId: ctx.orgId, userId: u.id, role: 'MEMBER', status: 'ACTIVE', name: 'Admin Removes Me' },
      });

      const result = await ctx.membersService.remove(ctx.orgId, m.id, adminMembershipId);
      expect(result.success).toBe(true);
    });

    it('ADMIN can change a MEMBER role to TREASURER', async () => {
      const u = await ctx.prisma.user.create({
        data: { email: `admin-promotes-${Date.now()}@test.local`, name: 'Admin Promotes Me' },
      });
      const m = await ctx.prisma.membership.create({
        data: { orgId: ctx.orgId, userId: u.id, role: 'MEMBER', status: 'ACTIVE', name: 'Admin Promotes Me' },
      });

      const result = await ctx.membersService.update(ctx.orgId, m.id, { role: 'TREASURER' }, adminMembershipId);
      expect(result.role).toBe('TREASURER');
    });
  });

  // ── Self-demotion guard ───────────────────────────────────────

  describe('self-role-change prevention', () => {
    it('cannot change own role', async () => {
      await expect(
        ctx.membersService.update(ctx.orgId, adminMembershipId, { role: 'MEMBER' }, adminMembershipId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── Transfer ownership ────────────────────────────────────────

  describe('transferOwnership', () => {
    it('OWNER can transfer ownership to an ADMIN', async () => {
      const result = await ctx.membersService.transferOwnership(ctx.orgId, adminMembershipId, ownerMembershipId);
      expect(result.success).toBe(true);

      // Verify roles swapped
      const formerOwner = await ctx.prisma.membership.findUnique({ where: { id: ownerMembershipId } });
      const newOwner = await ctx.prisma.membership.findUnique({ where: { id: adminMembershipId } });
      expect(formerOwner?.role).toBe('ADMIN');
      expect(newOwner?.role).toBe('OWNER');

      // Transfer back for subsequent tests
      await ctx.membersService.transferOwnership(ctx.orgId, ownerMembershipId, adminMembershipId);
      const restored = await ctx.prisma.membership.findUnique({ where: { id: ownerMembershipId } });
      expect(restored?.role).toBe('OWNER');
    });

    it('OWNER can transfer ownership to a regular MEMBER', async () => {
      const result = await ctx.membersService.transferOwnership(ctx.orgId, memberMembershipId, ownerMembershipId);
      expect(result.success).toBe(true);

      const newOwner = await ctx.prisma.membership.findUnique({ where: { id: memberMembershipId } });
      expect(newOwner?.role).toBe('OWNER');

      // Transfer back
      await ctx.membersService.transferOwnership(ctx.orgId, ownerMembershipId, memberMembershipId);
    });

    it('non-OWNER cannot transfer ownership', async () => {
      await expect(
        ctx.membersService.transferOwnership(ctx.orgId, memberMembershipId, adminMembershipId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cannot transfer to self', async () => {
      await expect(
        ctx.membersService.transferOwnership(ctx.orgId, ownerMembershipId, ownerMembershipId),
      ).rejects.toThrow(BadRequestException);
    });

    it('cannot transfer to inactive member', async () => {
      const u = await ctx.prisma.user.create({
        data: { email: `inactive-transfer-${Date.now()}@test.local`, name: 'Inactive' },
      });
      const m = await ctx.prisma.membership.create({
        data: { orgId: ctx.orgId, userId: u.id, role: 'MEMBER', status: 'LEFT', name: 'Inactive' },
      });

      await expect(
        ctx.membersService.transferOwnership(ctx.orgId, m.id, ownerMembershipId),
      ).rejects.toThrow(NotFoundException);
    });

    it('cannot transfer to nonexistent member', async () => {
      await expect(
        ctx.membersService.transferOwnership(ctx.orgId, 'nonexistent-id', ownerMembershipId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── Org creation assigns OWNER ────────────────────────────────

  describe('org creation', () => {
    let newOrgId: string;
    let creatorUserId: string;

    it('creator gets OWNER role', async () => {
      const u = await ctx.prisma.user.create({
        data: { email: `org-creator-${Date.now()}@test.local`, name: 'Org Creator' },
      });
      creatorUserId = u.id;

      const org = await ctx.organizationsService.create(u.id, { name: `owner-test-org-${Date.now()}` });
      newOrgId = org.id;

      expect(org.membership.role).toBe('OWNER');
    });

    afterAll(async () => {
      if (newOrgId) {
        await ctx.prisma.auditLog.deleteMany({ where: { orgId: newOrgId } });
        await ctx.prisma.membership.deleteMany({ where: { orgId: newOrgId } });
        await ctx.prisma.organization.delete({ where: { id: newOrgId } });
      }
      if (creatorUserId) {
        await ctx.prisma.user.deleteMany({ where: { id: creatorUserId } });
      }
    });
  });
});
