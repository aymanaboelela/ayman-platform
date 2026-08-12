import { z } from "zod";

/**
 * A local copy of `onboarding.ts`'s `GenderSchema` — deliberately NOT a
 * relative import to a sibling contracts leaf (newly-discovered H3 variant,
 * distinct from the "missing subpath export" shape hit four times before:
 * `admin/students` already HAS its subpath export, but Node's native ESM
 * loader still cannot resolve `../onboarding`'s own extensionless specifier
 * once it is reached at real runtime via `dist/main.js` — confirmed by
 * actually booting it, per the standing hazard doc's instruction).
 * `player.service.ts` documents the same rule from the apps/api side: a
 * runtime value must come from one leaf's own subpath export, never by
 * hopping through another leaf's relative import. Keep this in sync with
 * `onboarding.ts`'s `GenderSchema` if that enum ever changes.
 */
const GenderSchema = z.enum(["male", "female"]);

/** Same local-copy rule as `GenderSchema` above — keep in sync with
 *  `onboarding.ts`'s `SchoolStreamSchema`. */
const SchoolStreamSchema = z.enum(["general", "languages"]);

export const AdminStudentRowSchema = z.object({
  /** The table's row id — MUST be present and stable (getRowId). */
  id: z.string(),
  fullName: z.string(),
  email: z.string(),
  phone: z.string(),
  gender: GenderSchema,
  governorateCode: z.string().length(2),
  governorateNameAr: z.string(),
  systemSlug: z.string().nullable(),
  year: z.number().int().nullable(),
  trackLabelAr: z.string().nullable(),
  onboardingCompleted: z.boolean(),
  createdAt: z.string(),
});

export type AdminStudentRow = z.infer<typeof AdminStudentRowSchema>;

export const AdminStudentDetailSchema = AdminStudentRowSchema.extend({
  role: z.string(),
  schoolName: z.string().nullable(),
  /** Null for every profile onboarded before the question existed — «مش متسجّل»
   *  rather than a guess. Required for everyone who onboards from now on. */
  schoolStream: SchoolStreamSchema.nullable(),
  fatherPhone: z.string().nullable(),
  /** No longer collected; still shown, because the students who gave one
   *  before the form stopped asking are the reason it is worth showing. */
  motherPhone: z.string().nullable(),
  electiveSubjectNameAr: z.string().nullable(),
});

export type AdminStudentDetail = z.infer<typeof AdminStudentDetailSchema>;

/**
 * A4: the admin-writable field set, and nothing else. `role` is ABSENT on
 * purpose — it has its own endpoint, so a role escalation can never ride
 * along inside a routine profile correction, and its audit entry is
 * unambiguous. `.strict()` makes an unknown key a 400 rather than a silent
 * drop.
 */
export const AdminStudentPatchSchema = z
  .object({
    fullName: z.string().min(2).max(120).optional(),
    schoolName: z.string().max(160).nullable().optional(),
    governorateCode: z.string().length(2).optional(),
    year: z.number().int().min(1).max(3).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "no fields to update",
  });

export type AdminStudentPatch = z.infer<typeof AdminStudentPatchSchema>;

export const AdminRoleChangeSchema = z
  .object({
    role: z.enum(["admin", "student"]),
    /** Forces the operator to say why; it lands in the audit metadata. */
    reason: z.string().min(8).max(500),
  })
  .strict();

export type AdminRoleChange = z.infer<typeof AdminRoleChangeSchema>;

export const STUDENT_SORT_COLUMNS = {
  createdAt: "createdAt",
  fullName: "fullName",
  governorate: "governorateCode",
} as const;

export const STUDENT_LIST_QUERY_SORT_KEYS = Object.keys(
  STUDENT_SORT_COLUMNS,
) as Array<keyof typeof STUDENT_SORT_COLUMNS>;

/**
 * Express (and therefore Nest's `@Query()`) collapses a repeated query key to
 * a single string when exactly one value was sent — `?governorate=11` parses
 * as `"11"`, not `["11"]`. Reading `req.query` past this preprocessor would
 * silently break the single-filter case. `undefined` (the key absent
 * entirely) becomes `[]`, one value becomes a one-element array, and an
 * already-array value passes through unchanged.
 */
function toArray(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export const StudentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(120).default(""),
  governorate: z.preprocess(toArray, z.array(z.string().length(2))).default([]),
  year: z.preprocess(toArray, z.array(z.coerce.number().int())).default([]),
  track: z.preprocess(toArray, z.array(z.string())).default([]),
  sort: z.enum(["createdAt", "fullName", "governorate"]).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

export type StudentListQuery = z.infer<typeof StudentListQuerySchema>;

/**
 * Opening a closed course for one student — the key to the lock
 * `Course.requiresGrant` puts on it.
 *
 * A grant, not a flag on the enrollment: `EntitlementService` reads scopes and
 * validity windows, so "this student may open this course" is a row with a
 * source and an audit trail, and revoking it is a timestamp rather than a
 * delete. That is the whole reason `AccessGrant` exists (§6.6).
 *
 * `validUntil` is optional and nullable: most grants are open-ended, and a
 * dated one is how a term's access expires by itself instead of by somebody
 * remembering.
 */
export const AdminGrantCreateSchema = z
  .object({
    courseId: z.uuid(),
    /** `null` — the default — means it does not expire. */
    validUntil: z.iso.datetime().nullable().default(null),
    /** Free text for the audit trail: «دفع كاش», «منحة», «تعويض عن عطل». */
    note: z.string().max(500).nullable().default(null),
  })
  .strict();

export type AdminGrantCreate = z.infer<typeof AdminGrantCreateSchema>;

export const AdminGrantRowSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  courseTitle: z.string(),
  source: z.string(),
  validFrom: z.iso.datetime(),
  validUntil: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  note: z.string().nullable(),
});

export type AdminGrantRow = z.infer<typeof AdminGrantRowSchema>;
