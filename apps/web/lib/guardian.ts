import { z } from '@ayman/contracts/zod';
import { DashboardSchema } from '@ayman/contracts';

/**
 * رد `/api/guardian/me`.
 *
 * `dashboard` هو **نفس** عقد داشبورد الطالب بالحرف — مش نسخة. الأب والابن
 * بيقروا من نفس الحساب، فعقد تاني كان هيسمح للاتنين يختلفوا من غير ما
 * التايب‌سكريبت يزعّق.
 */
export const GuardianViewSchema = z.object({
  student: z.object({ name: z.string(), year: z.number().int().nullable() }),
  dashboard: DashboardSchema,
  report: z.object({
    homework: z.object({
      submitted: z.number().int(),
      accepted: z.number().int(),
      needsWork: z.number().int(),
      /** المقام — «سلّم ٣ من ٥». من غيره الرقم مالوش معنى قدام أب. */
      published: z.number().int(),
    }),
    quizzes: z.object({
      sat: z.number().int(),
      passed: z.number().int(),
      failed: z.number().int(),
      /** `null` قبل أول امتحان — مش صفر. صفر بيقرا «امتحن وجاب صفر». */
      averagePercent: z.number().nullable(),
    }),
    papers: z.array(
      z.object({
        attemptId: z.string(),
        title: z.string(),
        courseTitle: z.string(),
        scorePercent: z.number(),
        passed: z.boolean(),
        submittedAt: z.iso.datetime(),
      }),
    ),
  }),
});

export type GuardianView = z.infer<typeof GuardianViewSchema>;
