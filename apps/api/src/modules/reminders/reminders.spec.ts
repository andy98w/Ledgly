import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { RemindersService } from './reminders.service';

jest.setTimeout(60_000);

describe('RemindersService (integration)', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let service: RemindersService;
  let orgId: string;
  let otherOrgId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
      providers: [RemindersService],
    }).compile();

    prisma = module.get(PrismaService);
    service = module.get(RemindersService);
    await prisma.$connect();

    const org = await prisma.organization.create({
      data: { name: `rem-test-${Date.now()}` },
    });
    orgId = org.id;

    const otherOrg = await prisma.organization.create({
      data: { name: `rem-other-${Date.now()}` },
    });
    otherOrgId = otherOrg.id;
  }, 30_000);

  afterAll(async () => {
    await prisma.reminderRule.deleteMany({ where: { orgId: { in: [orgId, otherOrgId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgId, otherOrgId] } } });
    await prisma.$disconnect();
    await module.close();
  }, 15_000);

  afterEach(async () => {
    await prisma.reminderRule.deleteMany({ where: { orgId: { in: [orgId, otherOrgId] } } });
  });

  // ── CRUD ────────────────────────────────────────────────────────────

  describe('createRule', () => {
    it('creates a BEFORE_DUE rule', async () => {
      const rule = await service.createRule(orgId, { triggerType: 'BEFORE_DUE', daysOffset: 3 });
      expect(rule.triggerType).toBe('BEFORE_DUE');
      expect(rule.daysOffset).toBe(3);
      expect(rule.isActive).toBe(true);
      expect(rule.orgId).toBe(orgId);
    });

    it('creates an AFTER_DUE rule', async () => {
      const rule = await service.createRule(orgId, { triggerType: 'AFTER_DUE', daysOffset: 7 });
      expect(rule.triggerType).toBe('AFTER_DUE');
      expect(rule.daysOffset).toBe(7);
    });
  });

  describe('findAllRules', () => {
    it('returns rules scoped to org, sorted by isActive/triggerType/daysOffset', async () => {
      await service.createRule(orgId, { triggerType: 'AFTER_DUE', daysOffset: 7 });
      await service.createRule(orgId, { triggerType: 'BEFORE_DUE', daysOffset: 3 });
      await service.createRule(orgId, { triggerType: 'BEFORE_DUE', daysOffset: 1 });
      await service.createRule(otherOrgId, { triggerType: 'BEFORE_DUE', daysOffset: 5 });

      const rules = await service.findAllRules(orgId);
      expect(rules).toHaveLength(3);
      expect(rules.every((r) => r.orgId === orgId)).toBe(true);

      // All active (isActive desc), then AFTER_DUE after BEFORE_DUE (triggerType asc),
      // then by daysOffset asc
      expect(rules[0].triggerType).toBe('AFTER_DUE');
      expect(rules[1].triggerType).toBe('BEFORE_DUE');
      expect(rules[1].daysOffset).toBe(1);
      expect(rules[2].triggerType).toBe('BEFORE_DUE');
      expect(rules[2].daysOffset).toBe(3);
    });
  });

  describe('updateRule', () => {
    it('updates isActive only', async () => {
      const rule = await service.createRule(orgId, { triggerType: 'BEFORE_DUE', daysOffset: 3 });
      const updated = await service.updateRule(orgId, rule.id, { isActive: false });
      expect(updated.isActive).toBe(false);
      expect(updated.daysOffset).toBe(3);
    });

    it('updates daysOffset only', async () => {
      const rule = await service.createRule(orgId, { triggerType: 'AFTER_DUE', daysOffset: 7 });
      const updated = await service.updateRule(orgId, rule.id, { daysOffset: 14 });
      expect(updated.daysOffset).toBe(14);
      expect(updated.isActive).toBe(true);
    });
  });

  describe('deleteRule', () => {
    it('deletes a rule', async () => {
      const rule = await service.createRule(orgId, { triggerType: 'BEFORE_DUE', daysOffset: 3 });
      const result = await service.deleteRule(orgId, rule.id);
      expect(result).toEqual({ success: true });

      const rules = await service.findAllRules(orgId);
      expect(rules.find((r) => r.id === rule.id)).toBeUndefined();
    });
  });

  describe('cross-org access', () => {
    it('updateRule throws NotFoundException for other org rule', async () => {
      const rule = await service.createRule(otherOrgId, { triggerType: 'BEFORE_DUE', daysOffset: 3 });
      await expect(service.updateRule(orgId, rule.id, { isActive: false })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deleteRule throws NotFoundException for other org rule', async () => {
      const rule = await service.createRule(otherOrgId, { triggerType: 'AFTER_DUE', daysOffset: 5 });
      await expect(service.deleteRule(orgId, rule.id)).rejects.toThrow(NotFoundException);
    });
  });
});
