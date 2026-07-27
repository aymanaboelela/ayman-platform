import { Module } from '@nestjs/common';
import { HomeBlocksController } from './home-blocks.controller';
import { HomeBlocksService } from './home-blocks.service';

@Module({
  controllers: [HomeBlocksController],
  providers: [HomeBlocksService],
  exports: [HomeBlocksService],
})
export class HomeBlocksModule {}
