'use server';

import { revalidatePath } from 'next/cache';
import { ReplySchema, SetStatusSchema } from '@ayman/contracts/assistant/conversation';
import { adminSendVoid } from '@/lib/admin-api';

export type InboxActionResult = { ok: true } | { ok: false; message: string };

/**
 * ⚠️ `adminSendVoid`, never `adminSend`.
 *
 * Both routes answer `204`, and `adminSend` ends with
 * `schema.parse(await response.json())` — which throws on an empty body AFTER
 * the API has already written the reply. That is exactly how this shipped:
 * the message was saved and the student notified, and then the instructor was
 * told it had failed. A `z.unknown()` schema does not help, because the throw
 * happens in `.json()` before any schema is consulted.
 */

/**
 * `revalidatePath`, not `updateTag`.
 *
 * The settings actions use `updateTag` because they feed `'use cache'`
 * entries that outlive the request. The inbox does not: every read goes
 * through `adminGet`, which is `cache: 'no-store'` precisely so an editor can
 * never see a stale row. What still needs busting is the ROUTER cache — the
 * client-side snapshot of the RSC payload, which would otherwise re-render the
 * thread without the message just sent.
 */
export async function replyAction(id: string, message: string): Promise<InboxActionResult> {
  try {
    const body = ReplySchema.parse({ message });
    await adminSendVoid('POST', `/api/admin/conversations/${id}/reply`, body);
    revalidatePath('/admin/inbox');
    revalidatePath(`/admin/inbox/${id}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function setStatusAction(
  id: string,
  status: 'open' | 'closed',
): Promise<InboxActionResult> {
  try {
    const body = SetStatusSchema.parse({ status });
    await adminSendVoid('PATCH', `/api/admin/conversations/${id}/status`, body);
    revalidatePath('/admin/inbox');
    revalidatePath(`/admin/inbox/${id}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}
