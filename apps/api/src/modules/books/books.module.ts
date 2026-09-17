import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { SettingsModule } from '../admin/settings/settings.module';
import { AdminBooksController } from './admin-books.controller';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';

/**
 * «قسم الكتب» — the catalogue.
 *
 * `SettingsModule` because the delivery fee lives on the settings singleton
 * (`SiteSettings.store.shippingCents`) rather than as a constant: the courier's
 * price changes, and it should change in a form rather than in a deploy.
 *
 * `exports: [BooksService]` for `BookOrdersModule`, which prices a cart by
 * reading this catalogue — one direction only. Nothing here ever reads an
 * order except the COUNT on the admin list.
 */
@Module({
  imports: [AuditModule, SettingsModule],
  controllers: [BooksController, AdminBooksController],
  providers: [BooksService],
  exports: [BooksService],
})
export class BooksModule {}
