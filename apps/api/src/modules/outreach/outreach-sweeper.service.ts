import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { OutreachFacts, OutreachTopic } from '@ayman/contracts/outreach/compose';
import { PrismaService } from '../../prisma/prisma.service';
import {
  OutreachService,
  type DeliverInput,
  type DeliveryContext,
} from './outreach.service';
import type { AttemptQuestionState } from '../../generated/prisma/client';

/**
 * Who deserves a message, and when.
 *
 * ## Why a sweeper and not a hook on each event
 *
 * Every trigger here is "a thing became true and stayed true" rather than "an
 * event fired": a quiz was graded, a lesson has been finished for a day without
 * its quiz being opened, a student has not been invited to the group for three
 * weeks. Two of those three cannot be expressed as a hook at all — nothing
 * fires when a student DOESN'T do something — so the shape that covers all four
 * kinds is a periodic scan. Making the two reactive kinds hooks as well would
 * mean two delivery paths, two idempotency stories, and a result message that
 * can take down an exam submission (see `OutreachService`).
 *
 * ## Why every sweep is safe to run twice
 *
 * None of the queries below is precise, and none needs to be. They are
 * deliberately generous — a 20-minute window for the fast pass, seven days for
 * the slow one — and `outreach_messages_dedupe_key` is what turns "found again"
 * into a no-op. That is what makes the sweeper survive a missed tick, an
 * overlapping run, a deploy in the middle of a pass, and a replica coming back
 * online, without any of those being special cases in the code.
 *
 * ## One replica at a time
 *
 * `pg_try_advisory_xact_lock`, exactly as `OverdueService.sweep` takes it and
 * for the same reason: two replicas racing would not double-send (the index
 * stops that) but would double the work and fill the log with contention.
 */

/** The fast pass catches an ordinary submission within a minute. */
const RESULT_WINDOW_FAST_MS = 20 * 60 * 1000;
/**
 * The slow pass catches what the fast one could not: an essay paper marked
 * days after it was sat (which flips `pending_review` → `submitted` without
 * moving `submittedAt`), and any window the platform was down for.
 */
const RESULT_WINDOW_SLOW_MS = 7 * 24 * 60 * 60 * 1000;

/** A finished lesson stops being a nudge candidate after a week. */
const NUDGE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
/** Praise is for something that just happened, or it is not praise. */
const PRAISE_LOOKBACK_MS = 26 * 60 * 60 * 1000;

/** Per pass, per kind. Keeps one sweep bounded on a platform of any size. */
const BATCH = 60;
/** The invitation is the least urgent of the four; it goes out in a trickle. */
const INVITE_BATCH = 20;
/** How many enrolled students one invite pass considers before filtering. */
const INVITE_SCAN = 400;

/** `graded_partial` counts as weak: it is a question they did not fully get. */
const WEAK_STATES: readonly AttemptQuestionState[] = ['graded_wrong', 'graded_partial'];

@Injectable()
export class OutreachSweeper {
  private readonly logger = new Logger(OutreachSweeper.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outreach: OutreachService,
  ) {}

