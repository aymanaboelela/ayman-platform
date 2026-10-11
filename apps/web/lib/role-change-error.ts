import { copy } from '@ayman/contracts/copy/admin';
import { AdminApiError } from './admin-api';

const c = copy.admin.students;

/**
 * The API's refusal of a role change, in words the person who pressed it can
 * act on.
 *
 * ⚠️ The dialog used to print `error.message` raw — «POST /api/admin/students/…
 * /role failed with 403: {"statusCode":403,"message":"Forbidden",…}» — which is
 * what a teacher saw when he tried to make someone his assistant from the
 * student page. Every refusal below is a ForbiddenException, so the status
 * alone cannot tell them apart; the service's own message can.
 *
 * Its own module, not a helper inside an action file: a `'use server'` file
 * may export async functions only.
 */
const REFUSALS: ReadonlyArray<readonly [needle: string, message: string]> = [
  ['your own role', c.roleChangeSelfError],
  ['last remaining admin', c.roleChangeLastAdminError],
  ['not managed from the team screen', c.roleChangeAdminTarget],
  ['to an admin account', c.roleChangeAdminTarget],
  ["platform owner's account", c.roleChangeFounderTarget],
  ['permissions you do not hold', c.roleChangeBeyondYou],
  ['holds permissions you do not', c.roleChangeOutranked],
];

export function roleChangeError(error: unknown): string {
  if (!(error instanceof AdminApiError) || error.status !== 403) return c.roleChangeFailed;
  const detail =
    typeof error.payload === 'object' && error.payload !== null
      ? String((error.payload as { message?: unknown }).message ?? '')
      : '';
  for (const [needle, message] of REFUSALS) {
    if (detail.includes(needle)) return message;
  }
  // A bare «Forbidden» is the permission guard: this door is not theirs.
  return c.roleChangeAdminOnly;
}
