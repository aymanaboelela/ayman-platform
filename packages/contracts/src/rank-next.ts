import { z } from '@ayman/contracts/zod';
import { ExamPhaseSchema } from '@ayman/contracts/quiz/scheduled';

/**
 * «الطريق لفوق» — `GET /api/me/rank/next`: الحاجات اللي ناقصة الطالب، كل واحدة
 * بباب بيفتح.
 *
 * الكروت التلاتة في `/rank` كانت بتشرح النقط وبس («٤٠ نقطة على التسليم…»)
 * وماكانتش بتودّي حتة. والطلب بالنص: «هنا يضغط على الحاجات اللي ناقصاه توديه
 * ليها». فالرد ده هو اللي ناقص تحت كل كارت، صف صف، وكل صف رابط.
 *
 * ## كل صف هنا اتفتح فعلًا
 *
 * السيرفر بيعدّي كل محاضرة على `LessonAccessService.require` نفسه — نفس
 * البوابة اللي صفحة المحاضرة والكويز والواجب بيقفلوا بيها — قبل ما يحطها هنا.
 * فمفيش صف بيودّي على قفل أو «الصفحة مش موجودة». اللي البوابة قفلته بسبب
 * اشتراك (شهر تاني، ترم تاني، اشتراك خلص، كود محاضرة واحدة) مابيطلعش كصف،
 * وبيتعدّ في `locked` بباب واحد للاشتراك.
 *
 * ## ملف لوحده، مش جوّه `rank.ts`
 *
 * موديول اتشحن في بيلد قديم مايكسبش exports جديدة: تابة من البيلد اللي فات
 * بتقراها `undefined` (`turbopack-module-ids-outlive-a-deploy`). ملف جديد
 * مالوش id قديم يتلخبط.
 */

/** أقصى عدد صفوف بيتبعت في كل كارت. الباقي رقم في `total`. */
export const RANK_NEXT_MAX_ITEMS = 20;

const StepCourseSchema = z.object({
  courseSlug: z.string(),
  courseTitle: z.string(),
});

/**
 * واجب لسه ماتسلّمش.
 *
 * `new` = عمره ما اتسلّم. `needs_work` = اتسلّم والمدرّس رجّعه يتعمل تاني —
 * ودي لسه ناقصها لحد ٦٠ نقطة، فمكانها هنا مش في «اتسلّم».
 */
export const RankNextHomeworkSchema = StepCourseSchema.extend({
  lessonId: z.uuid(),
  lessonTitle: z.string(),
  status: z.enum(['new', 'needs_work']),
});
export type RankNextHomework = z.infer<typeof RankNextHomeworkSchema>;

/**
 * حالة كويز من ناحية «أقدر أعمل فيه إيه دلوقتي»:
 *
 * - `resume`   — فيه محاولة مفتوحة، كمّلها.
 * - `new`      — عمره ما اتحل.
 * - `retake`   — اتحل تحت ١٠٠٪ وفيه محاولة تانية (تحسين، أو محاولة زيادة
 *                من الأدمن).
 * - `upcoming` — ليه ميعاد ولسه مافتحش.
 * - `grading`  — اتحل، وفيه مقالي لسه بيتصحح؛ الدرجة مش نهائية.
 * - `spent`    — اتحل تحت ١٠٠٪ ومفيش محاولة تانية، أو الميعاد قفل.
 *
 * الترتيب ده هو ترتيب الصفوف: اللي يتعمل دلوقتي الأول.
 */
export const RANK_NEXT_QUIZ_STATES = ['resume', 'new', 'retake', 'upcoming', 'grading', 'spent'] as const;
export const RankNextQuizStateSchema = z.enum(RANK_NEXT_QUIZ_STATES);
export type RankNextQuizState = (typeof RANK_NEXT_QUIZ_STATES)[number];

export const RankNextQuizSchema = StepCourseSchema.extend({
  /** الباب: `/quizzes/:lessonId` — بيشتغل كمان للكويز المتعلّق على محاضرة فيديو. */
  lessonId: z.uuid(),
  title: z.string(),
  state: RankNextQuizStateSchema,
  /**
   * أحسن درجة بالمية، بنفس حساب النقط في `CohortRankService` (الدرجة ÷ الدرجة
   * الكلية لكل محاولة، وأعلاهم). `null` لو ماتحلّش — مش صفر: صفر بيقول للطالب
   * إنه سقط في حاجة ماحلّهاش.
   */
  bestPercent: z.number().min(0).max(100).nullable(),
});
export type RankNextQuiz = z.infer<typeof RankNextQuizSchema>;

/** امتحان نص الشهر (رف «امتحانات الشهر») زي ما الطالب بيشوفه هنا. */
export const RankNextExamSchema = StepCourseSchema.extend({
  lessonId: z.uuid(),
  title: z.string(),
  /** نفس `examPhase` اللي الداشبورد والسيرفر بيقفلوا بيها. */
  phase: ExamPhaseSchema,
  openFrom: z.iso.datetime().nullable(),
  openUntil: z.iso.datetime().nullable(),
  /** نفس معنى `RankNextQuizSchema.state`، بس على امتحان. */
  state: RankNextQuizStateSchema,
  bestPercent: z.number().min(0).max(100).nullable(),
});
export type RankNextExam = z.infer<typeof RankNextExamSchema>;

/**
 * اللي البوابة قفلته بسبب اشتراك — عدد، وكورس واحد يودّي على بابه
 * (`/library/:slug`، اللي فيه كارت الشهر والاشتراك). `null` لو مفيش.
 */
export const RankNextLockedSchema = z
  .object({ count: z.number().int().min(1), courseSlug: z.string() })
  .nullable();

export const RankNextStepsSchema = z.object({
  /** `null` على ستاك الواجبات فيه مقفولة — الكارت بيرجع شرح بس زي الأول. */
  homework: z
    .object({
      items: z.array(RankNextHomeworkSchema).max(RANK_NEXT_MAX_ITEMS),
      /** كل الواجبات الناقصة اللي الطالب يقدر يفتحها، مش بس اللي اتبعتت. */
      total: z.number().int().min(0),
      locked: RankNextLockedSchema,
    })
    .nullable(),
  quizzes: z.object({
    items: z.array(RankNextQuizSchema).max(RANK_NEXT_MAX_ITEMS),
    total: z.number().int().min(0),
    /** منهم كام يتحل دلوقتي (`resume` + `new` + `retake`) — رقم الشريط. */
    actionable: z.number().int().min(0),
    locked: RankNextLockedSchema,
  }),
  /** `null` على ستاك امتحانات الشهر فيه مقفولة. */
  exams: z
    .object({
      /** الامتحان اللي جاي: المفتوح اللي لسه يتحل، وإلا أقرب واحد لسه مافتحش. */
      next: RankNextExamSchema.nullable(),
      /** آخر امتحان اتحل — «نتيجتك». */
      last: RankNextExamSchema.nullable(),
    })
    .nullable(),
});
export type RankNextSteps = z.infer<typeof RankNextStepsSchema>;
