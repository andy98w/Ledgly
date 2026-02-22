import { Module, Global, forwardRef } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { ChargesModule } from '../charges/charges.module';
import { ExpensesModule } from '../expenses/expenses.module';

@Global() // Make it global so other modules can inject AuditService
@Module({
  imports: [
    forwardRef(() => ChargesModule),
    forwardRef(() => ExpensesModule),
  ],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
