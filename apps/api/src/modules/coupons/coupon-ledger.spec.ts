// Prisma 7 does not auto-load .env, and this spec runs outside Nest's bootstrap.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { HttpException } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { MediaService } from '../media/media.service';
import { PaymentsService } from '../payments/payments.service';
import { WalletService } from '../wallet/wallet.service';
import { CouponsService } from './coupons.service';

/**
 * «كوبونات الخصم», against the real database — because the promises are
 * database promises: the last use of a code cannot be spent twice by two
 * students pressing at once, the claim is filed at the discounted price the
 * server computed, a rejected claim gives its use back, and the ceiling holds
 * even against a write that skips the ledger.
 *
 * Fixture ids carry a per-run stamp; cleanup deletes the users (their cascade
 * takes the claims and redemptions), then the coupons and the courses.
 */

function codeOf(error: unknown): string | undefined {
  if (!(error instanceof HttpException)) return undefined;
  const body = error.getResponse();
  return typeof body === 'object' && body !== null ? (body as { code?: string }).code : undefined;
}

/** The 4xx code a promise was refused with — `undefined` if it resolved. */
async function refusal(promise: Promise<unknown>): Promise<string | undefined> {
  return promise.then(
    () => undefined,
    (error: unknown) => codeOf(error),
  );
}

