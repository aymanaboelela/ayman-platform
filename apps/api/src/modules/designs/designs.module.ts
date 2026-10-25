import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { FileSignatureService } from '../media/file-signature.service';
import { MediaModule } from '../media/media.module';
import { DesignsController } from './designs.controller';
import { DesignsService } from './designs.service';

@Module({
  imports: [AuditModule, MediaModule],
  controllers: [DesignsController],
  providers: [DesignsService, FileSignatureService],
})
export class DesignsModule {}
