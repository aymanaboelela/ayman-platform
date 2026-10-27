import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  bestStreak,
  currentStreak,
  shiftDayKey,
  type DailyAnswerResult,
  type DailyPayload,
  type DailyQuestion,
  type DailyStreak,
  type DailyVerdict,
} from '@ayman/contracts/engagement';
import { isFoundationCourse } from '@ayman/contracts/quiz/challenges';
import { PrismaService } from '../../prisma/prisma.service';
import { cairoDayKey } from '../analytics/analytics-shared';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { judgeMistakeAnswer } from '../mistakes/mistakes.service';
import { challengeCandidates, lessonServes, type ChallengeCandidate } from '../quiz/challenge-pool';

/** A question dealt in this many days is not dealt again while anything else is left. */
const NO_REPEAT_DAYS = 180;

interface DealtRow {
  questionVersionId: string;
  courseId: string;
  lessonId: string | null;
  optionId: string | null;
  wasRight: boolean | null;
  answeredAt: Date | null;
}

/** `YYYY-MM-DD` as the `@db.Date` value Prisma reads and writes (UTC midnight). */
function dateOf(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

function keyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A stable number per (seed) — the same student on the same day draws the same card. */
function hashOf(seed: string): number {
  return createHash('sha256').update(seed).digest().readUInt32BE(0);
}

/**
 * The card for the day: the questions of the lectures the student has already
 * opened, then (when they have opened none) any lecture of their courses.
 * Anything dealt in the last `NO_REPEAT_DAYS` days goes to the back of the
 * line, never out of it — a small course runs out of fresh questions, and a
 * repeat beats an empty card.
 *
 * Exported for the spec: the choice is the only part with an opinion in it.
 */
export function pickDaily(
  candidates: readonly ChallengeCandidate[],
  opened: ReadonlySet<string>,
  recentlyDealt: ReadonlySet<string>,
  seed: string,
): ChallengeCandidate | null {
  if (candidates.length === 0) return null;
  const touched = candidates.filter((candidate) => opened.has(candidate.lessonId));
  const pool = touched.length > 0 ? touched : [...candidates];
  const fresh = pool.filter((candidate) => !recentlyDealt.has(candidate.bankEntryId));
  const from = (fresh.length > 0 ? fresh : pool).sort((a, b) => a.versionId.localeCompare(b.versionId));
  return from[hashOf(seed) % from.length] ?? null;
}

/**
 * «سؤال اليوم» — one question a day from the student's own courses, and the
 * run of days they answered one.
 *
 * ## The deal is written, the pick is not re-run
 *
 * The first read of a Cairo day WRITES the row (`daily_answers`) with the
 * question in it. Every later read that day returns that row, so the card does
 * not change when a lecture is finished at noon and the candidate list moves,
 * and an answer can only ever be to the question that was on screen.
 *
 * ## Where the questions come from
 *
 * `challengeCandidates` — the bank «التحديات» draws from, with the same
 * exclusions: a question in a monthly or course exam the student has not
 * handed in yet never appears here, so the card cannot answer an open paper.
 * Filtered by the student's stream exactly as the game is, and the foundation
 * course is out for the same reason it is out of every game.
 */
@Injectable()
export class DailyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enrollments: EnrollmentService,
  ) {}

  async today(userId: string, now: Date = new Date()): Promise<DailyPayload> {
    const day = cairoDayKey(now);
    let row = await this.dealt(userId, day);
    let question = row ? await this.render(row, userId, day) : null;

    // Nothing dealt yet — or the dealt version left the bank before it was
    // answered, which is not the student's fault and should not cost a day.
    if (!row || (!question && row.answeredAt === null)) {
      if (row) await this.prisma.dailyAnswer.deleteMany({ where: { userId, day: dateOf(day), answeredAt: null } });
      const picked = await this.deal(userId, day);
      row = picked ? await this.dealt(userId, day) : null;
      question = row ? await this.render(row, userId, day) : null;
    }

    return {
      day,
      question,
      verdict: row && row.answeredAt ? await this.verdict(row) : null,
      streak: await this.streak(userId, day),
    };
  }

  async answer(userId: string, optionId: string, now: Date = new Date()): Promise<DailyAnswerResult> {
    const day = cairoDayKey(now);
    const row = await this.dealt(userId, day);
    if (!row) throw new NotFoundException();
    if (row.answeredAt) throw new ConflictException({ code: 'daily_already_answered' });

    const version = await this.prisma.questionVersion.findUnique({
      where: { id: row.questionVersionId },
      select: {
        type: true,
        options: { orderBy: { position: 'asc' }, select: { id: true, fraction: true, position: true } },
      },
    });
    if (!version || (version.type !== 'mcq_single' && version.type !== 'true_false')) throw new NotFoundException();
    if (!version.options.some((option) => option.id === optionId)) throw new BadRequestException();

    const { correct } = judgeMistakeAnswer(
      version.type,
      version.options.map((option) => ({ ...option, fraction: Number(option.fraction) })),
      [optionId],
    );

    // `answeredAt: null` in the WHERE makes a double tap one answer, not two.
    const written = await this.prisma.dailyAnswer.updateMany({
      where: { userId, day: dateOf(day), answeredAt: null },
      data: { optionId, wasRight: correct, answeredAt: now },
    });
    if (written.count === 0) throw new ConflictException({ code: 'daily_already_answered' });

    const answered = { ...row, optionId, wasRight: correct, answeredAt: now };
    return { verdict: await this.verdict(answered), streak: await this.streak(userId, day) };
  }

  /** Every Cairo day this student answered, for the streak and the badges. */
  async answeredDays(userId: string): Promise<{ day: string; wasRight: boolean }[]> {
    const rows = await this.prisma.dailyAnswer.findMany({
      where: { userId, answeredAt: { not: null } },
      select: { day: true, wasRight: true },
      orderBy: { day: 'asc' },
    });
    return rows.map((row) => ({ day: keyOf(row.day), wasRight: row.wasRight === true }));
  }

  private async dealt(userId: string, day: string): Promise<DealtRow | null> {
    return this.prisma.dailyAnswer.findUnique({
      where: { userId_day: { userId, day: dateOf(day) } },
      select: {
        questionVersionId: true,
        courseId: true,
        lessonId: true,
        optionId: true,
        wasRight: true,
        answeredAt: true,
      },
    });
  }

  private async deal(userId: string, day: string): Promise<boolean> {
    const courseIds = await this.courseIds(userId);
    if (courseIds.length === 0) return false;

    const [candidates, profile, opened, recent] = await Promise.all([
      challengeCandidates(this.prisma, courseIds, userId),
      this.prisma.studentProfile.findUnique({ where: { userId }, select: { schoolStream: true } }),
      this.prisma.lessonProgress.findMany({
        where: { enrollment: { userId }, state: { not: 'not_started' } },
        select: { lessonId: true },
      }),
      this.prisma.dailyAnswer.findMany({
        where: { userId, day: { gte: dateOf(shiftDayKey(day, -NO_REPEAT_DAYS)) } },
        select: { questionVersionId: true },
      }),
    ]);
    const stream = profile?.schoolStream ?? null;
    const served = candidates.filter((candidate) => lessonServes(candidate, stream));
    const recentVersions = recent.map((row) => row.questionVersionId);
    const recentEntries =
      recentVersions.length === 0
        ? []
        : await this.prisma.questionVersion.findMany({
            where: { id: { in: recentVersions } },
            select: { bankEntryId: true },
          });

    const picked = pickDaily(
      served,
      new Set(opened.map((row) => row.lessonId)),
      new Set(recentEntries.map((row) => row.bankEntryId)),
      `${userId}:${day}`,
    );
    if (!picked) return false;

    // `skipDuplicates`: two tabs opening the page at the same instant both
    // try to deal; the primary key keeps the first, and both then read it.
    await this.prisma.dailyAnswer.createMany({
      data: [
        {
          userId,
          day: dateOf(day),
          questionVersionId: picked.versionId,
          courseId: picked.courseId,
          lessonId: picked.lessonId,
        },
      ],
      skipDuplicates: true,
    });
    return true;
  }

  /** The courses the student can open right now, minus the foundation course. */
  private async courseIds(userId: string): Promise<string[]> {
    const enrollments = await this.enrollments.listOwn(userId);
    const ids = enrollments.filter((enrollment) => enrollment.accessActive).map((enrollment) => enrollment.courseId);
    if (ids.length === 0) return [];
    const courses = await this.prisma.course.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true, subtitle: true },
    });
    const foundation = new Set(courses.filter((course) => isFoundationCourse(course)).map((course) => course.id));
    return ids.filter((id) => !foundation.has(id));
  }

  /** The card, with no mark of the right answer on it. */
  private async render(row: DealtRow, userId: string, day: string): Promise<DailyQuestion | null> {
    const [version, course, lesson] = await Promise.all([
      this.prisma.questionVersion.findUnique({
        where: { id: row.questionVersionId },
        select: {
          id: true,
          type: true,
          stemHtml: true,
          options: { orderBy: { position: 'asc' }, select: { id: true, bodyHtml: true } },
        },
      }),
      this.prisma.course.findUnique({ where: { id: row.courseId }, select: { title: true, slug: true } }),
      row.lessonId
        ? this.prisma.lesson.findFirst({
            where: { id: row.lessonId, isPublished: true },
            select: { id: true, title: true },
          })
        : null,
    ]);
    if (!version || !course || version.options.length < 2) return null;
    if (version.type !== 'mcq_single' && version.type !== 'true_false') return null;

    // True/false keeps its order; a choice question is shuffled per student
    // per day, so «the third one» is never the answer two friends compare.
    const options =
      version.type === 'true_false'
        ? version.options
        : [...version.options].sort(
            (a, b) => hashOf(`${userId}:${day}:${a.id}`) - hashOf(`${userId}:${day}:${b.id}`),
          );

    return {
      questionVersionId: version.id,
      type: version.type,
      stemHtml: version.stemHtml,
      options,
      courseTitle: course.title,
      courseSlug: course.slug,
      lessonTitle: lesson?.title ?? null,
      lessonId: lesson?.id ?? null,
    };
  }

  private async verdict(row: DealtRow): Promise<DailyVerdict> {
    const version = await this.prisma.questionVersion.findUnique({
      where: { id: row.questionVersionId },
      select: {
        type: true,
        generalFeedbackHtml: true,
        options: { orderBy: { position: 'asc' }, select: { id: true, fraction: true, position: true } },
      },
    });
    const keyOptionIds =
      version && (version.type === 'mcq_single' || version.type === 'true_false')
        ? judgeMistakeAnswer(
            version.type,
            version.options.map((option) => ({ ...option, fraction: Number(option.fraction) })),
            [],
          ).rightOptionIds
        : [];
    return {
      wasRight: row.wasRight === true,
      chosenOptionId: row.optionId,
      keyOptionIds,
      explanationHtml: version?.generalFeedbackHtml?.trim() ? version.generalFeedbackHtml : null,
    };
  }

  private async streak(userId: string, today: string): Promise<DailyStreak> {
    const days = await this.answeredDays(userId);
    const answered = new Set(days.map((row) => row.day));
    const verdictOf = new Map(days.map((row) => [row.day, row.wasRight]));
    const week = Array.from({ length: 7 }, (_, index) => {
      const day = shiftDayKey(today, index - 6);
      const right = verdictOf.get(day);
      const status: DailyStreak['week'][number]['status'] =
        right === true ? 'right' : right === false ? 'wrong' : day === today ? 'today' : 'missed';
      return { day, status };
    });
    return {
      current: currentStreak(answered, today),
      best: bestStreak(answered),
      answered: days.length,
      right: days.filter((row) => row.wasRight).length,
      todayDone: answered.has(today),
      week,
    };
  }
}
