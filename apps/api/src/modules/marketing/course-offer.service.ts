import { Injectable } from '@nestjs/common';
import { cairoParts, fromCairoWall } from '@ayman/contracts/marketing/pacing';
import {
  addCairoDays,
  dailyCouponCode,
  dailyCouponLastDay,
  formatArabicDay,
  type DailyCoupon,
} from '@ayman/contracts/marketing/daily-coupon';
import { adminCampaignOffer as offerCopy } from '@ayman/contracts/copy/admin-campaign-offer';
import { formatCopy } from '@ayman/contracts/format';
import { AuditService } from '../../audit/audit.service';
import { loadEnv } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { planColumns } from '../coupons/coupons.service';
import { monthSliceOf } from '../entitlement/month-access';
import { fits, paidGrants, students } from '../subscribers/subscribers.service';
import { isUniqueViolation } from '../wallet/wallet-ledger';

/**
 * «ناقصه شهور» and «كود خصم لكل يوم» — everything a campaign needs to know
 * about ONE recipient's course, and the day's code.
 *
 * ## Same rule as the subscribers report and the padlock
 *
 * The audience (`usersMissingMonths`) is SQL built from the subscribers
 * report's own fragments — `students`, `paidGrants`, `fits` — so «ناقصهم شهور»
 * on a campaign and «مش مشترك في الشهر ده» on `/admin/subscribers` are the
 * same set. The per-recipient answer at send time (`offerFor`) reduces the
 * student's grants with `monthSliceOf`, the function the padlock itself uses,
 * so the message can never name as missing a month the lecture would open.
 *
 * ## Why send time and not creation time
 *
 * The audience is frozen when the campaign is made (see `campaign.ts`), but at
 * ~40 a day a campaign runs for weeks. Which months a student is missing is
 * re-read for every message: somebody who bought month 2 on day three is
 * told about month 3 only on day nine — or skipped, if nothing is missing.
 */

/** One selected course, as both halves need it. */
interface OfferCourse {
  id: string;
  slug: string;
  year: number;
  forGeneral: boolean;
  forLanguages: boolean;
  trackId: string | null;
  /** Open months only, by `monthIndex` — a closed month is not on sale. */
  openMonths: { id: string; monthIndex: number }[];
}

/** What the runner renders for one recipient. */
export interface RecipientOffer {
  course: { id: string; slug: string };
  /** Open months not covered by a live grant, by `monthIndex`. */
  missing: { id: string; monthIndex: number }[];
  openCount: number;
  /** Holds at least one open month — the «partial» text's audience. */
  holdsSome: boolean;
}

/** The day's code, as the message names it. */
export interface DayCoupon {
  code: string;
  /** «الخميس ٦ نوفمبر». */
  lastDay: string;
}

/** The day's code already exists as some OTHER coupon — see `ensureDayCoupon`. */
export class DayCouponTakenError extends Error {
  constructor(readonly code: string) {
    super(`coupon code ${code} already exists outside this campaign day`);
  }
}

const PAID_SCOPES = ['course', 'term', 'course_month'] as const;

