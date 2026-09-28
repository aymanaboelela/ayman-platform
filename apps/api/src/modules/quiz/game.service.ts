import { randomInt } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  GAME_ROUND_SIZE,
  type GameAnswerRequest,
  type GameAnswerResult,
  type GameRound,
} from '@ayman/contracts/quiz/game';
import { ReviewOptionsSchema } from '@ayman/contracts/quiz/quiz-settings';
import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveReviewFlags, resolveReviewWindow } from './serializers/review.serializer';

/** أنواع الأسئلة اللي تتلعب بدوسة واحدة. `mcq_multi` و`ordering` محتاجين
 *  شاشة تانية خالص، والمقالي مالوش تصحيح آلي أصلًا. */
const PLAYABLE_TYPES = ['mcq_single', 'true_false'] as const;

/**
 * «تحدّي الأسئلة».
 *
 * القاعدة الوحيدة اللي بتحكم كل حاجة هنا: **السؤال يدخل اللعبة بس لو صفحة
 * المراجعة بتاعته كانت هتوري الطالب الإجابة الصح دلوقتي.** نفس
 * `resolveReviewWindow` و`resolveReviewFlags` اللي `AttemptService.review`
 * بيستخدمهم، على نفس المحاولة، فمستحيل اللعبة تكشف حاجة المراجعة مخبّياها —
 * امتحان لسه مفتوح ومقفول فيه `rightAnswer` لحد ما يتقفل مثلًا.
 *
 * والسؤال بالـ**نسخة** اللي الطالب اتسأل فيها (`attempt_questions.question_version_id`)،
 * مش آخر نسخة في البنك: الطالب بيلعب على اللي شافه، والمدرّس لو عدّل السؤال
 * بعدها مايتكشفش التعديل من هنا.
 */
@Injectable()
export class GameService {
  constructor(private readonly prisma: PrismaService) {}

  async round(userId: string): Promise<GameRound> {
    const pool = await this.pool(userId);
    const picked = sample([...pool], GAME_ROUND_SIZE);
    if (picked.length === 0) return { questions: [], poolSize: 0 };

    const versions = await this.prisma.questionVersion.findMany({
      where: { id: { in: picked } },
      // ⚠️ من غير `fraction` ولا `feedbackHtml`: الإجابة الصح مابتسافرش مع
      // السؤال. `@NoAnswerLeak()` على الراوت شبكة تانية، مش الأولى.
      select: {
        id: true,
        type: true,
        stemHtml: true,
        options: { orderBy: { position: 'asc' }, select: { id: true, bodyHtml: true } },
      },
    });
    const byId = new Map(versions.map((version) => [version.id, version]));

    return {
      poolSize: pool.size,
      questions: picked.flatMap((id) => {
        const version = byId.get(id);
        if (!version || version.options.length < 2) return [];
        return [
          {
            id: version.id,
            type: version.type as (typeof PLAYABLE_TYPES)[number],
            stemHtml: version.stemHtml,
            // صح/غلط بترتيبه؛ الاختيار من متعدد بيتلخبط كل جولة عشان مايتحفظش
            // «التالتة هي الصح».
            options: version.type === 'true_false' ? version.options : sample(version.options, version.options.length),
          },
        ];
      }),
    };
  }

  async answer(userId: string, input: GameAnswerRequest): Promise<GameAnswerResult> {
    // نفس القاعدة بتاعة الجولة، بتتحسب تاني هنا: طالب بيبعت id سؤال من برّه
    // البنك بتاعه (امتحان لسه ماتقفلش) بياخد 404، مش الإجابة.
    const pool = await this.pool(userId);
    if (!pool.has(input.questionId)) throw new NotFoundException();

    const options = await this.prisma.questionOption.findMany({
      where: { questionVersionId: input.questionId },
      select: { id: true, fraction: true },
    });
    const best = Math.max(0, ...options.map((option) => Number(option.fraction)));
    const rightOptionIds = best > 0 ? options.filter((option) => Number(option.fraction) === best).map((o) => o.id) : [];

    return {
      correct: input.optionId !== null && rightOptionIds.includes(input.optionId),
      rightOptionIds,
    };
  }

