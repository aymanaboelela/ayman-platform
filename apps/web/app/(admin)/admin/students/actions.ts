'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  AdminGrantRowSchema,
  AdminRoleChangeSchema,
  AdminStudentBanSchema,
  AdminStudentBulkDeleteResultSchema,
  AdminStudentBulkDeleteSchema,
  AdminStudentDeleteBlockerSchema,
  AdminStudentDeleteSchema,
  AdminStudentDetailSchema,
  AdminStudentPatchSchema,
  type AdminStudentBulkDeleteResult,
} from '@ayman/contracts/admin/students';
import { formatCopy } from '@ayman/contracts';
import { copy } from '@ayman/contracts/copy/admin';
import { z } from 'zod';
import { AdminApiError, adminSend } from '@/lib/admin-api';

export type ActionResult = { ok: true } | { ok: false; message: string };

function readOptionalText(formData: FormData, key: string): string | null | undefined {
  if (!formData.has(key)) return undefined;
  const value = formData.get(key);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readOptionalYear(formData: FormData): number | null | undefined {
  if (!formData.has('year')) return undefined;
  const raw = formData.get('year');
  if (raw === '' || raw === null) return null;
  return Number(raw);
}

/**
 * Student profile fields only — `role` has no place in this action, let
 * alone its payload (A4). A student PATCHing `{ role: 'admin' }` onto their
 * own row is the realistic attack this separation closes; the API's own DTO
 * (`AdminStudentPatchSchema`, `.strict()`) is the real gate, but this action
 * cannot even construct the wrong shape in the first place.
 */
export async function patchStudentAction(userId: string, formData: FormData): Promise<ActionResult> {
  try {
    const body = AdminStudentPatchSchema.parse({
      fullName: readOptionalText(formData, 'fullName') || undefined,
      schoolName: readOptionalText(formData, 'schoolName'),
      governorateCode: (readOptionalText(formData, 'governorateCode') as string | undefined) || undefined,
      year: readOptionalYear(formData),
    });

    await adminSend('PATCH', `/api/admin/students/${userId}`, body, AdminStudentDetailSchema);
    revalidatePath(`/admin/students/${userId}`);
    revalidatePath('/admin/students');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

const RoleChangeResultSchema = z.object({ role: z.string() });

export async function changeRoleAction(userId: string, formData: FormData): Promise<ActionResult> {
  try {
    const body = AdminRoleChangeSchema.parse({
      role: formData.get('role'),
      reason: formData.get('reason'),
    });

    await adminSend('POST', `/api/admin/students/${userId}/role`, body, RoleChangeResultSchema);
    revalidatePath(`/admin/students/${userId}`);
    revalidatePath('/admin/students');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}


/**
 * Opening one course for one student — the key to a course marked «مقفول».
 *
 * `revalidatePath` on this student's page only. A grant changes what THIS
 * student can open and nothing about the catalog, so evicting anything wider
 * would be a cache eviction with no reader.
 */
export async function grantCourseAction(userId: string, formData: FormData): Promise<ActionResult> {
  try {
    const courseId = String(formData.get('courseId') ?? '');
    if (!courseId) return { ok: false, message: 'no course selected' };

    await adminSend(
      'POST',
      `/api/admin/students/${userId}/grants`,
      {
        courseId,
        // Open-ended and unannotated from this form. The API accepts both, and
        // a date picker plus a note field on a two-control panel would bury the
        // one thing it is for behind paperwork.
        validUntil: null,
        note: null,
      },
      z.array(AdminGrantRowSchema),
    );

    revalidatePath(`/admin/students/${userId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/** Closes it again. The row is stamped `revokedAt`, never deleted — see the service. */
export async function revokeGrantAction(userId: string, grantId: string): Promise<ActionResult> {
  try {
    await adminSend(
      'DELETE',
      `/api/admin/students/${userId}/grants/${grantId}`,
      undefined,
      z.array(AdminGrantRowSchema),
    );
    revalidatePath(`/admin/students/${userId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * حظر ومسح الحساب
 *
 * These three are the first actions in this file that do NOT surface
 * `error.message` to the operator, and that is deliberate. Every action above
 * ends with `error instanceof Error ? error.message : 'unknown'`, which renders
 * an internal route, an HTTP status and a raw JSON body into an Arabic RTL
 * admin screen — the reader learns nothing they can act on. `AdminApiError`
 * now carries the status, so these branch on it and say something true in
 * Arabic instead. The pattern is meant to spread to the actions above.
 * ════════════════════════════════════════════════════════════════════════ */

const c = copy.admin.students;

/**
 * Maps a failed write to copy the operator can act on.
 *
 * `fallback` rather than a shared generic string: «مقدرناش نوقف الحساب» and
 * «مقدرناش نمسح الحساب» are different sentences and the reader is in a
 * different dialog, so each caller passes its own.
 */
function explain(error: unknown, fallback: string, forbidden: Record<string, string>): string {
  if (!(error instanceof AdminApiError)) return fallback;

  if (error.status === 403) {
    // The API's own message distinguishes self from last-admin; both are
    // ForbiddenException, so the status alone cannot.
    const detail = typeof error.payload === 'object' && error.payload !== null
      ? String((error.payload as { message?: unknown }).message ?? '')
      : '';
    for (const [needle, message] of Object.entries(forbidden)) {
      if (detail.includes(needle)) return message;
    }
  }

  return fallback;
}

export async function banStudentAction(userId: string, formData: FormData): Promise<ActionResult> {
  try {
    const body = AdminStudentBanSchema.parse({ reason: formData.get('reason') });

    await adminSend('POST', `/api/admin/students/${userId}/ban`, body, AdminStudentDetailSchema);

    // Both paths: the detail page shows the banned panel, and the LIST shows
    // the «موقوف» badge — a stale list is how an admin bans someone and then
    // sees them still listed as active.
    revalidatePath(`/admin/students/${userId}`);
    revalidatePath('/admin/students');
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: explain(error, c.banFailed, {
        yourself: c.banSelfError,
        'last remaining admin': c.banLastAdminError,
      }),
    };
  }
}

export async function unbanStudentAction(userId: string): Promise<ActionResult> {
  try {
    await adminSend('POST', `/api/admin/students/${userId}/unban`, {}, AdminStudentDetailSchema);
    revalidatePath(`/admin/students/${userId}`);
    revalidatePath('/admin/students');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: explain(error, c.unbanFailed, {}) };
  }
}

/**
 * Irreversible. On success this REDIRECTS rather than revalidating, because
 * the page the operator is standing on describes a row that no longer exists —
 * revalidating it would re-fetch a 404 and drop them on the not-found screen
 * with no explanation of what happened.
 *
 * `redirect()` throws by design in Next, so it must sit OUTSIDE the try or the
 * catch below would swallow it and report the delete as failed.
 */
export async function deleteStudentAction(
  userId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const body = AdminStudentDeleteSchema.parse({
      confirmEmail: formData.get('confirmEmail'),
      reason: formData.get('reason'),
    });

    await adminSend(
      'DELETE',
      `/api/admin/students/${userId}`,
      body,
      z.object({ deleted: z.literal(true) }),
    );
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 409) {
      return { ok: false, message: describeBlockers(error.payload) };
    }
    if (error instanceof AdminApiError && error.status === 400) {
      return { ok: false, message: c.deleteEmailMismatch };
    }
    return {
      ok: false,
      message: explain(error, c.deleteFailed, {
        'your own account': c.deleteSelfError,
        'last remaining admin': c.deleteLastAdminError,
      }),
    };
  }

  revalidatePath('/admin/students');
  redirect('/admin/students');
}

/**
 * مسح مجموعة — the list screen's bulk delete.
 *
 * ## Why this returns a report instead of an `ActionResult`
 *
 * Partial success is the normal outcome (see `AdminStudentBulkDeleteResultSchema`),
 * and `{ ok: false, message }` can only say "it failed" — which for nineteen
 * deleted out of twenty is a lie in the direction that costs the most: the
 * admin re-runs it. The caller gets the ids that went, the rows that did not
 * and why, and keeps exactly those rows selected.
 *
 * ## Why no `redirect`, unlike `deleteStudentAction`
 *
 * The single delete runs on the deleted student's own page, which stops
 * existing the moment it succeeds. This runs on the list, which still exists
 * and is simply shorter — so it revalidates and stays put.
 */
export async function bulkDeleteStudentsAction(
  userIds: string[],
  reason: string,
): Promise<BulkDeleteResult> {
  try {
    const body = AdminStudentBulkDeleteSchema.parse({ userIds, reason });

    const report = await adminSend(
      'DELETE',
      '/api/admin/students',
      body,
      AdminStudentBulkDeleteResultSchema,
    );

    // Only when something actually went. Revalidating after a run that deleted
    // nothing costs a full re-fetch of the list to render the identical rows.
    if (report.deleted.length > 0) revalidatePath('/admin/students');

    return { ok: true, ...report };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof z.ZodError
          ? c.bulkDeleteFailed
          : explain(error, c.bulkDeleteFailed, {}),
    };
  }
}

export type BulkDeleteResult =
  | ({ ok: true } & AdminStudentBulkDeleteResult)
  | { ok: false; message: string };

/**
 * Turns the API's blocker counts into the one sentence that tells the operator
 * what to go and do. Question bank entries and versions are collapsed into one
 * «سؤال» count on purpose — the distinction is real in the schema and means
 * nothing to the person reading the dialog.
 */
function describeBlockers(payload: unknown): string {
  const parsed = AdminStudentDeleteBlockerSchema.safeParse(
    typeof payload === 'object' && payload !== null
      ? (payload as { blockers?: unknown }).blockers
      : null,
  );
  if (!parsed.success) return c.deleteFailed;

  const { courses, questionBankEntries, questionVersions, newsPosts } = parsed.data;
  const parts: string[] = [];
  if (courses > 0) parts.push(formatCopy(c.deleteBlockedCourses, { n: String(courses) }));
  const questions = questionBankEntries + questionVersions;
  if (questions > 0) parts.push(formatCopy(c.deleteBlockedQuestions, { n: String(questions) }));
  if (newsPosts > 0) parts.push(formatCopy(c.deleteBlockedNews, { n: String(newsPosts) }));

  return formatCopy(c.deleteBlocked, { items: parts.join(' و') });
}
