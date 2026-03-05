import { ConflictException } from '@nestjs/common';
import { createTestContext, cleanupTestContext, TestContext } from '../../test/test-helpers';

jest.setTimeout(30_000);

describe('Organization create — name uniqueness (integration)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  }, 30_000);

  afterAll(async () => {
    await cleanupTestContext(ctx);
  }, 15_000);

  it('creates an org with a unique name', async () => {
    const name = `Unique Org ${Date.now()}`;
    const org = await ctx.organizationsService.create(ctx.userId, { name });

    expect(org.id).toBeDefined();
    expect(org.name).toBe(name);

    // Cleanup
    await ctx.prisma.membership.deleteMany({ where: { orgId: org.id } });
    await ctx.prisma.organization.delete({ where: { id: org.id } });
  });

  it('throws ConflictException when user already has membership with same name', async () => {
    // The test context already created an org for ctx.userId
    const existingOrg = await ctx.prisma.organization.findUnique({ where: { id: ctx.orgId } });

    await expect(
      ctx.organizationsService.create(ctx.userId, { name: existingOrg!.name }),
    ).rejects.toThrow(ConflictException);
  });

  it('throws ConflictException for case-insensitive name match', async () => {
    const existingOrg = await ctx.prisma.organization.findUnique({ where: { id: ctx.orgId } });

    await expect(
      ctx.organizationsService.create(ctx.userId, { name: existingOrg!.name.toUpperCase() }),
    ).rejects.toThrow(ConflictException);
  });

  it('allows same org name for a different user', async () => {
    const otherUser = await ctx.prisma.user.create({
      data: { email: `other-${Date.now()}@test.local`, name: 'Other User' },
    });

    const existingOrg = await ctx.prisma.organization.findUnique({ where: { id: ctx.orgId } });
    const org = await ctx.organizationsService.create(otherUser.id, { name: existingOrg!.name });

    expect(org.id).toBeDefined();

    // Cleanup
    await ctx.prisma.membership.deleteMany({ where: { orgId: org.id } });
    await ctx.prisma.organization.delete({ where: { id: org.id } });
    await ctx.prisma.user.delete({ where: { id: otherUser.id } });
  });

  it('allows creating org after user leaves the same-named org', async () => {
    // Create first org
    const name = `Rejoin Test ${Date.now()}`;
    const org1 = await ctx.organizationsService.create(ctx.userId, { name });

    // Mark user's membership as LEFT
    await ctx.prisma.membership.updateMany({
      where: { orgId: org1.id, userId: ctx.userId },
      data: { status: 'LEFT' },
    });

    // Should now allow creating another org with the same name
    const org2 = await ctx.organizationsService.create(ctx.userId, { name });
    expect(org2.id).toBeDefined();

    // Cleanup
    await ctx.prisma.membership.deleteMany({ where: { orgId: org1.id } });
    await ctx.prisma.organization.delete({ where: { id: org1.id } });
    await ctx.prisma.membership.deleteMany({ where: { orgId: org2.id } });
    await ctx.prisma.organization.delete({ where: { id: org2.id } });
  });
});
