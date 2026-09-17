import { Controller, Get, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { Throttle, seconds } from '@nestjs/throttler';
import type { BookCatalog } from '@ayman/contracts/books';
import { Public } from '../../auth/decorators/public.decorator';
import { BooksService } from './books.service';

/**
 * ⚠️ The same throttle reasoning as `CatalogController` and `NewsController`,
 * and for the same observed failure: `next build` prerenders `/books` and every
 * page that links to it from one machine, firing these reads CONCURRENTLY. The
 * default `10/1s` budget fails the whole build, and it would recur on every
 * deploy rather than once.
 *
 * This is the only route on this controller and it is a `@Public()` GET of data
 * that is on a public page anyway, so the generous ceiling costs nothing: there
 * is no per-caller state behind it to exhaust.
 */
const BOOKS_THROTTLE = {
  short: { limit: 300, ttl: seconds(1) },
  medium: { limit: 3000, ttl: seconds(60) },
  long: { limit: 30_000, ttl: seconds(3600) },
};

/** «قسم الكتب» — the public shop. Read-only; ordering lives on `/book-orders`. */
@Controller('books')
@UsePipes(ZodValidationPipe)
export class BooksController {
  constructor(private readonly books: BooksService) {}

  /**
   * The whole catalogue in one payload — every shelf, every term, and the
   * delivery fee.
   *
   * One request rather than one per shelf: the cart has to total a basket that
   * may span three subjects, and a page that loads its sections independently
   * cannot show a total until the last of them arrives.
   */
  @Public()
  @Throttle(BOOKS_THROTTLE)
  @Get()
  catalog(): Promise<BookCatalog> {
    return this.books.catalog();
  }
}
