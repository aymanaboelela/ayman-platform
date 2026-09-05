import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { BookOrder, BookOrderStatus, CreateBookOrderInput, SubmitBookOrderPaymentInput } from '@ayman/contracts/book-orders';
import type {
  AdminBookOrderFilter,
  AdminBookOrderQuery,
  AdminBookOrderRow,
  AdminCreateBookOrderInput,
  DeleteBookOrderResult,
  MarkBookOrderDeliveredResult,
  MarkBookOrderShippedResult,
  RejectBookOrderResult,
  RestoreBookOrderResult,
} from '@ayman/contracts/admin/book-orders';
import type { AdminBookOrderPatchInput } from '@ayman/contracts/admin/books';
import { bookOrderTotals } from '@ayman/contracts/books';
import { toAsciiDigits } from '@ayman/contracts/phone';
import { streamChoiceOf } from '@ayman/contracts/content';
import { copy } from '@ayman/contracts/copy';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { BooksService } from '../books/books.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MediaService, type UploadFile } from '../media/media.service';
import { COURSE_BOOK_SELECT, courseBook } from '../books/course-book';

/** The prefix `POST /book-orders/screenshot` stores under — same reasoning
 *  as `PaymentsService`'s own `SCREENSHOT_PREFIX`: never served through the
 *  public `/media/:prefix/:name` route. */
const SCREENSHOT_PREFIX = 'book-order-proof';

/**
 * The digits of a PARTIAL phone number, in the form they are stored in.
 *
 * `normalizeEgyptianPhone` is the wrong tool here: it parses a WHOLE number
 * and answers `null` for anything shorter, so every search typed one digit at
 * a time would match nothing until the last keystroke. This keeps only the
 * digits, then drops the country code or the trunk zero the caller may or may
 * not have typed — `01015186`, `+201015186` and `201015186` all become
 * `1015186`, which is a substring of the stored `+201015186...` in all three
 * cases. Arabic-Indic digits go through `toAsciiDigits` first: a phone typed
 * on an Egyptian keyboard is «٠١٠١٥١٨٦», and comparing that to ASCII would
 * silently match nothing.
 *
 * Returns `null` below three digits — one or two digits appear inside every
 * number in the table, so the "phone" leg of the search would add every row
 * to a result set the admin is trying to narrow.
 */
function phoneSearchDigits(value: string): string | null {
  const digits = toAsciiDigits(value).replace(/\D/g, '');
  const local = digits.startsWith('20') ? digits.slice(2) : digits.replace(/^0+/, '');
  return local.length >= 3 ? local : null;
}

/**
 * عام ولا لغات، على السطر نفسه.
 *
 * The two booleans are read LIVE off the linked book rather than frozen onto
 * the line, and `BookOrderLineSchema` says at length why: the title and the
 * price are what the customer AGREED TO and must never be rewritten, but which
 * school the printed book is for is a fact about the OBJECT — if the admin
 * corrects it, the person packing the box should read the correction.
 *
 * ONE select shared by every place a line is read, for the same reason
 * `ORDER_SELECT` below is one constant: the admin list, the export and the
 * student's own confirmation must not be able to disagree about what a line is.
 */
const ORDER_ITEM_SELECT = {
  orderBy: { titleAr: 'asc' },
  select: {
    bookId: true,
    titleAr: true,
    unitPriceCents: true,
    quantity: true,
    /* `null` for a line with no `bookId` — one the admin typed by hand, or one
       whose book row has since been deleted. Both flags fall to `null`
       together; see the contract's own note on why that is honest rather than
       a default of «الاتنين». */
    book: { select: { forGeneral: true, forLanguages: true } },
  },
} as const;

/** One line as the API hands it back, stream included. */
interface OrderLineRow {
  bookId: string | null;
  titleAr: string;
  unitPriceCents: number;
  quantity: number;
  book: { forGeneral: boolean; forLanguages: boolean } | null;
}

/** `ORDER_ITEM_SELECT` → the wire shape, in one place. */
function toOrderLine(item: OrderLineRow) {
  return {
    bookId: item.bookId,
    titleAr: item.titleAr,
    unitPriceCents: item.unitPriceCents,
    quantity: item.quantity,
    forGeneral: item.book?.forGeneral ?? null,
    forLanguages: item.book?.forLanguages ?? null,
  };
}

/**
 * كل قراءة بتخفي المحذوف — إلا تبويب «المحذوفة».
 *
 * The one place the soft-delete rule is spelled out, because it is a rule that
 * fails SILENTLY: a read that forgets `deletedAt: null` does not throw, it just
 * keeps counting an order the admin decided did not happen — in the revenue
 * tile, in the sidebar badge, in the shipping spreadsheet. Every one of those
 * is a number somebody acts on.
 *
 * `'deleted'` is a VIEW and not a status (see `AdminBookOrderFilterSchema`), so
 * it drops the status filter entirely: a deleted row KEEPS the status it was
 * deleted from, and that is exactly what the admin looking at the tab needs to
 * see. Every other value, and no value at all, means «مش محذوف».
 */
function liveOrDeletedWhere(status: AdminBookOrderFilter | undefined): Prisma.BookOrderWhereInput {
  if (status === 'deleted') return { deletedAt: { not: null } };
  return { deletedAt: null, ...(status ? { status } : {}) };
}

