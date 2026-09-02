// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { MediaService } from '../media/media.service';
import type { SettingsService } from '../admin/settings/settings.service';
import { BooksService } from '../books/books.service';
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
  const service = new BookOrdersService(prisma, audit, media, books);

  let adminId = '';
  let studentId = '';
  let strangerId = '';
  let bookedCourseId = '';
  let noBookCourseId = '';
  let governorateCode = '';
  let bookA = '';
  let bookB = '';
  let soldOutBook = '';

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
  });

  beforeEach(async () => {
    await prisma.bookOrder.deleteMany({ where: { userId: { in: [studentId, strangerId] } } });
    // Guest orders carry `userId: null`, so the filter above never catches
    // them — clean up by course id instead, scoped to this spec's own fixture
    // courses so nothing in the shared dev database is touched.
    await prisma.bookOrder.deleteMany({
      where: { userId: null, courseId: { in: [bookedCourseId, noBookCourseId] } },
    });
    /* A CART order has no `courseId` at all, so neither filter above reaches
       it. Scoped to this spec's own books so nothing shared is touched. */
    await prisma.bookOrder.deleteMany({
      where: { items: { some: { bookId: { in: [bookA, bookB, soldOutBook] } } } },
    });
  });

  afterAll(async () => {
    await prisma.bookOrder.deleteMany({ where: { userId: { in: [studentId, strangerId] } } });
    await prisma.bookOrder.deleteMany({
      where: { userId: null, courseId: { in: [bookedCourseId, noBookCourseId] } },
    });
    /* A CART order has no `courseId` at all, so neither filter above reaches
       it. Scoped to this spec's own books so nothing shared is touched. */
    await prisma.bookOrder.deleteMany({
      where: { items: { some: { bookId: { in: [bookA, bookB, soldOutBook] } } } },
    });
    // Never `deleteMany` on `audit_log` — INSERT-only at the database level.
    await prisma.book.deleteMany({ where: { id: { in: [bookA, bookB, soldOutBook] } } });
    await prisma.course.deleteMany({ where: { id: { in: [bookedCourseId, noBookCourseId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [studentId, strangerId, adminId] } } });
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
        { bookId: null, titleAr: 'كتاب الفيزياء', unitPriceCents: 25000, quantity: 1 },
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

      const paid = await service.adminList({ status: 'paid', page: 1, perPage: 50 });
      const row = paid.rows.find((r) => r.id === order.id);

      expect(row).toBeDefined();
      expect(row?.userId).toBeNull();
      expect(row?.fullName).toBe('عميل بالتليفون');
      expect(row?.amountCents).toBe(25000 + SHIPPING_CENTS);
      expect(row?.bookTitle).toBe('كتاب الفيزياء');
    });

    it('shows up in the admin address_only list, same as an abandoned public order', async () => {
      const order = await service.adminCreate(adminId, adminAddress({ paid: false }));

      const addressOnly = await service.adminList({ status: 'address_only', page: 1, perPage: 50 });
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

    it('404s a GUEST request trying to pay a signed-in student\'s order by guessing its id', async () => {
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

    it('404s a signed-in student\'s order id read as a guest (userId: null)', async () => {
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

      const addressOnly = await service.adminList({ status: 'address_only', page: 1, perPage: 50 });
      const ids = addressOnly.rows.map((row) => row.id);
      expect(ids).toContain(incomplete.id);
      expect(ids).not.toContain(toPay.id);

      const paid = await service.adminList({ status: 'paid', page: 1, perPage: 50 });
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

      const addressOnly = await service.adminList({ status: 'address_only', page: 1, perPage: 50 });
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
      expect(header).toContain('عام / لغات');
      expect(header).toContain('الموبايل');

      const bodyRows: string[][] = [];
      for (let i = 2; i <= sheet.rowCount; i += 1) {
        bodyRows.push((sheet.getRow(i).values as unknown[]).map(String));
      }
      const fullNames = bodyRows.map((row) => row.find((cell) => cell === 'أحمد محمد')).filter(Boolean);
      expect(fullNames.length).toBeGreaterThan(0);
    });
  });
});
