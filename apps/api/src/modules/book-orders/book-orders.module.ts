import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { BookOrdersController } from './book-orders.controller';
import { AdminBookOrdersController } from './admin-book-orders.controller';
import { BookOrdersService } from './book-orders.service';

/**
 * `AuthModule` — for `OptionalSessionService`, which `BookOrdersController`'s
 * public routes need (a guest checkout has to work with or without a
 * session; see the controller's own note). Same dependency `AssistantModule`
 * has, for the same reason.
 */
@Module({
  imports: [MediaModule, AuthModule],
  controllers: [BookOrdersController, AdminBookOrdersController],
  providers: [BookOrdersService],
})
export class BookOrdersModule {}
