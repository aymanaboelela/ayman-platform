import { z } from '@ayman/contracts/zod';

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
const GenderSchema = z.enum(['male', 'female']);

/** Same local-copy rule as `GenderSchema` above — keep in sync with
 *  `onboarding.ts`'s `SchoolStreamSchema`. */
const SchoolStreamSchema = z.enum(['general', 'languages']);

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
  /**
   * ISO timestamp when this account was banned, or null. On the ROW and not
   * only the detail, because the one thing an admin scanning the list needs to
   * see without clicking is which accounts are locked out — a banned student
   * who looks identical to every other row is how someone gets told "your
   * account works fine" over WhatsApp.
   */
  bannedAt: z.string().nullable(),
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
  /** Why they were banned, as typed by the admin. Null when unbanned, and also
   *  null for a ban issued with no reason recorded. */
  bannedReason: z.string().nullable(),
  /** The admin who issued it, by name. Null if that admin's account has since
   *  been deleted — the ban survives its issuer (`ON DELETE SET NULL`). */
  bannedByName: z.string().nullable(),
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
  .refine((value) => Object.keys(value).length > 0, { message: 'no fields to update' });

export type AdminStudentPatch = z.infer<typeof AdminStudentPatchSchema>;

export const AdminRoleChangeSchema = z
  .object({
    role: z.enum(['admin', 'student']),
    /** Forces the operator to say why; it lands in the audit metadata. */
    reason: z.string().min(8).max(500),
  })
  .strict();

export type AdminRoleChange = z.infer<typeof AdminRoleChangeSchema>;

/**
 * حظر — locking an account out without destroying it.
 *
 * `reason` is required and has the same `min(8)` floor as a role change, for
 * the same reason: the field exists so that the admin reading the audit log in
 * three months can tell a disciplinary ban from a mistake, and «ban» or «.» in
 * a free-text box tells them nothing. It is ALSO shown to the student on the
 * sign-in screen, which is the second reason it cannot be optional — an
 * account that stops working with no explanation generates a support message
 * every time.
 */
export const AdminStudentBanSchema = z
  .object({
    reason: z.string().min(8).max(500),
  })
  .strict();

export type AdminStudentBan = z.infer<typeof AdminStudentBanSchema>;

/**
 * مسح — irreversible.
 *
 * `confirmEmail` is not belt-and-braces, it is the whole safety mechanism.
 * Every other destructive call in this admin takes an id from a URL, and an id
 * is unreadable: an admin who clicks delete on the wrong table row has no
 * chance of noticing before it happens. Requiring them to type the account's
 * own email means the confirmation step carries information about WHICH
 * account, which a yes/no dialog does not.
 *
 * The server compares it against the record it is about to delete and refuses
 * on a mismatch, so this holds even if the UI is bypassed entirely.
 */
export const AdminStudentDeleteSchema = z
  .object({
    confirmEmail: z.string().min(3).max(320),
    reason: z.string().min(8).max(500),
  })
  .strict();

export type AdminStudentDelete = z.infer<typeof AdminStudentDeleteSchema>;

/**
 * What a refused delete tells the admin.
 *
 * A student can always be deleted; an account that has AUTHORED something
 * cannot, because `courses.instructor_id`, `question_bank_entries`,
 * `question_versions` and `news_posts` all point at `users` with
 * `ON DELETE RESTRICT`. Deleting through that would either fail with a raw
 * constraint violation (a 500 the admin cannot act on) or, had those been
 * cascades, silently destroy published teaching content.
 *
 * So the service checks first and returns this instead — naming what is in the
 * way and how many, so the answer is «اتصرف في الكورسات الأول» rather than
 * «حصلت مشكلة».
 */
export const AdminStudentDeleteBlockerSchema = z.object({
  courses: z.number().int(),
  questionBankEntries: z.number().int(),
  questionVersions: z.number().int(),
  newsPosts: z.number().int(),
});

export type AdminStudentDeleteBlocker = z.infer<typeof AdminStudentDeleteBlockerSchema>;

