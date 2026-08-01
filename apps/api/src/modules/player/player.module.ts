import { Module } from '@nestjs/common';
import { EnvMediaUrlResolver, MEDIA_URL_RESOLVER } from '../../common/media/media-url';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { MediaModule } from '../media/media.module';
import { ProgressModule } from '../progress/progress.module';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';

// `MediaModule` is imported for its `MEDIA_STORAGE` binding only — the player
// streams resource bytes itself rather than redirecting to the public media
// route. `MEDIA_URL_RESOLVER` below is untouched and still resolves poster
// images, which ARE public and correctly served from the media origin.
@Module({
  imports: [ProgressModule, EnrollmentModule, MediaModule],
  controllers: [PlayerController],
  providers: [PlayerService, { provide: MEDIA_URL_RESOLVER, useClass: EnvMediaUrlResolver }],
  exports: [PlayerService, MEDIA_URL_RESOLVER],
})
export class PlayerModule {}
