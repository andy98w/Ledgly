import { JobsController } from './jobs.controller';
import { Global, Module } from '@nestjs/common';
import { DurableJobsService } from './durable-jobs.service';
@Global()
@Module({controllers:[JobsController],providers:[DurableJobsService],exports:[DurableJobsService]})
export class JobsModule {}
