// Prisma 7 does not auto-load .env, and this spec runs outside Nest's bootstrap.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { HttpException } from '@nestjs/common';
import { EMPTY_AUDIENCE } from '@ayman/contracts/marketing/campaign';
import { cairoParts } from '@ayman/contracts/marketing/pacing';
import { COUPON_CODE_PATTERN } from '@ayman/contracts/coupon-code';
import type { DailyCoupon } from '@ayman/contracts/marketing/daily-coupon';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { MediaService } from '../media/media.service';
import { PaymentsService } from '../payments/payments.service';
import { AudienceService } from './audience.service';
import { CourseOfferService, randomSuffix } from './course-offer.service';
import { CampaignRunner } from './campaign-runner.service';
import type { WhatsappDeviceService } from './whatsapp-device.service';
import type { OutreachService } from '../outreach/outreach.service';

/**
 * «ناقصهم شهور» and «كود خصم لكل يوم», against the real database — the
 * promises are database promises: which students are missing which open
 * months (the subscribers report's SQL), one code per campaign per Cairo day
 * however many workers ask at once, and the checkout pricing that code per
 * plan — 150 → 99 on the month, 450 → 300 on the term, refused on the year.
 *
 * Fixture ids carry a per-run stamp; cleanup deletes the users (their cascade
 * takes grants, enrolments and claims), then coupons, campaigns and courses.
 */

function codeOf(error: unknown): string | undefined {
  if (!(error instanceof HttpException)) return undefined;
  const body = error.getResponse();
  return typeof body === 'object' && body !== null ? (body as { code?: string }).code : undefined;
}

