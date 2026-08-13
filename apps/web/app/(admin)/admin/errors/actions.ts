'use server';

import { revalidatePath } from 'next/cache';
import { adminSendVoid } from '@/lib/admin-api';

export type ErrorActionResult = { ok: true } | { ok: false; message: string };

/**
 * Mark a failure handled, or put it back.
 *
 * ⚠️ `adminSendVoid`, never `adminSend` — both routes answer `204`, and
 * `adminSend` ends with `schema.parse(await response.json())`, which throws on
 * an empty body AFTER the API has already written. The inbox actions carry the
 * same warning because that is how it shipped there once: the write succeeded
 * and the instructor was told it had failed.
 *
 * `revalidatePath`, not `updateTag`, for the reason the inbox records: every
 * read here goes through `adminGet` (`cache: 'no-store'`), so there is no data
 * cache to bust — what needs busting is the ROUTER cache, the client-side
 * snapshot of the RSC payload, which would otherwise re-render the row in the
 * state it was just moved out of.
 *
 * There is deliberately no delete. `DiagnosticsService.record()` clears
 * `resolvedAt` on any fresh occurrence, so a fault that comes back reappears
 * carrying its whole history and its original `firstSeenAt` — which is the one
 * fact that distinguishes "fixed" from "fixed twice and still happening".
 */
export async function setResolvedAction(
  id: string,
  resolved: boolean,
): Promise<ErrorActionResult> {
  try {
    await adminSendVoid('PATCH', `/api/admin/errors/${id}/${resolved ? 'resolve' : 'reopen'}`);
    revalidatePath('/admin/errors');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}
