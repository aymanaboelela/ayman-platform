import { Injectable } from '@nestjs/common';
import type { OutreachSettings } from '@ayman/contracts/admin/settings';
import type { OutreachFacts } from '@ayman/contracts/outreach/compose';
import { PrismaService } from '../../prisma/prisma.service';
import { loadEnv } from '../../config/env';
import { Prisma } from '../../generated/prisma/client';
import type { DeliverInput } from '../outreach/outreach.service';
import {
  CROSS_KIND_COOLDOWN_MS,
  SIGNUP_STEP_KEYS,
  bookCheckoutAbandoned,
  checkoutDedupeKey,
  checkoutDue,
  checkoutScanBounds,
  checkoutWaitsForSignup,
  courseCheckoutAbandoned,
  neverSubscribedWhere,
  secondNudgeBounds,
  signupScanBounds,
  signupYieldsToCheckout,
} from './auto-outreach.rules';

/**
 * WHO is due an automatic message right now, in the order they would get one
 * — and nothing else. No writes, no WhatsApp, no clock of its own beyond the
 * `now` it is handed.
 *
 * Separate from the sweeper for the reason `OutreachSweeper.inviteCandidates`
 * gives: the predicate is the half worth testing and the half a send loop
 * that stops after one message cannot test. The admin card reads it too, for
 * «مستنيين دلوقتي», so the number on the screen is the sweeper's own answer
 * rather than a second query that could drift from it.
 */

/** How many rows one scan considers before the per-row checks. */
const SCAN = 80;

export interface DueMessage {
  input: DeliverInput;
  /** Set for a checkout reminder — the row to stamp `remindedAt` on. */
  intentId: string | null;
}

@Injectable()
export class AutoOutreachCandidates {
  private appUrlCache: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Deferred for the reason `FollowUpService.appUrl` documents. */
  private get appUrl(): string {
    this.appUrlCache ??= loadEnv(process.env).APP_URL.replace(/\/+$/, '');
    return this.appUrlCache;
  }

  // ── «كمّل الدفع» ─────────────────────────────────────────────────────────

