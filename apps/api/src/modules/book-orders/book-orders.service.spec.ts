// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { copy } from '@ayman/contracts/copy';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { MediaService } from '../media/media.service';
import type { SettingsService } from '../admin/settings/settings.service';
import { BooksService } from '../books/books.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BookOrdersService } from './book-orders.service';

/** Pinned so these assertions do not move when someone edits the live delivery
 *  fee in the shared dev database. 65 EGP is the real default. */
const SHIPPING_CENTS = 6_500;

describe('BookOrdersService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const audit = new AuditService(prisma);
  // `uploadScreenshot` is the only method that reaches `MediaService`, and it
  // is not exercised below — `create`/`submitPayment` only check the KEY's
  // prefix string, never the storage behind it. Same reasoning as
  // `payments.service.spec.ts`'s own stub.
  const media = {} as unknown as MediaService;
  /*
   * The real `BooksService`, not a stub. Two of its three uses here are the
   * whole point of the cart path — a catalogue lookup that must read
   * `books.price_cents` and never the request, and a stock check — so stubbing
   * it would test the mock. Its own `SettingsService` dependency IS stubbed, at
   * the one method used: the delivery fee is a settings read, and pinning it to
   * a literal keeps these assertions from moving when someone edits the live
   * shipping price in the shared dev database.
   */
  const settings = {
    read: async () => ({ store: { shippingCents: SHIPPING_CENTS } }),
  } as unknown as SettingsService;
  const books = new BooksService(prisma, audit, settings);
  /*
    A real `NotificationsService`, with no realtime fan-out behind it.

    Paying for an order now writes an alert for whoever ships parcels, in the
    same transaction — so the service cannot be built without one. The live
    delivery half is `@Optional()` (see the service's constructor): these cases
    assert what gets WRITTEN, and a Redis connection would be a second thing to
    keep alive for nothing.
  */
  const service = new BookOrdersService(
    prisma,
    audit,
    media,
    books,
    new NotificationsService(prisma),
  );

  let adminId = '';
  let studentId = '';
  let strangerId = '';
  /** A registered student whose `phoneNumber` is set — the whole point of the
   *  guest→student link in `create()`. Every other fixture user has none, so
   *  their orders stay guest orders however they are placed. */
  let linkedStudentId = '';
  let linkedPhone = '';
  let bookedCourseId = '';
  let noBookCourseId = '';
  let governorateCode = '';
  let bookA = '';
  let bookB = '';
  let soldOutBook = '';
  /** The one catalogue fixture with a stream of its own — every other book
   *  defaults to «الاتنين», which cannot distinguish "read off the book" from
   *  "fell back to the course". */
  let languagesBook = '';

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();

    adminId = (
      await prisma.user.create({
        data: { id: `book-admin-${stamp}`, name: 'أدمن', email: `book-admin-${stamp}@t.test`, role: 'admin' },
      })
    ).id;
    studentId = (
      await prisma.user.create({
        data: { id: `book-student-${stamp}`, name: 'طالب', email: `book-student-${stamp}@t.test` },
      })
    ).id;
    strangerId = (
      await prisma.user.create({
        data: { id: `book-stranger-${stamp}`, name: 'غريب', email: `book-stranger-${stamp}@t.test` },
      })
    ).id;
    /* E.164, because that is the only form `users.phone_number` is ever
       written in and the link is an exact string equality. Derived from the
       clock so two runs against this shared database never collide on the
       UNIQUE index. */
    linkedPhone = `+2015${String(stamp).slice(-8)}`;
    linkedStudentId = (
      await prisma.user.create({
        data: {
          id: `book-linked-${stamp}`,
          name: 'طالب سجّل بعدين',
          email: `book-linked-${stamp}@t.test`,
          phoneNumber: linkedPhone,
        },
      })
    ).id;

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    const governorate = await prisma.governorate.findFirstOrThrow();
    governorateCode = governorate.code;

    bookedCourseId = (
      await prisma.course.create({
        data: {
          slug: `book-order-course-${stamp}`,
          title: 'كورس بيه كتاب',
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          subjectId: subject.id,
          year: 2,
          instructorId: adminId,
          bookTitle: 'كتاب الفيزياء',
          bookPriceCents: 25000,
          /* عربي only, deliberately not the «الاتنين» default: the export's
             stream column falls back to the COURSE for a line with no book,
             and a fixture that says «الاتنين» everywhere cannot tell the
             fallback from the book's own answer. */
          forGeneral: true,
          forLanguages: false,
        },
      })
    ).id;

    noBookCourseId = (
      await prisma.course.create({
        data: {
          slug: `no-book-course-${stamp}`,
          title: 'كورس من غير كتاب',
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          subjectId: subject.id,
          year: 2,
          instructorId: adminId,
        },
      })
    ).id;

    /* The catalogue fixtures. `bookA` and `bookB` are two ordinary titles at
       two different prices — enough to prove a multi-line total — and
       `soldOutBook` is the one case `priceCart` has to REFUSE rather than
       silently reduce. */
    bookA = (
      await prisma.book.create({
        data: {
          slug: `book-a-${stamp}`,
          titleAr: 'كتاب الترم الأول',
          subjectId: subject.id,
          year: 1,
          term: 'first',
          priceCents: 25_000,
        },
      })
    ).id;
    bookB = (
      await prisma.book.create({
        data: {
          slug: `book-b-${stamp}`,
          titleAr: 'كتاب الترم التاني',
          subjectId: subject.id,
          year: 2,
          term: 'second',
          priceCents: 18_000,
        },
      })
    ).id;
    soldOutBook = (
      await prisma.book.create({
        data: {
          slug: `book-sold-out-${stamp}`,
          titleAr: 'كتاب خلص',
          priceCents: 10_000,
          stock: 0,
        },
      })
    ).id;
    languagesBook = (
      await prisma.book.create({
        data: {
          slug: `book-languages-${stamp}`,
          titleAr: 'كتاب لغات',
          subjectId: subject.id,
          year: 1,
          term: 'first',
          priceCents: 30_000,
          forGeneral: false,
          forLanguages: true,
        },
      })
    ).id;
  });

  beforeEach(async () => {
    await prisma.bookOrder.deleteMany({ where: { userId: { in: [studentId, strangerId, linkedStudentId] } } });
    // Guest orders carry `userId: null`, so the filter above never catches
    // them — clean up by course id instead, scoped to this spec's own fixture
    // courses so nothing in the shared dev database is touched.
    await prisma.bookOrder.deleteMany({
      where: { userId: null, courseId: { in: [bookedCourseId, noBookCourseId] } },
    });
    /* A CART order has no `courseId` at all, so neither filter above reaches
       it. Scoped to this spec's own books so nothing shared is touched. */
    await prisma.bookOrder.deleteMany({
      where: { items: { some: { bookId: { in: [bookA, bookB, soldOutBook, languagesBook] } } } },
    });
  });

  afterAll(async () => {
    await prisma.bookOrder.deleteMany({ where: { userId: { in: [studentId, strangerId, linkedStudentId] } } });
    await prisma.bookOrder.deleteMany({
      where: { userId: null, courseId: { in: [bookedCourseId, noBookCourseId] } },
    });
    /* A CART order has no `courseId` at all, so neither filter above reaches
       it. Scoped to this spec's own books so nothing shared is touched. */
    await prisma.bookOrder.deleteMany({
      where: { items: { some: { bookId: { in: [bookA, bookB, soldOutBook, languagesBook] } } } },
    });
    // Never `deleteMany` on `audit_log` — INSERT-only at the database level.
    await prisma.book.deleteMany({ where: { id: { in: [bookA, bookB, soldOutBook, languagesBook] } } });
    await prisma.course.deleteMany({ where: { id: { in: [bookedCourseId, noBookCourseId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [studentId, strangerId, linkedStudentId, adminId] } } });
    await prisma.$disconnect();
  });

  const validScreenshotKey = () => `book-order-proof/${randomUUID()}.webp`;

  const address = () => ({
    courseId: bookedCourseId,
    fullName: 'أحمد محمد',
    phone: '01012345678',
    altPhone: '01098765432',
    governorateCode,
    city: 'القاهرة',
    addressStreet: 'شارع التحرير',
    addressBuilding: '12',
    addressNote: null,
  });

  /** The same address with the basket half of the union instead of a course. */
  const cartAddress = () => {
    const { courseId: _courseId, ...rest } = address();
    return rest;
  };

  describe('create', () => {
    it('saves the address as address_only, BEFORE any payment', async () => {
      const order = await service.create(studentId, address());

      expect(order.status).toBe('address_only');
      expect(order.senderPhone).toBeNull();
      expect(order.paidAt).toBeNull();
      // The book's own price, derived server-side — not in the request above.
      expect(order.itemsCents).toBe(25000);
      // ⚠️ Delivery is charged on the course-book path too, which it was not
      // before the shop existed. Deliberate: it is the same parcel to the same
      // address, and one flow quietly shipping for free was the inconsistency,
      // not this. `book-order-panel.tsx` shows the same breakdown.
      expect(order.shippingCents).toBe(SHIPPING_CENTS);
      expect(order.amountCents).toBe(25000 + SHIPPING_CENTS);
      expect(order.bookTitle).toBe('كتاب الفيزياء');
      // Folded into a one-line basket, so everything downstream — the admin
      // editor, the export, the confirmation — has one shape to handle.
      expect(order.items).toEqual([
        {
          bookId: null,
          titleAr: 'كتاب الفيزياء',
          unitPriceCents: 25000,
          quantity: 1,
          /* Both `null` together — this course's book was never mirrored into
             the catalogue, so there is no `books` row to read the stream off.
             The export falls back to the COURSE for exactly this line; see
             `exportXlsx`. */
          forGeneral: null,
          forLanguages: null,
        },
      ]);

      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.userId).toBe(studentId);
      expect(row.status).toBe('address_only');
      expect(row.courseId).toBe(bookedCourseId);
    });

    it('404s an unknown course', async () => {
      await expect(
        service.create(studentId, { ...address(), courseId: randomUUID() }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a course with no book configured', async () => {
      await expect(
        service.create(studentId, { ...address(), courseId: noBookCourseId }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a governorateCode that does not name a real governorate', async () => {
      await expect(
        service.create(studentId, { ...address(), governorateCode: 'ZZ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    /*
     * ── the cart ────────────────────────────────────────────────────────────
     * The behaviour «واحد سنة أولى، واحد سنة ٢» asks for, and the shipping rule
     * that is the whole reason the fee is a column on the order.
     */
    it('prices a multi-book cart from the catalogue and charges shipping ONCE', async () => {
      const order = await service.create(studentId, {
        ...cartAddress(),
        items: [
          { bookId: bookA, quantity: 2 },
          { bookId: bookB, quantity: 1 },
        ],
      });

      expect(order.itemsCents).toBe(25_000 * 2 + 18_000);
      // The point of the whole feature: three books, one delivery fee.
      expect(order.shippingCents).toBe(SHIPPING_CENTS);
      expect(order.amountCents).toBe(25_000 * 2 + 18_000 + SHIPPING_CENTS);
      expect(order.courseId).toBeNull();
      expect(order.items).toHaveLength(2);
      expect(order.items.find((line) => line.bookId === bookA)?.quantity).toBe(2);
    });

    it('reads every price from the catalogue, never from the request', async () => {
      /* The contract has no price field on a cart line, so the only way to
         attempt this is to smuggle one past the type — which is exactly what a
         forged request would do. The stored line must still be 250 EGP. */
      const order = await service.create(studentId, {
        ...cartAddress(),
        items: [{ bookId: bookA, quantity: 1, unitPriceCents: 1 } as never],
      });

      expect(order.items[0].unitPriceCents).toBe(25_000);
      expect(order.amountCents).toBe(25_000 + SHIPPING_CENTS);
    });

    it('refuses a book that is out of stock rather than quietly reducing it', async () => {
      await expect(
        service.create(studentId, {
          ...cartAddress(),
          items: [{ bookId: soldOutBook, quantity: 1 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a book that has been taken off the shelf', async () => {
      await prisma.book.update({ where: { id: bookB }, data: { isActive: false } });
      try {
        await expect(
          service.create(studentId, { ...cartAddress(), items: [{ bookId: bookB, quantity: 1 }] }),
        ).rejects.toBeInstanceOf(BadRequestException);
      } finally {
        await prisma.book.update({ where: { id: bookB }, data: { isActive: true } });
      }
    });

    it('refuses a bookId that names nothing', async () => {
      await expect(
        service.create(studentId, { ...cartAddress(), items: [{ bookId: randomUUID(), quantity: 1 }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('keeps the stored total equal to items + shipping — the CHECK constraint', async () => {
      const order = await service.create(null, {
        ...cartAddress(),
        items: [{ bookId: bookA, quantity: 3 }],
      });

      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.amountCents).toBe(row.itemsCents + row.shippingCents - row.discountCents);
    });

    it('allows a second order for the same course (a lost book is a real reason)', async () => {
      await service.create(studentId, address());
      const second = await service.create(studentId, address());
      expect(second.status).toBe('address_only');

      const count = await prisma.bookOrder.count({ where: { userId: studentId, courseId: bookedCourseId } });
      expect(count).toBe(2);
    });

    it('saves a GUEST order (userId: null) — ordering a book needs no account', async () => {
      const order = await service.create(null, address());

      expect(order.status).toBe('address_only');
      expect(order.fullName).toBe('أحمد محمد');

      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.userId).toBeNull();
      expect(row.status).toBe('address_only');
    });
  });

  describe('adminCreate', () => {
    const adminAddress = (overrides: Partial<Parameters<typeof service.adminCreate>[1]> = {}) => ({
      courseId: bookedCourseId,
      fullName: 'عميل بالتليفون',
      phone: '01012345678',
      altPhone: '01098765432',
      governorateCode,
      city: 'القاهرة',
      addressStreet: 'شارع التحرير',
      addressBuilding: '12',
      addressNote: null,
      paid: false,
      senderPhone: null,
      screenshotKey: null,
      ...overrides,
    });

    it('creates an address_only order with no userId, when paid: false', async () => {
      const order = await service.adminCreate(adminId, adminAddress());

      expect(order.status).toBe('address_only');
      expect(order.senderPhone).toBeNull();
      expect(order.paidAt).toBeNull();
      // The book's own price, derived server-side, plus the one delivery fee.
      expect(order.amountCents).toBe(25000 + SHIPPING_CENTS);
      expect(order.bookTitle).toBe('كتاب الفيزياء');
      expect(order.fullName).toBe('عميل بالتليفون');

      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.userId).toBeNull();
      expect(row.status).toBe('address_only');
      expect(row.screenshotKey).toBeNull();
    });

    it('creates a paid order with paidAt/amountCents set, when paid: true', async () => {
      const order = await service.adminCreate(
        adminId,
        adminAddress({
          paid: true,
          senderPhone: '01011112222',
          screenshotKey: validScreenshotKey(),
        }),
      );

      expect(order.status).toBe('paid');
      expect(order.paidAt).not.toBeNull();
      expect(order.senderPhone).toBe('01011112222');
      expect(order.amountCents).toBe(25000 + SHIPPING_CENTS);

      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.userId).toBeNull();
      expect(row.status).toBe('paid');
      expect(row.paidAt).not.toBeNull();
      expect(row.screenshotKey).not.toBeNull();
    });

    it('creates a paid order with no screenshot/senderPhone — an admin recording a payment with nothing to attach', async () => {
      const order = await service.adminCreate(adminId, adminAddress({ paid: true }));

      expect(order.status).toBe('paid');
      expect(order.paidAt).not.toBeNull();
      expect(order.senderPhone).toBeNull();

      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.screenshotKey).toBeNull();
    });

    it('ignores senderPhone/screenshotKey when paid: false', async () => {
      const order = await service.adminCreate(
        adminId,
        adminAddress({ paid: false, senderPhone: '01011112222', screenshotKey: validScreenshotKey() }),
      );

      expect(order.status).toBe('address_only');
      expect(order.senderPhone).toBeNull();
      expect(order.paidAt).toBeNull();

      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.screenshotKey).toBeNull();
    });

    it('404s an unknown course', async () => {
      await expect(
        service.adminCreate(adminId, adminAddress({ courseId: randomUUID() })),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a course with no book configured', async () => {
      await expect(
        service.adminCreate(adminId, adminAddress({ courseId: noBookCourseId })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a governorateCode that does not name a real governorate', async () => {
      await expect(
        service.adminCreate(adminId, adminAddress({ governorateCode: 'ZZ' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a screenshotKey not issued by POST /book-orders/screenshot', async () => {
      await expect(
        service.adminCreate(
          adminId,
          adminAddress({ paid: true, screenshotKey: 'payment-proof/not-a-book-order.webp' }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('shows up in the admin paid list, indistinguishable in shape from a real paid order', async () => {
      const order = await service.adminCreate(adminId, adminAddress({ paid: true }));

      const paid = await service.adminList({ status: 'paid', page: 1, perPage: 50, q: '' });
      const row = paid.rows.find((r) => r.id === order.id);

      expect(row).toBeDefined();
      expect(row?.userId).toBeNull();
      expect(row?.fullName).toBe('عميل بالتليفون');
      expect(row?.amountCents).toBe(25000 + SHIPPING_CENTS);
      expect(row?.bookTitle).toBe('كتاب الفيزياء');
    });

    it('shows up in the admin address_only list, same as an abandoned public order', async () => {
      const order = await service.adminCreate(adminId, adminAddress({ paid: false }));

      const addressOnly = await service.adminList({ status: 'address_only', page: 1, perPage: 50, q: '' });
      const ids = addressOnly.rows.map((row) => row.id);
      expect(ids).toContain(order.id);
    });

    it('shows up in the Excel export, same shape as a real customer row', async () => {
      await service.adminCreate(adminId, adminAddress({ paid: true, fullName: 'عميل التصدير' }));

      const buffer = await service.exportXlsx('paid');
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.worksheets[0]!;

      const bodyRows: string[][] = [];
      for (let i = 2; i <= sheet.rowCount; i += 1) {
        bodyRows.push((sheet.getRow(i).values as unknown[]).map(String));
      }
      const found = bodyRows.some((row) => row.includes('عميل التصدير'));
      expect(found).toBe(true);
    });

    it('is shippable through the same markShipped path as a real customer order', async () => {
      const order = await service.adminCreate(adminId, adminAddress({ paid: true }));

      const result = await service.markShipped(adminId, order.id);
      expect(result.status).toBe('shipped');

      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.status).toBe('shipped');
      expect(row.shippedAt).not.toBeNull();
    });
  });

  /**
   * «أعدل الطلب» — the screen Ayman asked for by name: change the basket, the
   * price, the delivery fee, add a note. The invariant every case here is
   * really testing is that the stored total never gets to disagree with the
   * lines it is made of.
   */
  describe('adminPatch', () => {
    it('replaces the basket and recomputes the total', async () => {
      const order = await service.create(studentId, {
        ...cartAddress(),
        items: [{ bookId: bookA, quantity: 1 }],
      });

      const edited = await service.adminPatch(adminId, order.id, {
        items: [
          { bookId: bookB, titleAr: 'كتاب الترم التاني', unitPriceCents: 18_000, quantity: 2 },
        ],
      });

      expect(edited.items).toHaveLength(1);
      expect(edited.itemsCents).toBe(36_000);
      // Untouched by the edit — the fee is per order, not per line.
      expect(edited.shippingCents).toBe(SHIPPING_CENTS);
      expect(edited.amountCents).toBe(36_000 + SHIPPING_CENTS);
    });

    it('accepts a price the admin typed — «هيدفع كام» is a real negotiation', async () => {
      const order = await service.create(studentId, {
        ...cartAddress(),
        items: [{ bookId: bookA, quantity: 1 }],
      });

      const edited = await service.adminPatch(adminId, order.id, {
        items: [{ bookId: bookA, titleAr: 'كتاب الترم الأول', unitPriceCents: 20_000, quantity: 1 }],
      });

      expect(edited.items[0].unitPriceCents).toBe(20_000);
      expect(edited.amountCents).toBe(20_000 + SHIPPING_CENTS);
    });

    it('adds a line the catalogue does not carry, with no bookId', async () => {
      const order = await service.create(studentId, {
        ...cartAddress(),
        items: [{ bookId: bookA, quantity: 1 }],
      });

      const edited = await service.adminPatch(adminId, order.id, {
        items: [
          { bookId: bookA, titleAr: 'كتاب الترم الأول', unitPriceCents: 25_000, quantity: 1 },
          { bookId: null, titleAr: 'ملزمة مراجعة', unitPriceCents: 5_000, quantity: 1 },
        ],
      });

      expect(edited.items).toHaveLength(2);
      expect(edited.amountCents).toBe(30_000 + SHIPPING_CENTS);
    });

    it('waives the delivery fee when shipping is set to 0', async () => {
      const order = await service.create(studentId, {
        ...cartAddress(),
        items: [{ bookId: bookA, quantity: 1 }],
      });

      const edited = await service.adminPatch(adminId, order.id, { shippingCents: 0 });

      expect(edited.shippingCents).toBe(0);
      expect(edited.amountCents).toBe(25_000);
    });

    it('applies a discount and keeps the stored total consistent', async () => {
      const order = await service.create(studentId, {
        ...cartAddress(),
        items: [{ bookId: bookA, quantity: 1 }],
      });

      const edited = await service.adminPatch(adminId, order.id, { discountCents: 2_000 });

      expect(edited.discountCents).toBe(2_000);
      expect(edited.amountCents).toBe(25_000 + SHIPPING_CENTS - 2_000);

      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.amountCents).toBe(row.itemsCents + row.shippingCents - row.discountCents);
    });

    it('clamps a discount larger than the order rather than failing the CHECK', async () => {
      const order = await service.create(studentId, {
        ...cartAddress(),
        items: [{ bookId: bookA, quantity: 1 }],
      });

      const edited = await service.adminPatch(adminId, order.id, { discountCents: 999_999 });

      expect(edited.discountCents).toBe(25_000 + SHIPPING_CENTS);
      expect(edited.amountCents).toBe(0);
    });

    it('stores an admin note without touching the customer’s own note', async () => {
      const order = await service.create(studentId, {
        ...cartAddress(),
        addressNote: 'الدور التالت',
        items: [{ bookId: bookA, quantity: 1 }],
      });

      await service.adminPatch(adminId, order.id, { adminNote: 'كلمته، هيستلم الأسبوع الجاي' });

      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.adminNote).toBe('كلمته، هيستلم الأسبوع الجاي');
      expect(row.addressNote).toBe('الدور التالت');
    });

    it('leaves the basket alone when the patch only corrects the address', async () => {
      const order = await service.create(studentId, {
        ...cartAddress(),
        items: [
          { bookId: bookA, quantity: 2 },
          { bookId: bookB, quantity: 1 },
        ],
      });

      const edited = await service.adminPatch(adminId, order.id, { city: 'الجيزة' });

      expect(edited.items).toHaveLength(2);
      expect(edited.amountCents).toBe(order.amountCents);
    });

    /*
     * `book_order_items` has a UNIQUE index on `(order_id, book_id)`, so two
     * lines naming one book cannot be written — the write would be a P2002,
     * i.e. a 500 with a constraint name in it. `AdminBookOrderLinesSchema`
     * rejects the payload before it ever reaches here; this asserts the
     * DATABASE end of that pair still holds, because the schema refinement is
     * one edit away from being removed and the index is what makes it matter.
     */
    it('cannot write two lines for the same book — the unique index holds', async () => {
      const order = await service.create(studentId, {
        ...cartAddress(),
        items: [{ bookId: bookA, quantity: 1 }],
      });

      await expect(
        service.adminPatch(adminId, order.id, {
          items: [
            { bookId: bookA, titleAr: 'كتاب الترم الأول', unitPriceCents: 25_000, quantity: 1 },
            { bookId: bookA, titleAr: 'كتاب الترم الأول', unitPriceCents: 25_000, quantity: 1 },
          ],
        }),
      ).rejects.toThrow();
    });

    /* The same index deliberately does NOT constrain catalogue-less lines —
       Postgres treats NULLs as distinct — because several «كتاب خاص» rows on
       one order are legitimate. */
    it('allows several custom lines with no bookId on one order', async () => {
      const order = await service.create(studentId, {
        ...cartAddress(),
        items: [{ bookId: bookA, quantity: 1 }],
      });

      const edited = await service.adminPatch(adminId, order.id, {
        items: [
          { bookId: null, titleAr: 'ملزمة أولى', unitPriceCents: 5_000, quantity: 1 },
          { bookId: null, titleAr: 'ملزمة تانية', unitPriceCents: 7_000, quantity: 1 },
        ],
      });

      expect(edited.items).toHaveLength(2);
      expect(edited.itemsCents).toBe(12_000);
    });

    it('404s an order that does not exist', async () => {
      await expect(
        service.adminPatch(adminId, randomUUID(), { city: 'الجيزة' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a governorateCode that does not name a real governorate', async () => {
      const order = await service.create(studentId, {
        ...cartAddress(),
        items: [{ bookId: bookA, quantity: 1 }],
      });

      await expect(
        service.adminPatch(adminId, order.id, { governorateCode: 'ZZ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('submitPayment', () => {
    it('moves address_only to paid, and stamps paidAt', async () => {
      const order = await service.create(studentId, address());

      const paid = await service.submitPayment(studentId, order.id, {
        senderPhone: '01011112222',
        screenshotKey: validScreenshotKey(),
      });

      expect(paid.status).toBe('paid');
      expect(paid.senderPhone).toBe('01011112222');
      expect(paid.paidAt).not.toBeNull();

      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.status).toBe('paid');
      expect(row.screenshotKey).not.toBeNull();
    });

    it('rejects a screenshotKey not issued by POST /book-orders/screenshot', async () => {
      const order = await service.create(studentId, address());

      await expect(
        service.submitPayment(studentId, order.id, {
          senderPhone: '01011112222',
          screenshotKey: 'payment-proof/not-a-book-order.webp',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404s an order belonging to another student', async () => {
      const order = await service.create(studentId, address());

      await expect(
        service.submitPayment(strangerId, order.id, {
          senderPhone: '01011112222',
          screenshotKey: validScreenshotKey(),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses paying an order twice', async () => {
      const order = await service.create(studentId, address());
      await service.submitPayment(studentId, order.id, {
        senderPhone: '01011112222',
        screenshotKey: validScreenshotKey(),
      });

      await expect(
        service.submitPayment(studentId, order.id, {
          senderPhone: '01011112222',
          screenshotKey: validScreenshotKey(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('pays a GUEST order end to end — the order id is the only credential', async () => {
      const order = await service.create(null, address());

      const paid = await service.submitPayment(null, order.id, {
        senderPhone: '01011112222',
        screenshotKey: validScreenshotKey(),
      });

      expect(paid.status).toBe('paid');
      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.userId).toBeNull();
      expect(row.status).toBe('paid');
    });

    it('404s a signed-in caller trying to pay a GUEST order by guessing its id', async () => {
      const order = await service.create(null, address());

      await expect(
        service.submitPayment(studentId, order.id, {
          senderPhone: '01011112222',
          screenshotKey: validScreenshotKey(),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    /**
     * ⚠️ The half that protects an ACCOUNT, and the one that is tempting to
     * give away.
     *
     * An order placed from a session carries that student's full name, both
     * phone numbers and their home address, and none of it is reachable by
     * holding the id. The pressure to loosen this comes from the guest link:
     * the moment anything writes `userId` onto a guest's row, the browser that
     * placed the order 404s on its own read, and the quick fix is to let the
     * anonymous branch match on the id alone — which would also open every
     * account-placed order. The link is made at READ time instead precisely so
     * this test can keep passing. See `ownershipWhere`.
     */
    it('404s an account-placed order for an anonymous request holding its id', async () => {
      const order = await service.create(studentId, address());

      await expect(
        service.submitPayment(null, order.id, {
          senderPhone: '01011112222',
          screenshotKey: validScreenshotKey(),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getById', () => {
    it('reads back a GUEST order by id alone', async () => {
      const order = await service.create(null, address());
      const found = await service.getById(null, order.id);
      expect(found.id).toBe(order.id);
      expect(found.status).toBe('address_only');
    });

    it('404s a GUEST order id read with a signed-in userId', async () => {
      const order = await service.create(null, address());
      await expect(service.getById(studentId, order.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    /** The read half of the rule `submitPayment` asserts above: the id opens an
     *  UNCLAIMED order and nothing else. */
    it('404s an account-placed order for an anonymous caller who holds its id', async () => {
      const order = await service.create(studentId, address());
      await expect(service.getById(null, order.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reads back a signed-in student\'s own order', async () => {
      const order = await service.create(studentId, address());
      const found = await service.getById(studentId, order.id);
      expect(found.id).toBe(order.id);
    });
  });

  describe('paid vs incomplete separation', () => {
    it('adminList splits address_only from paid via the status filter', async () => {
      const incomplete = await service.create(studentId, address());
      const toPay = await service.create(strangerId, address());
      await service.submitPayment(strangerId, toPay.id, {
        senderPhone: '01011112222',
        screenshotKey: validScreenshotKey(),
      });

      const addressOnly = await service.adminList({ status: 'address_only', page: 1, perPage: 50, q: '' });
      const ids = addressOnly.rows.map((row) => row.id);
      expect(ids).toContain(incomplete.id);
      expect(ids).not.toContain(toPay.id);

      const paid = await service.adminList({ status: 'paid', page: 1, perPage: 50, q: '' });
      const paidIds = paid.rows.map((row) => row.id);
      expect(paidIds).toContain(toPay.id);
      expect(paidIds).not.toContain(incomplete.id);

      // Every field the shipping desk needs is on the row.
      const paidRow = paid.rows.find((row) => row.id === toPay.id);
      expect(paidRow?.fullName).toBe('أحمد محمد');
      expect(paidRow?.hasScreenshot).toBe(true);
      expect(paidRow?.bookTitle).toBe('كتاب الفيزياء');
    });

    it('adminList shows a GUEST order with null account fields, own fullName/phone intact', async () => {
      const guestOrder = await service.create(null, address());

      const addressOnly = await service.adminList({ status: 'address_only', page: 1, perPage: 50, q: '' });
      const row = addressOnly.rows.find((r) => r.id === guestOrder.id);

      expect(row).toBeDefined();
      expect(row?.userId).toBeNull();
      expect(row?.studentName).toBeNull();
      expect(row?.studentEmail).toBeNull();
      expect(row?.studentPhone).toBeNull();
      // The order's OWN submitted fields are unaffected by the missing account.
      expect(row?.fullName).toBe('أحمد محمد');
      expect(row?.phone).toBe('01012345678');
    });
  });

  /**
   * «عشان أعرف أوصل» — the search box over the shipping queue.
   *
   * Same shared-database discipline as every other case in this file: the
   * local Postgres is a real cohort of several thousand rows, so nothing here
   * asserts a result COUNT. Each case searches for a token it invented itself
   * and asserts that its own order is in the result and that a control order —
   * created in the same test, differing only in the field being searched — is
   * not.
   */
  describe('adminList search', () => {
    it('finds an order by part of the shipping name', async () => {
      const wanted = await service.create(studentId, {
        ...address(),
        fullName: 'معتز الغريب قاسم',
      });
      const other = await service.create(strangerId, { ...address(), fullName: 'هاجر سمير' });

      const found = await service.adminList({
        status: 'address_only',
        page: 1,
        perPage: 50,
        q: 'الغريب',
      });
      const ids = found.rows.map((row) => row.id);

      expect(ids).toContain(wanted.id);
      expect(ids).not.toContain(other.id);
    });

    /**
     * The case the whole `phoneSearchDigits` helper exists for. The DTO
     * normalises a submitted number to E.164, so the column holds
     * `+201555000111` — and the admin, reading a number off a WhatsApp
     * message, types it back the way Egyptians write it, with the trunk zero
     * and no country code. A plain `contains` on the typed string finds
     * nothing at all here.
     */
    it('finds an order by a phone typed with the leading zero against a stored +20 number', async () => {
      const wanted = await service.create(studentId, {
        ...address(),
        phone: '+201555000111',
      });

      const byLocal = await service.adminList({
        status: 'address_only',
        page: 1,
        perPage: 50,
        q: '01555000111',
      });
      expect(byLocal.rows.map((row) => row.id)).toContain(wanted.id);

      // …and the tail of the number alone, which is how half of them are read
      // out on the phone.
      const byTail = await service.adminList({
        status: 'address_only',
        page: 1,
        perPage: 50,
        q: '555000111',
      });
      expect(byTail.rows.map((row) => row.id)).toContain(wanted.id);
    });

    /** Arabic-Indic digits — what an Egyptian keyboard actually produces. */
    it('finds an order by a phone typed in Arabic-Indic digits', async () => {
      const wanted = await service.create(studentId, {
        ...address(),
        phone: '01555000222',
      });

      const found = await service.adminList({
        status: 'address_only',
        page: 1,
        perPage: 50,
        q: '٠١٥٥٥٠٠٠٢٢٢',
      });
      expect(found.rows.map((row) => row.id)).toContain(wanted.id);
    });

    /** «حول من» — the second number, and the Vodafone Cash sender's. A parent
     *  transferring for their child is the case both fields exist for. */
    it('finds an order by the ALTERNATE number, not just the first one', async () => {
      const wanted = await service.create(studentId, {
        ...address(),
        altPhone: '01555000333',
      });

      const found = await service.adminList({
        status: 'address_only',
        page: 1,
        perPage: 50,
        q: '01555000333',
      });
      expect(found.rows.map((row) => row.id)).toContain(wanted.id);
    });

    it('finds an order by المكان — the city and the street line', async () => {
      const wanted = await service.create(studentId, {
        ...address(),
        city: 'المطرية-دقهلية',
        addressStreet: 'شارع محمد فريد وتنيس',
      });
      const other = await service.create(strangerId, address());

      const byCity = await service.adminList({
        status: 'address_only',
        page: 1,
        perPage: 50,
        q: 'المطرية-دقهلية',
      });
      expect(byCity.rows.map((row) => row.id)).toContain(wanted.id);
      expect(byCity.rows.map((row) => row.id)).not.toContain(other.id);

      const byStreet = await service.adminList({
        status: 'address_only',
        page: 1,
        perPage: 50,
        q: 'محمد فريد وتنيس',
      });
      expect(byStreet.rows.map((row) => row.id)).toContain(wanted.id);
    });

    /** The tab still filters. A search is a narrowing of the open tab, not a
     *  way out of it — the screen says so, and the «دوّر في الكل» link is what
     *  crosses tabs. */
    it('still obeys the status tab it was searched from', async () => {
      const incomplete = await service.create(studentId, {
        ...address(),
        fullName: 'مطلوب في تبويب تاني',
      });

      const wrongTab = await service.adminList({
        status: 'paid',
        page: 1,
        perPage: 50,
        q: 'مطلوب في تبويب تاني',
      });
      expect(wrongTab.rows.map((row) => row.id)).not.toContain(incomplete.id);

      const rightTab = await service.adminList({
        status: 'address_only',
        page: 1,
        perPage: 50,
        q: 'مطلوب في تبويب تاني',
      });
      expect(rightTab.rows.map((row) => row.id)).toContain(incomplete.id);
    });

    /**
     * Below three digits the phone leg is dropped entirely. One or two digits
     * appear inside nearly every number in the table, so keeping it would make
     * the first two keystrokes of a phone search return the whole queue —
     * the opposite of what the box is for.
     *
     * ⚠️ Placed as a GUEST (`create(null, …)`), and that is load-bearing rather
     * than incidental. `adminSearchWhere` also spans the linked ACCOUNT's name
     * and e-mail, and every fixture account in this file is minted with an
     * address derived from the clock (`book-student-${stamp}@t.test`). A stamp
     * containing «44» — roughly a coin toss per run — made this order match
     * through the user leg, and the test failed announcing that the phone guard
     * was broken when the phone guard had nothing to do with it. Observed on
     * CI 2026-09-04.
     *
     * A guest order has no account to match through, so the only leg that could
     * possibly return this row is the one under test. Nothing else here
     * contains «44»: not the name, the city, the street, the governorate, nor
     * the book's title.
     */
    it('ignores a one- or two-digit query on the phone columns', async () => {
      const order = await service.create(null, {
        ...address(),
        fullName: 'بدون حروف مطابقة',
        city: 'بورسعيد',
        addressStreet: 'شارع بدون رقم',
        addressBuilding: null,
        phone: '01555000444',
      });

      const found = await service.adminList({
        status: 'address_only',
        page: 1,
        perPage: 50,
        q: '44',
      });
      expect(found.rows.map((row) => row.id)).not.toContain(order.id);
    });

    it('finds an order by the title of a book in it', async () => {
      const wanted = await service.create(studentId, {
        ...cartAddress(),
        items: [{ bookId: bookA, quantity: 1 }],
      });

      const found = await service.adminList({
        status: 'address_only',
        page: 1,
        perPage: 50,
        q: 'كتاب الترم الأول',
      });
      expect(found.rows.map((row) => row.id)).toContain(wanted.id);
    });

    /**
     * An empty box is not a filter — a query of nothing but spaces has to come
     * back as the whole tab, not as zero rows. Asserted on `rowCount` (the
     * TOTAL) rather than on the returned page, because the tab is thousands of
     * orders long on this database and the order just created sorts last.
     */
    it('returns the unfiltered tab for an empty or whitespace query', async () => {
      await service.create(studentId, address());

      const unfiltered = await service.adminList({ status: 'address_only', page: 1, perPage: 50, q: '' });
      const blank = await service.adminList({ status: 'address_only', page: 1, perPage: 50, q: '   ' });

      expect(unfiltered.rowCount).toBeGreaterThan(0);
      expect(blank.rowCount).toBe(unfiltered.rowCount);
    });
  });

  describe('adminRevenueSummary', () => {
    /**
     * Same shared-database discipline as `payments/finance.service.spec.ts`:
     * this is a real, already-populated local Postgres, so the assertion is
     * a BEFORE/AFTER delta across one more known payment, never an assumed
     * absolute total.
     */
    it('counts a newly PAID order into both revenueTotalCents and paidCount', async () => {
      const before = await service.adminRevenueSummary();

      const order = await service.create(studentId, address());
      await service.submitPayment(studentId, order.id, {
        senderPhone: '01011112222',
        screenshotKey: validScreenshotKey(),
      });

      const after = await service.adminRevenueSummary();
      expect(after.paidCount).toBe(before.paidCount + 1);
      expect(after.revenueTotalCents).toBe(before.revenueTotalCents + order.amountCents);
    });

    it('never counts an address_only order — no payment happened yet', async () => {
      const before = await service.adminRevenueSummary();
      await service.create(studentId, address());
      const after = await service.adminRevenueSummary();
      expect(after.paidCount).toBe(before.paidCount);
      expect(after.revenueTotalCents).toBe(before.revenueTotalCents);
    });
  });

  describe('markShipped', () => {
    it('stamps shippedAt and moves status to shipped', async () => {
      const order = await service.create(studentId, address());
      await service.submitPayment(studentId, order.id, {
        senderPhone: '01011112222',
        screenshotKey: validScreenshotKey(),
      });

      const result = await service.markShipped(adminId, order.id);
      expect(result.status).toBe('shipped');

      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.status).toBe('shipped');
      expect(row.shippedAt).not.toBeNull();
      expect(row.shippedByUserId).toBe(adminId);
    });

    it('refuses shipping an order that was never paid', async () => {
      const order = await service.create(studentId, address());
      await expect(service.markShipped(adminId, order.id)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses shipping an order twice', async () => {
      const order = await service.create(studentId, address());
      await service.submitPayment(studentId, order.id, {
        senderPhone: '01011112222',
        screenshotKey: validScreenshotKey(),
      });
      await service.markShipped(adminId, order.id);

      await expect(service.markShipped(adminId, order.id)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('exportXlsx', () => {
    it('produces a workbook containing exactly the rows for the requested status', async () => {
      const paidOrder = await service.create(studentId, address());
      await service.submitPayment(studentId, paidOrder.id, {
        senderPhone: '01011112222',
        screenshotKey: validScreenshotKey(),
      });
      await service.create(strangerId, address()); // stays address_only

      const buffer = await service.exportXlsx('paid');
      expect(buffer.length).toBeGreaterThan(0);

      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.worksheets[0]!;

      // Header row + exactly the paid rows for this test's own students —
      // other tests/processes may have left other paid rows in the shared
      // dev database, so this asserts a floor, not an exact count.
      expect(sheet.rowCount).toBeGreaterThanOrEqual(2);

      const header = sheet.getRow(1).values as unknown[];
      expect(header).toContain('اسم الكتاب');
      /* «عربي», not «عام» — the header disagreed with the values printed under
         it (`copy.stream.general`) from the day the column was written. */
      expect(header).toContain('عربي / لغات');
      expect(header).toContain('الموبايل');

      const bodyRows: string[][] = [];
      for (let i = 2; i <= sheet.rowCount; i += 1) {
        bodyRows.push((sheet.getRow(i).values as unknown[]).map(String));
      }
      const fullNames = bodyRows.map((row) => row.find((cell) => cell === 'أحمد محمد')).filter(Boolean);
      expect(fullNames.length).toBeGreaterThan(0);
    });
  });
  /*
   * ═════════════════════════════════════════════════════════════════════════
   * دورة حياة الطلب — «وصل»، «اترفض»، «اتشال»، «رجع».
   *
   * Every one of these transitions is a fact somebody acts on: a student
   * waiting for a book, an admin deciding an order will not happen, a row
   * disappearing from the shipping queue. So each case here asserts the STORED
   * row and, where a student is owed one, the notification — never just the
   * value the method handed back, which is the part that cannot be wrong.
   * ═════════════════════════════════════════════════════════════════════════
   */


  /**
   * The export's own «عربي / لغات» column, by position.
   *
   * ExcelJS hands back a 1-indexed row (slot 0 is always empty), and the sheet
   * is declared bookTitle, quantity, unitPrice, courseTitle, year, stream — so
   * the stream is slot 6. Asserted by CELL and not with `includes`, because
   * «عربي ولغات» contains «لغات» and a substring match would pass on the wrong
   * answer.
   */
  const STREAM_COLUMN = 6;

  /** Every body row of one export, as raw cell values. */
  const exportRows = async (
    status: Parameters<typeof service.exportXlsx>[0],
  ): Promise<unknown[][]> => {
    const buffer = await service.exportXlsx(status);
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0]!;

    const rows: unknown[][] = [];
    for (let i = 2; i <= sheet.rowCount; i += 1) rows.push(sheet.getRow(i).values as unknown[]);
    return rows;
  };

  /** An order sitting at `paid` — the state most of the transitions below
   *  start from, and the one the shipping queue is made of. */
  const paidOrder = async (
    userId: string | null = studentId,
    overrides: Partial<Parameters<typeof service.create>[1]> = {},
  ) => {
    const order = await service.create(userId, { ...address(), ...overrides });
    await service.submitPayment(userId, order.id, {
      senderPhone: '01011112222',
      screenshotKey: validScreenshotKey(),
    });
    return order;
  };

  /** Notifications are matched on the ORDER ID inside the payload, never on
   *  «the newest row»: this database is a real cohort and other suites write
   *  notifications of their own while this one runs. */
  const notificationsFor = (
    kind: 'book_order_shipped' | 'book_order_delivered' | 'book_order_rejected',
    orderId: string,
  ) =>
    prisma.notification.findMany({
      where: { kind, payload: { path: ['orderId'], equals: orderId } },
    });

  describe('markShipped notifies the student', () => {
    /**
     * ⚠️ REVERSED on 2026-09-04. `markShipped` used to say, in its own
     * docblock and in the model comment beside `shippedAt`, that the silence
     * was deliberate. The product owner changed the decision: the student is
     * told when the parcel leaves and again when it arrives.
     */
    it('writes a book_order_shipped notification for the student who owns the order', async () => {
      const order = await paidOrder();
      await service.markShipped(adminId, order.id);

      const written = await notificationsFor('book_order_shipped', order.id);
      expect(written).toHaveLength(1);
      expect(written[0]!.userId).toBe(studentId);
    });

    /** Most rows in this table are guests — there is no account to write a
     *  notification row against, and that is what guest checkout means, not a
     *  case to work around. */
    it('stays silent on a guest order — there is no account to tell', async () => {
      const order = await paidOrder(null);
      await service.markShipped(adminId, order.id);

      expect(await notificationsFor('book_order_shipped', order.id)).toHaveLength(0);
      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.status).toBe('shipped');
    });
  });

  describe('markDelivered', () => {
    it('moves a shipped order to delivered and records who said so', async () => {
      const order = await paidOrder();
      await service.markShipped(adminId, order.id);

      const result = await service.markDelivered(adminId, order.id);
      expect(result.status).toBe('delivered');

      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.status).toBe('delivered');
      expect(row.deliveredAt).not.toBeNull();
      expect(row.deliveredByUserId).toBe(adminId);
    });

    /** «بسلّم كتب بإيدي» — a book handed over at the centre was never given to
     *  a courier, and forcing «اتشحن» first would put a shipment that did not
     *  happen in the audit trail. */
    it('accepts a PAID order that was never shipped, and does not invent a shippedAt', async () => {
      const order = await paidOrder();

      const result = await service.markDelivered(adminId, order.id);
      expect(result.status).toBe('delivered');

      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.status).toBe('delivered');
      expect(row.shippedAt).toBeNull();
    });

    it('tells the student the book arrived', async () => {
      const order = await paidOrder();
      await service.markDelivered(adminId, order.id);

      const written = await notificationsFor('book_order_delivered', order.id);
      expect(written).toHaveLength(1);
      expect(written[0]!.userId).toBe(studentId);
    });

    it('writes nothing for a guest order', async () => {
      const order = await paidOrder(null);
      await service.markDelivered(adminId, order.id);

      expect(await notificationsFor('book_order_delivered', order.id)).toHaveLength(0);
    });

    it('refuses an order that has not been paid for', async () => {
      const order = await service.create(studentId, address());
      await expect(service.markDelivered(adminId, order.id)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses marking the same order delivered twice', async () => {
      const order = await paidOrder();
      await service.markDelivered(adminId, order.id);

      await expect(service.markDelivered(adminId, order.id)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses an order that was rejected', async () => {
      const order = await paidOrder();
      await service.reject(adminId, order.id, 'التحويل ما وصلش');

      await expect(service.markDelivered(adminId, order.id)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a deleted order until it is restored', async () => {
      const order = await paidOrder();
      await service.softDelete(adminId, order.id, 'طلب مكرر');

      await expect(service.markDelivered(adminId, order.id)).rejects.toBeInstanceOf(BadRequestException);

      await service.restore(adminId, order.id);
      const result = await service.markDelivered(adminId, order.id);
      expect(result.status).toBe('delivered');
    });

    /** Each refusal is its own sentence — «مدفعش», «اتسجّل قبل كده» and
     *  «مرفوض» are three different next actions for the admin. */
    it('says something different for each refusal', async () => {
      const unpaid = await service.create(studentId, address());
      const twice = await paidOrder();
      await service.markDelivered(adminId, twice.id);
      const refused = await paidOrder();
      await service.reject(adminId, refused.id, 'العنوان مش واضح');

      const messages = await Promise.all(
        [unpaid.id, twice.id, refused.id].map((id) =>
          service.markDelivered(adminId, id).then(
            () => '',
            (error: Error) => error.message,
          ),
        ),
      );

      expect(new Set(messages).size).toBe(3);
    });

    it('404s an order that does not exist', async () => {
      await expect(service.markDelivered(adminId, randomUUID())).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reject', () => {
    it('turns a paid order down, keeps the reason, and tells the student', async () => {
      const order = await paidOrder();

      const result = await service.reject(adminId, order.id, 'التحويل ما وصلش');
      expect(result.status).toBe('rejected');
      expect(result.rejectionReason).toBe('التحويل ما وصلش');

      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.status).toBe('rejected');
      expect(row.rejectedAt).not.toBeNull();
      expect(row.rejectedByUserId).toBe(adminId);
      expect(row.rejectionReason).toBe('التحويل ما وصلش');

      const written = await notificationsFor('book_order_rejected', order.id);
      expect(written).toHaveLength(1);
      // Verbatim, the same rule `payment_rejected` follows: a reason the
      // platform paraphrases is one the student argues with instead of acting on.
      expect((written[0]!.payload as { reason: string }).reason).toBe('التحويل ما وصلش');
    });

    it('rejects an order that never got past the address form', async () => {
      const order = await service.create(studentId, address());

      const result = await service.reject(adminId, order.id, 'الرقم مش بيرد');
      expect(result.status).toBe('rejected');
    });

    /** A parcel that came back, or a transfer that turned out to be somebody
     *  else's — discovered after the fact more often than before it. */
    it('rejects an order that already shipped or arrived', async () => {
      const order = await paidOrder();
      await service.markShipped(adminId, order.id);
      await service.markDelivered(adminId, order.id);

      const result = await service.reject(adminId, order.id, 'رجع تاني');
      expect(result.status).toBe('rejected');

      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      // The arrival still happened; rejecting it does not unhappen it.
      expect(row.deliveredAt).not.toBeNull();
    });

    it('refuses rejecting the same order twice', async () => {
      const order = await paidOrder();
      await service.reject(adminId, order.id, 'التحويل ما وصلش');

      await expect(service.reject(adminId, order.id, 'تاني')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a deleted order', async () => {
      const order = await paidOrder();
      await service.softDelete(adminId, order.id, 'طلب مكرر');

      await expect(service.reject(adminId, order.id, 'التحويل ما وصلش')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('writes nothing for a guest order, and still records the rejection', async () => {
      const order = await paidOrder(null);
      await service.reject(adminId, order.id, 'العنوان مش موجود');

      expect(await notificationsFor('book_order_rejected', order.id)).toHaveLength(0);
      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.status).toBe('rejected');
    });

    /** Rejecting is NOT deleting: the row stays in the list, on its own tab,
     *  and stays visible to the student. */
    it('leaves the row in the admin list under its own status', async () => {
      const order = await paidOrder();
      await service.reject(adminId, order.id, 'التحويل ما وصلش');

      const rejected = await service.adminList({ status: 'rejected', page: 1, perPage: 50, q: '' });
      expect(rejected.rows.map((row) => row.id)).toContain(order.id);

      const mine = await service.listMine(studentId);
      const own = mine.find((row) => row.id === order.id);
      expect(own?.status).toBe('rejected');
      expect(own?.rejectionReason).toBe('التحويل ما وصلش');
    });

    it('404s an order that does not exist', async () => {
      await expect(service.reject(adminId, randomUUID(), 'أي سبب')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('softDelete / restore', () => {
    it('hides the row WITHOUT touching the status it was deleted from', async () => {
      const order = await paidOrder();

      const result = await service.softDelete(adminId, order.id, 'طلب مكرر');
      expect(result.deletionReason).toBe('طلب مكرر');

      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.deletedAt).not.toBeNull();
      expect(row.deletedByUserId).toBe(adminId);
      expect(row.deletionReason).toBe('طلب مكرر');
      // The whole reason deletion is not a status.
      expect(row.status).toBe('paid');
    });

    /**
     * The case that makes soft delete worth the columns: every read has to
     * drop the row IN THE SAME COMMIT, or a deleted order keeps counting
     * somewhere nobody thinks to look — a revenue tile, a sidebar badge, a
     * spreadsheet handed to a courier.
     */
    it('drops the order out of the admin list, the revenue tile, the student history and the export', async () => {
      const order = await paidOrder(studentId, { fullName: 'حسام المحذوف' });

      const beforeRevenue = await service.adminRevenueSummary();
      const beforePaid = await service.adminList({ status: 'paid', page: 1, perPage: 50, q: 'حسام المحذوف' });
      expect(beforePaid.rows.map((row) => row.id)).toContain(order.id);
      expect((await service.listMine(studentId)).map((row) => row.id)).toContain(order.id);

      await service.softDelete(adminId, order.id, 'اتلغى في التليفون');

      const afterPaid = await service.adminList({ status: 'paid', page: 1, perPage: 50, q: 'حسام المحذوف' });
      expect(afterPaid.rows.map((row) => row.id)).not.toContain(order.id);
      // The unfiltered tab too — no status is «مش محذوف», not «كل حاجة».
      const afterAll = await service.adminList({ page: 1, perPage: 50, q: 'حسام المحذوف' });
      expect(afterAll.rows.map((row) => row.id)).not.toContain(order.id);

      const afterRevenue = await service.adminRevenueSummary();
      expect(afterRevenue.paidCount).toBe(beforeRevenue.paidCount - 1);
      expect(afterRevenue.revenueTotalCents).toBe(beforeRevenue.revenueTotalCents - order.amountCents);

      expect((await service.listMine(studentId)).map((row) => row.id)).not.toContain(order.id);

      const exported = await exportRows('paid');
      expect(exported.some((row) => row.includes('حسام المحذوف'))).toBe(false);
    });

    /** The `deleted` filter is a VIEW, not a status: the row comes back
     *  carrying the status it was deleted FROM, which is the point of it. */
    it('shows the row ONLY under status=deleted, still carrying its old status', async () => {
      const order = await paidOrder();
      await service.softDelete(adminId, order.id, 'طلب مكرر');

      const deleted = await service.adminList({ status: 'deleted', page: 1, perPage: 50, q: '' });
      const row = deleted.rows.find((entry) => entry.id === order.id);

      expect(row).toBeDefined();
      expect(row?.status).toBe('paid');
      expect(row?.deletedAt).not.toBeNull();
      expect(row?.deletionReason).toBe('طلب مكرر');
    });

    it('exports the deleted tab, and only it', async () => {
      const order = await paidOrder(studentId, { fullName: 'سطر اتشال' });
      await service.softDelete(adminId, order.id, 'طلب مكرر');

      expect((await exportRows('deleted')).some((row) => row.includes('سطر اتشال'))).toBe(true);
      expect((await exportRows('paid')).some((row) => row.includes('سطر اتشال'))).toBe(false);
    });

    it('puts everything back on restore', async () => {
      const order = await paidOrder(studentId, { fullName: 'حسام الراجع' });
      await service.softDelete(adminId, order.id, 'غلط');

      const result = await service.restore(adminId, order.id);
      expect(result.status).toBe('paid');

      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.deletedAt).toBeNull();
      expect(row.deletedByUserId).toBeNull();
      expect(row.deletionReason).toBeNull();

      const paid = await service.adminList({ status: 'paid', page: 1, perPage: 50, q: 'حسام الراجع' });
      expect(paid.rows.map((entry) => entry.id)).toContain(order.id);
      expect((await service.listMine(studentId)).map((entry) => entry.id)).toContain(order.id);
    });

    it('refuses deleting the same order twice — the second reason would replace the first', async () => {
      const order = await paidOrder();
      await service.softDelete(adminId, order.id, 'طلب مكرر');

      await expect(service.softDelete(adminId, order.id, 'تاني')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses restoring an order that was never deleted', async () => {
      const order = await paidOrder();
      await expect(service.restore(adminId, order.id)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deletes an order from ANY status, rejected included', async () => {
      const order = await paidOrder();
      await service.reject(adminId, order.id, 'التحويل ما وصلش');

      await service.softDelete(adminId, order.id, 'مش عايز أشوفه');

      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.status).toBe('rejected');
      expect(row.deletedAt).not.toBeNull();
    });

    it('a deleted order is gone from the public read and the payment step too', async () => {
      const order = await service.create(null, address());
      await service.softDelete(adminId, order.id, 'طلب تجريبي');

      await expect(service.getById(null, order.id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.submitPayment(null, order.id, {
          senderPhone: '01011112222',
          screenshotKey: validScreenshotKey(),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s an order that does not exist', async () => {
      await expect(service.softDelete(adminId, randomUUID(), 'أي سبب')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.restore(adminId, randomUUID())).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  /**
   * «فيه ناس اشترت فعلاً، شوف هل دول متسجلين» — the guest→student link.
   *
   * ⚠️ It is made at READ time, and the row is NEVER claimed. Writing `userId`
   * onto a guest order is the obvious implementation and it takes something
   * away from the person it is for: `getById` treats the id as the credential
   * for an unclaimed row, so stamping an account on it 404s the browser that
   * placed the order — mid-purchase, and only for people who are registered.
   * Every test below is written to fail if somebody makes `create` claim it.
   */
  describe('a guest order reaches the student whose phone it carries', () => {
    it('stays a GUEST row — create never writes an account onto it', async () => {
      const order = await service.create(null, { ...address(), phone: linkedPhone });

      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.userId).toBeNull();
    });

    it('shows up in that student’s own history anyway', async () => {
      const order = await service.create(null, { ...address(), phone: linkedPhone });

      expect((await service.listMine(linkedStudentId)).map((entry) => entry.id)).toContain(order.id);
    });

    /** The whole point of not claiming it: the browser that placed the order
     *  keeps the access it had, with no session. */
    it('still lets the browser that placed it read it back and pay for it', async () => {
      const order = await service.create(null, { ...address(), phone: linkedPhone });

      const read = await service.getById(null, order.id);
      expect(read.id).toBe(order.id);

      const paid = await service.submitPayment(null, order.id, {
        senderPhone: '01011112222',
        screenshotKey: validScreenshotKey(),
      });
      expect(paid.status).toBe('paid');
    });

    /** The alternate number is routinely a PARENT's — matching on it would put
     *  one sibling's order in another's history. */
    it('never matches on the ALTERNATE number', async () => {
      const order = await service.create(null, { ...address(), altPhone: linkedPhone });

      expect((await service.listMine(linkedStudentId)).map((entry) => entry.id)).not.toContain(
        order.id,
      );
    });

    it('leaves a number that matches nobody out of everybody’s history', async () => {
      const order = await service.create(null, { ...address(), phone: '+201500000001' });

      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.userId).toBeNull();
      expect((await service.listMine(linkedStudentId)).map((entry) => entry.id)).not.toContain(
        order.id,
      );
    });

    it('never overrides the session — a signed-in caller keeps their own id', async () => {
      const order = await service.create(strangerId, { ...address(), phone: linkedPhone });

      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.userId).toBe(strangerId);
      // …and it does NOT leak into the phone owner's history: an order somebody
      // else placed from their own account is theirs, whatever number is on it.
      expect((await service.listMine(linkedStudentId)).map((entry) => entry.id)).not.toContain(
        order.id,
      );
    });

    /** The notification side of the same resolution — «لو ضغطت وصل هيجيله
     *  إشعار» has to be true for an order placed without a session too. */
    it('notifies the phone’s owner when a GUEST order is shipped', async () => {
      const order = await service.create(null, { ...address(), phone: linkedPhone });
      await service.submitPayment(null, order.id, {
        senderPhone: '01011112222',
        screenshotKey: validScreenshotKey(),
      });

      await service.markShipped(adminId, order.id);

      const rows = await prisma.notification.findMany({
        where: { userId: linkedStudentId, kind: 'book_order_shipped' },
      });
      expect(rows).toHaveLength(1);
    });
  });

  /**
   * «أعرف إن الراجل ده طلب كتاب قبل كده ولا لأ» — counted on the phone number,
   * because guest checkout means one person is several unlinked rows.
   */
  describe('previousOrdersFromPhone', () => {
    /** Its own number per case: `address()`'s default is shared by half this
     *  file, and this is the one assertion that counts rows rather than
     *  looking for its own. */
    const repeatPhone = '+201500777001';
    const lonePhone = '+201500777002';

    it('is 0 for a number with no other live orders, and counts the OTHERS for a repeat customer', async () => {
      const only = await service.create(studentId, { ...address(), phone: lonePhone });
      const first = await service.create(studentId, { ...address(), phone: repeatPhone });
      const second = await service.create(studentId, { ...address(), phone: repeatPhone });
      const third = await service.create(studentId, { ...address(), phone: repeatPhone });

      const list = await service.adminList({ status: 'address_only', page: 1, perPage: 200, q: '500777' });
      const byId = new Map(list.rows.map((row) => [row.id, row.previousOrdersFromPhone]));

      expect(byId.get(only.id)).toBe(0);
      // Three rows sharing a number: each one sees the OTHER two.
      expect(byId.get(first.id)).toBe(2);
      expect(byId.get(second.id)).toBe(2);
      expect(byId.get(third.id)).toBe(2);
    });

    /** «طلب قبل كده» is a claim about a real history, and a row the admin hid
     *  is one they decided did not happen. */
    it('stops counting an order once it is deleted', async () => {
      const kept = await service.create(studentId, { ...address(), phone: repeatPhone });
      const removed = await service.create(studentId, { ...address(), phone: repeatPhone });

      await service.softDelete(adminId, removed.id, 'طلب مكرر');

      const list = await service.adminList({ status: 'address_only', page: 1, perPage: 200, q: '500777' });
      expect(list.rows.find((row) => row.id === kept.id)?.previousOrdersFromPhone).toBe(0);
    });
  });

  /**
   * عام ولا لغات — the column the print shop packs from, which was blank on
   * every cart order because it read the ORDER's course and a basket has none.
   */
  describe('the stream on the line', () => {
    it('carries the book’s own stream onto each line', async () => {
      const order = await service.create(studentId, {
        ...cartAddress(),
        items: [{ bookId: languagesBook, quantity: 1 }],
      });

      expect(order.items[0]!.forGeneral).toBe(false);
      expect(order.items[0]!.forLanguages).toBe(true);

      const list = await service.adminList({ status: 'address_only', page: 1, perPage: 50, q: 'كتاب لغات' });
      const row = list.rows.find((entry) => entry.id === order.id);
      expect(row?.items[0]?.forLanguages).toBe(true);
    });

    it('leaves both null on a line the catalogue does not carry', async () => {
      const order = await service.create(studentId, {
        ...cartAddress(),
        items: [{ bookId: bookA, quantity: 1 }],
      });

      const edited = await service.adminPatch(adminId, order.id, {
        items: [{ bookId: null, titleAr: 'ملزمة مراجعة', unitPriceCents: 5_000, quantity: 1 }],
      });

      expect(edited.items[0]!.forGeneral).toBeNull();
      expect(edited.items[0]!.forLanguages).toBeNull();
    });

    it('prints the LINE’s own stream in the export', async () => {
      await paidOrder(studentId, {
        courseId: undefined,
        items: [{ bookId: languagesBook, quantity: 1 }],
        fullName: 'زبون لغات',
      });

      const row = (await exportRows('paid')).find((cells) => cells.includes('زبون لغات'));
      expect(row).toBeDefined();
      expect(row?.[STREAM_COLUMN]).toBe(copy.stream.languages);
    });

    /** The fallback: a course-book line has no `bookId` when the course's book
     *  was never mirrored into the catalogue, and the course's own pair is
     *  still the right answer for it. */
    it('falls back to the ORDER’s course when the line has no book', async () => {
      await paidOrder(studentId, { fullName: 'زبون كورس' });

      const row = (await exportRows('paid')).find((cells) => cells.includes('زبون كورس'));
      expect(row).toBeDefined();
      // The fixture course is عربي only — see its own note in `beforeAll`.
      expect(row?.[STREAM_COLUMN]).toBe(copy.stream.general);
    });
  });

});