@Injectable()
export class CourseOfferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private originCache: string | null = null;

  /** `APP_URL` without a trailing slash — the stack's own domain, never a
   *  literal, so a teacher's campaign links to the teacher's site. */
  appOrigin(): string {
    this.originCache ??= loadEnv(process.env).APP_URL.replace(/\/+$/, '');
    return this.originCache;
  }

  /**
   * «ناقصهم شهور في الكورس المختار» — students who belong to one of `courseIds`
   * (its year and stream, or ever paid for it: the report's `audience=all`)
   * and are missing at least one OPEN month of it.
   *
   * A course that is not `requires_grant` has nothing to be missing — every
   * enrolled student is let in by the platform grant — and a course with no
   * open month has nothing on sale; both contribute nobody.
   */
  async usersMissingMonths(courseIds: readonly string[], now = new Date()): Promise<Set<string>> {
    if (courseIds.length === 0) return new Set();
    const rows = await this.prisma.$queryRaw<{ user_id: string }[]>(Prisma.sql`
      WITH rc AS (
        SELECT c."id", c."year", c."for_general", c."for_languages", c."track_id"
        FROM "app"."courses" c
        WHERE c."requires_grant" AND c."id" IN (${Prisma.join(courseIds.map((id) => Prisma.sql`${id}::uuid`))})
      ),
      ${students(undefined, '')},
      ${paidGrants(now)},
      aud AS (
        SELECT rc."id" AS course_id, stu."id" AS user_id FROM rc JOIN stu ON ${fits('stu', 'rc')}
        UNION
        SELECT DISTINCT "course_id", "user_id" FROM pg
      ),
      om AS (
        SELECT m."id", m."course_id" FROM "app"."course_months" m
        WHERE m."is_open" AND m."course_id" IN (SELECT "id" FROM rc)
      )
      SELECT DISTINCT aud."user_id"
      FROM aud JOIN om ON om."course_id" = aud."course_id"
      /* Covered: a live wide grant on the course, or the month itself —
         monthSliceOf's rule, the same predicate the report's month column uses. */
      WHERE NOT EXISTS (
        SELECT 1 FROM pg
        WHERE pg."user_id" = aud."user_id" AND pg."course_id" = aud."course_id" AND pg.live
          AND (pg."scope" <> 'course_month' OR pg."month_id" = om."id")
      )
    `);
    return new Set(rows.map((row) => row.user_id));
  }

  /** The selected courses with their open months, in the order given. */
  async courses(courseIds: readonly string[]): Promise<OfferCourse[]> {
    if (courseIds.length === 0) return [];
    const rows = await this.prisma.course.findMany({
      where: { id: { in: [...courseIds] } },
      select: {
        id: true,
        slug: true,
        year: true,
        forGeneral: true,
        forLanguages: true,
        trackId: true,
        months: {
          where: { isOpen: true },
          orderBy: { monthIndex: 'asc' },
          select: { id: true, monthIndex: true },
        },
      },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return courseIds
      .map((id) => byId.get(id))
      .filter((row): row is NonNullable<typeof row> => row !== undefined)
      .map(({ months, ...course }) => ({ ...course, openMonths: months }));
  }

  /**
   * The recipient's course among `courses`, and the open months they are
   * missing on it. `null` for a recipient with no account, or one no selected
   * course fits any more.
   *
   * Which course, when more than one could be theirs (a student with no
   * stream on file fits both «عربي» and «لغات»): the one they ever PAID for,
   * then the one they are enrolled in, then the first in the campaign's own
   * order. Paying is the strongest evidence of which course is theirs.
   */
  async offerFor(userId: string | null, courses: readonly OfferCourse[], now = new Date()): Promise<RecipientOffer | null> {
    if (userId === null || courses.length === 0) return null;
    const ids = courses.map((course) => course.id);
    const [profile, grants, enrolments] = await Promise.all([
      this.prisma.studentProfile.findUnique({
        where: { userId },
        select: { year: true, schoolStream: true, trackId: true },
      }),
      this.prisma.accessGrant.findMany({
        where: { userId, courseId: { in: ids }, scope: { in: [...PAID_SCOPES] } },
        // Newest first, `id` tiebreak — `monthSliceOf` attributes a month to the
        // first grant it meets.
        orderBy: [{ validFrom: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          scope: true,
          courseId: true,
          monthId: true,
          validFrom: true,
          validUntil: true,
          revokedAt: true,
        },
      }),
      this.prisma.enrollment.findMany({ where: { userId, courseId: { in: ids } }, select: { courseId: true } }),
    ]);

    const paid = new Set(grants.map((grant) => grant.courseId));
    const enrolled = new Set(enrolments.map((row) => row.courseId));
    const candidates = courses.filter((course) => paid.has(course.id) || fitsProfile(course, profile));
    const chosen =
      candidates.find((course) => paid.has(course.id)) ??
      candidates.find((course) => enrolled.has(course.id)) ??
      candidates[0];
    if (!chosen) return null;

    const slice = monthSliceOf(
      grants.filter((grant) => grant.courseId === chosen.id),
      now,
    );
    const missing = slice.everything ? [] : chosen.openMonths.filter((month) => !slice.monthIds.has(month.id));
    return {
      course: { id: chosen.id, slug: chosen.slug },
      missing,
      openCount: chosen.openMonths.length,
      holdsSome: missing.length < chosen.openMonths.length,
    };
  }

  /**
   * `{{اللينك}}` for one recipient — their course's subscribe page on their
   * first missing month, with the day's code. `/courses` when there is no
   * course to point at (a parent's number, a pasted one): a code on a page
   * that cannot take it is worse than the catalogue.
   *
   * `?month=` and `?coupon=` are the subscribe panel's own parameters (the
   * padlock links with `?month=<id>`; a campaign link with `?coupon=`).
   */
  linkFor(offer: RecipientOffer | null, code: string | null): string {
    const origin = this.appOrigin();
    if (!offer) return `${origin}/courses`;
    const query = new URLSearchParams();
    const first = offer.missing[0];
    if (first) query.set('month', first.id);
    if (code) query.set('coupon', code);
    const search = query.toString();
    return `${origin}/courses/${encodeURIComponent(offer.course.slug)}/subscribe${search ? `?${search}` : ''}`;
  }

  /**
   * Today's code for this campaign — made the first time it is asked for on a
   * Cairo day, and the same row on every later ask.
   *
   * ## Idempotent, and safe with two workers
   *
   * `(campaign_id, campaign_day)` is UNIQUE. Read first; on a miss, create;
   * if the create loses a race (P2002), read again and use the row that won.
   * The runner holds a Redis lock across a tick, so the race needs two API
   * containers AND a lock lost to its TTL — rare, and harmless by this.
   *
   * The one P2002 that is NOT a race is the CODE already belonging to some
   * other coupon — one made by hand, or another campaign with the same prefix
   * on the same day. That throws `DayCouponTakenError`, and the runner pauses
   * the campaign and says which code: re-using a stranger's coupon would send
   * its amounts and its window under this campaign's message.
   */
  async ensureDayCoupon(
    campaign: { id: string; name: string; createdById: string | null },
    config: DailyCoupon,
    now = new Date(),
  ): Promise<DayCoupon> {
    const day = cairoParts(now).day;
    const lastDay = dailyCouponLastDay(day, config.validDays);
    const found = await this.findDayCoupon(campaign.id, day);
    if (found) return { code: found, lastDay: formatArabicDay(lastDay) };

    const code = dailyCouponCode(config.prefix, day);
    const after = addCairoDays(lastDay, 1).split('-').map(Number) as [number, number, number];
    // The close of `lastDay`, Cairo time — midnight that begins the next day.
    const endsAt = fromCairoWall(after[0], after[1], after[2], 0);
    try {
      const created = await this.prisma.coupon.create({
        data: {
          code,
          kind: 'per_plan',
          percentOff: null,
          amountOffCents: null,
          ...planColumns(config.planAmounts),
          allCourses: false,
          startsAt: now,
          endsAt,
          maxUses: null,
          // «مرة واحدة لكل طالب» — the coupon's own per-student ceiling, read
          // under its row lock by `claimCoupon`.
          maxUsesPerStudent: 1,
          isActive: true,
          note: formatCopy(offerCopy.couponNote, { date: formatArabicDay(day), name: campaign.name }).slice(0, 300),
          createdByUserId: campaign.createdById,
          campaignId: campaign.id,
          campaignDay: day,
          courses: { createMany: { data: [...new Set(config.courseIds)].map((courseId) => ({ courseId })) } },
        },
        select: { id: true },
      });
      await this.audit.record({
        action: 'coupon:create',
        resourceType: AUDIT_RESOURCES.coupon,
        resourceId: created.id,
        actorUserId: campaign.createdById,
        outcome: 'success',
        metadata: {
          code,
          kind: 'per_plan',
          planAmounts: config.planAmounts,
          courseIds: config.courseIds,
          endsAt: endsAt.toISOString(),
          maxUsesPerStudent: 1,
          source: 'campaign',
          campaignId: campaign.id,
          campaignDay: day,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Lost the race to another worker — use what it made.
      const raced = await this.findDayCoupon(campaign.id, day);
      if (raced) return { code: raced, lastDay: formatArabicDay(lastDay) };
      throw new DayCouponTakenError(code);
    }
    return { code, lastDay: formatArabicDay(lastDay) };
  }

  private async findDayCoupon(campaignId: string, day: string): Promise<string | null> {
    const row = await this.prisma.coupon.findUnique({
      where: { campaignId_campaignDay: { campaignId, campaignDay: day } },
      select: { code: true },
    });
    return row?.code ?? null;
  }
}

/**
 * `fits()` from the subscribers report, in TypeScript: the course's year, and
 * its stream and track when the student has one on file. A null year fits
 * nothing — a refusal to guess.
 */
export function fitsProfile(
  course: Pick<OfferCourse, 'year' | 'forGeneral' | 'forLanguages' | 'trackId'>,
  profile: { year: number | null; schoolStream: 'general' | 'languages' | null; trackId: string | null } | null,
): boolean {
  if (!profile || profile.year === null || profile.year !== course.year) return false;
  const stream =
    profile.schoolStream === null ||
    (profile.schoolStream === 'general' && course.forGeneral) ||
    (profile.schoolStream === 'languages' && course.forLanguages);
  const track = course.trackId === null || profile.trackId === null || course.trackId === profile.trackId;
  return stream && track;
}
