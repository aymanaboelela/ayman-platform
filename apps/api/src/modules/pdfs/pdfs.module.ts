import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { MediaModule } from '../media/media.module';
import { PdfsController } from './pdfs.controller';
import { PdfsService } from './pdfs.service';

@Module({
  imports: [AuditModule, MediaModule],
  controllers: [PdfsController],
  providers: [PdfsService],
})
export class PdfsModule {}