describe('course offers', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const audit = new AuditService(prisma);
  const offers = new CourseOfferService(prisma, audit);
  // The link's origin is the stack's own `APP_URL`; pinned here so the spec
  // does not need the whole environment to load.
  jest.spyOn(offers, 'appOrigin').mockReturnValue('https://teacher.test');
  const audience = new AudienceService(prisma, offers);
  const payments = new PaymentsService(
    prisma,
    audit,
    new NotificationsService(prisma),
    {} as unknown as MediaService,
  );

  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  const prefix = `T${stamp}`.slice(0, 20);
  let adminId = '';
  let governorateCode = '';
  let general = { id: '', slug: '', months: [] as string[], termId: '' };
  let languages = { id: '', slug: '', months: [] as string[] };
  let campaignId = '';
  let otherCampaignId = '';

  const PHONE_BASE = Math.floor(Math.random() * 9_000_000);
  let seq = 0;
  async function student(year: number | null, stream: 'general' | 'languages' | null): Promise<string> {
    seq += 1;
    const id = `cof-stu-${stamp}-${seq}`;
    const local = `0109${String(PHONE_BASE + seq).padStart(7, '0').slice(-7)}`;
    await prisma.user.create({
      data: { id, name: 'طالبة العرض', email: `${id}@t.test`, phoneNumber: `+2${local}` },
    });
    await prisma.studentProfile.create({
      data: { userId: id, fullName: 'طالبة العرض', gender: 'female', phone: local, governorateCode, year, schoolStream: stream },
    });
    return id;
  }

  // Month grants are open-ended by CHECK (`access_grants_month_open_ended`);
  // a month that stopped counting is a REVOKED one (a refund).
  async function monthGrant(userId: string, courseId: string, monthId: string, revokedAt: Date | null = null) {
    await prisma.accessGrant.create({
      data: { userId, courseId, monthId, scope: 'course_month', source: 'purchase', revokedAt },
    });
  }

  const ids: Record<string, string> = {};

  /** The code the runner made for `id` today — read back, never derived:
   *  its tail is random on purpose. */
  const todaysCode = async (id: string) =>
    (
      await prisma.coupon.findUniqueOrThrow({
        where: { campaignId_campaignDay: { campaignId: id, campaignDay: cairoParts(new Date()).day } },
        select: { code: true },
      })
    ).code;

  const config = (overrides: Partial<DailyCoupon> = {}): DailyCoupon => ({
    prefix,
    validDays: 3,
    courseIds: [general.id, languages.id],
    planAmounts: { monthly: 5_100, quarterly: null, term: 15_000, yearly: null },
    ...overrides,
  });

  beforeAll(async () => {
    await prisma.$connect();
    adminId = (
      await prisma.user.create({
        data: { id: `cof-admin-${stamp}`, name: 'أدمن', email: `cof-admin-${stamp}@t.test`, role: 'admin' },
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
      monthlyPriceCents: 15_000,
      yearlyPriceCents: 95_000,
    };
    const monthRows = (open: boolean[]) =>
      open.map((isOpen, i) => ({ monthIndex: i + 1, title: `شهر ${i + 1}`, isOpen }));

    const g = await prisma.course.create({
      data: {
        ...base,
        slug: `cof-g-${stamp}`.toLowerCase(),
        title: 'تانية عربي',
        forGeneral: true,
        forLanguages: false,
        // Month 4 exists and is CLOSED — it is not on sale, so nobody is
        // «missing» it.
        months: { create: monthRows([true, true, true, false]) },
        terms: { create: [{ title: 'الترم الأول', position: 1, isOpen: true, priceCents: 45_000 }] },
      },
      include: { months: { orderBy: { monthIndex: 'asc' } }, terms: true },
    });
    general = { id: g.id, slug: g.slug, months: g.months.map((m) => m.id), termId: g.terms[0]!.id };
    const l = await prisma.course.create({
      data: {
        ...base,
        slug: `cof-l-${stamp}`.toLowerCase(),
        title: 'تانية لغات',
        forGeneral: false,
        forLanguages: true,
        months: { create: monthRows([true, true, true]) },
      },
      include: { months: { orderBy: { monthIndex: 'asc' } } },
    });
    languages = { id: l.id, slug: l.slug, months: l.months.map((m) => m.id) };

    ids.none = await student(2, 'general');
    ids.month1 = await student(2, 'general');
    await monthGrant(ids.month1, general.id, general.months[0]!);
    ids.allOpen = await student(2, 'general');
    for (const month of general.months.slice(0, 3)) await monthGrant(ids.allOpen, general.id, month);
    ids.term = await student(2, 'general');
    await prisma.accessGrant.create({
      data: { userId: ids.term, courseId: general.id, termId: general.termId, scope: 'term', source: 'purchase' },
    });
    ids.lapsed = await student(2, 'general');
    await monthGrant(ids.lapsed, general.id, general.months[0]!, new Date(Date.now() - 86_400_000));
    // (revoked yesterday — refunded)
    ids.lang = await student(2, 'languages');
    ids.year3 = await student(3, 'general');
    // No stream on file fits BOTH courses; having paid for «لغات» decides it.
    ids.noStreamPaidLang = await student(2, null);
    await monthGrant(ids.noStreamPaidLang, languages.id, languages.months[0]!);

    const campaign = (name: string) =>
      prisma.marketingCampaign.create({ data: { name, body: 'x', audience: {}, createdById: adminId } });
    campaignId = (await campaign(`cof-${stamp}`)).id;
    otherCampaignId = (await campaign(`cof-other-${stamp}`)).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { startsWith: `cof-stu-${stamp}` } } });
    await prisma.coupon.deleteMany({ where: { code: { startsWith: prefix } } });
    await prisma.marketingCampaign.deleteMany({ where: { name: { startsWith: 'cof-' }, createdById: adminId } });
    await prisma.course.deleteMany({ where: { slug: { startsWith: `cof-` }, instructorId: adminId } });
    await prisma.notification.deleteMany({ where: { userId: adminId } });
    await prisma.user.deleteMany({ where: { id: adminId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  describe('«ناقصهم شهور في الكورس المختار»', () => {
    it('is everybody of the course missing an OPEN month, and nobody covered', async () => {
      const missing = await offers.usersMissingMonths([general.id, languages.id]);
      for (const key of ['none', 'month1', 'lapsed', 'lang', 'noStreamPaidLang']) {
        expect({ key, in: missing.has(ids[key]!) }).toEqual({ key, in: true });
      }
      for (const key of ['allOpen', 'term', 'year3']) {
        expect({ key, in: missing.has(ids[key]!) }).toEqual({ key, in: false });
      }
    });

    it('is the campaign audience — not limited to enrolled students', async () => {
      const resolved = await audience.resolve({
        ...EMPTY_AUDIENCE,
        courseIds: [general.id, languages.id],
        missingMonths: true,
      });
      const userIds = new Set(resolved.recipients.map((row) => row.userId));
      expect(userIds.has(ids.none!)).toBe(true);
      expect(userIds.has(ids.month1!)).toBe(true);
      expect(userIds.has(ids.allOpen!)).toBe(false);
      expect(userIds.has(ids.term!)).toBe(false);
    });
  });

  describe('per recipient, at send time', () => {
    it('names the months still missing, and which text', async () => {
      const courses = await offers.courses([general.id, languages.id]);
      const none = await offers.offerFor(ids.none!, courses);
      expect(none).toMatchObject({ course: { id: general.id }, openCount: 3, holdsSome: false });
      expect(none!.missing.map((m) => m.monthIndex)).toEqual([1, 2, 3]);

      const month1 = await offers.offerFor(ids.month1!, courses);
      expect(month1!.missing.map((m) => m.monthIndex)).toEqual([2, 3]);
      expect(month1!.holdsSome).toBe(true);

      // A refunded month is a missing month.
      expect((await offers.offerFor(ids.lapsed!, courses))!.missing.map((m) => m.monthIndex)).toEqual([1, 2, 3]);
      // The term covers every month — nothing to say.
      expect((await offers.offerFor(ids.term!, courses))!.missing).toEqual([]);
    });

    it('picks the course by year and stream, then by what was paid for', async () => {
      const courses = await offers.courses([general.id, languages.id]);
      expect((await offers.offerFor(ids.lang!, courses))!.course.id).toBe(languages.id);
      expect((await offers.offerFor(ids.noStreamPaidLang!, courses))!.course.id).toBe(languages.id);
      expect(await offers.offerFor(ids.year3!, courses)).toBeNull();
      expect(await offers.offerFor(null, courses)).toBeNull();
    });

    it('links to their subscribe page on the first missing month, with the code', async () => {
      const courses = await offers.courses([general.id, languages.id]);
      const month1 = await offers.offerFor(ids.month1!, courses);
      expect(offers.linkFor(month1, 'WELCOME0311')).toBe(
        `https://teacher.test/courses/${general.slug}/subscribe?month=${general.months[1]}&coupon=WELCOME0311`,
      );
      expect(offers.linkFor(null, 'WELCOME0311')).toBe('https://teacher.test/courses');
    });
  });

  describe('the day code', () => {
    it('is made once per campaign per Cairo day, however many workers ask at once', async () => {
      const now = new Date();
      const campaign = { id: campaignId, name: 'cof', createdById: adminId };
      const results = await Promise.all([1, 2, 3, 4].map(() => offers.ensureDayCoupon(campaign, config(), now)));
      const code = await todaysCode(campaignId);
      expect(new Set(results.map((r) => r.code))).toEqual(new Set([code]));
      // PREFIX + DDMM + '-' + four random characters, within the stored shape.
      const [, month, date] = cairoParts(now).day.split('-');
      expect(code).toMatch(new RegExp(`^${prefix}${date}${month}-[A-Z2-9]{4}$`));
      expect(code).toMatch(COUPON_CODE_PATTERN);
      expect(await prisma.coupon.count({ where: { campaignId } })).toBe(1);

      // …and a later tick the same day finds the same row.
      expect((await offers.ensureDayCoupon(campaign, config(), new Date(now.getTime() + 60_000))).code).toBe(code);
      expect(await prisma.coupon.count({ where: { campaignId } })).toBe(1);

      const row = await prisma.coupon.findFirstOrThrow({ where: { campaignId }, include: { courses: true } });
      expect(row).toMatchObject({ kind: 'per_plan', maxUsesPerStudent: 1, allCourses: false, monthlyOffCents: 5_100 });
      expect(row.courses.map((link) => link.courseId).sort()).toEqual([general.id, languages.id].sort());
      // Ends at the close of the third day after the send day — never sooner
      // than three full days for anybody who got it that day.
      expect(row.endsAt!.getTime() - now.getTime()).toBeGreaterThan(3 * 86_400_000);
      expect(row.endsAt!.getTime() - now.getTime()).toBeLessThanOrEqual(4 * 86_400_000);
    });

    it('cannot be guessed: the same prefix on the same day is a different code for another campaign', async () => {
      const now = new Date();
      const other = await offers.ensureDayCoupon({ id: otherCampaignId, name: 'other', createdById: adminId }, config(), now);
      expect(other.code).not.toBe(await todaysCode(campaignId));
      expect(other.code.startsWith(prefix)).toBe(true);
      // The tail is drawn from the CSPRNG over [A-Z2-9].
      const tails = new Set(Array.from({ length: 50 }, () => randomSuffix()));
      expect(tails.size).toBeGreaterThan(45);
      for (const tail of tails) expect(tail).toMatch(/^[A-Z2-9]{4}$/);
    });

    it('prices per plan at the checkout: 150 → 99 a month, 450 → 300 a term, refused on the year', async () => {
      const code = await todaysCode(campaignId);
      const studentId = ids.month1!;
      const month = await payments.quoteCoupon(studentId, {
        code,
        courseId: general.id,
        plan: 'monthly',
        termId: null,
        monthIds: [general.months[1]!],
      });
      expect(month).toEqual({ code, originalCents: 15_000, discountCents: 5_100, finalCents: 9_900 });

      // «الشهر بـ ٩٩» per month: two months together are 198, three are 297.
      const twoMonths = await payments.quoteCoupon(studentId, {
        code,
        courseId: general.id,
        plan: 'monthly',
        termId: null,
        monthIds: [general.months[1]!, general.months[2]!],
      });
      expect(twoMonths).toEqual({ code, originalCents: 30_000, discountCents: 10_200, finalCents: 19_800 });
      const threeMonths = await payments.quoteCoupon(ids.none!, {
        code,
        courseId: general.id,
        plan: 'monthly',
        termId: null,
        monthIds: general.months.slice(0, 3),
      });
      expect(threeMonths).toEqual({ code, originalCents: 45_000, discountCents: 15_300, finalCents: 29_700 });

      const term = await payments.quoteCoupon(studentId, {
        code,
        courseId: general.id,
        plan: 'term',
        termId: general.termId,
        monthIds: [],
      });
      expect(term).toEqual({ code, originalCents: 45_000, discountCents: 15_000, finalCents: 30_000 });

      const year = await payments
        .quoteCoupon(studentId, { code, courseId: general.id, plan: 'yearly', termId: null, monthIds: [] })
        .catch(codeOf);
      expect(year).toBe('coupon_not_for_plan');
    });

    it('files a two-month claim at 2 × 99, under the lock, and records the per-month discount', async () => {
      const code = await todaysCode(campaignId);
      const submission = await payments.submit(ids.month1!, {
        courseId: general.id,
        plan: 'monthly',
        termId: null,
        monthIds: [general.months[1]!, general.months[2]!],
        senderPhone: '+201012345678',
        screenshotKey: `payment-proof/${randomUUID()}.webp`,
        couponCode: code,
      });
      expect(submission.amountCents).toBe(19_800);
      const redemption = await prisma.couponRedemption.findUniqueOrThrow({ where: { submissionId: submission.id } });
      expect(redemption).toMatchObject({ originalCents: 30_000, discountCents: 10_200 });
    });

    it('is one offer per student across the whole campaign — another day\'s code is refused', async () => {
      // A second day's code for the SAME campaign, as the runner would make
      // tomorrow (written directly: the spec cannot wait a day).
      const tomorrow = await prisma.coupon.create({
        data: {
          code: `${prefix}NEXT-${randomSuffix()}`,
          kind: 'per_plan',
          monthlyOffCents: 5_100,
          termOffCents: 15_000,
          allCourses: false,
          maxUsesPerStudent: 1,
          campaignId,
          campaignDay: '2099-01-01',
          courses: { createMany: { data: [{ courseId: general.id }, { courseId: languages.id }] } },
        },
      });
      // On «لغات»: `month1` has a claim in review on «عربي», which would
      // (rightly) block any second claim there before the coupon is read.
      const quote = (userId: string) =>
        payments
          .quoteCoupon(userId, {
            code: tomorrow.code,
            courseId: languages.id,
            plan: 'monthly',
            termId: null,
            monthIds: [languages.months[1]!],
          })
          .then((q) => q.finalCents, codeOf);

      // `month1` redeemed today's code in the test above.
      expect(await quote(ids.month1!)).toBe('coupon_campaign_used');
      // …and the claim itself refuses it under the lock, writing nothing.
      const claim = payments
        .purchaseFromWallet(ids.month1!, {
          courseId: languages.id,
          plan: 'monthly',
          termId: null,
          monthIds: [languages.months[1]!],
          idempotencyKey: randomUUID(),
          couponCode: tomorrow.code,
        })
        .then(() => undefined, codeOf);
      expect(await claim).toBe('coupon_campaign_used');
      expect((await prisma.coupon.findUniqueOrThrow({ where: { id: tomorrow.id } })).usesCount).toBe(0);
      // A student who never used the campaign's codes still gets it.
      expect(await quote(ids.lapsed!)).toBe(9_900);
    });
  });

  /*
   * The runner end to end, on the real tables: the message that leaves is the
   * one asserted, not a spy on a helper. The device is the one stub — it is
   * the thing that would send to a phone.
   */
  describe('the runner', () => {
    const sent: Array<{ phone: string; text: string }> = [];
    const device = {
      enabled: true,
      assertWithinCeiling: async () => undefined,
      send: async (input: { phone: string; text: string }) => {
        sent.push({ phone: input.phone, text: input.text });
        return { messageId: `M-${sent.length}` };
      },
    } as unknown as WhatsappDeviceService;
    const redis = { set: async () => 'OK', del: async () => 1 } as unknown as ConstructorParameters<
      typeof CampaignRunner
    >[2];
    const runner = new CampaignRunner(
      prisma,
      device,
      redis,
      { resolve: (key: string) => key },
      {} as unknown as OutreachService,
      offers,
    );

    async function queue(userKeys: string[]): Promise<string> {
      const runnerPrefix = `R${stamp}`.slice(0, 20);
      const campaign = await prisma.marketingCampaign.create({
        data: {
          name: `cof-run-${stamp}-${Date.now()}`,
          body: 'أهلاً {{الاسم}}، {{الشهور_الناقصة}} مستنية — الكود {{الكود}} لحد {{آخر_يوم}}\n{{اللينك}}',
          bodyPartial: 'كمّلنا مع بعض! فاضل {{الشهور_الناقصة}} — الكود {{الكود}}\n{{اللينك}}',
          status: 'running',
          channel: 'whatsapp',
          createdById: adminId,
          audience: { ...EMPTY_AUDIENCE, courseIds: [general.id, languages.id], missingMonths: true },
          dailyCoupon: { ...config(), prefix: runnerPrefix },
          minDelaySeconds: 5,
          maxDelaySeconds: 5,
          batchSize: 0,
          batchPauseMinutes: 0,
          dailyCap: 1000,
          windowStartHour: 0,
          windowEndHour: 24,
          nextSendAt: new Date(Date.now() - 1000),
        },
        select: { id: true },
      });
      const users = await prisma.user.findMany({
        where: { id: { in: userKeys.map((key) => ids[key]!) } },
        select: { id: true, phoneNumber: true },
      });
      const phoneOf = new Map(users.map((user) => [user.id, user.phoneNumber!]));
      await prisma.marketingRecipient.createMany({
        data: userKeys.map((key, position) => ({
          campaignId: campaign.id,
          phone: phoneOf.get(ids[key]!)!,
          userId: ids[key]!,
          name: 'منى أحمد',
          position,
        })),
      });
      return campaign.id;
    }

    /** The next tick must find the campaign due again (the pacing moved it). */
    const due = (id: string) =>
      prisma.marketingCampaign.update({ where: { id }, data: { nextSendAt: new Date(Date.now() - 1000) } });

    afterAll(async () => {
      await prisma.coupon.deleteMany({ where: { code: { startsWith: `R${stamp}`.slice(0, 20) } } });
    });

    it('sends each student their own months, text, code and link — one code for the day', async () => {
      sent.length = 0;
      const id = await queue(['month1', 'none']);
      await runner.tick();
      await due(id);
      await runner.tick();

      expect(sent).toHaveLength(2);
      const code = await todaysCode(id);
      const [partial, none] = sent.map((row) => row.text);

      expect(partial).toContain('كمّلنا مع بعض! فاضل الشهر التاني والتالت');
      expect(partial).toContain(`/courses/${general.slug}/subscribe?month=${general.months[1]}&coupon=${code}`);
      expect(none).toContain('أهلاً منى، الشهور التلاتة مستنية');
      expect(none).toContain(`?month=${general.months[0]}&coupon=${code}`);
      for (const text of sent.map((row) => row.text)) expect(text).not.toContain('{{');

      expect(await prisma.coupon.count({ where: { campaignId: id } })).toBe(1);
      await prisma.marketingCampaign.update({ where: { id }, data: { status: 'paused', nextSendAt: null } });
    });

    it('skips a student who holds every open month by now, and sends nothing', async () => {
      sent.length = 0;
      const id = await queue(['allOpen']);
      await runner.tick();

      expect(sent).toEqual([]);
      const row = await prisma.marketingRecipient.findFirstOrThrow({ where: { campaignId: id } });
      expect(row.status).toBe('skipped');
      // Nothing was sent, so no code was made for the day either.
      expect(await prisma.coupon.count({ where: { campaignId: id } })).toBe(0);
      await prisma.marketingCampaign.update({ where: { id }, data: { status: 'paused', nextSendAt: null } });
    });
  });
});
