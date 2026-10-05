import { z } from '@ayman/contracts/zod';

/**
 * «أسئلة كتب خارجية» — `/api/admin/external-books/*`.
 *
 * كتاب (كتاب الوزارة، كتاب امتحانات خاص) ← وحدة ← درس — شجرة تلات مستويات،
 * بنفس فكرة «أسئلة الألعاب» بالظبط (`quiz/game.ts`): تصنيف في بنك الأسئلة
 * الموجود، مش جدول علاقة جديد. السؤال نفسه بيتكتب وبيتلصق بالجملة بنفس أدوات
 * البنك (`POST /api/admin/questions` / `/bulk` بـ`categoryId`) — الشاشة دي
 * بس بتعرف أنهي تصنيف بتاع أنهي كتاب/وحدة/درس، وبتعمله أول مرة.
 *
 * السؤال ممكن يتحط على الكتاب نفسه (كل المنهج)، أو على وحدة (كل أسئلتها)، أو
 * على درس واحد — التلاتة تصنيفات حقيقية، فـ`ready` على كل مستوى هو عدّ
 * أسئلته هو بس، مش مجموع اللي تحته.
 */

export const ExternalBookLessonSchema = z.object({
  id: z.string(),
  name: z.string(),
  categoryId: z.string(),
  ready: z.number().int(),
  /**
   * محاضرة الكورس اللي الدرس ده بيغذّي تحدياتها — بالترتيب، مش بالاسم
   * (`apps/api/src/modules/quiz/book-lesson-links.ts`). NULL = الكتاب مش
   * مربوط بكورس، أو الكورس لسه ماوصلش للدرس ده.
   */
  linkedLesson: z.object({ id: z.string(), title: z.string() }).nullable(),
});
export type ExternalBookLesson = z.infer<typeof ExternalBookLessonSchema>;

export const ExternalBookUnitSchema = z.object({
  id: z.string(),
  name: z.string(),
  categoryId: z.string(),
  ready: z.number().int(),
  lessons: z.array(ExternalBookLessonSchema),
});
export type ExternalBookUnit = z.infer<typeof ExternalBookUnitSchema>;

export const ExternalBookRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  coverKey: z.string().nullable(),
  archived: z.boolean(),
  /** «التحديات» — الكورس اللي دروس الكتاب بتتربط بمحاضراته بالترتيب. */
  courseId: z.string().nullable(),
  categoryId: z.string(),
  /** مجموع أسئلة الكتاب نفسه + كل وحداته + كل دروسه. */
  ready: z.number().int(),
  units: z.number().int(),
});
export type ExternalBookRow = z.infer<typeof ExternalBookRowSchema>;

export const ExternalBooksSchema = z.object({ rows: z.array(ExternalBookRowSchema) });
export type ExternalBooks = z.infer<typeof ExternalBooksSchema>;

export const ExternalBookDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  coverKey: z.string().nullable(),
  archived: z.boolean(),
  courseId: z.string().nullable(),
  /** الكورسات اللي ينفع الكتاب يتربط بيها — لاختيار الكورس في الشاشة. */
  courses: z.array(z.object({ id: z.string(), title: z.string() })),
  categoryId: z.string(),
  /** أسئلة الكتاب نفسه — «المنهج كله»، مش جوه أي وحدة. */
  ready: z.number().int(),
  units: z.array(ExternalBookUnitSchema),
});
export type ExternalBookDetail = z.infer<typeof ExternalBookDetailSchema>;

export const CreateExternalBookSchema = z.object({ title: z.string().trim().min(1).max(200) }).strict();
export const UpdateExternalBookSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    archived: z.boolean().optional(),
    /** NULL = فك الربط. */
    courseId: z.uuid().nullable().optional(),
  })
  .strict();

export const CreateExternalBookUnitSchema = z.object({ name: z.string().trim().min(1).max(200) }).strict();
export const CreateExternalBookLessonSchema = z.object({ name: z.string().trim().min(1).max(200) }).strict();
/** تصنيف موجود في البنك بيتنقل درس جوه وحدة — `POST …/units/:unitId/adopt`. */
export const AdoptExternalBookLessonSchema = z.object({ categoryId: z.uuid() }).strict();
export const RenameExternalBookCategorySchema = z.object({ name: z.string().trim().min(1).max(200) }).strict();
