import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AuditModule } from '../../../audit/audit.module';
import { AdminProfileController } from './admin-profile.controller';
import { AdminProfileService } from './admin-profile.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [AdminProfileController],
  providers: [AdminProfileService],
  exports: [AdminProfileService],
})
export class AdminProfileModule {}