describe('coupons', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const audit = new AuditService(prisma);
  const notifications = new NotificationsService(prisma);
  const payments = new PaymentsService(prisma, audit, notifications, {} as unknown as MediaService);
  const wallet = new WalletService(prisma, audit, notifications);
  const coupons = new CouponsService(prisma, audit);

  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  let adminId = '';
  let courseId = '';
  let otherCourseId = '';
  let governorateCode = '';

  // Odd prices, so nothing here collides with a real row on the dev database.
  const MONTHLY = 25_000;

  const PHONE_BASE = Math.floor(Math.random() * 9_000_000);
  let seq = 0;
  async function student(): Promise<string> {
    seq += 1;
    const n = seq;
    const id = `cpn-stu-${stamp}-${n}`;
    await prisma.user.create({ data: { id, name: 'طالب الكوبون', email: `${id}@t.test` } });
    await prisma.studentProfile.create({
      data: {
        userId: id,
        fullName: 'طالب الكوبون',
        gender: 'female',
        // A random base plus the sequence, not the clock: five students are
        // made in the same millisecond below.
        phone: `0108${String(PHONE_BASE + n).padStart(7, '0').slice(-7)}`,
        governorateCode,
        year: 2,
      },
    });
    return id;
  }

  let codeSeq = 0;
  async function coupon(overrides: Record<string, unknown> = {}): Promise<{ id: string; code: string }> {
    codeSeq += 1;
    const code = `T${stamp}${codeSeq}`.slice(0, 32);
    const row = await coupons.create(adminId, {
      code,
      kind: 'percent',
      percentOff: 25,
      amountOffCents: null,
      allCourses: true,
      courseIds: [],
      startsAt: null,
      endsAt: null,
      maxUses: null,
      maxUsesPerStudent: 1,
      isActive: true,
      note: null,
      ...overrides,
    } as Parameters<CouponsService['create']>[1]);
    return { id: row.id, code: row.code };
  }

  const claim = (userId: string, couponCode: string | null, course = courseId) =>
    payments.submit(userId, {
      courseId: course,
      plan: 'monthly',
      termId: null,
      monthIds: [],
      senderPhone: '+201012345678',
      screenshotKey: `payment-proof/${randomUUID()}.webp`,
      couponCode,
    });

  const usesOf = async (id: string) => (await prisma.coupon.findUniqueOrThrow({ where: { id } })).usesCount;

  beforeAll(async () => {
    await prisma.$connect();
    adminId = (
      await prisma.user.create({
        data: { id: `cpn-admin-${stamp}`, name: 'أدمن', email: `cpn-admin-${stamp}@t.test`, role: 'admin' },
      })
    ).id;
    governorateCode = (await prisma.governorate.findFirstOrThrow()).code;
    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    const base = {
      status: 'published' as const,
      publishedAt: new Date(),
      systemId: system.id,
      subjectId: subject.id,
      year: 2,
      instructorId: adminId,
      requiresGrant: true,
      monthlyPriceCents: MONTHLY,
    };
    courseId = (await prisma.course.create({ data: { ...base, slug: `cpn-a-${stamp}`, title: 'كورس الكوبون' } })).id;
    otherCourseId = (await prisma.course.create({ data: { ...base, slug: `cpn-b-${stamp}`, title: 'كورس تاني' } })).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { startsWith: `cpn-stu-${stamp}` } } });
    await prisma.coupon.deleteMany({ where: { code: { startsWith: `T${stamp}` } } });
    await prisma.course.deleteMany({ where: { id: { in: [courseId, otherCourseId] } } });
    await prisma.notification.deleteMany({ where: { userId: adminId } });
    await prisma.user.deleteMany({ where: { id: adminId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('quotes the discounted price, floored to whole pounds, from the course price — not from the client', async () => {
    const { code } = await coupon({ percentOff: 15 });
    const id = await student();
    // 15% of 250 = 37.50 → 37 pounds off, so the transfer stays matchable.
    const quote = await payments.quoteCoupon(id, {
      code: code.toLowerCase(),
      courseId,
      plan: 'monthly',
      termId: null,
      monthIds: [],
    });
    expect(quote).toEqual({ code, originalCents: 25_000, discountCents: 3_700, finalCents: 21_300 });
  });

  it('files the claim at the discounted price and records the use in the same transaction', async () => {
    const { id: couponId, code } = await coupon();
    const id = await student();
    const submission = await claim(id, code);

    expect(submission.amountCents).toBe(18_800);
    const redemption = await prisma.couponRedemption.findUniqueOrThrow({ where: { submissionId: submission.id } });
    expect(redemption).toMatchObject({ couponId, userId: id, originalCents: 25_000, discountCents: 6_200, releasedAt: null });
    expect(await usesOf(couponId)).toBe(1);
  });

  it('spends the last use exactly once when several students press at the same moment', async () => {
    const { id: couponId, code } = await coupon({ maxUses: 1 });
    const students = await Promise.all([student(), student(), student(), student(), student()]);

    const results = await Promise.allSettled(students.map((id) => claim(id, code)));
    const won = results.filter((result) => result.status === 'fulfilled');
    const lost = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');

    expect(won).toHaveLength(1);
    expect(lost.map((result) => codeOf(result.reason))).toEqual(Array(4).fill('coupon_exhausted'));
    expect(await usesOf(couponId)).toBe(1);
    expect(await prisma.couponRedemption.count({ where: { couponId } })).toBe(1);
    // The losers' claims rolled back with their refusal — nothing half-filed.
    expect(await prisma.paymentSubmission.count({ where: { userId: { in: students } } })).toBe(1);
  });

  it('holds the per-student ceiling, and a rejected claim gives its use back', async () => {
    const { id: couponId, code } = await coupon({ maxUsesPerStudent: 1 });
    const id = await student();
    const first = await claim(id, code);

    expect(await refusal(claim(id, code, otherCourseId))).toBe('coupon_per_student_limit');

    await payments.reject(adminId, first.id, { reason: 'الصورة مش واضحة' });
    expect(await usesOf(couponId)).toBe(0);
    expect((await prisma.couponRedemption.findUniqueOrThrow({ where: { submissionId: first.id } })).releasedAt).not.toBeNull();

    const again = await claim(id, code);
    expect(again.amountCents).toBe(18_800);
    expect(await usesOf(couponId)).toBe(1);
  });

  it('refuses a code outside its window, switched off, on another course, or worth the whole price', async () => {
    const id = await student();
    const quote = (code: string) =>
      payments.quoteCoupon(id, { code, courseId, plan: 'monthly', termId: null, monthIds: [] }).catch(codeOf);

    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(await quote((await coupon({ startsAt: future })).code)).toBe('coupon_not_started');
    expect(await quote((await coupon({ startsAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), endsAt: past })).code)).toBe(
      'coupon_expired',
    );
    expect(await quote((await coupon({ isActive: false })).code)).toBe('coupon_inactive');
    expect(await quote((await coupon({ allCourses: false, courseIds: [otherCourseId] })).code)).toBe('coupon_not_for_course');
    expect(
      await quote((await coupon({ kind: 'fixed', percentOff: null, amountOffCents: 25_000 })).code),
    ).toBe('coupon_exceeds_price');
    expect(await quote('NOSUCHCODE1')).toBe('coupon_not_found');
    // …and the same refusal at the press, with nothing written.
    const off = await coupon({ isActive: false });
    expect(await refusal(claim(id, off.code))).toBe('coupon_inactive');
    expect(await prisma.paymentSubmission.count({ where: { userId: id } })).toBe(0);
  });

  it('debits the wallet the discounted price', async () => {
    const { id: couponId, code } = await coupon({ kind: 'fixed', percentOff: null, amountOffCents: 5_000 });
    const id = await student();
    await wallet.credit(adminId, id, { amountCents: 30_000, paid: true, note: 'شحن', idempotencyKey: randomUUID() });

    const result = await payments.purchaseFromWallet(id, {
      courseId,
      plan: 'monthly',
      termId: null,
      monthIds: [],
      idempotencyKey: randomUUID(),
      couponCode: code,
    });

    expect(result.submission.amountCents).toBe(20_000);
    expect(result.balanceCents).toBe(10_000);
    expect(await usesOf(couponId)).toBe(1);
  });

  it('a wallet purchase the balance cannot cover leaves the coupon untouched', async () => {
    const { id: couponId, code } = await coupon({ kind: 'fixed', percentOff: null, amountOffCents: 5_000 });
    const id = await student();
    await wallet.credit(adminId, id, { amountCents: 1_000, paid: true, note: 'شحن', idempotencyKey: randomUUID() });

    const purchase = payments.purchaseFromWallet(id, {
      courseId,
      plan: 'monthly',
      termId: null,
      monthIds: [],
      idempotencyKey: randomUUID(),
      couponCode: code,
    });
    expect(await refusal(purchase)).toBe('wallet_insufficient');
    expect(await usesOf(couponId)).toBe(0);
  });

  it('the database refuses a use count past the ceiling even without the ledger', async () => {
    const { id: couponId } = await coupon({ maxUses: 2 });
    await expect(prisma.coupon.update({ where: { id: couponId }, data: { usesCount: 3 } })).rejects.toThrow();
  });

  it('the admin list reports uses and the discount given', async () => {
    const { id: couponId, code } = await coupon({ maxUses: 5 });
    await claim(await student(), code);

    const list = await coupons.list({ page: 1, perPage: 100, q: code, status: 'all' });
    const row = list.rows.find((entry) => entry.id === couponId);
    expect(row).toMatchObject({ usesCount: 1, discountGivenCents: 6_200, status: 'active' });
    const used = await coupons.redemptions(couponId);
    expect(used.items).toHaveLength(1);
    expect(used.items[0]).toMatchObject({ discountCents: 6_200, submissionStatus: 'pending' });

    // A used code cannot be deleted — it is switched off instead.
    expect(await refusal(coupons.remove(adminId, couponId))).toBe('coupon_has_redemptions');
    const off = await coupons.update(adminId, couponId, { isActive: false });
    expect(off.status).toBe('inactive');
  });
});
