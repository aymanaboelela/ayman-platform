import { Module } from '@nestjs/common';
import { AuditReadController } from './audit-read.controller';
import { AuditReadService } from './audit-read.service';

@Module({
  controllers: [AuditReadController],
  providers: [AuditReadService],
})
export class AuditReadModule {}
