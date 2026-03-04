import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { ChargesModule } from '../charges/charges.module';
import { PaymentsModule } from '../payments/payments.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [MembersModule, ChargesModule, PaymentsModule, ExpensesModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
