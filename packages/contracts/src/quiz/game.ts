import { z } from '@ayman/contracts/zod';

/**
 * «الألعاب» — `/api/me/game/*`. تلات ألعاب على نفس البنك:
 *
 *   · `race`        — سباق وقت: ١٠ أسئلة، تايمر، ٣ قلوب، كومبو.
 *   · `millionaire` — «من سيربح المليون»: ١٥ سؤال من السهل للصعب، سلّم نقط،
 *                     «حذف إجابتين» و«اسأل الجمهور»، والسؤال بيتقري بصوت.
 *   · `survival`    — «البقاء»: أول غلطة والجولة بتخلص.
 *
 * ## الأسئلة منين
 *
 * من **كل** أسئلة الكويزات اللي الطالب سلّمها (طلب صريح من أيمن: «من كل
 * الأسئلة اللي في الكويز اللي امتحنها قبل كده») — اللي اتسأل فيها، واللي في
 * الكويز نفسه ومجاتلوش — ومن الكورس اللي بيختاره. وماعدا أي سؤال داخل في
 * امتحان شهر أو امتحان كورس لسه جاي، عشان اللعبة ماتبقاش حل نموذجي لامتحان
 * قبل ما يتعمل. التفاصيل في `GameService.pool`.
 *
 * ## الصعوبة من الطلبة نفسهم
 *
 * «سهل/متوسط/صعب» مش رأي حد: نسبة اللي جاوبوا السؤال صح من كل محاولات
 * المنصة (`facility`). سؤال عليه أقل من ٣ إجابات بيتحسب متوسط.
 *
 * ## الإجابة الصح مابتسافرش مع السؤال
 *
 * الجولة فيها الأسئلة والاختيارات من غير `fraction` ولا أي علامة؛ التصحيح في
 * السيرفر سؤال سؤال. والجولة نفسها `@NoAnswerLeak()`.
 *
 * مفيش imports نسبية هنا — نفس سبب `quiz/history.ts`.
 */

export const GAME_MODES = ['race', 'millionaire', 'survival'] as const;
export const GameModeSchema = z.enum(GAME_MODES);
export type GameMode = z.infer<typeof GameModeSchema>;

export const GAME_LEVELS = ['easy', 'medium', 'hard'] as const;
export const GameLevelSchema = z.enum(GAME_LEVELS);
export type GameLevel = z.infer<typeof GameLevelSchema>;

/** كل لعبة: كام سؤال، كام قلب، وكام ثانية للسؤال حسب المستوى. */
export const GAME_RULES: Record<
  GameMode,
  { questions: number; lives: number; seconds: Record<GameLevel, number> }
> = {
  race: { questions: 10, lives: 3, seconds: { easy: 25, medium: 20, hard: 15 } },
  millionaire: { questions: 15, lives: 1, seconds: { easy: 45, medium: 35, hard: 25 } },
  survival: { questions: 30, lives: 1, seconds: { easy: 25, medium: 20, hard: 15 } },
};

/** أكبر جولة ممكنة — سقف الـschema. */
export const GAME_MAX_QUESTIONS = 30;

/**
 * سلّم «من سيربح المليون». الـ٥ والـ١٠ «أمان»: اللي بيوقع بعدهم بياخدهم.
 * نقط مش فلوس — المنصة مابتوعدش بفلوس.
 */
export const MILLIONAIRE_LADDER = [
  100, 200, 300, 500, 1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 125_000, 250_000, 500_000,
  1_000_000,
] as const;
export const MILLIONAIRE_SAFE_STEPS = [5, 10] as const;

/** سباق الوقت — القيم القديمة، باقية عشان الحساب بتاعه. */
export const GAME_ROUND_SIZE = GAME_RULES.race.questions;
export const GAME_SECONDS_PER_QUESTION = GAME_RULES.race.seconds.medium;
export const GAME_LIVES = GAME_RULES.race.lives;

