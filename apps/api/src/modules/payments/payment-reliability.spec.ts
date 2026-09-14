import {PrismaService} from '../../prisma/prisma.service';
import {PaymentsService} from './payments.service';
import {ChargesService} from '../charges/charges.service';

// This suite must never inherit an application's real database URL.
const url = new URL(process.env.DATABASE_URL || 'http://invalid');
if (!['localhost','127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('/ledgly_test')) {
  throw new Error('Use a disposable localhost ledgly_test database');
}

describe('PostgreSQL payment reliability', () => {
  const db = new PrismaService();
  let failAudit = false;
  db.$use(async (params, next) => {
    if (failAudit && params.model === 'AuditLog' && params.action === 'create') {
      throw new Error('Injected audit failure');
    }
    return next(params);
  });
  const audit = {logCreate:jest.fn(),logUpdate:jest.fn()};
  const charges = new ChargesService(db, audit as any, {} as any, {} as any);
  const service = new PaymentsService(db, charges, {} as any, audit as any, {} as any);
  let orgId:string,actor:string,otherOrg:string,otherActor:string;
  const dto = {amountCents:1000,paidAt:'2026-09-11',rawPayerName:'Synthetic fixture'};
  beforeAll(async()=>{
    await db.$connect();
    orgId=(await db.organization.create({data:{name:'Reliability fixture'}})).id;
    otherOrg=(await db.organization.create({data:{name:'Other fixture'}})).id;
    actor=(await db.membership.create({data:{orgId,name:'Tester',role:'ADMIN',status:'ACTIVE'}})).id;
    otherActor=(await db.membership.create({data:{orgId:otherOrg,name:'Other',role:'ADMIN',status:'ACTIVE'}})).id;
  });
  afterAll(async()=>{
    await db.paymentAllocation.deleteMany({where:{orgId:{in:[orgId,otherOrg]}}});
    await db.payment.deleteMany({where:{orgId:{in:[orgId,otherOrg]}}});
    await db.charge.deleteMany({where:{orgId:{in:[orgId,otherOrg]}}});
    await db.auditLog.deleteMany({where:{orgId:{in:[orgId,otherOrg]}}});
    await db.membership.deleteMany({where:{orgId:{in:[orgId,otherOrg]}}});
    await db.organization.deleteMany({where:{id:{in:[orgId,otherOrg]}}});
    await db.$disconnect();
  });
  it('concurrent same-key requests commit one payment and one audit record',async()=>{
    const results=await Promise.all(Array.from({length:8},()=>service.create(orgId,actor,{...dto},'same-request-001')));
    expect(new Set(results.map(p=>p.id)).size).toBe(1);
    expect(results.every(p=>JSON.stringify(p)===JSON.stringify(results[0]))).toBe(true);
    expect(await db.payment.count({where:{orgId}})).toBe(1);
    expect(await db.auditLog.count({where:{orgId,entityType:'PAYMENT'}})).toBe(1);
    await expect(service.create(orgId,actor,{...dto,amountCents:2000},'same-request-001')).rejects.toThrow('different payment data');
    const freshService = new PaymentsService(db,charges,{} as any,audit as any,{} as any);
    expect(await freshService.create(orgId,actor,{...dto},'same-request-001')).toEqual(results[0]);
  });
  it('scopes keys and membership to the organization',async()=>{
    const other=await service.create(otherOrg,otherActor,{...dto},'same-request-001');
    expect(other.orgId).toBe(otherOrg);
    await expect(service.create(orgId,actor,{...dto,membershipId:otherActor},'bad-member-001')).rejects.toThrow('Invalid member');
  });
  it('rolls back payment and request record when the audit write fails',async()=>{
    const before = await db.payment.count({where:{orgId}});
    failAudit = true;
    try {
      await expect(service.create(orgId,actor,{...dto},'rollback-request-001')).rejects.toThrow('Injected audit failure');
    } finally { failAudit = false; }
    expect(await db.payment.count({where:{orgId}})).toBe(before);
    expect(await db.paymentRequest.count({where:{orgId,requestKey:'rollback-request-001'}})).toBe(0);
    const payment = await service.create(orgId,actor,{...dto},'rollback-request-001');
    expect(payment.id).toBeTruthy();
  });
  it('rejects invalid dates, amounts, and keys',async()=>{
    await expect(service.create(orgId,actor,{...dto,paidAt:'2026-02-30'},'invalid-date-001')).rejects.toThrow();
    await expect(service.create(orgId,actor,{...dto,amountCents:-1},'invalid-cents-001')).rejects.toThrow();
    await expect(service.create(orgId,actor,{...dto},'x')).rejects.toThrow();
  });
  it('does not over-allocate a payment under concurrent requests',async()=>{
    const payment=await service.create(orgId,actor,{...dto},'allocation-request-001');
    const charge=await db.charge.create({data:{orgId,membershipId:actor,createdById:actor,category:'DUES',title:'Concurrent',amountCents:2000}});
    const requests=await Promise.allSettled(Array.from({length:2},()=>service.allocate(orgId,payment.id,actor,{allocations:[{chargeId:charge.id,amountCents:800}]})));
    expect(requests.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect((await db.paymentAllocation.aggregate({where:{paymentId:payment.id},_sum:{amountCents:true}}))._sum.amountCents).toBe(800);
    await expect(service.update(orgId,payment.id,{amountCents:100},actor)).rejects.toThrow('below allocated');
    await expect(service.allocate(orgId,payment.id,actor,{allocations:[{chargeId:charge.id,amountCents:-100}]})).rejects.toThrow();
  });
  it('does not overpay one charge from two payments',async()=>{
    const [a,b]=await Promise.all(['charge-a-001','charge-b-001'].map(key=>service.create(orgId,actor,{...dto},key)));
    const charge=await db.charge.create({data:{orgId,membershipId:actor,createdById:actor,category:'DUES',title:'Shared charge',amountCents:1000}});
    const results=await Promise.allSettled([a,b].map(p=>service.allocate(orgId,p.id,actor,{allocations:[{chargeId:charge.id,amountCents:800}]})));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect((await db.paymentAllocation.aggregate({where:{chargeId:charge.id},_sum:{amountCents:true}}))._sum.amountCents).toBe(800);
    await expect(service.allocate(otherOrg,a.id,otherActor,{allocations:[{chargeId:charge.id,amountCents:100}]})).rejects.toThrow();
  });
});
