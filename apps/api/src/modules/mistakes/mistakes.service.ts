import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { MistakeAnswerResult, MistakeEntry, MistakeNotebook } from '@ayman/contracts/mistakes';
import { MISTAKE_MASTERY_STREAK } from '@ayman/contracts/mistakes';
import { PrismaService } from '../../prisma/prisma.service';
import { LEARNER_QUESTION_SELECT } from '../quiz/serializers/learner.serializer';

/** الأنواع اللي دفتر الغلطات بيتعامل معاها — شوف `mistakes.ts` (v1: أسئلة اختيارية بس). */
const MISTAKE_TYPES = ['mcq_single', 'mcq_multi', 'true_false'] as const;

/** «كويز خلص وله علامة» — نفس تعريف `GRADED_STATES` في `analytics.service.ts`،
 *  مكرّر هنا لأن `$queryRaw` مايقدرش يقرا الثابت جوّه SQL ليترال. */
const GRADED_ATTEMPT_STATES = ['submitted', 'pending_review'] as const;

/** صف واحد من استعلام «آخر مرة اتحل فيها كل سؤال». `snake_case` — خارج
 *  Postgres زي ما هو، مش العقد. */
interface LatestRow {
  question_version_id: string;
  state: 'graded_wrong' | 'graded_partial';
  missed_at: Date;
  lesson_id: string;
  missed_count: bigint;
  streak_right: number | null;
  mastered_at: Date | null;
}

@Injectable()
export class MistakesService {
  constructor(private readonly prisma: PrismaService) {}

  async notebook(userId: string): Promise<MistakeNotebook> {
    const rows = await this.latestMissed(userId);
    if (rows.length === 0) return { open: [], mastered: [] };

    const [questions, lessons] = await Promise.all([
      this.prisma.questionVersion.findMany({
        where: { id: { in: rows.map((row) => row.question_version_id) } },
        select: LEARNER_QUESTION_SELECT,
      }),
      this.lessonLabels(rows.map((row) => row.lesson_id)),
    ]);
    const questionById = new Map(questions.map((question) => [question.id, question]));

    const open: MistakeEntry[] = [];
    const mastered: MistakeEntry[] = [];
    for (const row of rows) {
      const question = questionById.get(row.question_version_id);
      // بنك الأسئلة ممكن يمسح نسخة قديمة — السؤال يختفي من الدفتر بدل ما يقع.
      if (!question) continue;
      const entry = toEntry(row, question, lessons.get(row.lesson_id));
      // «اتصلحت» بس لو التثبيت حصل بعد آخر غلطة حقيقية — غلطة جديدة في كويز
      // حقيقي بعد التثبيت ترجّع السؤال هنا من غير أي كتابة على الصف نفسه.
      const isMastered = row.mastered_at !== null && row.mastered_at > row.missed_at;
      (isMastered ? mastered : open).push(entry);
    }
    return { open, mastered };
  }

  async answer(userId: string, questionVersionId: string, optionIds: readonly string[]): Promise<MistakeAnswerResult> {
    const known = await this.prisma.attemptQuestion.findFirst({
      where: {
        questionVersionId,
        state: { in: ['graded_wrong', 'graded_partial'] },
        attempt: { userId, state: { in: [...GRADED_ATTEMPT_STATES] } },
      },
      select: { id: true },
    });
    // مفيش تسجيل غلطة على السؤال ده خالص — السؤال ده مش في دفتر الطالب ده،
    // مهما كان معاه ID صحيح لسؤال حقيقي على المنصة.
    if (!known) throw new NotFoundException();

    const question = await this.prisma.questionVersion.findUnique({
      where: { id: questionVersionId },
      select: { type: true, options: { select: { id: true, fraction: true } } },
    });
    if (!question || !isMistakeType(question.type)) throw new BadRequestException();

    const rightOptionIds = rightOptionsOf(question.options);
    const chosen = [...optionIds].sort();
    const sortedRight = [...rightOptionIds].sort();
    const correct =
      rightOptionIds.length > 0 &&
      chosen.length === sortedRight.length &&
      chosen.every((id, i) => id === sortedRight[i]);

    const existing = await this.prisma.mistakeReview.findUnique({
      where: { userId_questionVersionId: { userId, questionVersionId } },
    });
    const streakRight = correct ? (existing?.streakRight ?? 0) + 1 : 0;
    const mastered = streakRight >= MISTAKE_MASTERY_STREAK;

    await this.prisma.mistakeReview.upsert({
      where: { userId_questionVersionId: { userId, questionVersionId } },
      create: {
        userId,
        questionVersionId,
        streakRight,
        masteredAt: mastered ? new Date() : null,
        lastReviewedAt: new Date(),
      },
      update: {
        streakRight,
        // مستنياش نبني عليها الأول: أول مرة توصل للعداد المطلوب هي لحظة
        // التثبيت. ولو غلط تاني قبلها، `streakRight` رجع صفر فوق، فمابتتصلحش.
        ...(mastered ? { masteredAt: new Date() } : correct ? {} : { masteredAt: null }),
        lastReviewedAt: new Date(),
      },
    });

    return { correct, rightOptionIds, streakRight, mastered };
  }

