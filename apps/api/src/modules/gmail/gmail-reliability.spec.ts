import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../common/guards';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { GmailService } from './gmail.service';
import { DurableJobsService } from '../jobs/durable-jobs.service';
import { runOne } from '../jobs/durable-worker';
import { ChargesService } from '../charges/charges.service';
import { OutboxWorkerService } from '../notifications/outbox-worker.service';
import { JobsController } from '../jobs/jobs.controller';

const url=new URL(process.env.DATABASE_URL || 'http://invalid');
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/ledgly_test') throw new Error('Disposable local ledgly_test required');

describe('Gmail ingestion and notification outbox',()=>{
 const db=new PrismaService(); const queue=new DurableJobsService(db);
 const config=new ConfigService({DURABLE_GMAIL_ENABLED:'true'});
 const parsed={source:'venmo',direction:'incoming',amount:1234,payerName:'Fixture Payer',payerEmail:null,memo:null,transactionId:null};
 const parser={parseEmail:jest.fn(()=>({...parsed}))};
 const gmail=new GmailService(config,db,parser as any,{} as any,{} as any,new ChargesService(db,{} as any,{} as any,{} as any),{} as any,{} as any,queue);
 const provider={users:{messages:{list:jest.fn(),get:jest.fn()}}};
 let org:string,other:string,connection:string; let failAudit=false;
 const originalFetch=global.fetch;
 db.$use(async(params,next)=>{if(failAudit&&params.model==='AuditLog'&&params.action==='create')throw new Error('Injected audit failure');return next(params);});
 beforeAll(async()=>{
  await db.$connect();
  org=(await db.organization.create({data:{name:'Gmail fixture'}})).id;
  other=(await db.organization.create({data:{name:'Other Gmail fixture'}})).id;
  connection=(await db.gmailConnection.create({data:{orgId:org,email:'fixture@example.invalid',accessToken:'synthetic',refreshToken:'synthetic',tokenExpiresAt:new Date('2099-01-01')}})).id;
  jest.spyOn(gmail as any,'getGmailClient').mockResolvedValue(provider);
 });
 beforeEach(async()=>{
  await db.emailImport.deleteMany({where:{orgId:org}});
  await db.payment.deleteMany({where:{orgId:org}});await db.expense.deleteMany({where:{orgId:org}});
  await db.auditLog.deleteMany({where:{orgId:org}});await db.notification.deleteMany({where:{orgId:org}});
  await db.durableJob.deleteMany({where:{orgId:org}});
  await db.discordConnection.deleteMany({where:{orgId:org}});await db.slackConnection.deleteMany({where:{orgId:org}});
  parsed.direction='incoming';failAudit=false;
  provider.users.messages.list.mockReset();provider.users.messages.get.mockReset();
  provider.users.messages.get.mockResolvedValue({data:{payload:{headers:[{name:'Date',value:'2026-09-13T12:00:00Z'}]}}});
  global.fetch=jest.fn().mockRejectedValue(new Error('Unexpected network request'));
 });
 afterAll(async()=>{global.fetch=originalFetch;await db.organization.deleteMany({where:{id:{in:[org,other]}}});await db.$disconnect();});
 it('enqueues all pages, deduplicates redelivery and separates scan/message workers',async()=>{
  provider.users.messages.list.mockResolvedValueOnce({data:{messages:[{id:'m1'}],nextPageToken:'page2'}}).mockResolvedValueOnce({data:{messages:[{id:'m1'},{id:'m2'}]}});
  const queued=await gmail.requestSync(org);expect('queued' in queued && queued.queued).toBe(true);
  expect(await runOne(queue,j=>gmail.runScan(j.org_id,j.payload),'gmail-scan')).toBe('succeeded');
  expect(await runOne(queue,j=>gmail.runScan(j.org_id,j.payload),'gmail-scan')).toBe('succeeded');
  expect(await db.durableJob.count({where:{orgId:org,kind:'gmail-message'}})).toBe(2);
  expect(await queue.claim()).toBeNull();
  expect(provider.users.messages.list.mock.calls[1][0].pageToken).toBe('page2');
 });
 it('provider failure keeps the scan retryable instead of acknowledging success',async()=>{
  provider.users.messages.list.mockRejectedValue(new Error('offline'));
  await gmail.requestSync(org);
  expect(await runOne(queue,j=>gmail.runScan(j.org_id,j.payload),'gmail-scan')).toBe('retry-or-failed');
  expect(await db.durableJob.count({where:{orgId:org,status:'pending'}})).toBe(1);
 });
 it('concurrent incoming message delivery creates one payment, audit and notice',async()=>{
  await Promise.all(Array.from({length:5},()=>gmail.runMessage(org,{connectionId:connection,messageId:'incoming'})));
  expect(await db.payment.count({where:{orgId:org}})).toBe(1);
  expect(await db.emailImport.count({where:{orgId:org}})).toBe(1);
  expect(await db.auditLog.count({where:{orgId:org}})).toBe(1);
  expect(await db.notification.count({where:{orgId:org}})).toBe(1);
 });
 it('outgoing expense and import roll back together when audit fails',async()=>{
  parsed.direction='outgoing';failAudit=true;
  await expect(gmail.runMessage(org,{connectionId:connection,messageId:'outgoing'})).rejects.toThrow('Injected audit');
  expect(await db.expense.count({where:{orgId:org}})).toBe(0);expect(await db.emailImport.count({where:{orgId:org}})).toBe(0);
  failAudit=false;
  await Promise.all(Array.from({length:3},()=>gmail.runMessage(org,{connectionId:connection,messageId:'outgoing'})));
  expect(await db.expense.count({where:{orgId:org}})).toBe(1);expect(await db.emailImport.count({where:{orgId:org}})).toBe(1);
 });
 it('does not fetch messages for another tenant or disconnected connection',async()=>{
  await gmail.runMessage(other,{connectionId:connection,messageId:'foreign'});
  expect(provider.users.messages.get).not.toHaveBeenCalled();
  await expect(gmail.assertOwned(other,connection,'connection')).rejects.toThrow();
 });
 it('commits channel notices with payment and retries only failed destinations',async()=>{
  await db.discordConnection.create({data:{orgId:org,webhookUrl:'https://discord.com/api/webhooks/fixture/token'}});
  await db.slackConnection.create({data:{orgId:org,webhookUrl:'https://hooks.slack.com/services/fixture'}});
  failAudit=true;
  await expect(gmail.runMessage(org,{connectionId:connection,messageId:'notices'})).rejects.toThrow();
  expect(await db.durableJob.count({where:{orgId:org,kind:'notification'}})).toBe(0);
  failAudit=false;await gmail.runMessage(org,{connectionId:connection,messageId:'notices'});
  const worker=new OutboxWorkerService(db,queue,config);
  let discordFails=true;
  global.fetch=jest.fn(async(input)=>new Response(null,{status:String(input).includes('discord')&&discordFails?503:204}));
  await runOne(queue,j=>worker.deliver(j),'notification');await runOne(queue,j=>worker.deliver(j),'notification');
  expect(await db.durableJob.count({where:{orgId:org,kind:'notification',status:'succeeded'}})).toBe(1);
  discordFails=false;await db.durableJob.updateMany({where:{orgId:org,status:'pending'},data:{availableAt:new Date(0)}});
  expect(await runOne(queue,j=>worker.deliver(j),'notification')).toBe('succeeded');
  expect((global.fetch as jest.Mock).mock.calls.filter(c=>String(c[0]).includes('slack'))).toHaveLength(1);
  expect(await db.payment.count({where:{orgId:org}})).toBe(1);
 });
 it('replay is tenant scoped and audited',async()=>{
  const id=await queue.enqueue(org,'failed-scan-fixture',{connectionId:connection},'gmail-scan');
  await db.durableJob.update({where:{id},data:{status:'failed'}});
  const actor=await db.membership.create({data:{orgId:org,name:'Replay admin',role:'ADMIN',status:'ACTIVE'}});
  const controller=new JobsController(db);
  await expect(controller.replay(other,id,{membership:actor})).rejects.toThrow();
  expect(await controller.replay(org,id,{membership:actor})).toEqual({replayed:true});
  expect(await db.auditLog.count({where:{orgId:org,entityType:'JOB',action:'REPLAY'}})).toBe(1);
  await db.auditLog.deleteMany({where:{actorId:actor.id}});await db.membership.delete({where:{id:actor.id}});
 });
 it('operators cannot access another organization or act as an ordinary member',async()=>{
  const user=await db.user.create({data:{email:`${org}@example.invalid`}});
  const membership=await db.membership.create({data:{orgId:org,userId:user.id,role:'MEMBER',status:'ACTIVE'}});
  try {
   const guard=new RolesGuard(new Reflector(),db);
   const request:any={params:{orgId:org},user:{userId:user.id}};
   const context:any={getHandler:()=>JobsController.prototype.list,getClass:()=>JobsController,switchToHttp:()=>({getRequest:()=>request})};
   expect(await guard.canActivate(context)).toBe(false);
   await db.membership.update({where:{id:membership.id},data:{role:'ADMIN'}});
   delete request.membership;
   expect(await guard.canActivate(context)).toBe(true);
   request.params.orgId=other;
   expect(await guard.canActivate(context)).toBe(false);
  } finally {await db.membership.delete({where:{id:membership.id}});await db.user.delete({where:{id:user.id}});}
 });
 it('disabled delivery workers leave outbox jobs pending',async()=>{
  await queue.enqueue(org,'disabled-notice-001',{channel:'slack',connectionId:'missing',text:'fixture'},'notification');
  await new OutboxWorkerService(db,queue,config).tick();
  expect(await db.durableJob.count({where:{orgId:org,status:'pending'}})).toBe(1);
  expect(global.fetch).not.toHaveBeenCalled();
 });
 it('disconnecting a destination suppresses delayed delivery',async()=>{
  const c=await db.slackConnection.create({data:{orgId:org,webhookUrl:'https://hooks.slack.com/services/fixture'}});
  await queue.enqueue(org,'disconnected-notice-001',{channel:'slack',connectionId:c.id,text:'fixture'},'notification');
  await db.slackConnection.update({where:{id:c.id},data:{isActive:false}});
  const worker=new OutboxWorkerService(db,queue,config);
  expect(await runOne(queue,j=>worker.deliver(j),'notification')).toBe('succeeded');
  expect(global.fetch).not.toHaveBeenCalled();
 });

});