/**
 * مين يقدر يفتح الطلب ده — the ownership half of `getById`/`submitPayment`.
 *
 * ## A SIGNED-IN caller: their own rows, and nothing else
 *
 * `userId` goes into the WHERE, so another account's order — or a guest order
 * nobody owns — is a 404 through this session.
 *
 * ## An ANONYMOUS caller: unclaimed rows only, with the id as the credential
 *
 * `userId: null` is doing two jobs and both matter. It is what lets guest
 * checkout work at all: the confirmation panel resumes from `localStorage` and
 * the payment step runs with no session, and a UUIDv7 handed back only to
 * whoever created the order is the sole proof either of them has. And it is
 * what keeps an ACCOUNT-placed order behind its account — that order carries a
 * student's full name, both phone numbers and their home address, and none of
 * that should be reachable by holding an id.
 *
 * ⚠️ Do not widen this to «match on the id alone». It is tempting the moment
 * anything starts writing `userId` onto a guest row, because then the browser
 * that placed the order 404s on its own read — and the fix is to stop writing
 * it (see `create`), not to open the anonymous branch. The read-time link in
 * `listMine` and `studentIdForOrder` gives the student their order without
 * either cost.
 *
 * ⚠️ Both branches are ADDITIONALLY narrowed by `deletedAt: null` at every call
 * site. It is not folded in here on purpose — the admin restore path reads a
 * deleted row by id and must not inherit a filter from a helper whose name is
 * about ownership.
 */
