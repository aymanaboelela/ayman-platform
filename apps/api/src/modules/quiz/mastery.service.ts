import { Injectable } from '@nestjs/common';
import {
  MASTERY_MIN_EVIDENCE,
  MASTERY_REVIEW_BELOW,
  MASTERY_STRONG_AT,
  type MasteryTopic,
  type StudentMastery,
} from '@ayman/contracts';
import { PrismaService } from '../../prisma/prisma.service';
// Imported for the assertion below rather than interpolated into the SQL:
// `$queryRaw` cannot parameterise an IN-list, so the literals in the query are
// what Postgres sees, and this is what stops them drifting from the analytics
// service's definition of a graded sitting.
import { GRADED_STATES } from './analytics.service';

/** One grouped row, straight out of Postgres. `snake_case` because it is the
 *  raw shape, not the contract. */
interface TopicRow {
  category_id: string;
  name: string;
  answered: number;
  accuracy_percent: number;
  lesson_id: string;
}

/** A compile-time guard on the literals hard-coded in the query below. If
 *  `GRADED_STATES` ever gains or loses a member, this stops type-checking and
 *  the SQL has to be revisited — which is the only thing standing between the
 *  student's view of a topic and the admin's item analysis of the same
 *  questions reading different populations. */
const _GRADED_STATES_IS_STILL: readonly ['submitted', 'pending_review'] = GRADED_STATES;
void _GRADED_STATES_IS_STILL;

/**
 * «نقاط ضعفك» — how a student is scoring, per question topic.
 *
 * ## Why this file exists at all
 *
 * The join it walks has been fully populated since the quiz engine shipped and
 * nothing had ever traversed it: every question belongs to a
 * `QuestionCategory`, every answer carries its `mark` and `maxMark`, and the
 * path between them is three foreign keys. This is the first read that makes
 * that structure visible to the person it describes.
 *
 * ## Ownership
 *
 * `userId` is in the WHERE clause of the only attempt query here, and the route
 * that calls it takes no id parameter — the identity comes from the session and
 * nothing else. Same discipline `QuizHistoryService` and `DashboardController`
 * document, and the cheapest defence against IDOR: there is nothing to tamper
 * with.
 *
 * ## Why raw SQL
 *
 * Prisma's `groupBy` cannot express the "latest graded attempt per quiz"
 * window. Doing it in two round-trips means loading every attempt question the
 * student has ever answered into Node in order to group it there — for an
 * active student that is thousands of rows to produce six.
 */
@Injectable()
export class MasteryService {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: string): Promise<StudentMastery> {
    /*
     * `DISTINCT ON (quiz_id) … ORDER BY quiz_id, submitted_at DESC` is the
     * latest-sitting window: one row per quiz, the most recent graded one. A
     * student who revised and retook is measured on the retake, so the answers
     * they got wrong BEFORE they revised do not drag the topic down forever.
     *
     * Accuracy is SUM(mark)/SUM(max_mark), NOT AVG(fraction): averaging
     * fractions gives a one-mark multiple-choice question the same weight as a
     * ten-mark question in the same topic, and the figure the student's grade
     * is actually made of is the share of MARKS they collected.
     */
    const rows = await this.prisma.$queryRaw<TopicRow[]>`
      WITH latest AS (
        SELECT DISTINCT ON (a."quiz_id") a."id", a."quiz_id", a."submitted_at"
        FROM "app"."quiz_attempts" a
        WHERE a."user_id" = ${userId}
          AND a."state" IN ('submitted', 'pending_review')
        ORDER BY a."quiz_id", a."submitted_at" DESC
      ),
      scored AS (
        SELECT
          e."category_id",
          aq."mark",
          aq."max_mark",
          q."lesson_id",
          latest."submitted_at"
        FROM "app"."attempt_questions" aq
        JOIN latest                          ON latest."id" = aq."attempt_id"
        JOIN "app"."question_versions" v     ON v."id" = aq."question_version_id"
        JOIN "app"."question_bank_entries" e ON e."id" = v."bank_entry_id"
        JOIN "app"."quizzes" q               ON q."id" = latest."quiz_id"
        -- An ungraded answer is EXCLUDED, not counted as zero: an essay
        -- awaiting marking is not evidence of weakness.
        WHERE aq."mark" IS NOT NULL AND aq."max_mark" > 0
      )
      SELECT
        s."category_id",
        c."name",
        count(*)::int AS answered,
        round(sum(s."mark") / sum(s."max_mark") * 100)::int AS accuracy_percent,
        -- The lesson of this topic's most recent contributing sitting. Taken
        -- from the ATTEMPT rather than from the question bank, because a
        -- pool-drawn slot has no bank_entry_id and would vanish here.
        -- (No backticks anywhere in this template — one would close it.)
        (array_agg(s."lesson_id" ORDER BY s."submitted_at" DESC))[1] AS lesson_id
      FROM scored s
      JOIN "app"."question_categories" c ON c."id" = s."category_id"
      GROUP BY s."category_id", c."name"
    `;

