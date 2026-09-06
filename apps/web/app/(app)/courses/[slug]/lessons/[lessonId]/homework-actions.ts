'use server';

import {
  HomeworkSubmitSchema,
  MyHomeworkSubmissionSchema,
  type HomeworkImageInput,
} from '@ayman/contracts/homework';
import { apiSend } from '@/lib/api-server';

export type HomeworkActionResult = { ok: true } | { ok: false; message: string };

/**
 * «تسليم الواجب» — the receipts, never the bytes.
 *
 * The photographs went browser → API through `uploadHomeworkImage` before this
 * ran, and deliberately so: a Server Action buffers its whole payload in the
 * Next server's memory and is capped at 1 MB (`serverActions.bodySizeLimit`,
 * never raised in this repo), so a phone photo posted through here would
 * vanish with no error anywhere. What crosses is a key and a byte count per
 * page.
 *
 * ## No `revalidatePath`
 *
 * The caller does `router.refresh()` instead. The lesson page reads through
 * `apiGetAuthed`, which is `cache: 'no-store'`, so there is no data cache
 * entry to bust — only the client's router snapshot, and refreshing it in
 * place keeps the student's scroll position on a page whose first object is a
 * video they may be halfway through. Same reasoning `setReactionAction`
 * records in the inbox.
 *
 * Parsed against the contract before it leaves, even though the API validates
 * again: the API is the gate, this is the second lock on the same door.
 */
export async function submitHomeworkAction(
  lessonId: string,
  images: HomeworkImageInput[],
): Promise<HomeworkActionResult> {
  try {
    const body = HomeworkSubmitSchema.parse({ images });
    await apiSend(
      'POST',
      `/api/homework/lessons/${encodeURIComponent(lessonId)}/submissions`,
      MyHomeworkSubmissionSchema,
      body,
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}
