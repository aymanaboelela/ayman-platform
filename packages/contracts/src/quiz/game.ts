import { z } from '@ayman/contracts/zod';

/**
 * «تحدّي الأسئلة» — `GET /api/me/game/round` و`POST /api/me/game/answer`.
 *
 * ## الأسئلة منين، ولیه من هنا بس
 *
 * من الكويزات والامتحانات اللي الطالب **سلّمها**، وبس الأسئلة اللي صفحة
 * المراجعة بتاعتها مسموح لها دلوقتي تقوله الإجابة الصح (`rightAnswer` في
 * `reviewOptions` للوقت ده). يعني اللعبة مابتوريش أي حاجة ماكانش الطالب يقدر
 * يشوفها بدوسة على «مراجعة».
 *
 * «كل بنك الكورس» كان أكتر أسئلة وأمتع، واترفض عن قصد: امتحان الشهر وامتحان
 * الكورس بيسحبوا من نفس البنك، فلعبة بتصحّح أسئلته كانت هتبقى حل نموذجي
 * للامتحان قبل ما يتعمل. ونفس السبب اللي خلّى وضع `practice` يتشال من الكويز
 * (`quiz-settings.ts`).
 *
 * ## الإجابة الصح مابتسافرش مع السؤال
 *
 * الجولة فيها الأسئلة والاختيارات من غير `fraction` ولا أي علامة؛ التصحيح في
 * السيرفر سؤال سؤال. والجولة نفسها `@NoAnswerLeak()`.
 *
 * مفيش imports نسبية هنا — نفس سبب `quiz/history.ts`.
 */

/** أسئلة الجولة الواحدة. */
export const GAME_ROUND_SIZE = 10;
/** ثواني كل سؤال. */
export const GAME_SECONDS_PER_QUESTION = 20;
/** القلوب — تلات غلطات والجولة بتخلص. */
export const GAME_LIVES = 3;

/**
 * النقط: ١٠٠ للإجابة الصح، ولحد ١٠٠ كمان على السرعة (بتقل خطي مع الوقت)،
 * والكل مضروب في الكومبو: ×1 ← ×1.5 ← ×2 ← ×2.5 ← ×3 بحد أقصى.
 *
 * بتتحسب في المتصفح: اللعبة مالهاش لوحة أوائل، فمفيش حاجة تتسرق لو حد لعب
 * في الأرقام. لو اتعمل ترتيب عليها يومًا، الحساب لازم ينقل للسيرفر.
 */
export const GAME_POINTS = { correct: 100, speedMax: 100, comboStep: 0.5, comboMax: 3 } as const;

export function gamePoints(secondsLeft: number, streak: number): number {
  const speed = Math.max(0, Math.min(1, secondsLeft / GAME_SECONDS_PER_QUESTION));
  const multiplier = Math.min(GAME_POINTS.comboMax, 1 + Math.max(0, streak - 1) * GAME_POINTS.comboStep);
  return Math.round((GAME_POINTS.correct + GAME_POINTS.speedMax * speed) * multiplier);
}

export const GameQuestionSchema = z.object({
  /** `question_versions.id` — النسخة اللي الطالب شافها في الكويز نفسه. */
  id: z.string(),
  type: z.enum(['mcq_single', 'true_false']),
  stemHtml: z.string(),
  options: z.array(z.object({ id: z.string(), bodyHtml: z.string() })).min(2),
});
export type GameQuestion = z.infer<typeof GameQuestionSchema>;

export const GameRoundSchema = z.object({
  questions: z.array(GameQuestionSchema).max(GAME_ROUND_SIZE),
  /** كام سؤال في البنك بتاعه كله — «٤٣ سؤال جاهزين للتحدّي». */
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