  /**
   * ids النسخ اللي الطالب يقدر يلعب عليها.
   *
   * ## «شاف إجابته قبل كده»، مش «المراجعة بتوريها دلوقتي»
   *
   * الافتراضي على المنصة (`DEFAULT_REVIEW_OPTIONS`) إن الإجابة الصح بتظهر في
   * أول دقيقتين بعد التسليم وبعد ما الكويز يتقفل — وأغلب كويزات المحاضرات
   * مالهاش `openUntil`، يعني مابتتقفلش. لو اللعبة استنت «المراجعة بتوريها
   * دلوقتي» كانت هتفضل فاضية عند كل الطلبة. فالشرط: الطالب **اتوريله** الصح في
   * وقت ما (`immediatelyAfter`)، أو مسموح يشوفه دلوقتي. يعني اللعبة مابتكشفش
   * إجابة ماكانش الطالب شافها بعينه.
   *
   * ## وماعدا اللي داخل في امتحان جاي
   *
   * أي سؤال مربوط بامتحان شهر أو امتحان كورس لسه مفتوح أو جاي (ومش مسلّمه
   * الطالب) بيطلع برّه — مباشرة في slot، أو من تصنيف بيسحب منه pool الامتحان.
   * pool من غير فلتر تصنيفات بيسحب من البنك كله؛ ده مابيشيلش كل حاجة، لأن
   * الطالب شاف إجابات أسئلته هو بالفعل.
   *
   * محدود بعدد المحاولات اللي سلّمها (مئات بالكتير × ~٢٠ سؤال).
   */
  private async pool(userId: string): Promise<Set<string>> {
    const now = new Date();
    const [attempts, blocked] = await Promise.all([
      this.prisma.quizAttempt.findMany({
        where: { userId, submittedAt: { not: null }, state: { in: ['submitted', 'pending_review'] } },
        select: {
          submittedAt: true,
          quiz: { select: { reviewOptions: true, openUntil: true } },
          questions: {
            // `gradedAt` زي `rightAnswerOptionIds` في المراجعة بالظبط: سؤال
            // ماتصححش مالوش «إجابة صح» اتقالت.
            where: { gradedAt: { not: null }, version: { type: { in: [...PLAYABLE_TYPES] } } },
            select: {
              questionVersionId: true,
              version: { select: { bankEntryId: true, bankEntry: { select: { categoryId: true } } } },
            },
          },
        },
      }),
      this.upcomingExamSources(userId),
    ]);

    const ids = new Set<string>();
    for (const attempt of attempts) {
      const options = ReviewOptionsSchema.safeParse(attempt.quiz.reviewOptions);
      if (!options.success) continue;
      const window = resolveReviewWindow({ submittedAt: attempt.submittedAt, openUntil: attempt.quiz.openUntil, now });
      const shown = options.data.immediatelyAfter.rightAnswer || resolveReviewFlags(options.data, window).rightAnswer;
      if (!shown) continue;
      for (const question of attempt.questions) {
        if (blocked.entries.has(question.version.bankEntryId)) continue;
        if (blocked.categories.has(question.version.bankEntry.categoryId)) continue;
        ids.add(question.questionVersionId);
      }
    }
    return ids;
  }

  /**
   * البنك اللي امتحانات جاية بتسحب منه: امتحان شهر (رف «امتحانات الشهر») أو
   * امتحان كورس (`courses.exam_lesson_id`)، منشور، لسه ماتقفلش، والطالب لسه
   * ماسلّموش.
   */
  private async upcomingExamSources(userId: string): Promise<{ entries: Set<string>; categories: Set<string> }> {
    const rows = await this.prisma.$queryRaw<Array<{ bank_entry_id: string | null; source_filter: unknown }>>(Prisma.sql`
      SELECT DISTINCT s."bank_entry_id", p."source_filter"
      FROM "app"."quizzes" q
      JOIN "app"."lessons" l ON l."id" = q."lesson_id"
      JOIN "app"."course_sections" cs ON cs."id" = l."section_id"
      JOIN "app"."courses" co ON co."id" = l."course_id"
      LEFT JOIN "app"."quiz_slots" s ON s."quiz_id" = q."id"
      LEFT JOIN "app"."quiz_pools" p ON p."id" = s."pool_id"
      WHERE q."is_published"
        AND (q."open_until" IS NULL OR q."open_until" > now())
        AND (cs."title" = ${EXAM_SHELF_TITLE} OR co."exam_lesson_id" = l."id")
        AND NOT EXISTS (
          SELECT 1 FROM "app"."quiz_attempts" a
          WHERE a."quiz_id" = q."id" AND a."user_id" = ${userId} AND a."submitted_at" IS NOT NULL
        )
    `);
    const entries = new Set<string>();
    const categories = new Set<string>();
    for (const row of rows) {
      if (row.bank_entry_id) entries.add(row.bank_entry_id);
      const filter = row.source_filter as { categoryIds?: unknown } | null;
      if (Array.isArray(filter?.categoryIds)) {
        for (const id of filter.categoryIds) if (typeof id === 'string') categories.add(id);
      }
    }
    return { entries, categories };
  }
}

/** `count` عناصر عشوائية من غير تكرار (Fisher–Yates جزئي). */
function sample<T>(items: T[], count: number): T[] {
  const copy = [...items];
  const n = Math.min(count, copy.length);
  for (let i = 0; i < n; i++) {
    const j = i + randomInt(copy.length - i);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, n);
}
