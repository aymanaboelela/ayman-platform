import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { BookOrder, BookOrderStatus, CreateBookOrderInput, SubmitBookOrderPaymentInput } from '@ayman/contracts/book-orders';
import type { AdminBookOrderQuery, AdminBookOrderRow, AdminCreateBookOrderInput } from '@ayman/contracts/admin/book-orders';
import type { AdminBookOrderPatchInput } from '@ayman/contracts/admin/books';
import { bookOrderTotals } from '@ayman/contracts/books';
import { streamChoiceOf } from '@ayman/contracts/content';
import { copy } from '@ayman/contracts/copy';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { BooksService } from '../books/books.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MediaService, type UploadFile } from '../media/media.service';

/** The prefix `POST /book-orders/screenshot` stores under — same reasoning
 *  as `PaymentsService`'s own `SCREENSHOT_PREFIX`: never served through the
 *  public `/media/:prefix/:name` route. */
const SCREENSHOT_PREFIX = 'book-order-proof';

/**
 * ONE select for every read that returns a `BookOrder`, replacing the five
 * hand-copied ones this file used to carry.
 *
 * They were identical five times and then they were not: adding `items` to a
 * literal in `create` and forgetting the one in `listMine` produces an order
 * history whose rows have no books in them, with no type error anywhere,
 * because both shapes satisfy Prisma. One constant makes that impossible.
 *
 * `items` is ordered by title so the same order renders its lines in the same
 * sequence on the confirmation, in the admin list and in the export — an
 * unordered relation is free to come back in a different order per query, and
 * a receipt whose lines shuffle between two loads reads as a receipt that
 * changed.
 */
const ORDER_SELECT = {
  id: true,
  courseId: true,
  amountCents: true,
  itemsCents: true,
  shippingCents: true,
  discountCents: true,
  status: true,
  fullName: true,
  phone: true,
  altPhone: true,
  governorateCode: true,
  city: true,
  addressStreet: true,
  addressBuilding: true,
  addressNote: true,
  senderPhone: true,
  paidAt: true,
  shippedAt: true,
  createdAt: true,
  course: { select: { title: true, bookTitle: true } },
  items: {
    orderBy: { titleAr: 'asc' },
    select: { bookId: true, titleAr: true, unitPriceCents: true, quantity: true },
  },
} as const;

/** One line as it is written — the shape both pricing paths return. */
interface OrderLineWrite {
  bookId: string | null;
  titleAr: string;
  unitPriceCents: number;
  quantity: number;
}

/** What `ORDER_SELECT` returns, as one name the mappers below can share. */
interface OrderRow {
  id: string;
  courseId: string | null;
  amountCents: number;
  itemsCents: number;
  shippingCents: number;
  discountCents: number;
  status: 'address_only' | 'paid' | 'shipped';
  fullName: string;
  phone: string;
  altPhone: string;
  governorateCode: string;
  city: string;
  addressStreet: string;
  addressBuilding: string | null;
  addressNote: string | null;
  senderPhone: string | null;
  paidAt: Date | null;
  shippedAt: Date | null;
  createdAt: Date;
  course: { title: string; bookTitle: string | null } | null;
  items: { bookId: string | null; titleAr: string; unitPriceCents: number; quantity: number }[];
}