  /**
   * Results, promptly.
   *
   * A minute's delay is not a compromise here — it is the design. A message
   * that arrives in the same instant as the score is obviously machinery; one
   * that arrives a minute later reads as someone who looked.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async sweepResults(): Promise<number> {
    return this.locked('results-fast', async (context) => {
      if (!context.settings.quizResult) return 0;
      return this.sendResults(RESULT_WINDOW_FAST_MS, context);
    });
  }

  /**
   * Everything that is measured in hours or days, plus a wide second look at
   * results. Hourly, because none of it is urgent and all of it is a scan.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sweepSlow(): Promise<number> {
    return this.locked('slow', async (context) => {
      let sent = 0;
      // Ordered by how much the student earned the message. The per-student
      // daily cap is spent from the top down, so an unsolicited group
      // invitation can never crowd out a nudge about work they actually did.
      if (context.settings.quizResult) sent += await this.sendResults(RESULT_WINDOW_SLOW_MS, context);
      if (context.settings.quizNudge) sent += await this.sendQuizNudges(context);
      if (context.settings.lessonPraise) sent += await this.sendLessonPraise(context);
      if (context.settings.whatsappInvite) sent += await this.sendGroupInvites(context);
      return sent;
    });
  }

  // ── the four kinds ────────────────────────────────────────────────────

  /**
   * A paper that has been fully graded and never written about.
   *
   * `state: 'submitted'` only — never `pending_review`. A paper with an essay
   * still to mark has no final score, and a message quoting the auto-graded
   * half of it would be wrong in the one way that matters. It becomes a
   * candidate when the instructor finishes marking, which is what the slow
   * pass's seven-day window is for.
   */
  private async sendResults(windowMs: number, context: DeliveryContext): Promise<number> {
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { state: 'submitted', submittedAt: { gte: new Date(Date.now() - windowMs) } },
      orderBy: { submittedAt: 'asc' },
      take: BATCH,
      select: {
        id: true,
        userId: true,
        scaledScore: true,
        gradeOutOf: true,
        quiz: { select: { lesson: { select: { title: true } } } },
        questions: {
          orderBy: { slotPosition: 'asc' },
          select: {
            slotPosition: true,
            state: true,
            version: {
              select: { bankEntry: { select: { category: { select: { name: true } } } } },
            },
          },
        },
      },
    });
    if (attempts.length === 0) return 0;

    const pending = await this.unsent('quiz_result', attempts.map((a) => ({ userId: a.userId, dedupeKey: a.id })));

    let sent = 0;
    for (const attempt of attempts) {
      if (!pending.has(`${attempt.userId}:${attempt.id}`)) continue;

      const outOf = Number(attempt.gradeOutOf);
      const facts: OutreachFacts = {
        kind: 'quiz_result',
        quizTitle: attempt.quiz.lesson.title,
        scorePercent:
          outOf > 0 ? clampPercent(Math.round((Number(attempt.scaledScore ?? 0) / outOf) * 100)) : 0,
        ...topicsFor(attempt.questions),
      };

      sent += await this.send({ userId: attempt.userId, kind: 'quiz_result', dedupeKey: attempt.id, facts }, context);
    }
    return sent;
  }

  /**
   * The lesson is done and its quiz has never been opened.
   *
   * `state: 'completed'` is the exact shape of that: `passed`/`failed` are
   * written by grading, so a lesson still sitting at `completed` after its
   * quiz's grace period is one where the video was watched and the paper was
   * not sat. The attempt lookup below is belt and braces for the case where an
   * attempt exists but is still `in_progress`.
   */
  private async sendQuizNudges(context: DeliveryContext): Promise<number> {
    const now = Date.now();
    const rows = await this.prisma.lessonProgress.findMany({
      where: {
        state: 'completed',
        completedAt: {
          lte: new Date(now - context.settings.nudgeAfterHours * 60 * 60 * 1000),
          gte: new Date(now - NUDGE_LOOKBACK_MS),
        },
        lesson: { quiz: { is: { isPublished: true } } },
      },
      orderBy: { completedAt: 'asc' },
      take: BATCH,
      select: {
        enrollment: { select: { userId: true } },
        lesson: { select: { title: true, quiz: { select: { id: true } } } },
      },
    });
    if (rows.length === 0) return 0;

    const candidates = rows
      .map((row) => ({
        userId: row.enrollment.userId,
        quizId: row.lesson.quiz?.id ?? null,
        lessonTitle: row.lesson.title,
      }))
      .filter((row): row is { userId: string; quizId: string; lessonTitle: string } => row.quizId !== null);

    // Anyone who has already opened the paper — including an attempt still in
    // progress — is not being nudged to open it.
    const attempted = new Set(
      (
        await this.prisma.quizAttempt.findMany({
          where: {
            quizId: { in: candidates.map((c) => c.quizId) },
            userId: { in: candidates.map((c) => c.userId) },
          },
          select: { quizId: true, userId: true },
        })
      ).map((row) => `${row.userId}:${row.quizId}`),
    );

    const pending = await this.unsent(
      'quiz_nudge',
      candidates.map((c) => ({ userId: c.userId, dedupeKey: c.quizId })),
    );

    let sent = 0;
    for (const candidate of candidates) {
      const key = `${candidate.userId}:${candidate.quizId}`;
      if (attempted.has(key) || !pending.has(key)) continue;
      sent += await this.send(
        {
          userId: candidate.userId,
          kind: 'quiz_nudge',
          dedupeKey: candidate.quizId,
          facts: { kind: 'quiz_nudge', lessonTitle: candidate.lessonTitle },
        },
        context,
      );
    }
    return sent;
  }

  /**
   * A lesson with NO quiz was just finished.
   *
   * The only one of the four that asks for nothing, which is why it is worth
   * sending at all: a platform that only ever writes to you when it wants
   * something is not a teacher.
   */
  private async sendLessonPraise(context: DeliveryContext): Promise<number> {
    const rows = await this.prisma.lessonProgress.findMany({
      where: {
        state: { in: ['completed', 'passed'] },
        completedAt: { gte: new Date(Date.now() - PRAISE_LOOKBACK_MS) },
        lesson: { quiz: { is: null } },
      },
      orderBy: { completedAt: 'desc' },
      take: BATCH,
      select: {
        lessonId: true,
        enrollment: { select: { userId: true } },
        lesson: { select: { title: true } },
      },
    });
    if (rows.length === 0) return 0;

    const pending = await this.unsent(
      'lesson_praise',
      rows.map((row) => ({ userId: row.enrollment.userId, dedupeKey: row.lessonId })),
    );

    let sent = 0;
    for (const row of rows) {
      if (!pending.has(`${row.enrollment.userId}:${row.lessonId}`)) continue;
      sent += await this.send(
        {
          userId: row.enrollment.userId,
          kind: 'lesson_praise',
          dedupeKey: row.lessonId,
          facts: { kind: 'lesson_praise', lessonTitle: row.lesson.title },
        },
        context,
      );
    }
    return sent;
  }

  /**
   * Join the group — for students who have not been asked lately.
   *
   * "Lately" counts the tag-along too, not just the standalone message. The
   * composer appends a group line to roughly one message in three, and a
   * student who got one of those last week has been asked; sending them a whole
   * message about it now would read as not having been listening.
   */
  private async sendGroupInvites(context: DeliveryContext): Promise<number> {
    // Nothing to invite anyone to. `composeOutreach` would omit the link and
    // leave a message whose entire subject is a group it cannot point at.
    if (!context.whatsappGroupUrl) return 0;

    const since = new Date(Date.now() - context.settings.groupInviteEveryDays * DAY_MS);
    const asked = new Set(
      (
        await this.prisma.outreachMessage.findMany({
          where: {
            createdAt: { gte: since },
            OR: [{ kind: 'whatsapp_invite' }, { variantKey: { contains: 'w=' } }],
          },
          select: { userId: true },
        })
      ).map((row) => row.userId),
    );

    const students = await this.prisma.user.findMany({
      where: { role: 'student', bannedAt: null, enrollments: { some: {} } },
      // Stable ordering, so a pass that stops at INVITE_BATCH resumes from the
      // same place next hour rather than re-rolling the whole population.
      orderBy: { createdAt: 'asc' },
      take: INVITE_SCAN,
      select: { id: true },
    });

    const dedupeKey = isoWeek(new Date());
    let sent = 0;
    for (const student of students) {
      if (sent >= INVITE_BATCH) break;
      if (asked.has(student.id)) continue;
      sent += await this.send(
        {
          userId: student.id,
          kind: 'whatsapp_invite',
          // The ISO week, so the unique index alone caps this at once a week
          // per student even if the settings are lowered to something silly.
          dedupeKey,
          facts: { kind: 'whatsapp_invite' },
        },
        context,
      );
    }
    return sent;
  }

  // ── internals ─────────────────────────────────────────────────────────

  /**
   * Delivers one message, and never lets one bad row stop a pass.
   *
   * A student whose data trips something — a title with a lone surrogate in it,
   * a row the composer cannot handle — must not silently cancel every message
   * queued behind them. Logged and skipped; the next pass finds them again,
   * because nothing was written.
   */
  private async send(input: DeliverInput, context: DeliveryContext): Promise<number> {
    try {
      return (await this.outreach.deliver(input, context)) === 'sent' ? 1 : 0;
    } catch (error) {
      this.logger.error(
        { err: error, kind: input.kind, userId: input.userId },
        'outreach delivery failed',
      );
      return 0;
    }
  }

  /**
   * Which of these `(user, dedupeKey)` pairs have NOT been sent yet.
   *
   * Filtered by `userId` as well as by key so the read uses the leading column
   * of `outreach_messages_dedupe_key` — a lookup on `dedupeKey` alone would be
   * a sequential scan of the whole ledger every minute, on an index that exists
   * and is simply the wrong way round for it.
   */
  private async unsent(
    kind: DeliverInput['kind'],
    pairs: readonly { userId: string; dedupeKey: string }[],
  ): Promise<Set<string>> {
    const wanted = new Set(pairs.map((pair) => `${pair.userId}:${pair.dedupeKey}`));
    if (wanted.size === 0) return wanted;

    const already = await this.prisma.outreachMessage.findMany({
      where: {
        kind,
        userId: { in: [...new Set(pairs.map((pair) => pair.userId))] },
        dedupeKey: { in: [...new Set(pairs.map((pair) => pair.dedupeKey))] },
      },
      select: { userId: true, dedupeKey: true },
    });
    for (const row of already) wanted.delete(`${row.userId}:${row.dedupeKey}`);
    return wanted;
  }

  /**
   * Runs `work` on exactly one replica, or not at all.
   *
   * `pg_try_advisory_xact_lock` inside ONE interactive transaction, which is
   * the arrangement `OverdueService` documents: a session-level lock taken and
   * released as two `$queryRaw` calls has no guarantee of landing on the same
   * pooled connection, and a lock acquired on one can never be released from
   * another.
   *
   * ⚠️ The transaction here exists ONLY to hold the lock — no delivery happens
   * inside it. Each `deliver` opens its own short transaction, so a slow pass
   * cannot hold one open across sixty message writes.
   */
  private async locked(
    name: string,
    work: (context: DeliveryContext) => Promise<number>,
  ): Promise<number> {
    const acquired = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${`ayman:outreach:${name}`}, 0)) AS locked
      `;
      return rows[0]?.locked === true;
    });
    if (!acquired) return 0;

    const context = await this.outreach.context();
    const sent = await work(context);
    if (sent > 0) this.logger.log({ sweep: name, sent }, 'outreach sent');
    return sent;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function clampPercent(value: number): number {
  return Math.min(Math.max(value, 0), 100);
}

/**
 * Groups a graded paper into "go back to this" and "you own this".
 *
 * Exported for its own test: this is the half of the message that has to be
 * TRUE, and it is the half a reader cannot check by eye.
 *
 * A category appears in exactly one of the two lists. A topic with one wrong
 * answer out of four is a weak topic, not a strong one with an asterisk —
 * telling a student they are good at something they just got wrong is the
 * fastest way to prove nobody read the paper.
 */
export function topicsFor(
  questions: readonly {
    slotPosition: number;
    state: AttemptQuestionState;
    version: { bankEntry: { category: { name: string } | null } };
  }[],
): { weakTopics: OutreachTopic[]; strongTopics: string[] } {
  const weak = new Map<string, number[]>();
  const seen = new Set<string>();

  for (const question of questions) {
    // `null` is a real key here — questions whose category was deleted still
    // group together, and the copy has a bullet with no topic name for them.
    const name = question.version.bankEntry.category?.name ?? '';
    seen.add(name);
    if (WEAK_STATES.includes(question.state)) {
      const numbers = weak.get(name) ?? [];
      numbers.push(question.slotPosition);
      weak.set(name, numbers);
    }
  }

  return {
    // Most-missed first: if the message can only carry three bullets, they
    // should be the three that cost the most marks.
    weakTopics: [...weak.entries()]
      .sort(([, a], [, b]) => b.length - a.length || a[0]! - b[0]!)
      .map(([name, questionNumbers]) => ({ name: name === '' ? null : name, questionNumbers })),
    strongTopics: [...seen].filter((name) => name !== '' && !weak.has(name)),
  };
}

/**
 * `2026-W33`. The invitation's dedupe key, so the unique index alone caps it at
 * once a week per student whatever the settings say.
 *
 * ISO weeks start on Monday and the week containing the year's first Thursday
 * is week 1 — hence the shift to Thursday before dividing. A naive
 * `dayOfYear / 7` would give two different keys to one week across a year
 * boundary, which is a duplicate message on exactly one day a year: the kind of
 * bug that ships.
 */
export function isoWeek(date: Date): string {
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
