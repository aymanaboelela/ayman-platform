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
});

export type GuardianView = z.infer<typeof GuardianViewSchema>;
