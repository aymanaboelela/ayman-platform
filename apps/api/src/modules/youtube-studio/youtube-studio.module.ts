import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FileSignatureService } from '../media/file-signature.service';
import { YoutubeApiClient } from './youtube-api.client';
import { YoutubeConnectionService } from './youtube-connection.service';
import { YoutubeStudioController } from './youtube-studio.controller';
import { YoutubeStudioService } from './youtube-studio.service';
import { YoutubeWatchService } from './youtube-watch.service';

/**
 * «يوتيوب». `YoutubeApiClient` is built by a factory over the global `fetch`,
 * like the social studio's `MetaGraphClient`, so the specs hand it a scripted
 * fake instead.
 */
@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [YoutubeStudioController],
  providers: [
    YoutubeConnectionService,
    YoutubeStudioService,
    YoutubeWatchService,
    FileSignatureService,
    { provide: YoutubeApiClient, useFactory: () => new YoutubeApiClient((url, init) => fetch(url, init)) },
  ],
})
export class YoutubeStudioModule {}