    const evaluatedRows = rows.filter((row) => row.answered >= MASTERY_MIN_EVIDENCE);
    const pending = rows.length - evaluatedRows.length;

    const weakRows = evaluatedRows
      .filter((row) => row.accuracy_percent < MASTERY_REVIEW_BELOW)
      .sort((a, b) => a.accuracy_percent - b.accuracy_percent)
      .slice(0, 3);

    const strongRows = evaluatedRows
      .filter((row) => row.accuracy_percent >= MASTERY_STRONG_AT)
      .sort((a, b) => b.accuracy_percent - a.accuracy_percent)
      .slice(0, 3);

    // Only the rows that actually reach the card need their lesson resolved —
    // at most six lookups, not one per topic the student has ever met.
    const lessons = await this.publishedLessons(
      [...weakRows, ...strongRows].map((row) => row.lesson_id),
    );

    return {
      weakest: weakRows.map((row) => toTopic(row, lessons)),
      strongest: strongRows.map((row) => toTopic(row, lessons)),
      evaluated: evaluatedRows.length,
      pending,
    };
  }

  /**
   * Titles and course slugs for the handful of lessons the card will link.
   *
   * Publication is checked on BOTH the lesson and its course, and they are two
   * different columns: `Lesson.isPublished` is a boolean, `Course.status` is a
   * `CourseStatus` enum where only `published` is live (a course can also be
   * `draft` or `archived`). A card that offers a button to a 404 is worse than
   * one that offers no button.
   *
   * Reached through `Lesson.courseId` — the denormalised column the schema
   * carries for exactly this, "so course-wide queries do not have to join
   * through sections" — rather than `section.course`. One hop, and it is the
   * hop `@@index([courseId, isPublished])` is built for.
   *
   * Access is deliberately NOT re-checked here. A student who answered
   * questions in this lesson was enrolled at the time, and the lesson route
   * enforces entitlement on arrival anyway; re-deriving it would be a second
   * source of truth for the same question.
   */
  private async publishedLessons(
    ids: readonly string[],
  ): Promise<Map<string, { title: string; courseSlug: string }>> {
    if (ids.length === 0) return new Map();

    const lessons = await this.prisma.lesson.findMany({
      where: {
        id: { in: [...new Set(ids)] },
        isPublished: true,
        course: { status: 'published' },
      },
      select: { id: true, title: true, course: { select: { slug: true } } },
    });

    return new Map(
      lessons.map((lesson) => [lesson.id, { title: lesson.title, courseSlug: lesson.course.slug }]),
    );
  }
}

function toTopic(
  row: TopicRow,
  lessons: Map<string, { title: string; courseSlug: string }>,
): MasteryTopic {
  const lesson = lessons.get(row.lesson_id);
  return {
    categoryId: row.category_id,
    name: row.name,
    answered: row.answered,
    accuracyPercent: row.accuracy_percent,
    lessonId: lesson ? row.lesson_id : null,
    lessonTitle: lesson?.title ?? null,
    courseSlug: lesson?.courseSlug ?? null,
  };
}
