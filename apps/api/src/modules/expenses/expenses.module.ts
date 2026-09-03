import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { FinanceOverviewService } from './finance-overview.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [ExpensesController],
  providers: [ExpensesService, FinanceOverviewService],
})
export class ExpensesModule {}