function ownershipWhere(userId: string | null): Prisma.BookOrderWhereInput {
  return { userId };
}

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
  /* The three lifecycle stamps the student's own screen renders. `rejectedAt`
     and `rejectionReason` are inseparable at the database
     (`book_orders_rejection_has_a_reason`), so a row that carries one always
     carries the other and the card never has to render «مرفوض» with nothing
     after it. */
  deliveredAt: true,
  rejectedAt: true,
  rejectionReason: true,
  createdAt: true,
  course: { select: { title: true, bookTitle: true } },
  items: ORDER_ITEM_SELECT,
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
  status: BookOrderStatus;
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
  deliveredAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  course: { title: string; bookTitle: string | null } | null;
  items: OrderLineRow[];
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
      items: row.items.map(toOrderLine),
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
      deliveredAt: row.deliveredAt?.toISOString() ?? null,
      rejectedAt: row.rejectedAt?.toISOString() ?? null,
      rejectionReason: row.rejectionReason,
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
   *
   * ## اللي طلب من غير حساب وهو أصلاً مسجّل
   *
   * A guest order whose phone number belongs to a registered student is
   * ATTACHED to that student here, at write time. «فيه ناس اشترت فعلاً، شوف هل
   * دول متسجلين — لو متسجلين يبقى الكتاب موجود عنده إنه خلاص اشتراه»: the
   * platform knew the student had bought the book and could not tell them so,
   * because guest checkout left the column null.
   *
   * `20260904120100_books_stream_placement_and_order_lifecycle` back-fills the
   * history; this is what stops the problem growing, so that backfill stays a
   * one-off rather than a job somebody has to remember to re-run.
   *
   * ⚠️ On `phone` ONLY, never `altPhone`. The alternate number is routinely a
   * parent's — that is the case the second field exists for — and matching on
   * it would file a child's order under a parent's account, or under a sibling
   * who happens to have signed up with the same household number.
   *
   * The match is exact rather than fuzzy and needs no normalisation of its own:
   * `users.phone_number` is UNIQUE and stored in E.164, and `input.phone` has
   * already been through `egyptianPhone()` by the time it reaches here, so both
   * sides are the same canonical string. A number that matches nobody stays a
   * guest order and behaves exactly as it did before — see `getById` for the
   * access rule that keeps the placing browser's own read working either way.
   */
  async create(userId: string | null, input: CreateBookOrderInput): Promise<BookOrder> {
    /* ⚠️ The session's id, or NULL — never a phone lookup.
       The obvious «اربطه بالحساب» is to fill `userId` in from
       `users.phone_number` here. It was written that way first, and it takes
       something away from the person it is meant to help: `getById` treats the
       order id as the bearer token for an UNCLAIMED row, which is how the
       confirmation panel resumes from `localStorage` and how the payment step
       works with no session at all. Stamping an account onto the row turns the
       browser's very next read into a 404 — a stranger who is registered gets
       locked out of paying for the book they are mid-way through buying, and
       only them. The alternative fix, widening the anonymous branch to match on
       the id alone, buys that back by letting anybody holding an id read an
       account-placed order's home address.
       Neither is necessary. The link is made at READ time — `listMine` unions
       on the phone, and `studentIdForOrder` resolves the notification's
       recipient the same way — so the row is never claimed, the guest keeps the
       access they had, and the student still sees the order. */
    const ownerId = userId;
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
        userId: ownerId,
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
        userId: ownerId,
        courseId: priced.courseId,
        amountCents: totals.totalCents,
        lineCount: priced.lines.length,
        /* Whether anybody was signed in when this was placed. A guest row is
           never claimed afterwards, so this stays true for its whole life and
           is the only record that the order arrived without a session. */
        guest: userId === null,
      },
    });

    return this.byId(order.id);
  }

  /**
   * The account behind a phone number, or `null` — the whole of the guest→
   * student link.
   *
   * `findUnique` and not `findFirst`: `users.phone_number` is UNIQUE, so a
   * number matches at most one account and there is no "which one" to decide.
   * `null` phone numbers cannot collide either — a `null` argument would be a
   * `WHERE phone_number IS NULL` that Prisma refuses on a unique lookup, and
   * `input.phone` is required by the contract, so it never happens.
   */
  /**
   * Who to notify about an order — «الطالب» even when the row says nobody.
   *
   * `order.userId` when a session placed it. Otherwise the account whose
   * `phone_number` the order carries, which is the same read-time link
   * `listMine` makes and the reason `create` never writes the column: a guest
   * row stays a guest row, and its owner is worked out fresh each time.
   *
   * `null` when the number belongs to nobody — a real stranger with no account,
   * which is what guest checkout is for. That is not a degraded case to work
   * around; there is simply no bell to ring, and the admin tells them himself.
   */
  private async studentIdForOrder(order: {
    userId: string | null;
    phone: string;
  }): Promise<string | null> {
    return order.userId ?? (await this.userIdForPhone(order.phone));
  }

  private async userIdForPhone(phone: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { phoneNumber: phone },
      select: { id: true },
    });
    return user?.id ?? null;
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
   * ## ⚠️ The price here is the price the student was SHOWN
   *
   * This method used to read `course.bookPriceCents` while the course page read
   * the catalogue, and that was the whole «توحدلي» bug: an admin repricing a
   * book in `/admin/books/catalog` changed the number on the button and not the
   * number charged when it was pressed. Nothing surfaced the difference — the
   * order simply recorded the old amount, and the student's screenshot was for
   * the new one.
   *
   * `courseBook()` is now the only answer to «الكتاب بتاع الكورس ده», and both
   * sides call it. It must stay that way: a second copy of the predicate here
   * reopens the gap from the pricing side, which is the side that costs money.
   *
   * It also settles what «مفيش كتاب» means. A live catalogue row with
   * `showOnCourse: false` returns nothing — «الكتاب ده يتباع من قسم الكتب بس» —
   * so this 400s rather than quietly selling it at the legacy price, and the
   * button the student would have needed is not on the page either.
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
        /* `stock` on top of the shared select: `courseBook` does not need it,
           the availability check below does, and the shop path has always made
           it. */
        book: { select: { ...COURSE_BOOK_SELECT, stock: true } },
      },
    });
    if (!course || course.status !== 'published') throw new NotFoundException();

    const { bookTitle, bookPriceCents, bookId } = courseBook(course);
    if (bookTitle === null || bookPriceCents === null) {
      throw new BadRequestException('this course has no book to order');
    }

    /* `null` stock means «مش بنعد»; only a real number is a limit. The shop
       path checks this per line and this one did not, so a course button could
       sell the last copy twice. */
    if (bookId !== null && course.book!.stock !== null && course.book!.stock < 1) {
      throw new BadRequestException(`«${bookTitle}» مفيش منه العدد ده دلوقتي`);
    }

    return {
      courseId: course.id,
      lines: [
        {
          /* The catalogue row the price came FROM, so the admin screen and the
             per-title order count see this exactly like a shop order. `null` on
             the legacy branch — see `courseBook`: there is no row that priced
             it, and pointing at one would attach the order to a book it was not
             sold at. */
          bookId,
          titleAr: bookTitle,
          unitPriceCents: bookPriceCents,
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
   * Ownership is `ownershipWhere` — see that helper for why the anonymous half
   * of it is "the id alone" now that a guest's order can be attached to an
   * account it was never placed from.
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
      // A deleted order is not payable — «الطلب ده اتشال» — and a 404 is the
      // honest answer to a browser resuming a `localStorage` id for a row the
      // admin removed. Restoring it is the admin's own action, not a side
      // effect of somebody uploading a screenshot at it.
      where: { id: orderId, deletedAt: null, ...ownershipWhere(userId) },
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
   * `deletedAt: null` for the same reason `submitPayment` carries it: a row
   * the admin removed from every working list must not still answer a public
   * route with a name, a phone number and a street address on it.
   */
  async getById(userId: string | null, orderId: string): Promise<BookOrder> {
    const row = await this.prisma.bookOrder.findFirst({
      where: { id: orderId, deletedAt: null, ...ownershipWhere(userId) },
      select: ORDER_SELECT,
    });
    if (!row) throw new NotFoundException();
    return this.toBookOrder(row);
  }

  /** The caller's own orders, newest first. `userId` from the session, never
   *  the URL, and never a row the admin deleted — «اتشال» has to mean gone
   *  from the student's history too, or the one screen the deletion was
   *  supposed to clean up is the one that still shows it. */
  async listMine(userId: string): Promise<BookOrder[]> {
    const phone = await this.phoneOf(userId);

    const rows = await this.prisma.bookOrder.findMany({
      where: {
        deletedAt: null,
        OR: [
          { userId },
          /* «اللي اشتروا قبل ما يسجّلوا» — the read-time half of the guest link.
             Guest checkout leaves `userId` NULL forever (see `create`), so a
             student who ordered signed-out, or ordered before they had an
             account at all, owns rows this query would otherwise never see.
             The number is what connects them: `users.phone_number` is UNIQUE
             and E.164, and `book_orders.phone` goes through `egyptianPhone()`,
             which normalises to the same form before it is written — so this is
             an equality on two canonical strings, not a fuzzy match.
             `phone`, never `altPhone`: the second number is routinely a
             parent's, and matching on it would put one sibling's order in
             another's history. And only rows still UNCLAIMED — `userId: null`
             — so this can never reach into another account's orders. */
          ...(phone ? [{ userId: null, phone }] : []),
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: ORDER_SELECT,
    });
    return rows.map((row) => this.toBookOrder(row));
  }

  /**
   * The student's own number, for the guest-order union above.
   *
   * `null` for an account that has none — and the caller drops the whole OR arm
   * rather than passing it through, because `{ userId: null, phone: null }`
   * would be a `WHERE phone IS NULL` against a NOT NULL column: harmless today,
   * and exactly the shape that silently matches everything the day somebody
   * makes the column nullable.
   */
  private async phoneOf(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phoneNumber: true },
    });
    return user?.phoneNumber ?? null;
  }

  /**
   * «أوصل للطالب» — the free-text leg of the admin list.
   *
   * One box, three kinds of answer, because that is how the caller identifies
   * themselves on the phone: a NAME (the order's own `fullName`, which is the
   * shipping name and may differ from the account's, plus the linked account's
   * `name`/`email` when there is one), a NUMBER (any of the three the order
   * carries — the contact number, the second number «حول من», and the
   * Vodafone Cash number the transfer came from, since a parent transferring
   * for their child is the case the second number exists for), or a PLACE (the
   * governorate as it is written on the row, the city, and the street line).
   * Book titles are in as well: «مين طلب كتاب البرمجة» is the same question
   * asked from the other side.
   *
   * The phone leg goes through `phoneSearchDigits` rather than matching the
   * typed string — see that function for why a raw `contains` on `01015186`
   * finds nothing against a stored `+201015186...`.
   *
   * `mode: 'insensitive'` on the text legs only. It is what makes an English
   * name typed in lower case match one saved capitalised; on the phone
   * columns it would be a per-row `LOWER()` over digits for no benefit.
   */
  private adminSearchWhere(q: string): Prisma.BookOrderWhereInput {
    const term = q.trim();
    if (!term) return {};

    const text = { contains: term, mode: 'insensitive' as const };
    const digits = phoneSearchDigits(term);

    return {
      OR: [
        { fullName: text },
        { city: text },
        { addressStreet: text },
        { addressBuilding: text },
        { addressNote: text },
        { governorate: { nameAr: text } },
        { items: { some: { titleAr: text } } },
        { course: { title: text } },
        { user: { OR: [{ name: text }, { email: text }] } },
        ...(digits
          ? [
              { phone: { contains: digits } },
              { altPhone: { contains: digits } },
              { senderPhone: { contains: digits } },
            ]
          : []),
      ],
    };
  }

  /**
   * The admin list — paid-vs-incomplete is a `status` filter, not two
   * endpoints, same convention as `PaymentsService.adminList`.
   *
   * The sidebar's «الكتب» badge is this same query with `status=paid`
   * (`book-orders-alerts.tsx` polls the route rather than a count of its own),
   * so `liveOrDeletedWhere` below is what keeps a deleted order off the badge
   * as well — one filter, not two that can drift apart.
   */
  async adminList(query: AdminBookOrderQuery): Promise<{ rows: AdminBookOrderRow[]; rowCount: number }> {
    const where = {
      ...liveOrDeletedWhere(query.status),
      ...this.adminSearchWhere(query.q),
    };

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
          deliveredAt: true,
          rejectedAt: true,
          rejectionReason: true,
          deletedAt: true,
          deletionReason: true,
          // «كل واحد عايز كام كتاب» is read straight off this — with the
          // line's own «عربي / لغات» beside it, which is what the packing list
          // could never say for a cart order.
          items: ORDER_ITEM_SELECT,
          course: {
            select: { id: true, title: true, year: true, forGeneral: true, forLanguages: true, bookTitle: true },
          },
          governorate: { select: { nameAr: true } },
          user: { select: { name: true, email: true, phoneNumber: true } },
        },
      }),
    ]);

    /*
     * «أعرف إن الراجل ده طلب كتاب قبل كده ولا لأ» — ONE grouped count for the
     * whole page, keyed by phone number.
     *
     * The same trick `BooksService.adminList` uses for `orderedCount`, and for
     * the same reason: a per-row `_count` would be a correlated subquery
     * executed once per row on a screen whose whole purpose is comparing rows.
     *
     * Counted on `phone` and NOT on `userId`, which is the entire point —
     * guest checkout means one person is several unlinked rows, and the number
     * they typed is the only thing all of them share. Soft-deleted orders are
     * excluded: «طلب قبل كده» is a claim about a real history, and a row the
     * admin hid is one they decided did not happen.
     */
    const phones = [...new Set(rows.map((row) => row.phone))];
    const grouped =
      phones.length === 0
        ? []
        : await this.prisma.bookOrder.groupBy({
            by: ['phone'],
            where: { phone: { in: phones }, deletedAt: null },
            _count: { _all: true },
          });
    const ordersByPhone = new Map(grouped.map((entry) => [entry.phone, entry._count._all]));

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
        items: row.items.map(toOrderLine),
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
        deliveredAt: row.deliveredAt?.toISOString() ?? null,
        rejectedAt: row.rejectedAt?.toISOString() ?? null,
        rejectionReason: row.rejectionReason,
        deletedAt: row.deletedAt?.toISOString() ?? null,
        deletionReason: row.deletionReason,
        /* «كام طلب TANI» — the row itself is subtracted, so `0` is the common
           case and the badge is simply absent for it. The subtraction is
           conditional because a row on the «المحذوفة» tab was never in the
           grouped count above, and taking one off anyway would report `-1`
           worth of history as `0` on the very screen that shows deleted rows
           beside live ones. */
        previousOrdersFromPhone: Math.max(
          (ordersByPhone.get(row.phone) ?? 0) - (row.deletedAt === null ? 1 : 0),
          0,
        ),
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
    /*
     * `delivered` counts as money received — it is `shipped` one step later,
     * not a different kind of sale — and `rejected` never does: the whole
     * meaning of turning an order down is that it is not owed and not paid.
     *
     * `deletedAt: null` is the one that is easy to leave out and the one that
     * matters most here. «واحد دفع فلوس» is exactly why deletion is soft: the
     * row survives, so a read that forgets this filter keeps a hidden order in
     * a total nobody can trace back to it.
     */
    const counted: Prisma.BookOrderWhereInput = {
      status: { in: ['paid', 'shipped', 'delivered'] },
      deletedAt: null,
    };

    const [paidCount, revenue] = await this.prisma.$transaction([
      this.prisma.bookOrder.count({ where: counted }),
      this.prisma.bookOrder.aggregate({ where: counted, _sum: { amountCents: true } }),
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
   * The row an admin action is about, loaded once with everything the four
   * transitions below need to decide and to record.
   *
   * `deletedAt` is selected rather than filtered on, because "this order is
   * deleted" is a different answer from "there is no such order": `restore`
   * needs the deleted row, and the other three need to say «رجّعه الأول»
   * instead of a 404 that reads as a bad id.
   */
  private async orderForAdminAction(orderId: string) {
    const order = await this.prisma.bookOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        userId: true,
        /* For `studentIdForOrder`: a guest row's `userId` is NULL forever, and
           the number is what finds the account to notify. */
        phone: true,
        courseId: true,
        deletedAt: true,
        deletionReason: true,
      },
    });
    if (!order) throw new NotFoundException();
    return order;
  }

  /**
   * «اتشحن» — the parcel left the office.
   *
   * ## The student IS told, as of 2026-09-04
   *
   * This method's own docblock used to say the opposite, and so did the model
   * comment beside `BookOrder.shippedAt`: shipping recorded a timestamp and
   * deliberately sent nothing, on the reasoning that Ayman told people himself,
   * outside the platform. That decision was reversed — «الطالب يعرف إن الكتاب
   * في الطريق، وبعدين يعرف إنه وصل» — so the notification is written HERE, in
   * the same transaction as the status change, exactly the way `submitPayment`
   * writes the admin's alert. A stamped `shippedAt` with nobody told about it
   * is the silent state this pair of transitions exists to remove.
   *
   * ⚠️ Only when `userId` is non-null. Most rows in this table are guests, and
   * there is no account to write a notification row against; that is not a
   * degraded case to work around, it is what guest checkout means. The
   * recipient is resolved through `studentIdForOrder`, so a guest order placed
   * on a registered student's own number still reaches their bell — without the
   * row ever being claimed. See `create` for why claiming it is the wrong fix.
   */
  async markShipped(adminId: string, orderId: string): Promise<MarkBookOrderShippedResult> {
    const order = await this.orderForAdminAction(orderId);
    this.assertNotDeleted(order);
    if (order.status !== 'paid') {
      throw new BadRequestException(
        order.status === 'shipped' ? 'this order already shipped' : 'this order has not been paid yet',
      );
    }

    const now = new Date();
    const studentId = await this.studentIdForOrder(order);
    await this.prisma.$transaction(async (tx) => {
      await tx.bookOrder.update({
        where: { id: order.id },
        data: { status: 'shipped', shippedAt: now, shippedByUserId: adminId },
      });
      if (studentId !== null) {
        await this.notifications.emit(tx, {
          userId: studentId,
          kind: 'book_order_shipped',
          orderId: order.id,
        });
      }
    });

    // After the commit, never inside it. See `NotificationsService.announce`.
    if (studentId !== null) await this.notifications.announce(studentId);

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
   * «وصل» — the student has the book in their hands.
   *
   * ## Why `paid` OR `shipped`, and not just `shipped`
   *
   * The obvious lifecycle is paid → shipped → delivered, and most orders walk
   * it. But Ayman hands books over himself — at the centre, to a student who
   * came to collect — and that parcel was never given to a courier. Forcing
   * «اتشحن» first to unlock «وصل» would make the admin record a shipment that
   * did not happen, i.e. put a lie in the audit trail to satisfy a state
   * machine. Two entry points, one destination.
   *
   * `shippedAt` is deliberately NOT back-filled on that path: it means "handed
   * to the courier", and inventing a time for it would be the same lie one
   * column over. A delivered order with `shippedAt: null` reads correctly —
   * «اتسلّم باليد».
   *
   * ## Every refusal says which case it is
   *
   * A single «مش ينفع» would leave the admin guessing between "you have not
   * recorded the payment yet", "somebody already pressed this" and "this order
   * was turned down". They are three different next actions.
   */
  async markDelivered(adminId: string, orderId: string): Promise<MarkBookOrderDeliveredResult> {
    const order = await this.orderForAdminAction(orderId);
    this.assertNotDeleted(order);
    if (order.status !== 'paid' && order.status !== 'shipped') {
      throw new BadRequestException(
        order.status === 'delivered'
          ? 'this order was already marked delivered'
          : order.status === 'rejected'
            ? 'this order was rejected — restore it to a live status first'
            : 'this order has not been paid yet',
      );
    }

    const now = new Date();
    const studentId = await this.studentIdForOrder(order);
    await this.prisma.$transaction(async (tx) => {
      await tx.bookOrder.update({
        where: { id: order.id },
        data: { status: 'delivered', deliveredAt: now, deliveredByUserId: adminId },
      });
      if (studentId !== null) {
        await this.notifications.emit(tx, {
          userId: studentId,
          kind: 'book_order_delivered',
          orderId: order.id,
        });
      }
    });

    if (studentId !== null) await this.notifications.announce(studentId);

    await this.audit.record({
      action: 'book-order:deliver',
      resourceType: AUDIT_RESOURCES.bookOrder,
      resourceId: order.id,
      outcome: 'success',
      /* `from` and not just the new state: «كان مدفوع وبعتّه» and «سلّمته
         باليد من غير شحن» end in the same row and are different facts. */
      metadata: { userId: order.userId, courseId: order.courseId, adminId, from: order.status },
    });

    return { id: order.id, status: 'delivered', deliveredAt: now.toISOString() };
  }

  /**
   * «أرفضه» — the order is turned down, and the student is told why.
   *
   * ## Rejecting is not deleting
   *
   * The row STAYS in the list, keeps its money on the screen and stays visible
   * to the student with the reason on it. `softDelete` below is the other
   * thing: gone from every working list, and the student is told nothing. The
   * two are one click apart in the admin and must never be one method with a
   * flag — «التحويل ما وصلش» is a decision about the CUSTOMER, and «طلب مكرر»
   * is a decision about the LIST.
   *
   * ## Allowed from every live status
   *
   * Including `shipped` and `delivered`, deliberately: a parcel that came back,
   * or a transfer that turned out to be someone else's, is discovered after the
   * fact more often than before it. The only refusals are an order that is
   * already rejected (nothing to decide twice) and one that is deleted (put it
   * back first — an admin acting on a hidden row cannot see what they are
   * acting on).
   *
   * `rejectionReason` is written in the same statement as `rejectedAt` because
   * `book_orders_rejection_has_a_reason` will not accept them apart, and
   * `book_orders_rejected_status_matches` will not accept the status without
   * the timestamp. All three in one `update` means the constraints can only
   * ever fire on a bug in this method — which is what a constraint is for.
   */
  async reject(adminId: string, orderId: string, reason: string): Promise<RejectBookOrderResult> {
    const order = await this.orderForAdminAction(orderId);
    this.assertNotDeleted(order);
    if (order.status === 'rejected') {
      throw new BadRequestException('this order was already rejected');
    }

    const now = new Date();
    const studentId = await this.studentIdForOrder(order);
    await this.prisma.$transaction(async (tx) => {
      await tx.bookOrder.update({
        where: { id: order.id },
        data: {
          status: 'rejected',
          rejectedAt: now,
          rejectedByUserId: adminId,
          rejectionReason: reason,
        },
      });
      if (studentId !== null) {
        await this.notifications.emit(tx, {
          userId: studentId,
          kind: 'book_order_rejected',
          orderId: order.id,
          /* The admin's own words, carried through and shown verbatim — the
             same rule `payment_rejected` follows. A reason the platform
             paraphrases is a reason the student argues with instead of acting
             on. */
          reason,
        });
      }
    });

    if (studentId !== null) await this.notifications.announce(studentId);

    await this.audit.record({
      action: 'book-order:reject',
      resourceType: AUDIT_RESOURCES.bookOrder,
      resourceId: order.id,
      outcome: 'success',
      /* The reason IS in the trail here, unlike the address text `adminPatch`
         withholds: it is the admin's own sentence about their own decision, it
         was shown to the student, and «قاله إيه» is the first question if the
         student disputes it. */
      metadata: { userId: order.userId, courseId: order.courseId, adminId, from: order.status, reason },
    });

    return {
      id: order.id,
      status: 'rejected',
      rejectedAt: now.toISOString(),
      rejectionReason: reason,
    };
  }

  /**
   * «أحذفه وأكتب سبب الحذف» — gone from every working list, still in the table.
   *
   * ## `status` is deliberately NOT touched
   *
   * An order can be deleted from any state, and writing `status: 'deleted'`
   * would erase the state it was deleted FROM — which is the one thing the
   * admin looking at «المحذوفة» needs to see, and the reason the enum has no
   * such member (see `BookOrderStatusSchema`'s own warning). `restore` below
   * therefore has nothing to put back except the three deletion columns.
   *
   * ## No notification, and that is not an oversight
   *
   * Most of these rows are guests with no account to notify, and the ones that
   * are not are still the wrong audience: deleting is an administrative tidy-up
   * of a list — a duplicate, a test row, an order cancelled on the phone — not
   * a decision ABOUT the customer. The decision about the customer is `reject`,
   * and it does notify. Sending «طلبك اتشال» for a duplicate somebody placed
   * twice would be the platform reporting its own housekeeping as bad news.
   *
   * Soft, because «واحد دفع فلوس»: the row is money that was received and is
   * counted in «إيرادات الكتب». A real DELETE would restate a month's revenue
   * with nothing left to explain the difference, and could not be undone by
   * whoever clicked the wrong row.
   */
  async softDelete(adminId: string, orderId: string, reason: string): Promise<DeleteBookOrderResult> {
    const order = await this.orderForAdminAction(orderId);
    /* Refused rather than treated as a re-delete: the second reason would
       silently replace the first, and the first is the one that explains why
       the row is where the admin found it. */
    if (order.deletedAt !== null) {
      throw new BadRequestException('this order was already deleted');
    }

    const now = new Date();
    await this.prisma.bookOrder.update({
      where: { id: order.id },
      data: { deletedAt: now, deletedByUserId: adminId, deletionReason: reason },
    });

    await this.audit.record({
      action: 'book-order:delete',
      resourceType: AUDIT_RESOURCES.bookOrder,
      resourceId: order.id,
      outcome: 'success',
      // `status` is what it was deleted FROM, and it is the field the row keeps
      // — recording it here means the trail says the same thing the «المحذوفة»
      // tab does.
      metadata: { userId: order.userId, courseId: order.courseId, adminId, status: order.status, reason },
    });

    return { id: order.id, deletedAt: now.toISOString(), deletionReason: reason };
  }

  /**
   * «رجّعه» — undo a deletion.
   *
   * All three deletion columns are cleared together;
   * `book_orders_deletion_has_a_reason` would reject any other combination, and
   * a restored order carrying the reason it was once deleted for is a row that
   * lies about its own state.
   *
   * No reason is asked for. Putting something back is not a decision anybody
   * has to justify, and the audit row already records who did it. `status` is
   * untouched for the same reason `softDelete` never wrote it — the order comes
   * back exactly as it went: a paid order returns paid, a rejected one returns
   * rejected.
   *
   * A 400 and not a silent success on a row that is not deleted: «رجّعته» on an
   * order that was never hidden means the admin is looking at a stale screen,
   * and answering "done" would confirm a belief that is wrong.
   */
  async restore(adminId: string, orderId: string): Promise<RestoreBookOrderResult> {
    const order = await this.orderForAdminAction(orderId);
    if (order.deletedAt === null) {
      throw new BadRequestException('this order is not deleted');
    }

    await this.prisma.bookOrder.update({
      where: { id: order.id },
      data: { deletedAt: null, deletedByUserId: null, deletionReason: null },
    });

    await this.audit.record({
      action: 'book-order:restore',
      resourceType: AUDIT_RESOURCES.bookOrder,
      resourceId: order.id,
      outcome: 'success',
      /* The reason it HAD been deleted for, carried into the restore row: the
         `book_orders` column is about to be null, so this is the only place
         that pairing survives. */
      metadata: {
        userId: order.userId,
        courseId: order.courseId,
        adminId,
        status: order.status,
        deletionReason: order.deletionReason,
      },
    });

    return { id: order.id, status: order.status };
  }

  /**
   * «رجّعه الأول» — the shared refusal for the three transitions that act on a
   * LIVE order.
   *
   * A 400 rather than pretending the row is not there, because it is: the admin
   * is looking at it on the «المحذوفة» tab, and a 404 would read as a broken id
   * on a row they can see. Restoring is one click away and is the correct next
   * action, so the message names it.
   */
  private assertNotDeleted(order: { deletedAt: Date | null }): void {
    if (order.deletedAt !== null) {
      throw new BadRequestException('this order was deleted — restore it first');
    }
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
   *
   * It takes the LIST's own filter (`AdminBookOrderFilter`) and not a bare
   * `BookOrderStatus`, so the button exports exactly the tab the admin is
   * looking at — «المحذوفة» included, which is the one case where the point of
   * the export is to see what was removed. Every other value excludes deleted
   * rows through the same `liveOrDeletedWhere` the screen uses: a spreadsheet
   * handed to a courier must not contain a parcel nobody is sending.
   */
  async exportXlsx(status: AdminBookOrderFilter): Promise<Buffer> {
    const rows = await this.prisma.bookOrder.findMany({
      where: liveOrDeletedWhere(status),
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
        items: ORDER_ITEM_SELECT,
        course: { select: { title: true, year: true, forGeneral: true, forLanguages: true, bookTitle: true } },
        governorate: { select: { nameAr: true } },
      },
    });

    const streamLabel = {
      general: copy.stream.general,
      languages: copy.stream.languages,
      both: copy.stream.both,
    };

    /*
     * ═══════════════════════════════════════════════════════════════════════
     * THE SHIPPING SHEET IS A PACKING LIST, NOT AN INVOICE.
     *
     * «وأنا بصدّر متحطش السعر… يبقى العربي فوق وتحته اللغات، وبينهم خط،
     *  واكتب أرقام ١ و ٢ و ٣، وفوق اكتب عدد العربي كام واللغات كام.»
     *
     * ## Why the money is gone
     *
     * Three columns used to carry it — سعر النسخة، الشحن، إجمالي الطلب — and
     * this file goes to a print shop and a courier. Neither is owed what a
     * student paid, every one of those numbers is a number somebody can
     * mis-read as what they are owed, and the revenue figures live on
     * `/admin/finance` where they belong. A packing list that quotes prices is
     * a packing list that gets quoted back.
     *
     * ## Why it is grouped and ruled
     *
     * The two editions are physically different stacks of paper. A sheet that
     * interleaves them makes the packer decide per row which pile to reach
     * into; grouping makes it two passes with a line between them. The rule is
     * drawn as a real bordered row rather than a blank one, because a blank row
     * disappears the moment anyone sorts — and somebody always sorts.
     *
     * ## Why the counts are at the TOP
     *
     * They are what he checks BEFORE printing: «أولى سنة كام كتاب وكام نسخة».
     * Books and COPIES are counted separately and on purpose — twenty orders
     * for one title is one thing to print and twenty things to pack.
     * ═══════════════════════════════════════════════════════════════════════
     */
    interface SheetLine {
      seq: number;
      bookTitle: string;
      quantity: number;
      courseTitle: string;
      year: number | '';
      stream: string;
      fullName: string;
      phone: string;
      altPhone: string;
      governorate: string;
      city: string;
      street: string;
      building: string | null;
      note: string;
      createdAt: string;
    }

    const lines: Array<Omit<SheetLine, 'seq'>> = [];
    for (const row of rows) {
      /*
       * ONE ROW PER BOOK, not per order. A courier packs titles, and an order
       * with three of them collapsed onto one line is a line somebody has to
       * phone about. The address is repeated on each — spreadsheets are read by
       * sorting and filtering, and a blank address on the second line of a
       * group disappears the moment anyone does either.
       *
       * ⚠️ The stream is per LINE, and the order's course is only the fallback.
       * This column was blank on nearly every row until `books.for_general` /
       * `for_languages` existed: it read `order.course`, and a cart order has
       * no course at all — so the one thing the print shop needs was missing on
       * exactly the orders that make up most of the list. The course fallback
       * stays for a course-page order whose book was never mirrored into the
       * catalogue; blank when neither exists, which is honest.
       */
      const courseStream = row.course ? streamLabel[streamChoiceOf(row.course)] : '';
      for (const item of row.items) {
        lines.push({
          bookTitle: item.titleAr,
          quantity: item.quantity,
          courseTitle: row.course?.title ?? '',
          year: row.course?.year ?? '',
          stream: item.book ? streamLabel[streamChoiceOf(item.book)] : courseStream,
          fullName: row.fullName,
          phone: row.phone,
          altPhone: row.altPhone,
          governorate: row.governorate.nameAr,
          city: row.city,
          street: row.addressStreet,
          building: row.addressBuilding,
          note: row.addressNote ?? '',
          createdAt: row.createdAt.toISOString().slice(0, 10),
        });
      }
    }

    /* عربي first, then لغات, then anything with no edition at all — a
       hand-typed «ملزمة مراجعة» has no stream and must not be silently filed
       under one. Within a group the original order (oldest first) survives,
       because that is the queue the desk works through. */
    const groupsInOrder = [copy.stream.general, copy.stream.languages, copy.stream.both] as const;
    const grouped = [
      ...groupsInOrder.map((label) => ({ label, rows: lines.filter((l) => l.stream === label) })),
      { label: '', rows: lines.filter((l) => !groupsInOrder.includes(l.stream as never)) },
    ].filter((group) => group.rows.length > 0);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('طلبات الكتب');
    // `views` sets right-to-left so an Arabic spreadsheet actually reads
    // right-to-left when opened, rather than mirrored column order in an
    // LTR grid.
    sheet.views = [{ rightToLeft: true }];
    sheet.columns = [
      { header: '#', key: 'seq', width: 6 },
      { header: 'اسم الكتاب', key: 'bookTitle', width: 28 },
      { header: 'العدد', key: 'quantity', width: 8 },
      { header: 'الكورس', key: 'courseTitle', width: 28 },
      { header: 'الصف', key: 'year', width: 8 },
      /* «عربي», not «عام». The VALUES here come from `copy.stream.*` and
         `copy.stream.general` is «عربي» — the header used to say «عام» while
         the cells under it said «عربي», on the one column a print shop reads to
         decide which edition to pack. */
      { header: 'عربي / لغات', key: 'stream', width: 14 },
      { header: 'الاسم بالكامل', key: 'fullName', width: 24 },
      { header: 'الموبايل', key: 'phone', width: 16 },
      { header: 'موبايل تاني', key: 'altPhone', width: 16 },
      { header: 'المحافظة', key: 'governorate', width: 16 },
      { header: 'المدينة', key: 'city', width: 18 },
      { header: 'الشارع', key: 'street', width: 28 },
      { header: 'رقم العمارة', key: 'building', width: 14 },
      { header: 'تفاصيل إضافية', key: 'note', width: 28 },
      { header: 'تاريخ الطلب', key: 'createdAt', width: 18 },
    ];

    /*
     * ── The summary block, above the table ────────────────────────────────
     *
     * Written with `spliceRows` AFTER the columns are declared, because
     * `sheet.columns` binds the header to row 1 — inserting above it moves the
     * header down and keeps every `addRow({key})` below working on the same
     * keys. Two counts per line and never one: «كام كتاب» is what to print and
     * «كام نسخة» is what to pack, and they differ the moment anybody orders two.
     */
    const copies = (rows_: Array<Omit<SheetLine, 'seq'>>) =>
      rows_.reduce((n, l) => n + l.quantity, 0);

    const summary: string[][] = [['طلبات الكتب — ملخص']];
    for (const group of grouped) {
      const label = group.label || 'من غير طبعة محددة';
      summary.push([`${label}: ${group.rows.length} كتاب · ${copies(group.rows)} نسخة`]);
      /* Per YEAR inside each edition — «سنة أولى كام كتاب وكام نسخة عربي». The
         years present are read from the data rather than assumed 1..3, so a
         sheet with nothing in a year does not print an empty line for it. */
      const years = [...new Set(group.rows.map((l) => l.year).filter((y): y is number => y !== ''))].sort();
      for (const year of years) {
        const inYear = group.rows.filter((l) => l.year === year);
        summary.push([`   الصف ${year}: ${inYear.length} كتاب · ${copies(inYear)} نسخة`]);
      }
      const noYear = group.rows.filter((l) => l.year === '');
      if (noYear.length > 0) {
        summary.push([`   من غير صف: ${noYear.length} كتاب · ${copies(noYear)} نسخة`]);
      }
    }
    summary.push([`الإجمالي: ${lines.length} كتاب · ${copies(lines)} نسخة`]);
    summary.push([]);

    sheet.spliceRows(1, 0, ...summary);
    for (let i = 1; i <= summary.length; i += 1) {
      sheet.getRow(i).font = { bold: i === 1 || i === summary.length - 1 };
    }
    sheet.getRow(summary.length + 1).font = { bold: true };

    /* The numbering restarts nowhere: «١، ٢، ٣» down the whole sheet is what a
       packer counts against, and a per-group restart would make «رقم ١٢» mean
       two different rows. */
    let seq = 0;
    grouped.forEach((group, index) => {
      if (index > 0) {
        /* The rule between the editions. A BORDERED row, not a blank one — a
           blank row vanishes the first time anybody sorts the sheet, and this
           line is the whole reason the grouping is legible. */
        const divider = sheet.addRow({});
        divider.height = 6;
        divider.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = { top: { style: 'medium' } };
        });
      }
      for (const line of group.rows) {
        seq += 1;
        sheet.addRow({ ...line, seq });
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
