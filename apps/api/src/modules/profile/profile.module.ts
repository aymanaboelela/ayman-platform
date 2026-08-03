import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

/**
 * `MediaModule` is imported so `ProfileService` can call
 * `MediaService.uploadAvatar`. The upload pipeline — extension allowlist,
 * magic-byte sniff, sharp re-encode, UUID key — stays in one place rather than
 * being reimplemented here for the one case a student can reach, which is
 * exactly the case where getting it wrong matters most.
 */
@Module({
  imports: [MediaModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
