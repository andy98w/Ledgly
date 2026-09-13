import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { DurableJobsService } from '../jobs/durable-jobs.service';
import { runOne } from '../jobs/durable-worker';
import { GmailService } from './gmail.service';
@Injectable()
export class GmailWorkerService {
  private busy=false;
  private readonly logger=new Logger(GmailWorkerService.name);
  constructor(private queue:DurableJobsService,private gmail:GmailService,private config:ConfigService) {}
  @Interval(1000)
  async tick() {
    if(this.busy || this.config.get('DURABLE_GMAIL_ENABLED')!=='true') return;
    this.busy=true;
    try {
      await runOne(this.queue,j=>this.gmail.runScan(j.org_id,j.payload),'gmail-scan');
      await runOne(this.queue,j=>this.gmail.runMessage(j.org_id,j.payload),'gmail-message');
    } catch {this.logger.error('Gmail worker database operation failed');}
    finally {this.busy=false;}
  }
}