  private async latestMissed(userId: string): Promise<LatestRow[]> {
    return this.prisma.$queryRaw<LatestRow[]>`
      WITH scored AS (
        SELECT
          aq."question_version_id" AS question_version_id,
          aq."state" AS state,
          a."submitted_at" AS submitted_at,
          qz."lesson_id" AS lesson_id,
          count(*) FILTER (WHERE aq."state" IN ('graded_wrong', 'graded_partial'))
            OVER (PARTITION BY aq."question_version_id") AS missed_count
        FROM "app"."attempt_questions" aq
        JOIN "app"."quiz_attempts" a ON a."id" = aq."attempt_id"
        JOIN "app"."quizzes" qz ON qz."id" = a."quiz_id"
        JOIN "app"."question_versions" v ON v."id" = aq."question_version_id"
        WHERE a."user_id" = ${userId}
          AND a."state" IN ('submitted', 'pending_review')
          AND v."type" IN ('mcq_single', 'mcq_multi', 'true_false')
      ),
      latest AS (
        SELECT DISTINCT ON (question_version_id)
          question_version_id, state, submitted_at, lesson_id, missed_count
        FROM scored
        ORDER BY question_version_id, submitted_at DESC
      )
      SELECT
        latest.question_version_id,
        latest.state,
        latest.submitted_at AS missed_at,
        latest.lesson_id,
        latest.missed_count,
        mr."streak_right" AS streak_right,
        mr."mastered_at" AS mastered_at
      FROM latest
      LEFT JOIN "app"."mistake_reviews" mr
        ON mr."user_id" = ${userId} AND mr."question_version_id" = latest.question_version_id
      WHERE latest.state IN ('graded_wrong', 'graded_partial')
    `;
  }

  /** نفس منطق `MasteryService.publishedLessons` بالظبط — درس منشور وكورسه
   *  منشور، من `Lesson.courseId` المسطّح مباشرة. */
  private async lessonLabels(
    ids: readonly string[],
  ): Promise<Map<string, { title: string; courseTitle: string; courseSlug: string }>> {
    if (ids.length === 0) return new Map();
    const lessons = await this.prisma.lesson.findMany({
      where: { id: { in: [...new Set(ids)] }, isPublished: true, course: { status: 'published' } },
      select: { id: true, title: true, course: { select: { title: true, slug: true } } },
    });
    return new Map(
      lessons.map((lesson) => [
        lesson.id,
        { title: lesson.title, courseTitle: lesson.course.title, courseSlug: lesson.course.slug },
      ]),
    );
  }
}

function isMistakeType(type: string): type is (typeof MISTAKE_TYPES)[number] {
  return (MISTAKE_TYPES as readonly string[]).includes(type);
}

/** أعلى fraction موجب — نفس `rightOf` في `game.service.ts`، مكرّرة هنا عشان
 *  الموديول ده مايعتمدش على تفاصيل داخلية في موديول تاني. */
function rightOptionsOf(options: readonly { id: string; fraction: unknown }[]): string[] {
  const best = Math.max(0, ...options.map((option) => Number(option.fraction)));
  return best > 0 ? options.filter((option) => Number(option.fraction) === best).map((option) => option.id) : [];
}

function toEntry(
  row: LatestRow,
  question: { id: string; type: string; stemHtml: string; options: { id: string; bodyHtml: string }[] },
  lesson: { title: string; courseTitle: string; courseSlug: string } | undefined,
): MistakeEntry {
  return {
    questionVersionId: row.question_version_id,
    type: question.type as MistakeEntry['type'],
    stemHtml: question.stemHtml,
    options: question.options,
    courseTitle: lesson?.courseTitle ?? null,
    courseSlug: lesson?.courseSlug ?? null,
    lessonTitle: lesson?.title ?? null,
    missedAt: row.missed_at.toISOString(),
    timesMissed: Number(row.missed_count),
    streakRight: row.streak_right ?? 0,
  };
}
