'use server';

import { revalidatePath } from 'next/cache';
import { HomeworkReviewSchema } from '@ayman/contracts/homework';
import { adminSendVoid } from '@/lib/admin-api';

export type HomeworkActionResult = { ok: true } | { ok: false; message: string };

/**
 * «مقبول» / «يفكّر تاني ويبعته».
 *
 * ⚠️ `adminSendVoid`, never `adminSend`. The route answers 204, and `adminSend`
 * ends with `schema.parse(await response.json())` — which throws on an empty
 * body AFTER the student has been marked, told, and (on accept) had their
 * photographs deleted. That is exactly how the inbox reply shipped once: the
 * work was done and the instructor was told it had failed.
 *
 * `revalidatePath`, not `updateTag`: every read on these screens goes through
 * `adminGet`, which is `cache: 'no-store'` precisely so an admin never sees a
 * stale row. What has to be dropped is the ROUTER cache — the client-side RSC
 * snapshot — or the queue re-renders with the submission still sitting in
 * «مستني مراجعة» after it has been decided.
 */
export async function reviewHomeworkAction(
  id: string,
  input: { decision: 'accepted' | 'needs_work'; grade: number | null; message: string },
): Promise<HomeworkActionResult> {
  try {
    // Parsed against the contract before it leaves, even though the API
    // validates again — including the refusal of a grade on `needs_work`, so a
    // form bug cannot put a mark on work that is coming back.
    const body = HomeworkReviewSchema.parse(input);
    await adminSendVoid('POST', `/api/admin/homework/${id}/review`, body);
    revalidatePath('/admin/homework');
    revalidatePath(`/admin/homework/${id}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}
