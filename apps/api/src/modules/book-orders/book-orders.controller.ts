import { BadRequestException, Body, Controller, Get, Param, Post, Req, UploadedFile, UseInterceptors, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, seconds } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import { MAX_UPLOAD_BYTES } from '@ayman/contracts/admin/media';
import type { BookOrder } from '@ayman/contracts/book-orders';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { OptionalSessionService } from '../../auth/optional-session.service';
import { RequireCsrf } from '../security/require-csrf.decorator';
import { CreateBookOrderDto, SubmitBookOrderPaymentDto } from './book-orders.dto';
import { BookOrdersService } from './book-orders.service';

interface MulterFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

/**
 * Creating an order is expensive — it writes a row and collects a real
 * name/phone/address from someone who, since guest checkout, may hold no
 * account at all. Same two-limit shape المساعد's `OPEN_THROTTLE` uses for
 * the same reason: the global `ThrottlerGuard` (session/IP-keyed, registered
 * once for the whole app) already bounds every route, but it keys on a
 * session cookie that a public route never requires — a script that changes
 * that cookie per request gets a fresh bucket each time. This is the ceiling
 * that still holds when there is no session to key on.
 */
const CREATE_THROTTLE = {
  short: { limit: 1, ttl: seconds(10) },
  medium: { limit: 3, ttl: seconds(600) },
  long: { limit: 10, ttl: seconds(3600) },
};

/** Cheaper than `create` — no new row, just a field update on one that
 *  already exists — but still worth its own ceiling for the same reason. */
const PAYMENT_THROTTLE = {
  short: { limit: 1, ttl: seconds(5) },
  medium: { limit: 5, ttl: seconds(600) },
};

/**
 * الكتاب الورقي — the student/visitor half. `book-order:submit` gated every
 * route here until guest checkout: ordering the physical textbook is "a
 * different service" from the platform's login-gated course content (Ayman),
 * and the course landing page is already public, so a complete stranger has
 * to be able to fill the address form and pay with zero account friction.
 *
 * ## `@Public()` + `OptionalSessionService`, same pattern as المساعد
 *
 * `create`/`submitPayment`/`uploadScreenshot`/`getOne` are `@Public()` and
 * resolve `user?.id ?? null` themselves via `OptionalSessionService` — a
 * signed-in caller still gets `userId` attached (purely additive), a guest
 * gets `null`. `BookOrdersService.submitPayment`/`getById` then use THAT
 * value, `null` included, as the ownership filter: a guest order can only
 * ever be read/paid by another guest request presenting the same order id,
 * and a signed-in student's order can only ever be read/paid by that same
 * account. See those methods' own notes.
 *
 * `@RequireCsrf()` on every WRITE below, for the reason `AssistantController`
 * gives at length: `@Public()` used to imply "no CSRF check either", which
 * was safe only while every public route was a GET. `book-order:submit`
 * stays a real permission in `../../auth/permissions` — `listMine` (a signed-
 * in student's own order history; a guest has no session to list from in the
 * first place) is the one route here that still requires it.
 */
@Controller('book-orders')
export class BookOrdersController {
  constructor(
    private readonly bookOrders: BookOrdersService,
    private readonly session: OptionalSessionService,
  ) {}

  /** Step one of the two-step upload — same shape as `PaymentsController`. */
  @Public()
  @RequireCsrf()
  @Throttle(CREATE_THROTTLE)
  @Post('screenshot')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  async uploadScreenshot(@UploadedFile() file?: MulterFile) {
    if (!file) throw new BadRequestException('no file uploaded');
    return this.bookOrders.uploadScreenshot(file);
  }

  /** The address form — saved BEFORE any payment. */
  @Public()
  @RequireCsrf()
  @Throttle(CREATE_THROTTLE)
  @UsePipes(ZodValidationPipe)
  @Post()
  async create(@Req() request: Request, @Body() body: CreateBookOrderDto): Promise<BookOrder> {
    const user = await this.session.userOrNull(request);
    return this.bookOrders.create(user?.id ?? null, body);
  }

  /** The payment — moves an existing order from `address_only` to `paid`. */
  @Public()
  @RequireCsrf()
  @Throttle(PAYMENT_THROTTLE)
  @UsePipes(ZodValidationPipe)
  @Post(':id/payment')
  async submitPayment(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: SubmitBookOrderPaymentDto,
  ): Promise<BookOrder> {
    const user = await this.session.userOrNull(request);
    return this.bookOrders.submitPayment(user?.id ?? null, id, body);
  }

  // `mine` MUST be registered before `:id` below — Nest/Express matches GET
  // routes in declaration order, so a `:id` route declared first would treat
  // a request to `/book-orders/mine` as `id: 'mine'` and never reach this one.
  @RequirePermission('book-order:submit')
  @Get('mine')
  listMine(@CurrentUser() user: AuthenticatedUser): Promise<BookOrder[]> {
    return this.bookOrders.listMine(user.id);
  }

  /**
   * One order, by id — read-only, no `@RequireCsrf()` (a GET changes
   * nothing). Lets a guest's browser turn the `bookOrderId` it kept in
   * `localStorage` back into "still `address_only`, or already `paid`?"
   * when the panel remounts, without ever needing a session. See
   * `BookOrdersService.getById`'s own note on the ownership rule.
   */
  @Public()
  @Get(':id')
  async getOne(@Req() request: Request, @Param('id') id: string): Promise<BookOrder> {
    const user = await this.session.userOrNull(request);
    return this.bookOrders.getById(user?.id ?? null, id);
  }
}
