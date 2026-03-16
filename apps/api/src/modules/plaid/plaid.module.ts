import { Module } from '@nestjs/common';
import { PlaidController } from './plaid.controller';
import { PlaidService } from './plaid.service';
import { PlaidSchedulerService } from './plaid-scheduler.service';

@Module({
  controllers: [PlaidController],
  providers: [PlaidService, PlaidSchedulerService],
  exports: [PlaidService],
})
export class PlaidModule {}
