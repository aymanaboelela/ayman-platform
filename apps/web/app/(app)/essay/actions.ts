'use server';

import {
  DailyEssaySubmitSchema,
  MyEssaySubmissionSchema,
  type EssayImageInput,
} from '@ayman/contracts/daily-essay';
import { apiSend } from '@/lib/api-server';

export type EssayActionResult = { ok: true } | { ok: false; message: string };

/**
 * «تسليم الحل» — the receipts or the typed text, never the bytes.
 *
 * The photographs went browser → API through `uploadEssayImage` before this
 * ran: a Server Action is capped at 1 MB, so a phone photo posted through one
 * would vanish with no error. What crosses here is a key and a byte count per
 * page, or up to 10,000 characters of text.
 *
 * No `revalidatePath`: the page reads through `apiGetAuthed` (`no-store`), so
 * the caller's `router.refresh()` is all there is to refresh.
 */
export async function submitEssayAction(
  essayId: string,
  answer: { images: EssayImageInput[]; text: string | null },
): Promise<EssayActionResult> {
  try {
    const body = DailyEssaySubmitSchema.parse(answer);
    await apiSend('POST', `/api/me/essay/${encodeURIComponent(essayId)}/answer`, MyEssaySubmissionSchema, body);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}
