import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { DurableJobsService, Job } from '../jobs/durable-jobs.service';
import { runOne } from '../jobs/durable-worker';

@Injectable()
export class OutboxWorkerService {
  private busy = false;
  private readonly logger = new Logger(OutboxWorkerService.name);
  constructor(private db: PrismaService, private queue: DurableJobsService, private config: ConfigService) {}
  @Interval(1000)
  async tick() {
    if (this.busy || this.config.get('DURABLE_NOTIFICATIONS_ENABLED') !== 'true') return;
    this.busy = true;
    try { await runOne(this.queue, job=>this.deliver(job),'notification'); }
    catch { this.logger.error('Notification worker database operation failed'); }
    finally { this.busy = false; }
  }
  async deliver(job: Job) {
    const {channel,connectionId,text} = job.payload;
    if (typeof connectionId !== 'string' || typeof text !== 'string') throw new Error('Invalid notification');
    let url: string, body: object;
    if (channel === 'groupme') {
      const c = await this.db.groupMeConnection.findFirst({where:{id:connectionId,orgId:job.org_id,isActive:true}});
      if (!c) return; // Disconnected destinations must not receive delayed messages.
      url='https://api.groupme.com/v3/bots/post'; body={bot_id:c.botId,text:text.slice(0,1000)};
    } else if (channel === 'discord' || channel === 'slack') {
      const where={id:connectionId,orgId:job.org_id,isActive:true};
      const c=channel==='discord'?await this.db.discordConnection.findFirst({where}):await this.db.slackConnection.findFirst({where});
      if (!c) return;
      url=c.webhookUrl;
      const parsed=new URL(url);
      const valid=channel==='discord'
        ? parsed.hostname==='discord.com' && parsed.pathname.startsWith('/api/webhooks/')
        : parsed.hostname==='hooks.slack.com' && parsed.pathname.startsWith('/services/');
      if (parsed.protocol!=='https:' || parsed.port || parsed.username || parsed.password || !valid) throw new Error('Invalid channel destination');
      body=channel==='discord'?{content:text.slice(0,2000)}:{text:text.slice(0,4000)};
    } else throw new Error('Unknown channel');
    const response = await fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
    await response.body?.cancel();
    if (!response.ok) throw new Error('Notification provider rejected request');
  }
}
