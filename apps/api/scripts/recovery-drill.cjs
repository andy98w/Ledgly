/* Disposable CI only. Never accepts a production URL or drops an existing DB. */
require('ts-node/register/transpile-only');
const { PrismaClient }=require('@prisma/client');
const {DurableJobsService}=require('../src/modules/jobs/durable-jobs.service');
const {runOne}=require('../src/modules/jobs/durable-worker');
const {PaymentsService}=require('../src/modules/payments/payments.service');
const {ChargesService}=require('../src/modules/charges/charges.service');
const {fork,spawnSync}=require('node:child_process');
const assert=require('node:assert/strict');
const url=new URL(process.env.DATABASE_URL || 'http://invalid');
if(!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/ledgly_test') throw new Error('Disposable localhost ledgly_test only');
const db=new PrismaClient();
function payments(client){return new PaymentsService(client,new ChargesService(client,{}, {}, {}),{}, {}, {});}
async function effect(client,job){return payments(client).create(job.org_id,job.payload.actor,job.payload.payment,job.id);}
async function child(){
 const q=new DurableJobsService(db);const j=await q.claim('recovery-fixture');assert(j);
 await effect(db,j);process.send({committed:true});
 // Remain alive until the parent sends SIGKILL: no acknowledgement or cleanup.
 setInterval(()=>{},1000);
}
function docker(args,input){
 const id=process.env.PG_CONTAINER;
 if(!id || !/^[a-zA-Z0-9_-]+$/.test(id))throw new Error('Explicit CI PostgreSQL container required');
 const r=spawnSync('docker',['exec','-i',id,...args],{input,maxBuffer:32*1024*1024});
 if(r.status!==0)throw new Error(String(r.stderr));return r.stdout;
}
async function snapshot(client,org){
 return {
 payments:await client.payment.count({where:{orgId:org}}),
 cents:(await client.payment.aggregate({where:{orgId:org},_sum:{amountCents:true}}))._sum.amountCents,
 audits:await client.auditLog.count({where:{orgId:org}}),
 notices:await client.notification.count({where:{orgId:org}}),
 jobs:await client.durableJob.count({where:{orgId:org}}),
 requests:await client.paymentRequest.count({where:{orgId:org}}),
 };
}
async function main(){
 const org=(await db.organization.create({data:{name:'Recovery synthetic fixture'}})).id;
 const actor=(await db.membership.create({data:{orgId:org,name:'Fixture',role:'ADMIN',status:'ACTIVE'}})).id;
 const q=new DurableJobsService(db);
 const id=await q.enqueue(org,'recovery-payment-001',{actor,payment:{amountCents:2500,paidAt:'2026-09-13',rawPayerName:'Synthetic'}},'recovery-fixture');
 const worker=fork(__filename,['--worker'],{stdio:['ignore','inherit','inherit','ipc']});
 try {
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('Worker did not commit in time')),30000);
   worker.once('message',()=>{clearTimeout(timer);resolve();});
   worker.once('exit',code=>{clearTimeout(timer);reject(new Error('Worker exited before commit: '+code));});
  });
  const exited=new Promise(resolve=>worker.once('exit',resolve));worker.kill('SIGKILL');await exited;
 } finally {worker.kill('SIGKILL');}
 const container=process.env.PG_CONTAINER;
 if(!container || !/^[a-zA-Z0-9_-]+$/.test(container))throw new Error('Explicit CI container required');
 assert.equal(spawnSync('docker',['stop',container]).status,0);
 try {await assert.rejects(()=>q.claim('recovery-fixture'));}
 finally {assert.equal(spawnSync('docker',['start',container]).status,0);}
 let ready=false;
 for(let attempt=0;attempt<20;attempt++){
  if(spawnSync('docker',['exec',container,'pg_isready','-U','fixture'],{stdio:'ignore'}).status===0){ready=true;break;}
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 assert(ready,'Database did not recover');
 const before=await snapshot(db,org);assert.equal(before.payments,1);assert.equal(before.cents,2500);
 const started=Date.now();
 const dump=docker(['pg_dump','-U','fixture','-d','ledgly_test','-Fc']);
 // createdb fails if the destination already exists; no destructive reset.
 docker(['createdb','-U','fixture','ledgly_restore_test']);
 docker(['pg_restore','-U','fixture','-d','ledgly_restore_test','--exit-on-error'],dump);
 const restoredUrl=new URL(url);restoredUrl.pathname='/ledgly_restore_test';
 const restored=new PrismaClient({datasources:{db:{url:restoredUrl.toString()}}});
 try {
  assert.deepEqual(await snapshot(restored,org),before);
  // Expire the restored lease deterministically; production waits up to 60s.
  await restored.durableJob.update({where:{id},data:{leaseUntil:new Date(0)}});
  assert.equal(await runOne(new DurableJobsService(restored),j=>effect(restored,j),'recovery-fixture'),'succeeded');
  assert.deepEqual(await snapshot(restored,org),before);
  console.log(JSON.stringify({drill:'SIGKILL after payment commit, dump/restore, redelivery',passed:true,databaseRestartVerified:true,restored:before,restoreAndVerifyMs:Date.now()-started,scope:'synthetic CI fixture; not a production RTO/RPO guarantee'}));
 } finally {await restored.$disconnect();await db.$disconnect();}
}
(process.argv.includes('--worker')?child():main()).catch(async e=>{console.error(e);await db.$disconnect();process.exit(1);});
