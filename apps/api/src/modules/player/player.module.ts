import { Module } from '@nestjs/common';
import { EnvMediaUrlResolver, MEDIA_URL_RESOLVER } from '../../common/media/media-url';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { ProgressModule } from '../progress/progress.module';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';

@Module({
  imports: [ProgressModule, EnrollmentModule],
  controllers: [PlayerController],
  providers: [PlayerService, { provide: MEDIA_URL_RESOLVER, useClass: EnvMediaUrlResolver }],
  exports: [PlayerService, MEDIA_URL_RESOLVER],
})
export class PlayerModule {}
