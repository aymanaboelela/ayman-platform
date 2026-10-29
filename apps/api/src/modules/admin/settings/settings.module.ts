import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { SocialCountsController } from './social-counts.controller';

@Module({
  controllers: [SettingsController, SocialCountsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
