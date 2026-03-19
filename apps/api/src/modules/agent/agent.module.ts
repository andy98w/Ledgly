import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { ChargesModule } from '../charges/charges.module';
import { PaymentsModule } from '../payments/payments.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { AnnouncementsModule } from '../announcements/announcements.module';
import { GmailModule } from '../gmail/gmail.module';
import { PlaidModule } from '../plaid/plaid.module';
import { ReportsModule } from '../reports/reports.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [MembersModule, ChargesModule, PaymentsModule, ExpensesModule, AnnouncementsModule, GmailModule, PlaidModule, ReportsModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
