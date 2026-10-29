import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { SocialCountsController } from './social-counts.controller';
import { SocialCountsSyncService } from './social-counts-sync.service';

@Module({
  controllers: [SettingsController, SocialCountsController],
  providers: [SettingsService, SocialCountsSyncService],
  exports: [SettingsService],
})
export class SettingsModule {}
