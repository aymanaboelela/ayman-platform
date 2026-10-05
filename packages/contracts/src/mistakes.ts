import { z } from '@ayman/contracts/zod';

/**
 * «دفتر غلطاتي» — كل سؤال غلط فيه الطالب في أي كويز حقيقي (درس أو امتحان
 * شهر)، في مكان واحد، وبيديله يعيد الاختبار عليه لحد ما يثبّته.
 *
 * ## مفيش «احذف من الدفتر» — بس «اتصلحت»
 *
 * السؤال بيتحرك من «غلطاتي» لـ«اللي صلّحتها» لما يجاوبه صح مرتين متتاليتين
 * هنا في الدفتر (`MASTERY_STREAK`) — مش بمجرد إجابة واحدة، ومش بالحذف. ولو
 * غلط فيه تاني في أي كويز حقيقي بعد كده، بيرجع «غلطاتي» لوحده من غير أي
 * فعل من حد. اللي «صلّحها» تفضل متاحة يعيد الاختبار عليها برضه — الدفتر
 * بيوّريها كمجموعة تانية، مش بيمسحها.
 *
 * ## v1: أسئلة اختيارية بس
 *
 * مقالي (`essay`) و«جاوب بكلمة» (`short_answer`) مش في الدفتر — الأول محتاج
 * تصحيح آدمي كل مرة (مش «جاوب وشوف على طول») والتاني محتاج إدخال نص مش
 * زرار. `mcq_single` و`mcq_multi` و`true_false` بس.
 */

/** صح مرتين متتاليتين في الدفتر = «اتصلحت». غلطة واحدة (هنا أو في كويز
 *  حقيقي) بترجّع العداد صفر. */
export const MISTAKE_MASTERY_STREAK = 2;

export const MistakeQuestionTypeSchema = z.enum(['mcq_single', 'mcq_multi', 'true_false']);

export const MistakeOptionSchema = z.object({ id: z.string(), bodyHtml: z.string() });

export const MistakeEntrySchema = z.object({
  /** `question_versions.id` — نفس السؤال اللي الطالب شافه في الكويز الأصلي. */
  questionVersionId: z.uuid(),
  type: MistakeQuestionTypeSchema,
  stemHtml: z.string(),
  options: z.array(MistakeOptionSchema).min(2),
  courseTitle: z.string().nullable(),
  courseSlug: z.string().nullable(),
  lessonTitle: z.string().nullable(),
  /** آخر مرة غلط فيها في كويز حقيقي. */
  missedAt: z.string(),
  /** كام مرة غلط في السؤال ده لحد دلوقتي — في كويز حقيقي أو في الدفتر. */
  timesMissed: z.number().int().min(1),
  /** صح متتالي هنا في الدفتر دلوقتي (0 قبل أول محاولة). */
  streakRight: z.number().int().min(0),
  /**
   * آخر مرة اتجاوب فيها كانت فين: كويز حقيقي، «تحدّي الأسئلة»، ولا «ساحة
   * التحدي». غلطات اللعب بتدخل الدفتر هي كمان — شوف `MistakesService.latestMissed`.
   */
  source: z.enum(['quiz', 'game', 'arena']).default('quiz'),
});
export type MistakeEntry = z.infer<typeof MistakeEntrySchema>;

export const MistakeNotebookSchema = z.object({
  /** لسه محتاجة مراجعة. */
  open: z.array(MistakeEntrySchema),
  /** «اتصلحت» — صح مرتين متتاليتين، لسه متاحة تتعاد. */
  mastered: z.array(MistakeEntrySchema),
});
export type MistakeNotebook = z.infer<typeof MistakeNotebookSchema>;

export const MistakeAnswerRequestSchema = z.object({
  optionIds: z.array(z.uuid()).min(1),
});
export type MistakeAnswerRequest = z.infer<typeof MistakeAnswerRequestSchema>;

export const MistakeAnswerResultSchema = z.object({
  correct: z.boolean(),
  rightOptionIds: z.array(z.uuid()),
  streakRight: z.number().int().min(0),
  /** الصح ده خلّاها «تتصلح» دلوقتي (وصلت لـ`MISTAKE_MASTERY_STREAK`). */
  mastered: z.boolean(),
});
export type MistakeAnswerResult = z.infer<typeof MistakeAnswerResultSchema>;
