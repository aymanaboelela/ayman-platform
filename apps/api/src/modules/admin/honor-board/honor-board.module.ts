import { Module } from '@nestjs/common';
import { NotificationsModule } from '../../notifications/notifications.module';
import { AdminHonorBoardController } from './honor-board.controller';
import { AdminHonorBoardService } from './honor-board.service';

@Module({
  imports: [NotificationsModule],
  controllers: [AdminHonorBoardController],
  providers: [AdminHonorBoardService],
})
export class AdminHonorBoardModule {}
