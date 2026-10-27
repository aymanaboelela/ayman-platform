'use server';

import { revalidatePath } from '@/lib/revalidate-screen';
import {
  AdminReferralRowSchema,
  ReferralProgramSchema,
  type ReferralProgram,
} from '@ayman/contracts/admin/referrals';
import { adminReferralsCopy as c } from '@ayman/contracts/copy/admin-referrals';
import { AdminApiError, adminSend } from '@/lib/admin-api';

/**
 * The two writes behind «دعوة الصحاب», as Server Actions that return
 * `{ ok, message }` instead of throwing — the same `ActionResult` shape the
 * rest of «التسويق» uses, for the reason `../actions.ts` gives: the client
 * cannot import `AdminApiError` for an `instanceof` without pulling
 * `next/headers` into the browser bundle.
 *
 * A separate module from `../actions.ts` so this feature's writes and the
 * campaigns' never share a file two branches edit at once.
 */
export type ReferralActionResult = { ok: true } | { ok: false; message: string };

const PATH = '/admin/marketing/referrals';

function failure(error: unknown): ReferralActionResult {
  if (error instanceof AdminApiError && error.status === 400) return { ok: false, message: c.invalid };
  return { ok: false, message: c.failed };
}

export async function saveReferralProgramAction(input: ReferralProgram): Promise<ReferralActionResult> {
  try {
    await adminSend('PUT', '/api/admin/referrals/program', input, ReferralProgramSchema);
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function voidReferralAction(id: string, reason: string): Promise<ReferralActionResult> {
  try {
    await adminSend('POST', `/api/admin/referrals/${encodeURIComponent(id)}/void`, { reason }, AdminReferralRowSchema);
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 409) return { ok: false, message: c.alreadyClosed };
    return failure(error);
  }
}