/**
 * مسح مجموعة — the same irreversible operation, from the list screen.
 *
 * ## Why this is not `AdminStudentDeleteSchema` in a loop
 *
 * `confirmEmail` cannot survive the trip to a bulk call. The single delete asks
 * the admin to TYPE the address because that is the only step in the flow that
 * carries information about which account; a bulk request whose body repeated
 * twenty addresses the client already had on screen would be the client
 * confirming to itself — a check that passes by construction, which is worse
 * than no check because it still reads like one.
 *
 * So the confirmation moves to where it can still mean something: the dialog
 * lists every account by name and email and makes the admin type a fixed
 * phrase, and this schema asks only for the ids and the audit reason. What the
 * server enforces instead is the cap — a hundred at a time, because each id
 * costs a blocker count and a delete, and an unbounded list is a
 * request-timeout-shaped hole in an endpoint that deletes people.
 *
 * `.min(1)`: an empty array is a request that means nothing, and answering it
 * with a cheerful `{ deleted: [] }` hides a client bug that is about to be
 * reported as "the button does nothing".
 */
export const AdminStudentBulkDeleteSchema = z
  .object({
    /*
     * ⚠️ `z.string()`, NOT `z.uuid()` — the same type `AdminStudentRowSchema.id`
     * carries, and for the same reason.
     *
     * A user id here comes from better-auth, which mints a 32-character nanoid
     * (`9vrJB5pO088EPb4hDZnMajJtPy48GIjL`), not a UUID. Only the seeded and e2e
     * accounts have UUID ids, because those rows are written by hand. A
     * `z.uuid()` on this field therefore validates cleanly against every
     * fixture, passes every test written from one, and then rejects with a bare
     * 400 the moment an admin selects a student who signed up through the
     * actual registration form — which is all of them.
     */
    userIds: z.array(z.string().min(1).max(64)).min(1).max(100),
    reason: z.string().min(8).max(500),
  })
  .strict();

export type AdminStudentBulkDelete = z.infer<typeof AdminStudentBulkDeleteSchema>;

/**
 * Why ONE account in a bulk delete could not be deleted.
 *
 * A code, not a sentence: Global Constraint 4 keeps user-facing text out of the
 * API, and the admin UI already owns the Arabic for each of these — the single
 * delete renders the same four refusals from its own copy table.
 */
export const STUDENT_BULK_DELETE_FAILURES = [
  'self',
  'last-admin',
  'authored-content',
  'not-found',
] as const;

export const AdminStudentBulkDeleteFailureSchema = z.object({
  /** A better-auth nanoid for real accounts, a UUID for seeded ones. */
  userId: z.string(),
  /** Empty for `not-found` — there is no row left to read a name from. */
  name: z.string(),
  reason: z.enum(STUDENT_BULK_DELETE_FAILURES),
});

/**
 * Partial success is the NORMAL outcome, not an error case.
 *
 * Twenty selected rows where one turns out to own a course must not fail all
 * twenty — the admin would have no way to make progress except to unpick the
 * selection by hand, one delete at a time, to find the one that is stuck. Each
 * account is attempted on its own and reported on its own, and the UI keeps
 * exactly the failed rows selected so the next action is obvious.
 */
export const AdminStudentBulkDeleteResultSchema = z.object({
  deleted: z.array(z.string()),
  failed: z.array(AdminStudentBulkDeleteFailureSchema),
});

export type AdminStudentBulkDeleteResult = z.infer<typeof AdminStudentBulkDeleteResultSchema>;
export type AdminStudentBulkDeleteFailure = z.infer<typeof AdminStudentBulkDeleteFailureSchema>;

export const STUDENT_SORT_COLUMNS = {
  createdAt: 'createdAt',
  fullName: 'fullName',
  governorate: 'governorateCode',
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
  q: z.string().max(120).default(''),
  governorate: z.preprocess(toArray, z.array(z.string().length(2))).default([]),
  year: z.preprocess(toArray, z.array(z.coerce.number().int())).default([]),
  track: z.preprocess(toArray, z.array(z.string())).default([]),
  sort: z.enum(['createdAt', 'fullName', 'governorate']).default('createdAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
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
