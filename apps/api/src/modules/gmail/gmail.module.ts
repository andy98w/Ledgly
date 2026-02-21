import { Module, forwardRef } from '@nestjs/common';
import { GmailController, GmailPublicController } from './gmail.controller';
import { GmailService } from './gmail.service';
import { EmailParserService } from './email-parser.service';
import { PaymentMatcherService } from './payment-matcher.service';
import { ExpenseMatcherService } from './expense-matcher.service';
import { GmailSchedulerService } from './gmail-scheduler.service';
import { ChargesModule } from '../charges/charges.module';

@Module({
  imports: [forwardRef(() => ChargesModule)],
  controllers: [GmailController, GmailPublicController],
  providers: [GmailService, EmailParserService, PaymentMatcherService, ExpenseMatcherService, GmailSchedulerService],
  exports: [GmailService],
})
export class GmailModule {}