@Injectable()
export class BookOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    /** For the catalogue's prices and the current delivery fee — one
     *  direction only; nothing in `BooksService` reads an order. */
    private readonly books: BooksService,
    /** Tells whoever ships parcels that one is waiting. One direction only —
     *  nothing in notifications reads an order. */
    private readonly notifications: NotificationsService,
  ) {}

  /** The screenshot upload — identical shape to `PaymentsService.uploadScreenshot`. */
  async uploadScreenshot(file: UploadFile): Promise<{ screenshotKey: string }> {
    const image = await this.media.uploadPrivateImage(file, SCREENSHOT_PREFIX);
    return { screenshotKey: image.storageKey };
  }

  private toBookOrder(row: OrderRow): BookOrder {
    return {
      id: row.id,
      courseId: row.courseId,
      courseTitle: row.course?.title ?? null,
      /*
       * The one-line summary the course page's own panel has always rendered.
       *
       * For a course order it is the course's own book, as before. For a CART
       * order there is no course, so the first line's title stands in — which is
       * what that panel would want to say if it were ever shown a basket, and is
       * strictly better than the empty string it would otherwise get.
       */
      bookTitle: row.course?.bookTitle ?? row.items[0]?.titleAr ?? '',
      items: row.items.map((item) => ({
        bookId: item.bookId,
        titleAr: item.titleAr,
        unitPriceCents: item.unitPriceCents,
        quantity: item.quantity,
      })),
      amountCents: row.amountCents,
      itemsCents: row.itemsCents,
      shippingCents: row.shippingCents,
      discountCents: row.discountCents,
      status: row.status,
      fullName: row.fullName,
      phone: row.phone,
      altPhone: row.altPhone,
      governorateCode: row.governorateCode,
      city: row.city,
      addressStreet: row.addressStreet,
      addressBuilding: row.addressBuilding,
      addressNote: row.addressNote,
      senderPhone: row.senderPhone,
      paidAt: row.paidAt?.toISOString() ?? null,
      shippedAt: row.shippedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * Step one — the address form, saved BEFORE any payment. See the
   * `BookOrder` model doc for why this alone is worth a row: a student who
   * abandons here still leaves an admin something to see.
   *
   * `userId` is `null` for a GUEST — ordering a book never requires an
   * account (see the controller's own note). A signed-in caller still gets
   * it attached; this is purely additive.
   */
  async create(userId: string | null, input: CreateBookOrderInput): Promise<BookOrder> {
    // Same check `ProfileService.completeOnboarding` runs on the identical
    // field — `CreateBookOrderSchema` only proves SHAPE (two characters), not
    // that the code names a real governorate. Without this, a bad code would
    // otherwise surface as a raw foreign-key violation (a 500) rather than a
    // 400 naming the actual problem.
    const governorate = await this.prisma.governorate.findUnique({
      where: { code: input.governorateCode },
      select: { code: true },
    });
    if (!governorate) {
      throw new BadRequestException('governorateCode does not match a known governorate');
    }

    /* One of the two, never both — `CreateBookOrderSchema`'s own refinement is
       what makes that a shape error rather than a decision taken here. */
    const priced =
      input.items !== undefined
        ? await this.priceCart(input.items)
        : await this.priceCourseBook(input.courseId as string);

    const totals = bookOrderTotals(priced.lines, await this.books.shippingCents());

    const order = await this.prisma.bookOrder.create({
      data: {
        userId,
        courseId: priced.courseId,
        // Every price here came from `books.price_cents` or
        // `courses.book_price_cents` moments ago — never from the request. Same
        // rule `PaymentsService.submit` follows for `amountCents`.
        amountCents: totals.totalCents,
        itemsCents: totals.itemsCents,
        shippingCents: totals.shippingCents,
        discountCents: totals.discountCents,
        items: { create: priced.lines },
        fullName: input.fullName,
        phone: input.phone,
        altPhone: input.altPhone,
        governorateCode: input.governorateCode,
        city: input.city,
        addressStreet: input.addressStreet,
        addressBuilding: input.addressBuilding,
        addressNote: input.addressNote,
      },
      /* Just the id — `byId` below reads the row back through `ORDER_SELECT`,
         which is the one place the response shape is defined. A second literal
         here is a second thing to remember to add `items` to. */
      select: { id: true },
    });

    await this.audit.record({
      action: 'book-order:submit',
      resourceType: AUDIT_RESOURCES.bookOrder,
      resourceId: order.id,
      outcome: 'success',
      metadata: {
        userId,
        courseId: priced.courseId,
        amountCents: totals.totalCents,
        lineCount: priced.lines.length,
      },
    });

    return this.byId(order.id);
  }

  /**
   * A cart, priced from the catalogue.
   *
   * ⚠️ The prices come from `books.price_cents` and NOTHING else. The request
   * carries ids and quantities only (`BookCartLineSchema` has no price field at
   * all), because a price a browser can name is a price a browser can set to 1.
   *
   * `isActive` is in the WHERE rather than checked afterwards, for the reason
   * `NewsService` states about drafts: a filter in application code is one early
   * return away from being skipped, and the failure here is selling something
   * that was deliberately taken off the shelf. A book that is missing OR
   * inactive produces the same 400 — the cart is stale either way, and the fix
   * the student needs is the same.
   *
   * Out-of-stock is a REFUSAL and not a silent quantity reduction: someone who
   * asked for three and is charged for two without being told has been
   * short-changed by software.
   */
  private async priceCart(
    lines: readonly { bookId: string; quantity: number }[],
  ): Promise<{ courseId: null; lines: OrderLineWrite[] }> {
    const books = await this.prisma.book.findMany({
      where: { id: { in: lines.map((line) => line.bookId) }, isActive: true },
      select: { id: true, titleAr: true, priceCents: true, stock: true },
    });
    const byId = new Map(books.map((book) => [book.id, book]));

    const priced = lines.map((line) => {
      const book = byId.get(line.bookId);
      if (!book) {
        throw new BadRequestException('في كتاب في السلة مش متاح دلوقتي — حدّث الصفحة');
      }
      /* `null` stock means «مش بنعد»; only a real number is a limit. */
      if (book.stock !== null && book.stock < line.quantity) {
        throw new BadRequestException(`«${book.titleAr}» مفيش منه العدد ده دلوقتي`);
      }
      return {
        bookId: book.id,
        titleAr: book.titleAr,
        unitPriceCents: book.priceCents,
        quantity: line.quantity,
      };
    });

    return { courseId: null, lines: priced };
  }

  /**
   * The course-page flow, expressed as a one-line cart.
   *
   * Same checks as before the shop existed — published course, book actually on
   * sale — and the same price source. What changed is only the SHAPE it returns:
   * folding it into a line means everything downstream (totals, storage, the
   * admin editor, the export) has exactly one kind of order to handle.
   */
  private async priceCourseBook(
    courseId: string,
  ): Promise<{ courseId: string; lines: OrderLineWrite[] }> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        status: true,
        bookTitle: true,
        bookPriceCents: true,
        book: { select: { id: true } },
      },
    });
    if (!course || course.status !== 'published') throw new NotFoundException();
    if (course.bookTitle === null || course.bookPriceCents === null) {
      throw new BadRequestException('this course has no book to order');
    }

    return {
      courseId: course.id,
      lines: [
        {
          /* Linked to the catalogue entry when there is one — the migration
             created one per course that sells a book — so the admin screen and
             the per-title order count see this exactly like a shop order. `null`
             for a course whose book was never mirrored into the catalogue. */
          bookId: course.book?.id ?? null,
          titleAr: course.bookTitle,
          unitPriceCents: course.bookPriceCents,
          quantity: 1,
        },
      ],
    };
  }

  /** One order by id, in the public shape. The read every write ends with. */
  private async byId(id: string): Promise<BookOrder> {
    const row = await this.prisma.bookOrder.findUnique({ where: { id }, select: ORDER_SELECT });
    if (!row) throw new NotFoundException();
    return this.toBookOrder(row);
  }

  /**
   * «أضف طلب كتاب» — an admin entering a customer's order directly from
   * `/admin/books`, skipping the public/guest two-step flow entirely.
   * Reuses THIS service's own `create()` data model rather than a parallel
   * path: same course/book/governorate checks, same `amountCents` derived
   * from `course.bookPriceCents`, same `BookOrder` row shape a real
   * customer's order would produce.
   *
   * `userId` is ALWAYS `null` — an admin-entered order has no student
   * account tied to it, same as a guest order (see `create()`'s own note).
   * There is deliberately no field here to attach one: if the admin is
   * looking at a specific student's page, `AdminStudentsController`'s own
   * surface is where an account-linked action belongs; this route is for
   * "a customer called/messaged and I'm recording their order right now."
   *
   * `input.paid` decides which of the two states `create()`+`submitPayment()`
   * would have produced together: `false` stops exactly where `create()`
   * alone does (`status: 'address_only'`, everything payment-shaped left
   * `null`); `true` also does what `submitPayment()` does — stamps
   * `paidAt: now` and moves `status` to `'paid'` — in the SAME write, since
   * there is no separate row to update here. `senderPhone`/`screenshotKey`
   * are carried through only when `paid`, same as a genuine payment step.
   */
  async adminCreate(adminId: string, input: AdminCreateBookOrderInput): Promise<BookOrder> {
    if (input.screenshotKey !== null && !input.screenshotKey.startsWith(`${SCREENSHOT_PREFIX}/`)) {
      // Same guard `submitPayment` runs — refuses a key from an unrelated
      // upload rather than letting this admin route attach someone else's
      // picture as "proof" of this payment.
      throw new BadRequestException('screenshotKey was not issued by POST /book-orders/screenshot');
    }

    // Same check `create()` runs on the identical field.
    const governorate = await this.prisma.governorate.findUnique({
      where: { code: input.governorateCode },
      select: { code: true },
    });
    if (!governorate) {
      throw new BadRequestException('governorateCode does not match a known governorate');
    }

    /*
     * Exactly one of the two, same rule as `create()`. The difference is where
     * the line prices come from: a cart typed HERE carries its own
     * `unitPriceCents`, because this route exists to record what a human agreed
     * to on the phone. Forcing that back through `books.price_cents` would mean
     * changing the shop for everyone to give one customer a discount. The
     * public route trusts no such thing — see `priceCart`.
     */
    const priced =
      input.items !== undefined
        ? { courseId: null, lines: input.items.map((line) => ({ ...line })) }
        : await this.priceCourseBook(input.courseId as string);

    const totals = bookOrderTotals(
      priced.lines,
      input.shippingCents ?? (await this.books.shippingCents()),
      input.discountCents ?? 0,
    );

    const now = new Date();
    const order = await this.prisma.bookOrder.create({
      data: {
        userId: null,
        courseId: priced.courseId,
        amountCents: totals.totalCents,
        itemsCents: totals.itemsCents,
        shippingCents: totals.shippingCents,
        discountCents: totals.discountCents,
        items: { create: priced.lines },
        adminNote: input.adminNote,
        fullName: input.fullName,
        phone: input.phone,
        altPhone: input.altPhone,
        governorateCode: input.governorateCode,
        city: input.city,
        addressStreet: input.addressStreet,
        addressBuilding: input.addressBuilding,
        addressNote: input.addressNote,
        senderPhone: input.paid ? input.senderPhone : null,
        screenshotKey: input.paid ? input.screenshotKey : null,
        status: input.paid ? 'paid' : 'address_only',
        paidAt: input.paid ? now : null,
      },
      select: { id: true },
    });

    await this.audit.record({
      action: 'book-order:admin-create',
      resourceType: AUDIT_RESOURCES.bookOrder,
      resourceId: order.id,
      outcome: 'success',
      metadata: {
        adminId,
        courseId: priced.courseId,
        amountCents: totals.totalCents,
        lineCount: priced.lines.length,
        paid: input.paid,
      },
    });

    return this.byId(order.id);
  }

  /**
   * «أعدل الطلب» — the whole editable surface of one order, in one write.
   *
   * ## Why the lines are REPLACED and not merged
   *
   * A merge needs a stable line id round-tripping through a form, and the one
   * operation this screen exists for — «شيل الكتاب ده وحط التاني» — is a
   * replacement anyway. `deleteMany` + `create` inside one transaction is
   * therefore the honest spelling, and the transaction is what stops an order
   * existing for even a moment with its old total and its new lines.
   *
   * ## Why the totals are recomputed and never accepted
   *
   * The client sends lines, shipping and discount; the server does the
   * arithmetic with the same `bookOrderTotals` the cart used. A total posted
   * from a form is a total that can disagree with the lines beside it, and
   * `book_orders_amount_is_the_sum` would then reject the write as a 500 the
   * admin cannot act on. Recomputing means the constraint can only ever fire on
   * a bug in this method — which is exactly what a constraint is for.
   *
   * ## What is deliberately NOT editable here
   *
   * `status`, `paidAt`, `shippedAt`, the screenshot and the phone numbers.
   * Shipping has its own route and its own permission (`book-order:ship`), and
   * an order's payment state is evidence rather than a field — moving it by
   * PATCH would make the audit trail's «اتشحن» entry a thing that can be
   * skipped. The phones are the one identifier a guest order has; correcting
   * one is rare enough to be worth doing deliberately elsewhere rather than
   * cheap enough to sit in the same form as a quantity.
   */
  async adminPatch(
    adminId: string,
    orderId: string,
    input: AdminBookOrderPatchInput,
  ): Promise<BookOrder> {
    const existing = await this.prisma.bookOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        shippingCents: true,
        discountCents: true,
        items: { select: { titleAr: true, unitPriceCents: true, quantity: true, bookId: true } },
      },
    });
    if (!existing) throw new NotFoundException();

    if (input.governorateCode !== undefined) {
      // Same check both create paths run — a code that names nothing would
      // otherwise be a foreign-key 500 rather than a message about the field.
      const governorate = await this.prisma.governorate.findUnique({
        where: { code: input.governorateCode },
        select: { code: true },
      });
      if (!governorate) {
        throw new BadRequestException('governorateCode does not match a known governorate');
      }
    }

    const lines = input.items ?? existing.items;
    const totals = bookOrderTotals(
      lines,
      input.shippingCents ?? existing.shippingCents,
      input.discountCents ?? existing.discountCents,
    );

    await this.prisma.$transaction(async (tx) => {
      if (input.items !== undefined) {
        await tx.bookOrderItem.deleteMany({ where: { orderId } });
        await tx.bookOrderItem.createMany({
          data: input.items.map((line) => ({ ...line, orderId })),
        });
      }
      await tx.bookOrder.update({
        where: { id: orderId },
        data: {
          amountCents: totals.totalCents,
          itemsCents: totals.itemsCents,
          shippingCents: totals.shippingCents,
          discountCents: totals.discountCents,
          fullName: input.fullName,
          governorateCode: input.governorateCode,
          city: input.city,
          addressStreet: input.addressStreet,
          addressBuilding: input.addressBuilding,
          addressNote: input.addressNote,
          adminNote: input.adminNote,
        },
      });
    });

    await this.audit.record({
      action: 'book-order:update',
      resourceType: AUDIT_RESOURCES.bookOrder,
      resourceId: orderId,
      outcome: 'success',
      /* The field names and the money, never the address text. What an order is
         worth is the number anyone auditing this would come looking for; a
         street name in an audit row is a copy of personal data with no reader. */
      metadata: {
        adminId,
        fields: Object.keys(input),
        amountCents: totals.totalCents,
        lineCount: lines.length,
      },
    });

    return this.byId(orderId);
  }

  /**
   * Step two — the payment. Moves the SAME row from `address_only` to
   * `paid`; no separate admin-approval step. See the model doc for why.
   *
   * `userId` partitions ownership even for a guest: `null` matches only a
   * GUEST order (`userId IS NULL` in the WHERE below), so a signed-in caller
   * can never take over a guest's order by guessing its id, and a guest can
   * never take over a signed-in student's order the same way — the two
   * populations simply do not intersect in this WHERE clause. Knowing the
   * order's id (a UUIDv7, handed back only to whoever created it, and the
   * same id a guest's browser remembers in `localStorage` to resume this
   * exact step) is what stands in for a session here.
   */
  async submitPayment(
    userId: string | null,
    orderId: string,
    input: SubmitBookOrderPaymentInput,
  ): Promise<BookOrder> {
    if (!input.screenshotKey.startsWith(`${SCREENSHOT_PREFIX}/`)) {
      // Same guard `PaymentsService.submit` runs — refuses a key from an
      // unrelated upload (a course cover, a payment screenshot) rather than
      // letting this order attach someone else's picture as "proof".
      throw new BadRequestException('screenshotKey was not issued by POST /book-orders/screenshot');
    }

    const existing = await this.prisma.bookOrder.findFirst({
      // `userId` in the WHERE — an order id from another student's account
      // cannot be paid through this student's session.
      where: { id: orderId, userId },
      select: { id: true, status: true, courseId: true },
    });
    if (!existing) throw new NotFoundException();
    if (existing.status !== 'address_only') {
      throw new BadRequestException('this order was already paid');
    }

    const now = new Date();
    /*
      Paying is the moment this becomes somebody's job — `address_only` is a
      basket, `paid` is a parcel owed. So the alert is written in the SAME
      transaction as the status change: an order that reached `paid` with
      nobody told about it is exactly the silent queue this feature exists to
      close.
    */
    const { order, admins } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.bookOrder.update({
        where: { id: existing.id },
        data: {
          senderPhone: input.senderPhone,
          screenshotKey: input.screenshotKey,
          paidAt: now,
          status: 'paid',
        },
        select: ORDER_SELECT,
      });

      const recipients = await this.notifications.emitToPermission(
        tx,
        // The permission that opens the shipping queue — the same authority
        // that decides who may act on this decides who hears about it.
        'book-order:read',
        'book_order_placed',
        { orderId: updated.id },
      );

      return { order: updated, admins: recipients };
    });

    // After the commit. See `NotificationsService.announce`.
    await this.notifications.announceAll(admins);

    await this.audit.record({
      action: 'book-order:pay',
      resourceType: AUDIT_RESOURCES.bookOrder,
      resourceId: order.id,
      outcome: 'success',
      metadata: { userId, courseId: existing.courseId, amountCents: order.amountCents },
    });

    return this.toBookOrder(order);
  }

  /**
   * One order, by id — the read half of the same ownership rule
   * `submitPayment` enforces. Used to resume the flow: a guest's browser
   * keeps `{courseId, bookOrderId}` in `localStorage` across a closed tab,
   * and this is what turns that id back into "is this still address_only,
   * or already paid?" without ever needing a session to ask the question.
   *
   * Same partition as `submitPayment`: `userId: null` matches only a GUEST
   * order, so a signed-in caller cannot read a guest's order by guessing its
   * id and a guest cannot read a signed-in student's order the same way.
   */
  async getById(userId: string | null, orderId: string): Promise<BookOrder> {
    const row = await this.prisma.bookOrder.findFirst({
      where: { id: orderId, userId },
      select: ORDER_SELECT,
    });
    if (!row) throw new NotFoundException();
    return this.toBookOrder(row);
  }

  /** The caller's own orders, newest first. `userId` from the session, never the URL. */
  async listMine(userId: string): Promise<BookOrder[]> {
    const rows = await this.prisma.bookOrder.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: ORDER_SELECT,
    });
    return rows.map((row) => this.toBookOrder(row));
  }

  /**
   * The admin list — paid-vs-incomplete is a `status` filter, not two
   * endpoints, same convention as `PaymentsService.adminList`.
   */
  async adminList(query: AdminBookOrderQuery): Promise<{ rows: AdminBookOrderRow[]; rowCount: number }> {
    const where = query.status ? { status: query.status } : {};

    const [rowCount, rows] = await this.prisma.$transaction([
      this.prisma.bookOrder.count({ where }),
      this.prisma.bookOrder.findMany({
        where,
        // Oldest first — a shipping queue is a support ticket queue, same
        // convention as the payment review queue.
        orderBy: [{ createdAt: 'asc' }],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        select: {
          id: true,
          userId: true,
          amountCents: true,
          itemsCents: true,
          shippingCents: true,
          discountCents: true,
          fullName: true,
          phone: true,
          altPhone: true,
          governorateCode: true,
          city: true,
          addressStreet: true,
          addressBuilding: true,
          addressNote: true,
          adminNote: true,
          senderPhone: true,
          screenshotKey: true,
          status: true,
          createdAt: true,
          paidAt: true,
          shippedAt: true,
          // «كل واحد عايز كام كتاب» is read straight off this.
          items: {
            orderBy: { titleAr: 'asc' as const },
            select: { bookId: true, titleAr: true, unitPriceCents: true, quantity: true },
          },
          course: {
            select: { id: true, title: true, year: true, forGeneral: true, forLanguages: true, bookTitle: true },
          },
          governorate: { select: { nameAr: true } },
          user: { select: { name: true, email: true, phoneNumber: true } },
        },
      }),
    ]);

    return {
      rowCount,
      rows: rows.map((row) => ({
        id: row.id,
        // `null` for a guest order — no account is linked. `fullName`/
        // `phone` below (the order's OWN submitted fields) are what the
        // admin list and export actually rely on for shipping; `user.*`
        // here is incidental account context, shown only when it exists.
        userId: row.userId,
        studentName: row.user?.name ?? null,
        studentEmail: row.user?.email ?? null,
        studentPhone: row.user?.phoneNumber ?? null,
        /* All four null for a CART order — the basket may span two years and
           two subjects, so there is no course to name. `items` below is what
           such a row is made of. */
        courseId: row.course?.id ?? null,
        courseTitle: row.course?.title ?? null,
        courseYear: row.course?.year ?? null,
        courseForGeneral: row.course?.forGeneral ?? null,
        courseForLanguages: row.course?.forLanguages ?? null,
        bookTitle: row.course?.bookTitle ?? row.items[0]?.titleAr ?? '',
        items: row.items.map((item) => ({
          bookId: item.bookId,
          titleAr: item.titleAr,
          unitPriceCents: item.unitPriceCents,
          quantity: item.quantity,
        })),
        amountCents: row.amountCents,
        itemsCents: row.itemsCents,
        shippingCents: row.shippingCents,
        discountCents: row.discountCents,
        adminNote: row.adminNote,
        fullName: row.fullName,
        phone: row.phone,
        altPhone: row.altPhone,
        governorateCode: row.governorateCode,
        governorateNameAr: row.governorate.nameAr,
        city: row.city,
        addressStreet: row.addressStreet,
        addressBuilding: row.addressBuilding,
        addressNote: row.addressNote,
        senderPhone: row.senderPhone,
        hasScreenshot: row.screenshotKey !== null,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        paidAt: row.paidAt?.toISOString() ?? null,
        shippedAt: row.shippedAt?.toISOString() ?? null,
      })),
    };
  }

  /**
   * The book-order revenue tile on `/admin/finance` — deliberately its OWN
   * query, not something `FinanceService` reaches into this module for. A
   * book order grants no platform access at all (see the model doc), so its
   * money is a genuinely different product from a subscription's, and
   * Ayman explicitly wants it seen separately, never folded into the same
   * total. `/admin/finance`'s page composes this alongside the subscription
   * summary independently — two fetches, two tiles, never one merged number.
   *
   * A running total, not scoped to a calendar month — same correction as
   * `FinanceService`'s own `revenueTotalCents`: a fresh month starting the
   * tile back at zero read as money vanishing, not as a monthly figure
   * starting over.
   */
  async adminRevenueSummary(): Promise<{ revenueTotalCents: number; paidCount: number }> {
    const [paidCount, revenue] = await this.prisma.$transaction([
      this.prisma.bookOrder.count({ where: { status: { in: ['paid', 'shipped'] } } }),
      this.prisma.bookOrder.aggregate({
        where: { status: { in: ['paid', 'shipped'] } },
        _sum: { amountCents: true },
      }),
    ]);

    return { revenueTotalCents: revenue._sum.amountCents ?? 0, paidCount };
  }

  /** The screenshot's storage key, for the gated admin download route. */
  async screenshotKeyFor(orderId: string): Promise<string> {
    const row = await this.prisma.bookOrder.findUnique({
      where: { id: orderId },
      select: { screenshotKey: true },
    });
    if (!row || row.screenshotKey === null) throw new NotFoundException();
    return row.screenshotKey;
  }

  /**
   * «اتشحن» — records ONLY that the order shipped. No notification is sent
   * to the student; see the model doc on `BookOrder.shippedAt`.
   */
  async markShipped(adminId: string, orderId: string): Promise<{ id: string; status: 'shipped'; shippedAt: string }> {
    const order = await this.prisma.bookOrder.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, userId: true, courseId: true },
    });
    if (!order) throw new NotFoundException();
    if (order.status !== 'paid') {
      throw new BadRequestException(
        order.status === 'shipped' ? 'this order already shipped' : 'this order has not been paid yet',
      );
    }

    const now = new Date();
    await this.prisma.bookOrder.update({
      where: { id: order.id },
      data: { status: 'shipped', shippedAt: now, shippedByUserId: adminId },
    });

    await this.audit.record({
      action: 'book-order:ship',
      resourceType: AUDIT_RESOURCES.bookOrder,
      resourceId: order.id,
      outcome: 'success',
      metadata: { userId: order.userId, courseId: order.courseId, adminId },
    });

    return { id: order.id, status: 'shipped', shippedAt: now.toISOString() };
  }

  /**
   * The shipping-desk spreadsheet — handed directly to a shipping company
   * and a print shop, so every column is something one of them needs and
   * nothing is a platform-internal id.
   *
   * `status` is EXPLICIT here, not a hidden default — the admin route always
   * receives one, and the web page's own filter picker is what makes "paid,
   * not yet shipped" (the practical everyday export) a visible choice rather
   * than a silently baked-in one. Exporting `shipped` orders (a reprint
   * request) or `address_only` ones (chasing up abandoned carts) are both
   * legitimate, rarer uses of the same button.
   */
  async exportXlsx(status: BookOrderStatus): Promise<Buffer> {
    const rows = await this.prisma.bookOrder.findMany({
      where: { status },
      orderBy: [{ createdAt: 'asc' }],
      select: {
        fullName: true,
        phone: true,
        altPhone: true,
        city: true,
        addressStreet: true,
        addressBuilding: true,
        addressNote: true,
        amountCents: true,
        shippingCents: true,
        createdAt: true,
        items: {
          orderBy: { titleAr: 'asc' as const },
          select: { titleAr: true, unitPriceCents: true, quantity: true },
        },
        course: { select: { title: true, year: true, forGeneral: true, forLanguages: true, bookTitle: true } },
        governorate: { select: { nameAr: true } },
      },
    });

    const streamLabel = {
      general: copy.stream.general,
      languages: copy.stream.languages,
      both: copy.stream.both,
    };

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('طلبات الكتب');
    // `views` sets right-to-left so an Arabic spreadsheet actually reads
    // right-to-left when opened, rather than mirrored column order in an
    // LTR grid.
    sheet.views = [{ rightToLeft: true }];
    sheet.columns = [
      { header: 'اسم الكتاب', key: 'bookTitle', width: 28 },
      // The two columns the print shop actually packs from. They are NEW, and
      // they are why an order with three titles is now three rows instead of
      // one line reading «كتاب» with no count — a packing list that does not say
      // how many is a packing list somebody has to phone about.
      { header: 'العدد', key: 'quantity', width: 8 },
      { header: 'سعر النسخة (جنيه)', key: 'unitPrice', width: 16 },
      { header: 'الكورس', key: 'courseTitle', width: 28 },
      { header: 'الصف', key: 'year', width: 8 },
      { header: 'عام / لغات', key: 'stream', width: 14 },
      { header: 'الاسم بالكامل', key: 'fullName', width: 24 },
      { header: 'الموبايل', key: 'phone', width: 16 },
      { header: 'موبايل تاني', key: 'altPhone', width: 16 },
      { header: 'المحافظة', key: 'governorate', width: 16 },
      { header: 'المدينة', key: 'city', width: 18 },
      { header: 'الشارع', key: 'street', width: 28 },
      { header: 'رقم العمارة', key: 'building', width: 14 },
      { header: 'تفاصيل إضافية', key: 'note', width: 28 },
      { header: 'الشحن (جنيه)', key: 'shipping', width: 12 },
      { header: 'إجمالي الطلب (جنيه)', key: 'amount', width: 18 },
      { header: 'تاريخ الطلب', key: 'createdAt', width: 18 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const row of rows) {
      /*
       * ONE ROW PER BOOK, not per order.
       *
       * A courier packs titles, and an order with three of them collapsed onto
       * one line is a line somebody has to phone about. The address is repeated
       * on each — spreadsheets are read by sorting and filtering, and a blank
       * address on the second line of a group disappears the moment anyone does
       * either.
       *
       * ⚠️ `shipping` and `amount` are the ORDER's, so they are written on the
       * FIRST line only and left blank on the rest. Repeating them would make a
       * SUM over the column count one delivery three times, and that column is
       * the one somebody will total.
       */
      const stream = row.course ? streamLabel[streamChoiceOf(row.course)] : '';
      row.items.forEach((item, index) => {
        sheet.addRow({
          bookTitle: item.titleAr,
          quantity: item.quantity,
          unitPrice: item.unitPriceCents / 100,
          courseTitle: row.course?.title ?? '',
          year: row.course?.year ?? '',
          stream,
          fullName: row.fullName,
          phone: row.phone,
          altPhone: row.altPhone,
          governorate: row.governorate.nameAr,
          city: row.city,
          street: row.addressStreet,
          building: row.addressBuilding,
          note: row.addressNote ?? '',
          shipping: index === 0 ? row.shippingCents / 100 : '',
          amount: index === 0 ? row.amountCents / 100 : '',
          createdAt: index === 0 ? row.createdAt.toISOString().slice(0, 10) : '',
        });
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
