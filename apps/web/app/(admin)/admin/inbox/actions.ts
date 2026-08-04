'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ReplySchema, SetStatusSchema } from '@ayman/contracts/assistant/conversation';
import { adminSend } from '@/lib/admin-api';

export type InboxActionResult = { ok: true } | { ok: false; message: string };

/**
 * Both routes answer `204`, so there is nothing to parse. `z.unknown()` is the
 * honest schema for that — `adminSend` needs one, and inventing a body shape
 * the API does not send would be a fiction the next reader has to disprove.
 */
const NoBody = z.unknown();

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
    await adminSend('POST', `/api/admin/conversations/${id}/reply`, body, NoBody);
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
    await adminSend('PATCH', `/api/admin/conversations/${id}/status`, body, NoBody);
    revalidatePath('/admin/inbox');
    revalidatePath(`/admin/inbox/${id}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}
