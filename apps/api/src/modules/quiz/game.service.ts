import { randomInt } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  GAME_ROUND_SIZE,
  type GameAnswerRequest,
  type GameAnswerResult,
  type GameRound,
} from '@ayman/contracts/quiz/game';
import { ReviewOptionsSchema } from '@ayman/contracts/quiz/quiz-settings';
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
   * ids النسخ اللي الطالب يقدر يلعب عليها. محدود بعدد المحاولات اللي سلّمها
   * في السنة (مئات بالكتير × ~٢٠ سؤال)، والفهرس `[userId, quizId]` على
   * `quiz_attempts` بيخدم الفلتر.
   */
  private async pool(userId: string): Promise<Set<string>> {
    const now = new Date();
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { userId, submittedAt: { not: null }, state: { in: ['submitted', 'pending_review'] } },
      select: {
        submittedAt: true,
        quiz: { select: { reviewOptions: true, openUntil: true } },
        questions: {
          // `gradedAt` زي `rightAnswerOptionIds` في المراجعة بالظبط: سؤال
          // ماتصححش مالوش «إجابة صح» تتقال.
          where: { gradedAt: { not: null }, version: { type: { in: [...PLAYABLE_TYPES] } } },
          select: { questionVersionId: true },
        },
      },
    });

    const ids = new Set<string>();
    for (const attempt of attempts) {
      const options = ReviewOptionsSchema.safeParse(attempt.quiz.reviewOptions);
      if (!options.success) continue;
      const window = resolveReviewWindow({ submittedAt: attempt.submittedAt, openUntil: attempt.quiz.openUntil, now });
      if (!resolveReviewFlags(options.data, window).rightAnswer) continue;
      for (const question of attempt.questions) ids.add(question.questionVersionId);
    }
    return ids;
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