/**
 * النقط: ١٠٠ للإجابة الصح، ولحد ١٠٠ كمان على السرعة (بتقل خطي مع الوقت)،
 * والكل مضروب في الكومبو: ×1 ← ×1.5 ← ×2 ← ×2.5 ← ×3 بحد أقصى.
 *
 * بتتحسب في المتصفح: اللعبة مالهاش لوحة أوائل، فمفيش حاجة تتسرق لو حد لعب
 * في الأرقام. لو اتعمل ترتيب عليها يومًا، الحساب لازم ينقل للسيرفر.
 */
export const GAME_POINTS = { correct: 100, speedMax: 100, comboStep: 0.5, comboMax: 3 } as const;

export function gamePoints(secondsLeft: number, streak: number, secondsPerQuestion = GAME_SECONDS_PER_QUESTION): number {
  const speed = Math.max(0, Math.min(1, secondsLeft / secondsPerQuestion));
  const multiplier = Math.min(GAME_POINTS.comboMax, 1 + Math.max(0, streak - 1) * GAME_POINTS.comboStep);
  return Math.round((GAME_POINTS.correct + GAME_POINTS.speedMax * speed) * multiplier);
}

export const GameQuestionSchema = z.object({
  /** `question_versions.id` — النسخة اللي الطالب شافها في الكويز نفسه. */
  id: z.string(),
  type: z.enum(['mcq_single', 'true_false']),
  stemHtml: z.string(),
  options: z.array(z.object({ id: z.string(), bodyHtml: z.string() })).min(2),
  /** من `facility` — شوف فوق. */
  level: GameLevelSchema,
});
export type GameQuestion = z.infer<typeof GameQuestionSchema>;

export const GameRoundSchema = z.object({
  mode: GameModeSchema,
  level: GameLevelSchema,
  questions: z.array(GameQuestionSchema).max(GAME_MAX_QUESTIONS),
  /** كام سؤال في البنك اللي اتسحب منه (الكورس المختار أو الكل). */
  poolSize: z.number().int().min(0),
});
export type GameRound = z.infer<typeof GameRoundSchema>;

export const GameAnswerRequestSchema = z.object({
  questionId: z.uuid(),
  /** `null` لما الوقت يخلص من غير إجابة — بيرجّع الصح برضه. */
  optionId: z.uuid().nullable(),
});
export type GameAnswerRequest = z.infer<typeof GameAnswerRequestSchema>;

export const GameAnswerResultSchema = z.object({
  correct: z.boolean(),
  rightOptionIds: z.array(z.string()),
});
export type GameAnswerResult = z.infer<typeof GameAnswerResultSchema>;

export const GameRoundQuerySchema = z.object({
  mode: GameModeSchema.default('race'),
  level: GameLevelSchema.default('medium'),
  /** فاضي = كل الكورسات. */
  courseId: z.uuid().optional(),
});
export type GameRoundQuery = z.infer<typeof GameRoundQuerySchema>;

/** صفحة الألعاب: الكورسات اللي فيها أسئلة، وكام سؤال في كل مستوى. */
export const GameHubSchema = z.object({
  total: z.number().int().min(0),
  courses: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      counts: z.object({ easy: z.number().int(), medium: z.number().int(), hard: z.number().int() }),
    }),
  ),
});
export type GameHub = z.infer<typeof GameHubSchema>;

export const GameLifelineRequestSchema = z.object({
  questionId: z.uuid(),
  kind: z.enum(['fifty', 'audience']),
});
export type GameLifelineRequest = z.infer<typeof GameLifelineRequestSchema>;

export const GameLifelineResultSchema = z.object({
  /** «حذف إجابتين» — اختيارين غلط يختفوا. */
  removeOptionIds: z.array(z.string()),
  /** «اسأل الجمهور» — نسب بتجمع ١٠٠. */
  votes: z.array(z.object({ optionId: z.string(), percent: z.number().int().min(0).max(100) })),
});
export type GameLifelineResult = z.infer<typeof GameLifelineResultSchema>;
