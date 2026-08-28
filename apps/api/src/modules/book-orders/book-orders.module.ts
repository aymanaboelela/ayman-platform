import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { BookOrdersController } from './book-orders.controller';
import { AdminBookOrdersController } from './admin-book-orders.controller';
import { BookOrdersService } from './book-orders.service';

@Module({
  imports: [MediaModule],
  controllers: [BookOrdersController, AdminBookOrdersController],
  providers: [BookOrdersService],
})
export class BookOrdersModule {}
