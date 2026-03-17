import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ChargesModule } from '../charges/charges.module';
import { ExpensesModule } from '../expenses/expenses.module';

@Module({
  imports: [ChargesModule, ExpensesModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
