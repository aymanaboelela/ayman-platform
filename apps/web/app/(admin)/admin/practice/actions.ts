'use server';

import { updateTag } from 'next/cache';
import {
  AdminPracticeSetDetailSchema,
  AdminPracticeSetRowSchema,
  PracticeQuestionBatchSchema,
  PracticeQuestionInputSchema,
  PracticeQuestionReorderSchema,
  PracticeSetCreateSchema,
  PracticeSetPatchSchema,
  type AdminPracticeSetDetail,
  type AdminPracticeSetRow,
  type PracticeQuestionInput,
  type PracticeSetCreate,
  type PracticeSetPatch,
} from '@ayman/contracts/practice';
import { adminPractice as c } from '@ayman/contracts/copy/admin-practice';
import { AdminApiError, adminSend, adminSendVoid } from '@/lib/admin-api';
import { TAG_PRACTICE } from '@/lib/cache-tags';

/**
 * «اختبارات مجانية» — every dashboard write, over `/api/admin/practice/*`.
 *
 * ## Results, not throws
 *
 * Each action answers `{ ok, … }` instead of throwing. A Server Action's
 * thrown message is replaced by a generic digest in a production build, so the
 * `message.includes('409')` test `news/article-form.tsx` relies on only works
 * under `next dev` — and «الدرس ده موجود بالفعل» is the one failure here the
 * instructor can fix himself. The status is read off `AdminApiError` on the
 * server, where it still exists, and turned into copy there.
 *
 * ## `updateTag`, never `revalidateTag`
 *
 * For the reason `news/actions.ts` gives: the public `/practice` pages are
 * `'use cache'` under `TAG_PRACTICE`, and `updateTag` expires them for THIS
 * request too, so «فتح الصفحة» right after a save shows the save. Every write
 * expires the tag — a reorder or a fixed typo in an explanation changes the
 * public page exactly as much as a new set does.
 *
 * Inputs are parsed against the shared contract before they leave, so a form
 * bug shows up as a refused action here rather than as an opaque 400.
 */

export type PracticeActionResult<T = null> = { ok: true; data: T } | { ok: false; message: string };

function failure(error: unknown): { ok: false; message: string } {
  if (error instanceof AdminApiError) {
    if (error.status === 409) return { ok: false, message: c.errors.taken };
    if (error.status === 403) return { ok: false, message: c.errors.forbidden };
    if (error.status === 404) return { ok: false, message: c.errors.notFound };
  }
  return { ok: false, message: c.errors.failed };
}

const setPath = (id: string) => `/api/admin/practice/sets/${encodeURIComponent(id)}`;
const questionPath = (id: string) => `/api/admin/practice/questions/${encodeURIComponent(id)}`;

export async function createPracticeSet(input: PracticeSetCreate): Promise<PracticeActionResult<AdminPracticeSetRow>> {
  const body = PracticeSetCreateSchema.safeParse(input);
  if (!body.success) return { ok: false, message: c.errors.failed };
  try {
    // The row schema reads a detail response too (it is a superset), so this
    // holds whichever of the two the route answers with.
    const row = await adminSend('POST', '/api/admin/practice/sets', body.data, AdminPracticeSetRowSchema);
    updateTag(TAG_PRACTICE);
    return { ok: true, data: row };
  } catch (error) {
    return failure(error);
  }
}

export async function patchPracticeSet(id: string, patch: PracticeSetPatch): Promise<PracticeActionResult> {
  const body = PracticeSetPatchSchema.safeParse(patch);
  if (!body.success) return { ok: false, message: c.errors.failed };
  try {
    // Void: the screen re-reads the set with `router.refresh()`, so the body
    // — row or detail — is not needed, and not depending on it means the two
    // halves of this feature cannot disagree about it.
    await adminSendVoid('PATCH', setPath(id), body.data);
    updateTag(TAG_PRACTICE);
    return { ok: true, data: null };
  } catch (error) {
    return failure(error);
  }
}

export async function deletePracticeSet(id: string): Promise<PracticeActionResult> {
  try {
    await adminSendVoid('DELETE', setPath(id));
    updateTag(TAG_PRACTICE);
    return { ok: true, data: null };
  } catch (error) {
    return failure(error);
  }
}

/** One question or a pasted hundred — the route appends in order and answers with the whole set. */
export async function addPracticeQuestions(
  setId: string,
  questions: PracticeQuestionInput[],
): Promise<PracticeActionResult<AdminPracticeSetDetail>> {
  const body = PracticeQuestionBatchSchema.safeParse({ questions });
  if (!body.success) return { ok: false, message: c.errors.failed };
  try {
    const detail = await adminSend('POST', `${setPath(setId)}/questions`, body.data, AdminPracticeSetDetailSchema);
    updateTag(TAG_PRACTICE);
    return { ok: true, data: detail };
  } catch (error) {
    return failure(error);
  }
}

export async function updatePracticeQuestion(id: string, input: PracticeQuestionInput): Promise<PracticeActionResult> {
  const body = PracticeQuestionInputSchema.safeParse(input);
  if (!body.success) return { ok: false, message: c.errors.failed };
  try {
    await adminSendVoid('PATCH', questionPath(id), body.data);
    updateTag(TAG_PRACTICE);
    return { ok: true, data: null };
  } catch (error) {
    return failure(error);
  }
}

export async function deletePracticeQuestion(id: string): Promise<PracticeActionResult> {
  try {
    await adminSendVoid('DELETE', questionPath(id));
    updateTag(TAG_PRACTICE);
    return { ok: true, data: null };
  } catch (error) {
    return failure(error);
  }
}

/** The WHOLE order, never a delta — see `use-debounced-reorder.ts`. */
export async function reorderPracticeQuestions(setId: string, ids: string[]): Promise<PracticeActionResult> {
  const body = PracticeQuestionReorderSchema.safeParse({ ids });
  if (!body.success) return { ok: false, message: c.question.reorderFailed };
  try {
    await adminSendVoid('PUT', `${setPath(setId)}/order`, body.data);
    updateTag(TAG_PRACTICE);
    return { ok: true, data: null };
  } catch (error) {
    return failure(error);
  }
}
