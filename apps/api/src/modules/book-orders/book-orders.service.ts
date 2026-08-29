import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { BookOrder, BookOrderStatus, CreateBookOrderInput, SubmitBookOrderPaymentInput } from '@ayman/contracts/book-orders';
import type { AdminBookOrderQuery, AdminBookOrderRow } from '@ayman/contracts/admin/book-orders';
import { streamChoiceOf } from '@ayman/contracts/content';
import { copy } from '@ayman/contracts/copy';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { MediaService, type UploadFile } from '../media/media.service';

/** The prefix `POST /book-orders/screenshot` stores under — same reasoning
 *  as `PaymentsService`'s own `SCREENSHOT_PREFIX`: never served through the
 *  public `/media/:prefix/:name` route. */
const SCREENSHOT_PREFIX = 'book-order-proof';

@Injectable()
export class BookOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  /** The screenshot upload — identical shape to `PaymentsService.uploadScreenshot`. */
  async uploadScreenshot(file: UploadFile): Promise<{ screenshotKey: string }> {
    const image = await this.media.uploadPrivateImage(file, SCREENSHOT_PREFIX);
    return { screenshotKey: image.storageKey };
  }

  private toBookOrder(row: {
    id: string;
    courseId: string;
    amountCents: number;
    status: 'address_only' | 'paid' | 'shipped';
    fullName: string;
    phone: string;
    altPhone: string;
    governorateCode: string;
    city: string;
    addressStreet: string;
    addressBuilding: string;
    addressNote: string | null;
    senderPhone: string | null;
    paidAt: Date | null;
    shippedAt: Date | null;
    createdAt: Date;
    course: { title: string; bookTitle: string | null };
  }): BookOrder {
    return {
      id: row.id,
      courseId: row.courseId,
      courseTitle: row.course.title,
      // Guaranteed non-null: `create()` refuses a course with no book before
      // a row can ever exist, and the book cannot be un-set out from under a
      // live order (`CourseService.update` only ever ADDS/changes a price,
      // never has a reason to null it while orders exist — a real gap would
      // surface here as an empty string rather than a crash).
      bookTitle: row.course.bookTitle ?? '',
      amountCents: row.amountCents,
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
    const course = await this.prisma.course.findUnique({
      where: { id: input.courseId },
      select: { id: true, title: true, status: true, bookTitle: true, bookPriceCents: true },
    });
    if (!course || course.status !== 'published') throw new NotFoundException();
    if (course.bookTitle === null || course.bookPriceCents === null) {
      throw new BadRequestException('this course has no book to order');
    }

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

    const order = await this.prisma.bookOrder.create({
      data: {
        userId,
        courseId: course.id,
        // The book's own price, not anything the student typed — same rule
        // `PaymentsService.submit` follows for `amountCents`.
        amountCents: course.bookPriceCents,
        fullName: input.fullName,
        phone: input.phone,
        altPhone: input.altPhone,
        governorateCode: input.governorateCode,
        city: input.city,
        addressStreet: input.addressStreet,
        addressBuilding: input.addressBuilding,
        addressNote: input.addressNote,
      },
      select: {
        id: true,
        courseId: true,
        amountCents: true,
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
      },
    });

    await this.audit.record({
      action: 'book-order:submit',
      resourceType: AUDIT_RESOURCES.bookOrder,
      resourceId: order.id,
      outcome: 'success',
      metadata: { userId, courseId: course.id, amountCents: course.bookPriceCents },
    });

    return this.toBookOrder({ ...order, course: { title: course.title, bookTitle: course.bookTitle } });
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
    const order = await this.prisma.bookOrder.update({
      where: { id: existing.id },
      data: {
        senderPhone: input.senderPhone,
        screenshotKey: input.screenshotKey,
        paidAt: now,
        status: 'paid',
      },
      select: {
        id: true,
        courseId: true,
        amountCents: true,
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
      },
    });

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
      select: {
        id: true,
        courseId: true,
        amountCents: true,
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
      },
    });
    if (!row) throw new NotFoundException();
    return this.toBookOrder(row);
  }

  /** The caller's own orders, newest first. `userId` from the session, never the URL. */
  async listMine(userId: string): Promise<BookOrder[]> {
    const rows = await this.prisma.bookOrder.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        courseId: true,
        amountCents: true,
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
      },
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
          fullName: true,
          phone: true,
          altPhone: true,
          governorateCode: true,
          city: true,
          addressStreet: true,
          addressBuilding: true,
          addressNote: true,
          senderPhone: true,
          screenshotKey: true,
          status: true,
          createdAt: true,
          paidAt: true,
          shippedAt: true,
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
        courseId: row.course.id,
        courseTitle: row.course.title,
        courseYear: row.course.year,
        courseForGeneral: row.course.forGeneral,
        courseForLanguages: row.course.forLanguages,
        bookTitle: row.course.bookTitle ?? '',
        amountCents: row.amountCents,
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
        createdAt: true,
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
      { header: 'السعر (جنيه)', key: 'amount', width: 12 },
      { header: 'تاريخ الطلب', key: 'createdAt', width: 18 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const row of rows) {
      sheet.addRow({
        bookTitle: row.course.bookTitle ?? '',
        courseTitle: row.course.title,
        year: row.course.year,
        stream: streamLabel[streamChoiceOf(row.course)],
        fullName: row.fullName,
        phone: row.phone,
        altPhone: row.altPhone,
        governorate: row.governorate.nameAr,
        city: row.city,
        street: row.addressStreet,
        building: row.addressBuilding,
        note: row.addressNote ?? '',
        amount: row.amountCents / 100,
        createdAt: row.createdAt.toISOString().slice(0, 10),
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
