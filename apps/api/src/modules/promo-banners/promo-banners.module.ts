import { Module } from '@nestjs/common';
import { AdminPromoBannersController } from './admin-promo-banners.controller';
import { PromoBannersController } from './promo-banners.controller';
import { PromoBannersService } from './promo-banners.service';

@Module({
  controllers: [PromoBannersController, AdminPromoBannersController],
  providers: [PromoBannersService],
})
export class PromoBannersModule {}
