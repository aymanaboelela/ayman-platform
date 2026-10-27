import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { ContentModule } from '../content/content.module';
import { VideoMirrorModule } from '../video-mirror/video-mirror.module';
import { MontageController } from './montage.controller';
import { MontageService } from './montage.service';

/**
 * «المونتاج». Its own module rather than more routes on `VideoMirrorModule`:
 * it needs `LessonService` (a hand-over can become a new lesson), and the
 * content module already imports the video one — the dependency only runs
 * one way if this sits above both.
 */
@Module({
  imports: [AuditModule, ContentModule, VideoMirrorModule],
  controllers: [MontageController],
  providers: [MontageService],
})
export class MontageModule {}