  async checkoutDue(now: Date, settings: OutreachSettings): Promise<DueMessage[]> {
    const bounds = checkoutScanBounds(now, settings);
    if (bounds.to <= bounds.from) return [];

    const intents = await this.prisma.checkoutIntent.findMany({
      where: {
        openedAt: { gte: bounds.from, lte: bounds.to },
        user: { role: 'student', bannedAt: null },
      },
      orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
      take: SCAN,
      select: { id: true, userId: true, target: true, targetId: true, path: true, openedAt: true, remindedAt: true },
    });
    const timely = intents.filter((intent) => checkoutDue(intent, now, settings));
    if (timely.length === 0) return [];

    const userIds = [...new Set(timely.map((i) => i.userId))];
    const courseIds = [...new Set(timely.filter((i) => i.target === 'course').map((i) => i.targetId))];
    const orderIds = timely.filter((i) => i.target === 'book_order').map((i) => i.targetId);

    const [courses, submissions, grants, orders, signupNudges] = await Promise.all([
      courseIds.length === 0
        ? []
        : this.prisma.course.findMany({
            where: { id: { in: courseIds } },
            select: { id: true, title: true, status: true, requiresGrant: true },
          }),
      courseIds.length === 0
        ? []
        : this.prisma.paymentSubmission.findMany({
            where: {
              userId: { in: userIds },
              courseId: { in: courseIds },
              status: { in: ['pending', 'approved'] },
            },
            select: { userId: true, courseId: true, status: true, createdAt: true },
          }),
      courseIds.length === 0
        ? []
        : this.prisma.accessGrant.findMany({
            where: { userId: { in: userIds }, courseId: { in: courseIds }, revokedAt: null },
            select: { userId: true, courseId: true, createdAt: true },
          }),
      orderIds.length === 0
        ? []
        : this.prisma.bookOrder.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, status: true, deletedAt: true },
          }),
      this.latestByUser('signup_nudge', userIds, now),
    ]);

    const courseById = new Map(courses.map((c) => [c.id, c]));
    const orderById = new Map(orders.map((o) => [o.id, o]));

    const due: DueMessage[] = [];
    for (const intent of timely) {
      if (checkoutWaitsForSignup(now, signupNudges.get(intent.userId) ?? null)) continue;

      let facts: OutreachFacts;
      if (intent.target === 'course') {
        const course = courseById.get(intent.targetId);
        const mine = (row: { userId: string; courseId: string | null }) =>
          row.userId === intent.userId && row.courseId === intent.targetId;
        const abandoned = courseCheckoutAbandoned({
          stillOnSale: course?.status === 'published' && course.requiresGrant,
          pendingSubmission: submissions.some((s) => mine(s) && s.status === 'pending'),
          approvedSinceOpened: submissions.some(
            (s) => mine(s) && s.status === 'approved' && s.createdAt >= intent.openedAt,
          ),
          grantSinceOpened: grants.some((g) => mine(g) && g.createdAt >= intent.openedAt),
        });
        if (!abandoned || !course) continue;
        facts = { kind: 'checkout_recovery', target: 'course', title: course.title, url: this.appUrl + intent.path };
      } else {
        if (!bookCheckoutAbandoned(orderById.get(intent.targetId) ?? null)) continue;
        facts = { kind: 'checkout_recovery', target: 'book_order', title: null, url: this.appUrl + intent.path };
      }

      due.push({
        intentId: intent.id,
        input: {
          userId: intent.userId,
          kind: 'checkout_recovery',
          dedupeKey: checkoutDedupeKey(intent),
          facts,
        },
      });
    }
    return due;
  }

  // ── «الحساب جاهز» ────────────────────────────────────────────────────────

  async signupDue(now: Date, settings: OutreachSettings): Promise<DueMessage[]> {
    const first = await this.firstNudges(now, settings);
    const second = await this.secondNudges(now, settings);
    const candidates = [...first, ...second];
    if (candidates.length === 0) return [];

    const userIds = [...new Set(candidates.map((c) => c.userId))];
    const [intents, reminders, profiles] = await Promise.all([
      this.prisma.checkoutIntent.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds } },
        _max: { openedAt: true },
      }),
      this.latestByUser('checkout_recovery', userIds, now),
      this.prisma.studentProfile.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, year: true, schoolStream: true },
      }),
    ]);
    const latestIntent = new Map(intents.map((row) => [row.userId, row._max.openedAt]));
    const profileOf = new Map(profiles.map((p) => [p.userId, p]));
    const suggestions = await this.suggestedCourses(profiles);

    const due: DueMessage[] = [];
    for (const candidate of candidates) {
      if (
        signupYieldsToCheckout({
          now,
          latestIntentOpenedAt: latestIntent.get(candidate.userId) ?? null,
          latestCheckoutReminderAt: reminders.get(candidate.userId) ?? null,
        })
      ) {
        continue;
      }
      const profile = profileOf.get(candidate.userId);
      const course = profile ? suggestions.get(suggestionKey(profile)) ?? null : null;
      due.push({
        intentId: null,
        input: {
          userId: candidate.userId,
          kind: 'signup_nudge',
          dedupeKey: SIGNUP_STEP_KEYS[candidate.step],
          facts: {
            kind: 'signup_nudge',
            step: candidate.step,
            courseTitle: course?.title ?? null,
            url: course
              ? `${this.appUrl}/courses/${encodeURIComponent(course.slug)}`
              : `${this.appUrl}/courses`,
          },
        },
      });
    }
    return due;
  }

  /**
   * Accounts made inside the window, past the delay, that have bought nothing
   * and have never had the first nudge.
   *
   * `createdAt` on the USER, so the window is about the sign-up and nothing
   * else: a student who signed up a month ago and is browsing today is the
   * campaign's backlog, not this message's.
   */
  private async firstNudges(now: Date, settings: OutreachSettings): Promise<{ userId: string; step: 1 | 2 }[]> {
    const bounds = signupScanBounds(now, settings);
    if (bounds.to <= bounds.from) return [];
    const rows = await this.prisma.user.findMany({
      where: {
        role: 'student',
        bannedAt: null,
        createdAt: { gte: bounds.from, lte: bounds.to },
        ...neverSubscribedWhere(now),
        outreachMessages: { none: { kind: 'signup_nudge', dedupeKey: SIGNUP_STEP_KEYS[1] } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: SCAN,
      select: { id: true },
    });
    return rows.map((row) => ({ userId: row.id, step: 1 as const }));
  }

  /**
   * First nudges old enough for the second, still unanswered by a purchase.
   *
   * Bounded by when the FIRST went out, not by sign-up, so a second nudge
   * that fell due while the device was unlinked is still sent for a few days
   * and then quietly dropped — never a burst of week-old seconds on relink.
   */
  private async secondNudges(now: Date, settings: OutreachSettings): Promise<{ userId: string; step: 1 | 2 }[]> {
    const bounds = secondNudgeBounds(now, settings);
    if (!bounds) return [];
    const rows = await this.prisma.outreachMessage.findMany({
      where: {
        kind: 'signup_nudge',
        dedupeKey: SIGNUP_STEP_KEYS[1],
        createdAt: { gte: bounds.from, lte: bounds.to },
        user: {
          role: 'student',
          bannedAt: null,
          ...neverSubscribedWhere(now),
          outreachMessages: { none: { kind: 'signup_nudge', dedupeKey: SIGNUP_STEP_KEYS[2] } },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: SCAN,
      select: { userId: true },
    });
    return rows.map((row) => ({ userId: row.userId, step: 2 as const }));
  }

  /** The newest message of `kind` to each user inside the cross-kind cooldown. */
  private async latestByUser(
    kind: 'checkout_recovery' | 'signup_nudge',
    userIds: string[],
    now: Date,
  ): Promise<Map<string, Date>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.prisma.outreachMessage.groupBy({
      by: ['userId'],
      where: {
        kind,
        userId: { in: userIds },
        createdAt: { gte: new Date(now.getTime() - CROSS_KIND_COOLDOWN_MS) },
      },
      _max: { createdAt: true },
    });
    const out = new Map<string, Date>();
    for (const row of rows) if (row._max.createdAt) out.set(row.userId, row._max.createdAt);
    return out;
  }

  /**
   * The ONE course a year and stream point at — the same rule and the same
   * ranking `/admin/follow-up`'s «مااشتركش» list uses (`COURSE_FITS_PROFILE`
   * and its emphasis order in `follow-up.service.ts`), so the automatic
   * message and the instructor's own button send a student to the same place.
   *
   * One query per distinct (year, stream), not per student: a pass sees a
   * handful of combinations however many students it scans.
   */
  private async suggestedCourses(
    profiles: readonly { year: number | null; schoolStream: 'general' | 'languages' | null }[],
  ): Promise<Map<string, { title: string; slug: string }>> {
    const out = new Map<string, { title: string; slug: string }>();
    const seen = new Set<string>();
    for (const profile of profiles) {
      if (profile.year === null) continue;
      const key = suggestionKey(profile);
      if (seen.has(key)) continue;
      seen.add(key);

      const stream =
        profile.schoolStream === 'general'
          ? Prisma.sql`AND c."for_general"`
          : profile.schoolStream === 'languages'
            ? Prisma.sql`AND c."for_languages"`
            : Prisma.empty;
      const rows = await this.prisma.$queryRaw<{ title: string; slug: string }[]>(Prisma.sql`
        SELECT c."title", c."slug"
        FROM "app"."courses" c
        WHERE c."status" = 'published' AND c."year" = ${profile.year} ${stream}
        ORDER BY
          CASE c."emphasis"
            WHEN 'required' THEN 0 WHEN 'recommended' THEN 1 WHEN 'optional' THEN 2 ELSE 3
          END,
          (SELECT count(*) FROM "app"."lessons" l
           WHERE l."course_id" = c."id" AND l."is_published") DESC,
          c."created_at" ASC,
          c."id" ASC
        LIMIT 1
      `);
      if (rows[0]) out.set(key, rows[0]);
    }
    return out;
  }
}

function suggestionKey(profile: { year: number | null; schoolStream: string | null }): string {
  return `${profile.year ?? ''}:${profile.schoolStream ?? ''}`;
}
