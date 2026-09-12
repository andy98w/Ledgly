import { PrismaService } from '../../prisma/prisma.service';
import { DurableJobsService } from './durable-jobs.service';
import { runOne } from './durable-worker';
import { PaymentsService } from '../payments/payments.service';
import { ChargesService } from '../charges/charges.service';

const url = new URL(process.env.DATABASE_URL || 'http://invalid');
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/ledgly_test') {
  throw new Error('Use a disposable localhost ledgly_test database');
}

describe('Durable jobs on PostgreSQL', () => {
  const db = new PrismaService();
  const queue = new DurableJobsService(db);
  let org: string, other: string, actor: string;
  beforeAll(async () => {
    await db.$connect();
    org = (await db.organization.create({data:{name:'Jobs fixture'}})).id;
    other = (await db.organization.create({data:{name:'Other jobs fixture'}})).id;
    actor = (await db.membership.create({data:{orgId:org,name:'Fixture',role:'ADMIN',status:'ACTIVE'}})).id;
  });
  beforeEach(async () => { await db.$executeRaw`DELETE FROM durable_jobs WHERE org_id IN (${org}, ${other})`; });
  afterAll(async () => {
    await db.payment.deleteMany({where:{orgId:org}});
    await db.auditLog.deleteMany({where:{orgId:org}});
    await db.membership.deleteMany({where:{orgId:org}});
    await db.organization.deleteMany({where:{id:{in:[org,other]}}});
    await db.$disconnect();
  });
  const expire = (id: string) => db.$executeRaw`UPDATE durable_jobs SET lease_until=now()-interval '1 second' WHERE id=${id}`;
  it('deduplicates enqueue and rejects changed payloads, scoped to tenant', async () => {
    const ids = await Promise.all(Array.from({length:8}, () => queue.enqueue(org,'same-job-001',{a:1,b:2})));
    expect(new Set(ids).size).toBe(1);
    expect(await queue.enqueue(org,'same-job-001',{b:2,a:1})).toBe(ids[0]);
    await expect(queue.enqueue(org,'same-job-001',{a:2})).rejects.toThrow('different payload');
    expect(await queue.enqueue(other,'same-job-001',{a:1,b:2})).not.toBe(ids[0]);
  });
  it('competing workers claim distinct jobs', async () => {
    for (let i=0;i<8;i++) await queue.enqueue(org,`parallel-${i}`,{});
    const jobs = await Promise.all(Array.from({length:12}, () => new DurableJobsService(db).claim()));
    const claimed = jobs.filter(Boolean);
    expect(claimed).toHaveLength(8);
    expect(new Set(claimed.map(j=>j!.id)).size).toBe(8);
  });
  it('reclaims a crashed worker and fences stale acknowledgements', async () => {
    const id = await queue.enqueue(org,'crash-job-001',{});
    const old = (await queue.claim())!;
    await expire(id);
    expect(await queue.renew(old)).toBe(false);
    const fresh = (await new DurableJobsService(db).claim())!;
    expect(fresh.id).toBe(id);
    expect(fresh.attempts).toBe(2);
    expect(await queue.complete(old)).toBe(false);
    expect(await queue.fail(old)).toBe(false);
    expect(await queue.complete(fresh)).toBe(true);
  });
  it('retries transient failures, exhausts attempts and scopes manual replay', async () => {
    const id = await queue.enqueue(org,'retry-job-001',{});
    for (let i=0;i<5;i++) {
      expect(await runOne(queue, async()=>{throw new Error('provider unavailable');})).toBe('retry-or-failed');
      expect(await queue.claim()).toBeNull();
      await db.$executeRaw`UPDATE durable_jobs SET available_at=now() WHERE id=${id}`;
    }
    expect(await queue.replay(other,id)).toBe(false);
    expect(await queue.replay(org,id)).toBe(true);
    expect(await runOne(queue,async()=>{})).toBe('succeeded');
    expect(await queue.replay(org,id)).toBe(false);
  });
  it('marks a crashed final attempt failed', async () => {
    const id = await queue.enqueue(org,'exhaust-job-001',{});
    await db.$executeRaw`UPDATE durable_jobs SET attempts=4 WHERE id=${id}`;
    await queue.claim(); await expire(id);
    expect(await queue.claim()).toBeNull();
    expect(await queue.replay(org,id)).toBe(true);
  });
  it('a payment committed before a crash is not duplicated after redelivery', async () => {
    const audit = {logCreate:jest.fn(),logUpdate:jest.fn()};
    const charges = new ChargesService(db,audit as any,{} as any,{} as any);
    const payments = new PaymentsService(db,charges,{} as any,audit as any,{} as any);
    const dto = {amountCents:1000,paidAt:'2026-09-12',rawPayerName:'Synthetic job'};
    const id = await queue.enqueue(org,'payment-job-001',dto);
    const first = (await queue.claim())!;
    const payment = await payments.create(org,actor,dto,first.id);
    // Simulate abrupt exit after commit: no acknowledgement or failure callback.
    await expire(id);
    const restarted = new DurableJobsService(db);
    expect(await runOne(restarted,async job=>{
      const replay = await payments.create(job.org_id,actor,dto,job.id);
      expect(replay.id).toBe(payment.id);
    })).toBe('succeeded');
    expect(await db.payment.count({where:{orgId:org}})).toBe(1);
    expect(await db.auditLog.count({where:{orgId:org,entityType:'PAYMENT'}})).toBe(1);
  });
});
