import { z } from '@ayman/contracts/zod';
import { ListQuerySchema, listResponse } from '@ayman/contracts/admin/list';
import { UnlockCourseRefSchema, UnlockTargetKindSchema } from '@ayman/contracts/unlock-codes';

/**
 * «أكواد الفتح» — the admin's half: pick a course, pick what inside it, get a
 * six-character code to send the student on WhatsApp; see who used which code
 * and pull what it opened at any time.
 */

/** A piece of a course a code can open. `course` is not here — «الكورس كله»
 *  is `wholeCourse`, a flag, not an item. */
export const UnlockItemKindSchema = z.enum(['term', 'month', 'section', 'lesson']);
export type UnlockItemKind = z.infer<typeof UnlockItemKindSchema>;

export const AdminUnlockItemInputSchema = z
  .object({ kind: UnlockItemKindSchema, id: z.uuid() })
  .strict();

/**
 * One press of «اعمل الكود».
 *
 * `quantity` is for the admin who sells the same lecture to five students at
 * once: five codes, each single-use, each for the same content. Capped at 50 —
 * past that it is a printing job, not a WhatsApp message.
 */
export const AdminUnlockCodeCreateSchema = z
  .object({
    courseId: z.uuid(),
    wholeCourse: z.boolean().default(false),
    items: z.array(AdminUnlockItemInputSchema).max(300).default([]),
    quantity: z.number().int().min(1).max(50).default(1),
    /** Piastres the student paid, for the list. A record, never a charge. */
    priceCents: z.number().int().min(0).max(100_000_000).nullable().default(null),
    note: z.string().trim().max(500).nullable().default(null),
  })
  .strict()
  .refine((value) => value.wholeCourse || value.items.length > 0, {
    message: 'اختار الكود يفتح إيه',
    path: ['items'],
  });
export type AdminUnlockCodeCreateInput = z.infer<typeof AdminUnlockCodeCreateSchema>;

export const UnlockCodeStatusSchema = z.enum(['unused', 'used', 'revoked']);
export type UnlockCodeStatus = z.infer<typeof UnlockCodeStatusSchema>;

export const AdminUnlockCodeItemSchema = z.object({
  kind: UnlockTargetKindSchema,
  id: z.uuid(),
  title: z.string(),
  /** The unit a lecture sits in, so «المحاضرة ٣» is readable in a list of
   *  codes from ten units. `null` for everything but a lecture. */
  parentTitle: z.string().nullable(),
});
export type AdminUnlockCodeItem = z.infer<typeof AdminUnlockCodeItemSchema>;

export const AdminUnlockCodeRowSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  course: UnlockCourseRefSchema,
  wholeCourse: z.boolean(),
  items: z.array(AdminUnlockCodeItemSchema),
  priceCents: z.number().int().nullable(),
  note: z.string().nullable(),
  status: UnlockCodeStatusSchema,
  createdAt: z.iso.datetime(),
  createdBy: z.object({ id: z.string(), name: z.string() }).nullable(),
  redeemedAt: z.iso.datetime().nullable(),
  /** `null` on an unused code — and on a used one whose student account was
   *  since deleted (the FK sets it null; `redeemedAt` stays). */
  redeemedBy: z
    .object({ id: z.string(), name: z.string(), phone: z.string().nullable() })
    .nullable(),
  revokedAt: z.iso.datetime().nullable(),
});
export type AdminUnlockCodeRow = z.infer<typeof AdminUnlockCodeRowSchema>;

export const AdminUnlockCodeListSchema = listResponse(AdminUnlockCodeRowSchema).extend({
  /** Over the whole table, not the page — the three tiles above the list. */
  counts: z.object({
    unused: z.number().int(),
    used: z.number().int(),
    revoked: z.number().int(),
  }),
});
export type AdminUnlockCodeList = z.infer<typeof AdminUnlockCodeListSchema>;

export const AdminUnlockCodeQuerySchema = ListQuerySchema.extend({
  status: z.enum(['all', 'unused', 'used', 'revoked']).default('all'),
  courseId: z.uuid().optional(),
}).omit({ dir: true });
export type AdminUnlockCodeQuery = z.infer<typeof AdminUnlockCodeQuerySchema>;

export const AdminUnlockCodeCreateResponseSchema = z.object({
  codes: z.array(AdminUnlockCodeRowSchema),
});
export type AdminUnlockCodeCreateResponse = z.infer<typeof AdminUnlockCodeCreateResponseSchema>;

/** The course dropdown. Drafts are listed (an admin may pre-sell) but marked. */
export const AdminUnlockCourseOptionSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  slug: z.string(),
  published: z.boolean(),
});
export const AdminUnlockCourseOptionsSchema = z.object({
  items: z.array(AdminUnlockCourseOptionSchema),
});
export type AdminUnlockCourseOption = z.infer<typeof AdminUnlockCourseOptionSchema>;

/**
 * The picker's tree for one course: terms and months to pick whole, units to
 * pick whole, and every lecture inside each unit to pick one by one.
 */
export const AdminUnlockLessonNodeSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  kind: z.enum(['video', 'quiz', 'attachment', 'text']),
  published: z.boolean(),
  hasQuiz: z.boolean(),
  hasHomework: z.boolean(),
});
export const AdminUnlockSectionNodeSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  published: z.boolean(),
  termId: z.uuid().nullable(),
  lessons: z.array(AdminUnlockLessonNodeSchema),
});
export const AdminUnlockCourseTreeSchema = z.object({
  course: UnlockCourseRefSchema,
  terms: z.array(z.object({ id: z.uuid(), title: z.string() })),
  months: z.array(z.object({ id: z.uuid(), title: z.string(), lessonCount: z.number().int() })),
  sections: z.array(AdminUnlockSectionNodeSchema),
});
export type AdminUnlockCourseTree = z.infer<typeof AdminUnlockCourseTreeSchema>;
export type AdminUnlockSectionNode = z.infer<typeof AdminUnlockSectionNodeSchema>;
export type AdminUnlockLessonNode = z.infer<typeof AdminUnlockLessonNodeSchema>;
