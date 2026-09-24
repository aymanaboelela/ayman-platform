'use server';

import { revalidatePath } from '@/lib/revalidate-screen';
import {
  AdminUnlockCodeCreateResponseSchema,
  AdminUnlockCodeCreateSchema,
  AdminUnlockCodeRowSchema,
  AdminUnlockCourseTreeSchema,
  type AdminUnlockCodeCreateInput,
  type AdminUnlockCodeRow,
  type AdminUnlockCourseTree,
} from '@ayman/contracts/admin/unlock-codes';
import { copy } from '@ayman/contracts/copy/admin';
import { AdminApiError, adminGet, adminSend, adminSendVoid } from '@/lib/admin-api';

const c = copy.admin.unlockCodes;

export type ActionResult = { ok: true } | { ok: false; message: string };
export type TreeResult = { ok: true; tree: AdminUnlockCourseTree } | { ok: false; message: string };
export type CreateResult =
  | { ok: true; codes: AdminUnlockCodeRow[] }
  | { ok: false; message: string };

/**
 * The API's refusal, in the admin's words — never the raw
 * «POST /api/… failed with 400: {…}» that `AdminApiError.message` carries.
 */
function describe(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.status === 429) return copy.admin.common.rateLimited;
    const code =
      typeof error.payload === 'object' && error.payload !== null
        ? (error.payload as { code?: unknown }).code
        : undefined;
    // A lecture that moved to another course between loading the tree and
    // pressing the button — the one 400 the picker itself cannot rule out.
    if (code === 'unlock_item_outside_course') return c.errorOutside;
  }
  return c.errorGeneric;
}

/**
 * The picker's tree, fetched when a course is chosen rather than for every
 * course up front: a course is hundreds of lectures, and the dropdown lists
 * all of them.
 */
export async function loadCourseTreeAction(courseId: string): Promise<TreeResult> {
  try {
    const tree = await adminGet(
      `/api/admin/unlock-codes/courses/${encodeURIComponent(courseId)}/tree`,
      AdminUnlockCourseTreeSchema,
    );
    return { ok: true, tree };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

export async function createUnlockCodesAction(
  input: AdminUnlockCodeCreateInput,
): Promise<CreateResult> {
  const parsed = AdminUnlockCodeCreateSchema.safeParse(input);
  if (!parsed.success) {
    // The one refine on the schema is «nothing picked»; the button is disabled
    // in that state, so reaching here means a stale form, not a typo.
    const nothing = parsed.error.issues.some((issue) => issue.path[0] === 'items');
    return { ok: false, message: nothing ? c.nothingPicked : c.errorGeneric };
  }
  try {
    const { codes } = await adminSend(
      'POST',
      '/api/admin/unlock-codes',
      parsed.data,
      AdminUnlockCodeCreateResponseSchema,
    );
    revalidatePath('/admin/unlock-codes');
    return { ok: true, codes };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

/** Unused → cancelled. Used → what it opened is pulled from the student. */
export async function revokeUnlockCodeAction(id: string): Promise<ActionResult> {
  try {
    await adminSend(
      'POST',
      `/api/admin/unlock-codes/${encodeURIComponent(id)}/revoke`,
      undefined,
      AdminUnlockCodeRowSchema,
    );
    revalidatePath('/admin/unlock-codes');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

/** Never-used codes only — a used one answers 409 and has to be revoked, so
 *  the record of who typed it survives. */
export async function deleteUnlockCodeAction(id: string): Promise<ActionResult> {
  try {
    await adminSendVoid('DELETE', `/api/admin/unlock-codes/${encodeURIComponent(id)}`);
    revalidatePath('/admin/unlock-codes');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}
