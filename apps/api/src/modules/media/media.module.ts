import { Module } from '@nestjs/common';
import { loadEnv } from '../../config/env';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { FileSignatureService } from './file-signature.service';
import { LocalDiskStorage } from './storage/local-disk.storage';
import { MEDIA_STORAGE } from './storage/media-storage';

/**
 * `PlayerModule`'s existing `MEDIA_URL_RESOLVER` binding (`EnvMediaUrlResolver`)
 * is UNCHANGED — Plan 4's consumers do not move. "Rebind onto `MediaStorage`"
 * (the reconciliation note) is about ownership and origin correctness, not
 * about introducing a second, competing resolver implementation:
 * `EnvMediaUrlResolver` already does exactly what a resolver needs to do
 * (base URL + storage key), and it already reads the SAME `MEDIA_BASE_URL`
 * this module's `MEDIA_STORAGE` provider derives its root from — the env.ts
 * boot assertion (Task 13 Step 1/8) is what actually keeps the two aligned,
 * not a second DI binding duplicating the same string concatenation.
 */
@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    FileSignatureService,
    {
      provide: MEDIA_STORAGE,
      useFactory: () => new LocalDiskStorage(loadEnv(process.env).MEDIA_ROOT),
    },
  ],
  exports: [MediaService, MEDIA_STORAGE],
})
export class MediaModule {}
