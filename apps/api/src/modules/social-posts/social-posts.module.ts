import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { EnvMediaUrlResolver, MEDIA_URL_RESOLVER } from '../../common/media/media-url';
import { FileSignatureService } from '../media/file-signature.service';
import { MediaModule } from '../media/media.module';
import { MetaGraphClient } from './meta-graph.client';
import { SocialConnectionService } from './social-connection.service';
import { SocialPostsController } from './social-posts.controller';
import { SocialPostsService } from './social-posts.service';
import { SocialPublisherService } from './social-publisher.service';
import { SocialSourcesService } from './social-sources.service';

/**
 * «استوديو البوستات».
 *
 * `MetaGraphClient` is built by a factory over the global `fetch`, so the
 * specs construct it with a scripted fake instead. `MEDIA_URL_RESOLVER` is
 * bound here for the reason `MarketingModule` gives: the image reaches Meta
 * as a URL Meta downloads, so it must be the public `MEDIA_BASE_URL`.
 */
@Module({
  imports: [AuditModule, MediaModule],
  controllers: [SocialPostsController],
  providers: [
    SocialPostsService,
    SocialSourcesService,
    SocialConnectionService,
    SocialPublisherService,
    FileSignatureService,
    { provide: MetaGraphClient, useFactory: () => new MetaGraphClient((url, init) => fetch(url, init)) },
    { provide: MEDIA_URL_RESOLVER, useClass: EnvMediaUrlResolver },
  ],
})
export class SocialPostsModule {}
