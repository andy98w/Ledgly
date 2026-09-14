import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

/** Called inside the same transaction as a newly created payment/import. */
export async function recordPaymentNotice(tx: Prisma.TransactionClient, orgId: string, entityId: string, payer: string, cents: number) {
  const org = await tx.organization.findUniqueOrThrow({where:{id:orgId},select:{notificationTemplates:true}});
  const templates = org.notificationTemplates as Record<string,string> | null;
  const template = templates?.payment_received || '✅ {{payerName}} paid ${{amount}} for {{chargeTitle}}';
  const vars: Record<string,string> = {payerName:payer,amount:(cents/100).toFixed(2),chargeTitle:'payment'};
  const text = template.replace(/\{\{(payerName|amount|chargeTitle)\}\}/g,(_,key)=>vars[key]);
  await tx.notification.create({data:{orgId,type:'PAYMENT_RECEIVED',title:'Payment Received',body:text,linkUrl:'/payments'}});
  const channels = [
    ... (await tx.discordConnection.findMany({where:{orgId,isActive:true},select:{id:true}})).map(c=>({...c,channel:'discord'})),
    ... (await tx.slackConnection.findMany({where:{orgId,isActive:true},select:{id:true}})).map(c=>({...c,channel:'slack'})),
    ... (await tx.groupMeConnection.findMany({where:{orgId,isActive:true},select:{id:true}})).map(c=>({...c,channel:'groupme'})),
  ];
  for (const c of channels) {
    await tx.durableJob.create({data:{id:randomUUID(),orgId,kind:'notification',requestKey:`notice:${entityId}:${c.id}`,payload:{channel:c.channel,connectionId:c.id,text}}});
  }
}
