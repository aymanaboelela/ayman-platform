// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { EMPTY_AUDIENCE, type Audience } from '@ayman/contracts/marketing/campaign';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AudienceService } from './audience.service';

/**
 * Integration test against the real database — the same reasoning
 * `EntitlementService`'s own spec gives: a mock `AccessGrant` table would only
 * prove the mock agrees with itself, and "which grant states count as
 * already-subscribed" is exactly the behaviour under test.
 */
describe('AudienceService', () => {
  let prisma: PrismaService;
  let service: AudienceService;

  let instructorId: string;
  let generalStudentId: string;
  let languagesStudentId: string;
  let generalPhone: string;
  let languagesPhone: string;
  let paidCourseId: string;

  function audienceFor(overrides: Partial<Audience>): Audience {
    return { ...EMPTY_AUDIENCE, ...overrides };
  }

  beforeAll(async () => {
    // Prisma 7 requires a driver adapter at construction time — a bare
    // `new PrismaClient()` throws (see PrismaService for the same wiring).
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as unknown as PrismaService;
    await prisma.$connect();
    service = new AudienceService(prisma);

    const stamp = Date.now();
    const suffix = stamp.toString(36);
    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    const governorate = await prisma.governorate.findFirstOrThrow();

    instructorId = (
      await prisma.user.create({
        data: { id: `aud-instr-${suffix}`, name: 'مدرّس', email: `aud-instr-${suffix}@t.test`, role: 'admin' },
      })
    ).id;

    generalPhone = `+2010${String(stamp).slice(-8)}`;
    languagesPhone = `+2011${String(stamp + 1).slice(-8)}`;

    generalStudentId = (
      await prisma.user.create({
        data: {
          id: `aud-gen-${suffix}`,
          name: 'طالب عام',
          email: `aud-gen-${suffix}@t.test`,
          role: 'student',
          phoneNumber: generalPhone,
        },
      })
    ).id;

    languagesStudentId = (
      await prisma.user.create({
        data: {
          id: `aud-lang-${suffix}`,
          name: 'طالب لغات',
          email: `aud-lang-${suffix}@t.test`,
          role: 'student',
          phoneNumber: languagesPhone,
        },
      })
    ).id;

    // `AudienceService.students()` reads the profile's stream/year through
    // `studentProfile`, same as `year` today — every real student row has one.
    await prisma.studentProfile.create({
      data: {
        userId: generalStudentId,
        fullName: 'طالب عام',
        gender: 'male',
        phone: generalPhone,
        governorateCode: governorate.code,
        year: 2,
        schoolStream: 'general',
      },
    });
    await prisma.studentProfile.create({
      data: {
        userId: languagesStudentId,
        fullName: 'طالب لغات',
        gender: 'male',
        phone: languagesPhone,
        governorateCode: governorate.code,
        year: 2,
        schoolStream: 'languages',
      },
    });

    paidCourseId = (
      await prisma.course.create({
        data: {
          slug: `aud-paid-${suffix}`,
          title: 'كورس مدفوع',
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          subjectId: subject.id,
          year: 2,
          instructorId,
          requiresGrant: true,
        },
      })
    ).id;

    // Both fixtures enroll — "not yet subscribed" is about the GRANT, not the
    // enrollment, so both must start from the same enrolled baseline.
    await prisma.enrollment.createMany({
      data: [
        { userId: generalStudentId, courseId: paidCourseId },
        { userId: languagesStudentId, courseId: paidCourseId },
      ],
    });
  });

  afterAll(async () => {
    await prisma.accessGrant.deleteMany({
      where: { userId: { in: [generalStudentId, languagesStudentId] } },
    });
    await prisma.enrollment.deleteMany({
      where: { userId: { in: [generalStudentId, languagesStudentId] } },
    });
    await prisma.course.deleteMany({ where: { id: paidCourseId } });
    await prisma.studentProfile.deleteMany({
      where: { userId: { in: [generalStudentId, languagesStudentId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [generalStudentId, languagesStudentId, instructorId] } },
    });
    await prisma.$disconnect();
  });

  it('narrows by school stream', async () => {
    const resolved = await service.resolve(audienceFor({ schoolStreams: ['languages'] }));
    const phones = resolved.recipients.map((r) => r.phone);
    expect(phones).toContain(languagesPhone);
    expect(phones).not.toContain(generalPhone);
  });

  it('is a no-op on school stream when the filter is empty', async () => {
    const resolved = await service.resolve(audienceFor({}));
    const phones = resolved.recipients.map((r) => r.phone);
    expect(phones).toContain(generalPhone);
    expect(phones).toContain(languagesPhone);
  });

  it('"not yet subscribed" excludes a student with a live grant for the course', async () => {
    const grant = await prisma.accessGrant.create({
      data: { userId: generalStudentId, scope: 'course', courseId: paidCourseId, source: 'admin' },
    });

    try {
      const resolved = await service.resolve(
        audienceFor({ courseIds: [paidCourseId], notSubscribedOnly: true }),
      );
      const phones = resolved.recipients.map((r) => r.phone);
      expect(phones).not.toContain(generalPhone);
      expect(phones).toContain(languagesPhone);
    } finally {
      await prisma.accessGrant.delete({ where: { id: grant.id } });
    }
  });

  it('"not yet subscribed" includes a student whose grant expired', async () => {
    const grant = await prisma.accessGrant.create({
      data: {
        userId: generalStudentId,
        scope: 'course',
        courseId: paidCourseId,
        source: 'admin',
        validFrom: new Date(Date.now() - 20_000),
        validUntil: new Date(Date.now() - 10_000),
      },
    });

    try {
      const resolved = await service.resolve(
        audienceFor({ courseIds: [paidCourseId], notSubscribedOnly: true }),
      );
      const phones = resolved.recipients.map((r) => r.phone);
      expect(phones).toContain(generalPhone);
      expect(phones).toContain(languagesPhone);
    } finally {
      await prisma.accessGrant.delete({ where: { id: grant.id } });
    }
  });

  it('"not yet subscribed" includes a student whose grant was revoked', async () => {
    const grant = await prisma.accessGrant.create({
      data: {
        userId: generalStudentId,
        scope: 'course',
        courseId: paidCourseId,
        source: 'admin',
        revokedAt: new Date(),
      },
    });

    try {
      const resolved = await service.resolve(
        audienceFor({ courseIds: [paidCourseId], notSubscribedOnly: true }),
      );
      const phones = resolved.recipients.map((r) => r.phone);
      expect(phones).toContain(generalPhone);
      expect(phones).toContain(languagesPhone);
    } finally {
      await prisma.accessGrant.delete({ where: { id: grant.id } });
    }
  });

  it('is a no-op when notSubscribedOnly is set but no courseIds are selected', async () => {
    const grant = await prisma.accessGrant.create({
      data: { userId: generalStudentId, scope: 'course', courseId: paidCourseId, source: 'admin' },
    });

    try {
      const resolved = await service.resolve(audienceFor({ courseIds: [], notSubscribedOnly: true }));
      const phones = resolved.recipients.map((r) => r.phone);
      // No course selected — there is nothing to be "subscribed" to, so the
      // filter must not silently drop anyone.
      expect(phones).toContain(generalPhone);
      expect(phones).toContain(languagesPhone);
    } finally {
      await prisma.accessGrant.delete({ where: { id: grant.id } });
    }
  });

  /**
   * «أحدد الناس اللي اتشحن ليها + اللي ماتشحنتش ليها + اللي وصل ليها.»
   *
   * Against the real table for the same reason the grant tests above are: the
   * behaviour under test IS the `where` clause — a soft-delete filter nested
   * inside a `some`, an enum `in`, and a nullable foreign key. A mocked
   * `bookOrder` would agree with whatever this file told it to.
   *
   * The fixtures put one student in each state and give the same treatment to
   * two rows that must NOT be picked up: an order the admin deleted, and a
   * guest order that belongs to no account at all.
   */
  describe('book order states', () => {
    let addressOnlyStudentId: string;
    let deliveredStudentId: string;
    let deletedOrderStudentId: string;
    let addressOnlyPhone: string;
    let deliveredPhone: string;
    let deletedOrderPhone: string;
    /** A guest order's own number — no `users` row anywhere carries it. */
    let guestPhone: string;
    let orderIds: string[] = [];

    /** The address columns are NOT NULL and say nothing about this test. */
    async function placeOrder(data: {
      userId: string | null;
      phone: string;
      status: 'address_only' | 'paid' | 'shipped' | 'delivered' | 'rejected';
      deleted?: boolean;
    }) {
      const governorate = await prisma.governorate.findFirstOrThrow();
      const order = await prisma.bookOrder.create({
        data: {
          userId: data.userId,
          fullName: 'صاحب الطلب',
          phone: data.phone,
          altPhone: data.phone,
          governorateCode: governorate.code,
          city: 'المنصورة',
          addressStreet: 'شارع الجيش',
          // `book_orders_amount_is_the_sum` — the total is the breakdown, and
          // a row that disagrees with itself is a failed write, not a warning.
          amountCents: 15000,
          itemsCents: 15000,
          status: data.status,
          ...(data.status === 'shipped' ? { shippedAt: new Date() } : {}),
          ...(data.status === 'delivered' ? { shippedAt: new Date(), deliveredAt: new Date() } : {}),
          ...(data.deleted
            ? { deletedAt: new Date(), deletionReason: 'اتلغى بالتليفون' }
            : {}),
        },
      });
      orderIds.push(order.id);
      return order;
    }

    beforeAll(async () => {
      const stamp = Date.now();
      const suffix = `${stamp.toString(36)}b`;

      addressOnlyPhone = `+2012${String(stamp + 2).slice(-8)}`;
      deliveredPhone = `+2015${String(stamp + 3).slice(-8)}`;
      deletedOrderPhone = `+2011${String(stamp + 4).slice(-8)}`;
      guestPhone = `+2010${String(stamp + 5).slice(-8)}`;

      const student = async (key: string, phone: string) =>
        (
          await prisma.user.create({
            data: {
              id: `aud-${key}-${suffix}`,
              name: `طالب ${key}`,
              email: `aud-${key}-${suffix}@t.test`,
              role: 'student',
              phoneNumber: phone,
            },
          })
        ).id;

      addressOnlyStudentId = await student('addr', addressOnlyPhone);
      deliveredStudentId = await student('deliv', deliveredPhone);
      deletedOrderStudentId = await student('del', deletedOrderPhone);

      // One student per state, reusing the two the outer fixtures already
      // created for the two states the instructor cares about most.
      await placeOrder({ userId: generalStudentId, phone: generalPhone, status: 'paid' });
      await placeOrder({ userId: languagesStudentId, phone: languagesPhone, status: 'shipped' });
      await placeOrder({ userId: deliveredStudentId, phone: deliveredPhone, status: 'delivered' });
      await placeOrder({
        userId: addressOnlyStudentId,
        phone: addressOnlyPhone,
        status: 'address_only',
      });

      // Paid, and then deleted by an admin. It must behave like no order at all.
      await placeOrder({
        userId: deletedOrderStudentId,
        phone: deletedOrderPhone,
        status: 'paid',
        deleted: true,
      });

      // Guest checkout — `user_id` is NULL, so no `users` row owns it.
      await placeOrder({ userId: null, phone: guestPhone, status: 'shipped' });
    });

    afterAll(async () => {
      await prisma.bookOrder.deleteMany({ where: { id: { in: orderIds } } });
      orderIds = [];
      await prisma.user.deleteMany({
        where: { id: { in: [addressOnlyStudentId, deliveredStudentId, deletedOrderStudentId] } },
      });
    });

    it('«ماتشحنتش ليها» — `paid` is the ones who paid and are still waiting', async () => {
      const resolved = await service.resolve(audienceFor({ bookOrderStatuses: ['paid'] }));
      const phones = resolved.recipients.map((r) => r.phone);
      expect(phones).toContain(generalPhone);
      expect(phones).not.toContain(languagesPhone);
      expect(phones).not.toContain(deliveredPhone);
    });

    it('«ماتشحنتش ليها» does NOT include somebody who never paid', async () => {
      // `address_only` is a filled-in address and no transfer. That person is
      // not owed «معلش اتأخر عليك الشحن» — nothing was ever shipped to them
      // because nothing was ever bought. They are their own checkbox instead.
      const waiting = await service.resolve(audienceFor({ bookOrderStatuses: ['paid'] }));
      expect(waiting.recipients.map((r) => r.phone)).not.toContain(addressOnlyPhone);

      const neverPaid = await service.resolve(audienceFor({ bookOrderStatuses: ['address_only'] }));
      const phones = neverPaid.recipients.map((r) => r.phone);
      expect(phones).toContain(addressOnlyPhone);
      expect(phones).not.toContain(generalPhone);
    });

    it('«اتشحن ليها» — `shipped` is the ones whose book left', async () => {
      const resolved = await service.resolve(audienceFor({ bookOrderStatuses: ['shipped'] }));
      const phones = resolved.recipients.map((r) => r.phone);
      expect(phones).toContain(languagesPhone);
      expect(phones).not.toContain(generalPhone);
      expect(phones).not.toContain(deliveredPhone);
    });

    it('«وصل ليها» — `delivered` is the ones who have the book', async () => {
      const resolved = await service.resolve(audienceFor({ bookOrderStatuses: ['delivered'] }));
      const phones = resolved.recipients.map((r) => r.phone);
      expect(phones).toContain(deliveredPhone);
      expect(phones).not.toContain(generalPhone);
      expect(phones).not.toContain(languagesPhone);
    });

    it('picking more than one state is a union, not an intersection', async () => {
      const resolved = await service.resolve(
        audienceFor({ bookOrderStatuses: ['shipped', 'delivered'] }),
      );
      const phones = resolved.recipients.map((r) => r.phone);
      expect(phones).toContain(languagesPhone);
      expect(phones).toContain(deliveredPhone);
      expect(phones).not.toContain(generalPhone);
    });

    it('is a no-op when no state is ticked — empty is "every student", not "nobody"', async () => {
      const resolved = await service.resolve(audienceFor({ bookOrderStatuses: [] }));
      const phones = resolved.recipients.map((r) => r.phone);
      expect(phones).toContain(generalPhone);
      expect(phones).toContain(languagesPhone);
      expect(phones).toContain(deliveredPhone);
      // Not even an order-less student is dropped: this axis is off.
      expect(phones).toContain(addressOnlyPhone);
    });

    it('a deleted order counts for nothing', async () => {
      const resolved = await service.resolve(audienceFor({ bookOrderStatuses: ['paid'] }));
      // The row still says `paid`; the admin decided it did not happen. A
      // «الكتاب في السكة» message about it would be a message about nothing.
      expect(resolved.recipients.map((r) => r.phone)).not.toContain(deletedOrderPhone);
    });

    it('a guest order (null user_id) is never a recipient', async () => {
      // The audience is built from `users`; a guest order has no account, so
      // there is no student row to reach. See `AudienceService.bookOrderFilter`
      // for the whole reasoning and for «أرقام تانية» as the way to reach them.
      const shipped = await service.resolve(audienceFor({ bookOrderStatuses: ['shipped'] }));
      const phones = shipped.recipients.map((r) => r.phone);
      expect(phones).toContain(languagesPhone);
      expect(phones).not.toContain(guestPhone);

      // And not through the unfiltered audience either — it was never a
      // student, so no combination of filters can turn it into one.
      const everyone = await service.resolve(audienceFor({}));
      expect(everyone.recipients.map((r) => r.phone)).not.toContain(guestPhone);
    });
  });
});
