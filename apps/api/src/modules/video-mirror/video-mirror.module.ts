import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { VideoMirrorService } from './video-mirror.service';

/**
 * The mirror worker and the two things that read its state — the player
 * (which prefers our copy) and the admin content screens (which show whether
 * there is one).
 *
 * Exported rather than global: a module that wants to requeue a mirror is
 * making a content decision and should say so in its imports.
 */
@Module({
  imports: [PrismaModule],
  providers: [VideoMirrorService],
  exports: [VideoMirrorService],
})
export class VideoMirrorModule {}
