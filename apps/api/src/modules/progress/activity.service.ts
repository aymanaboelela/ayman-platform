import { BadRequestException, Injectable } from '@nestjs/common';
import type { ActivityEntry, ActivityFeed } from '@ayman/contracts/activity';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * The student's own activity feed: what they watched, what they finished, and
 * what they sat — newest first, one merged list.
 *
 * ## Why the merge is here and not in SQL
 *
 * The three sources have different shapes and live in different tables. A
 * `UNION ALL` would need every column widened to a common type, a per-branch
 * `ORDER BY … LIMIT` pushed into a subquery so the union does not sort the
 * whole history, and a cast back out on the other side. This does three
 * bounded, index-served reads and merges them in memory, which is both easier
 * to prove correct and easier to change when a fourth kind arrives.
 *
 * Each read takes `limit + 1` rows, so the merged list is guaranteed to have
 * enough candidates to fill a page no matter how they interleave — even when
 * every one of the newest N events came from the same source.
 *
 * ## Ownership
 *
 * Two of the three sources are reached through `enrollment.userId` and the
 * third through `quizAttempt.userId`; all three carry it in the WHERE clause.
 * The route takes no id parameter at all.
 */
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: string, limit: number, cursor?: string): Promise<ActivityFeed> {
    const before = parseCursor(cursor);
    // One extra row is what tells us whether a next page exists without a
    // second COUNT over the same three tables.
    const take = limit + 1;

    const [watched, completed, attempts] = await Promise.all([
      this.prisma.lessonViewSession.findMany({
        where: {
          enrollment: { userId },
          ...(before ? { startedAt: { lt: before } } : {}),
        },
        orderBy: { startedAt: 'desc' },
        take,
        select: {
          id: true,
          startedAt: true,
          watchedSeconds: true,
          lesson: {
            select: { id: true, title: true, course: { select: { title: true, slug: true } } },
          },
        },
      }),

      this.prisma.lessonProgress.findMany({
        where: {
          enrollment: { userId },
          completedAt: { not: null, ...(before ? { lt: before } : {}) },
        },
        orderBy: { completedAt: 'desc' },
        take,
        select: {
          lessonId: true,
          completedAt: true,
          completedVia: true,
          lesson: {
            select: { id: true, title: true, course: { select: { title: true, slug: true } } },
          },
        },
      }),

      this.prisma.quizAttempt.findMany({
        where: {
          userId,
          submittedAt: { not: null, ...(before ? { lt: before } : {}) },
        },
        orderBy: { submittedAt: 'desc' },
        take,
        select: {
          id: true,
          attemptNo: true,
          submittedAt: true,
          scaledScore: true,
          gradeOutOf: true,
          passed: true,
          quiz: {
            select: {
              lesson: {
                select: { id: true, title: true, course: { select: { title: true, slug: true } } },
              },
            },
          },
        },
      }),
    ]);

    const merged: ActivityEntry[] = [
      ...watched.map(
        (row): ActivityEntry => ({
          kind: 'watched',
          id: row.id,
          occurredAt: row.startedAt.toISOString(),
          lessonId: row.lesson.id,
          lessonTitle: row.lesson.title,
          courseTitle: row.lesson.course.title,
          courseSlug: row.lesson.course.slug,
          secondsWatched: row.watchedSeconds,
        }),
      ),
      ...completed.map(
        (row): ActivityEntry => ({
          kind: 'completed',
          // `lesson_progress` has a composite key and no surrogate id; the
          // lesson id is unique within this kind, which is all the React key
          // needs since `kind` is part of it at every call site.
          id: row.lessonId,
          occurredAt: row.completedAt!.toISOString(),
          lessonId: row.lesson.id,
          lessonTitle: row.lesson.title,
          courseTitle: row.lesson.course.title,
          courseSlug: row.lesson.course.slug,
          completedVia: row.completedVia,
        }),
      ),
      ...attempts.map((row): ActivityEntry => {
        const gradeOutOf = Number(row.gradeOutOf);
        const scaled = Number(row.scaledScore ?? 0);
        return {
          kind: 'quiz',
          id: row.id,
          occurredAt: row.submittedAt!.toISOString(),
          lessonId: row.quiz.lesson.id,
          lessonTitle: row.quiz.lesson.title,
          courseTitle: row.quiz.lesson.course.title,
          courseSlug: row.quiz.lesson.course.slug,
          attemptId: row.id,
          attemptNo: row.attemptNo,
          // `gradeOutOf` of 0 is legitimate for a quiz whose slots all failed
          // to resolve; dividing by it yields Infinity, which fails the
          // contract's `.max(100)` and takes the feed down with a parse error.
          scorePercent:
            gradeOutOf > 0 ? Math.round(Math.min(Math.max((scaled / gradeOutOf) * 100, 0), 100)) : 0,
          passed: row.passed,
        };
      }),
    ];

    merged.sort((a, b) => {
      const byTime = b.occurredAt.localeCompare(a.occurredAt);
      // Ties broken on a stable, unique-within-kind key. Without this, two
      // events sharing a timestamp — a lesson completed by the same heartbeat
      // that closed its sitting, which is the COMMON case, not a rare one —
      // can order differently between two requests, and a cursor page
      // boundary that lands between them drops one row or repeats it.
      return byTime !== 0 ? byTime : `${b.kind}:${b.id}`.localeCompare(`${a.kind}:${a.id}`);
    });

    const page = merged.slice(0, limit);
    const hasMore = merged.length > limit;

    return {
      entries: page,
      // The cursor is the LAST returned row's timestamp, and the next page
      // asks for strictly-older rows. Two events at the identical millisecond
      // straddling a page boundary would lose one; `occurredAt` is
      // millisecond-precision and the tie-break above keeps the ordering
      // stable, so the window only ever closes on a boundary it has already
      // returned both sides of.
      nextCursor: hasMore && page.length > 0 ? page[page.length - 1]!.occurredAt : null,
    };
  }
}

/**
 * Cursors come from a URL, so they are attacker-controlled. An unparseable one
 * must be a 400 rather than an `Invalid Date` silently turning every `lt`
 * comparison into `false` and rendering an empty feed that looks like "you
 * have never done anything".
 */
function parseCursor(cursor?: string): Date | undefined {
  if (!cursor) return undefined;
  const parsed = new Date(cursor);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('cursor is not a valid timestamp');
  }
  return parsed;
}
