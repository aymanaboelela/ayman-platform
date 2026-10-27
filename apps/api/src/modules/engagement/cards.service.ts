import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  CARD_BOXES,
  CARD_DECK_SIZE,
  CARD_INTERVAL_DAYS,
  nextCardBox,
  shiftDayKey,
  type CardFace,
  type CardReview,
  type CardReviewResult,
  type CardsCourse,
  type CardsPayload,
  type CardsSummary,
} from '@ayman/contracts/engagement';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { cairoDate, cairoDayKey } from '../analytics/analytics-shared';
import { judgeMistakeAnswer } from '../mistakes/mistakes.service';
import { challengeCandidates, lessonServes, type ChallengeCandidate } from '../quiz/challenge-pool';
import { DailyService } from './daily.service';

interface Boxed {
  box: number;
  dueOn: string;
}

function dateOf(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

function hashOf(seed: string): number {
  return createHash('sha256').update(seed).digest().readUInt32BE(0);
}

/**
 * The round: due cards first — the lowest box first, so what is shakiest
 * comes back soonest — then new cards to fill it, from the lectures the
 * student has already opened (any lecture, when they have opened none in this
 * course). New cards are shuffled per student per day, so a reload is the
 * same round and tomorrow is a different one.
 *
 * Exported for the spec: it is the only rule here with an opinion in it.
 */
export function buildDeck(
  candidates: readonly ChallengeCandidate[],
  boxes: ReadonlyMap<string, Boxed>,
  opened: ReadonlySet<string>,
  today: string,
  seed: string,
  size: number = CARD_DECK_SIZE,
): ChallengeCandidate[] {
  const due = candidates
    .filter((candidate) => {
      const boxed = boxes.get(candidate.bankEntryId);
      return boxed !== undefined && boxed.dueOn <= today;
    })
    .sort((a, b) => {
      const left = boxes.get(a.bankEntryId)!;
      const right = boxes.get(b.bankEntryId)!;
      return left.box - right.box || left.dueOn.localeCompare(right.dueOn) || a.bankEntryId.localeCompare(b.bankEntryId);
    });
  if (due.length >= size) return due.slice(0, size);

  const unseen = candidates.filter((candidate) => !boxes.has(candidate.bankEntryId));
  const touched = unseen.filter((candidate) => opened.has(candidate.lessonId));
  const fresh = (touched.length > 0 ? touched : unseen).sort(
    (a, b) => hashOf(`${seed}:${a.bankEntryId}`) - hashOf(`${seed}:${b.bankEntryId}`),
  );
  return [...due, ...fresh.slice(0, size - due.length)];
}

/**
 * «بطاقات المراجعة» — the course's questions as flash cards in Leitner boxes.
 *
 * ## The bank is the challenges' bank
 *
 * `challengeCandidates`, filtered by stream, exactly as «سؤال اليوم» deals
 * from it. That is what makes it safe to send the back of the card with the
 * front: a question of a monthly or course exam the student has not handed
 * in yet is not in it, and neither is a draft.
 *
 * ## Only what was shown is stored
 *
 * A row is written the first time a card is answered, and only for the card
 * answered. The rest of the bank is «جديد» by having no row, so a course that
 * gains a lecture gains its cards with nothing to backfill.
 */
@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly daily: DailyService,
  ) {}

  async forUser(userId: string, wanted: string | undefined, now: Date = new Date()): Promise<CardsPayload> {
    const today = cairoDayKey(now);
    const courseIds = await this.daily.courseIds(userId);
    const reviewedToday = await this.reviewedOn(userId, today);
    if (courseIds.length === 0) return { courses: [], courseId: null, deck: [], reviewedToday };

    const [candidates, profile, courses, rows] = await Promise.all([
      challengeCandidates(this.prisma, courseIds, userId),
      this.prisma.studentProfile.findUnique({ where: { userId }, select: { schoolStream: true } }),
      this.prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } }),
      this.prisma.flashCard.findMany({ where: { userId }, select: { bankEntryId: true, box: true, dueOn: true } }),
    ]);
    const served = candidates.filter((candidate) => lessonServes(candidate, profile?.schoolStream ?? null));
    const boxes = new Map(
      rows.map((row) => [row.bankEntryId, { box: row.box, dueOn: row.dueOn.toISOString().slice(0, 10) }]),
    );

    const titleOf = new Map(courses.map((course) => [course.id, course.title]));
    const stats: CardsCourse[] = courseIds
      .filter((id) => titleOf.has(id))
      .map((courseId) => {
        const own = served.filter((candidate) => candidate.courseId === courseId);
        const seen = own.flatMap((candidate) => boxes.get(candidate.bankEntryId) ?? []);
        return {
          courseId,
          title: titleOf.get(courseId)!,
          total: own.length,
          seen: seen.length,
          mastered: seen.filter((boxed) => boxed.box >= CARD_BOXES).length,
          due: seen.filter((boxed) => boxed.dueOn <= today).length,
        };
      })
      .filter((course) => course.total > 0);
    if (stats.length === 0) return { courses: [], courseId: null, deck: [], reviewedToday };

    // The asked-for course, else the one with the most waiting, else the first.
    const chosen =
      stats.find((course) => course.courseId === wanted) ??
      [...stats].sort((a, b) => b.due - a.due)[0]!;

    const opened = await this.prisma.lessonProgress.findMany({
      where: { enrollment: { userId, courseId: chosen.courseId }, state: { not: 'not_started' } },
      select: { lessonId: true },
    });
    const picked = buildDeck(
      served.filter((candidate) => candidate.courseId === chosen.courseId),
      boxes,
      new Set(opened.map((row) => row.lessonId)),
      today,
      `${userId}:${today}`,
    );

    return {
      courses: stats,
      courseId: chosen.courseId,
      deck: await this.render(picked, boxes),
      reviewedToday,
    };
  }

  async review(userId: string, input: CardReview, now: Date = new Date()): Promise<CardReviewResult> {
    const today = cairoDayKey(now);
    const courseIds = await this.daily.courseIds(userId);
    if (!courseIds.includes(input.courseId)) throw new NotFoundException();
    const entry = await this.prisma.questionBankEntry.findFirst({
      where: { id: input.bankEntryId, archivedAt: null },
      select: { id: true },
    });
    if (!entry) throw new BadRequestException();

    const existing = await this.prisma.flashCard.findUnique({
      where: { userId_bankEntryId: { userId, bankEntryId: input.bankEntryId } },
      select: { box: true },
    });
    const box = nextCardBox(existing?.box ?? 0, input.knew);
    const dueOn = shiftDayKey(today, CARD_INTERVAL_DAYS[box - 1]!);

    await this.prisma.flashCard.upsert({
      where: { userId_bankEntryId: { userId, bankEntryId: input.bankEntryId } },
      create: { userId, bankEntryId: input.bankEntryId, courseId: input.courseId, box, dueOn: dateOf(dueOn), reviews: 1, lastSeenAt: now },
      update: { box, dueOn: dateOf(dueOn), reviews: { increment: 1 }, lastSeenAt: now },
    });
    return { box, dueOn };
  }

  /**
   * The dashboard's row: cards already seen that are due, from the student's
   * own rows only. New cards are not counted — that would need the bank.
   */
  async summary(userId: string, now: Date = new Date()): Promise<CardsSummary> {
    const today = cairoDayKey(now);
    const [due, mastered, reviewedToday] = await Promise.all([
      this.prisma.flashCard.count({ where: { userId, dueOn: { lte: dateOf(today) } } }),
      this.mastered(userId),
      this.reviewedOn(userId, today),
    ]);
    return { due, mastered, reviewedToday };
  }

  /** Cards in the top box — the «بطاقات المراجعة» badge. */
  mastered(userId: string): Promise<number> {
    return this.prisma.flashCard.count({ where: { userId, box: CARD_BOXES } });
  }

  private async reviewedOn(userId: string, day: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ n: number }>>(Prisma.sql`
      SELECT count(*)::int AS n FROM "app"."flash_cards" f
      WHERE f."user_id" = ${userId} AND ${cairoDate('f."last_seen_at"')} = ${day}::date
    `);
    return rows[0]?.n ?? 0;
  }

  private async render(picked: readonly ChallengeCandidate[], boxes: ReadonlyMap<string, Boxed>): Promise<CardFace[]> {
    if (picked.length === 0) return [];
    const [versions, lessons] = await Promise.all([
      this.prisma.questionVersion.findMany({
        where: { id: { in: picked.map((candidate) => candidate.versionId) } },
        select: {
          id: true,
          type: true,
          stemHtml: true,
          generalFeedbackHtml: true,
          options: { orderBy: { position: 'asc' }, select: { id: true, bodyHtml: true, fraction: true, position: true } },
        },
      }),
      this.prisma.lesson.findMany({
        where: { id: { in: picked.map((candidate) => candidate.lessonId) }, isPublished: true },
        select: { id: true, title: true },
      }),
    ]);
    const versionOf = new Map(versions.map((version) => [version.id, version]));
    const lessonOf = new Map(lessons.map((lesson) => [lesson.id, lesson.title]));

    return picked.flatMap((candidate): CardFace[] => {
      const version = versionOf.get(candidate.versionId);
      if (!version || (version.type !== 'mcq_single' && version.type !== 'true_false')) return [];
      const { rightOptionIds } = judgeMistakeAnswer(
        version.type,
        version.options.map((option) => ({ ...option, fraction: Number(option.fraction) })),
        [],
      );
      if (rightOptionIds.length === 0) return [];
      return [
        {
          bankEntryId: candidate.bankEntryId,
          questionVersionId: version.id,
          type: version.type,
          stemHtml: version.stemHtml,
          options: version.options.map((option) => ({ id: option.id, bodyHtml: option.bodyHtml })),
          keyOptionIds: rightOptionIds,
          explanationHtml: version.generalFeedbackHtml?.trim() ? version.generalFeedbackHtml : null,
          lessonTitle: lessonOf.get(candidate.lessonId) ?? null,
          box: boxes.get(candidate.bankEntryId)?.box ?? 0,
        },
      ];
    });
  }
}
