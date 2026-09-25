import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminCentersController } from './admin-centers.controller';
import { CentersController } from './centers.controller';
import { CentersService } from './centers.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [CentersController, AdminCentersController],
  providers: [CentersService],
  exports: [CentersService],
})
export class CentersModule {}
