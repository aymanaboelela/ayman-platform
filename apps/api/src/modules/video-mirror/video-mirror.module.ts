import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { VideoMirrorService } from './video-mirror.service';
import { VideoUploadService } from './video-upload.service';

/**
 * The two pipelines that fill our own video origin — copying a YouTube
 * lecture, and packaging one the instructor uploaded to us — plus the things
 * that read their state: the player (which prefers our copy) and the admin
 * content screens (which show whether there is one).
 *
 * `VideoUploadService` lives here rather than in `content` because it signs
 * URLs against the SAME bucket, with the same credentials and the same
 * all-or-nothing config the worker resolved. Two places holding those would
 * be two places to get half-configured.
 *
 * Exported rather than global: a module that wants to requeue a mirror is
 * making a content decision and should say so in its imports.
 */
@Module({
  /*
   * `RedisModule` explicitly, even though it is `@Global()`.
   *
   * A global module's exports are only available once SOMETHING in the graph
   * has imported it, and `AppModule` doing so is not a property this module
   * can rely on — the authorization matrix builds its own fixture module from
   * an explicit list, and there this one is imported without it. The symptom
   * is not a missing lock: it is every route in the suite failing at once,
   * because the module never compiles.
   */
  imports: [PrismaModule, RedisModule],
  providers: [VideoMirrorService, VideoUploadService],
  exports: [VideoMirrorService, VideoUploadService],
})
export class VideoMirrorModule {}
