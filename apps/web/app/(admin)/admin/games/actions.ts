'use server';

import { revalidatePath } from '@/lib/revalidate-screen';
import { GameBankEnsureResultSchema } from '@ayman/contracts/quiz/game';
import { adminSend } from '@/lib/admin-api';

export type EnsureResult = { ok: true; categoryId: string; categoryName: string } | { ok: false };

/** بيعمل تصنيف «ألعاب — الكورس» أول مرة، وبيرجّعه لو موجود. */
export async function ensureGameBankAction(courseId: string): Promise<EnsureResult> {
  try {
    const result = await adminSend('POST', `/api/admin/game-banks/${encodeURIComponent(courseId)}`, undefined, GameBankEnsureResultSchema);
    revalidatePath('/admin/games');
    return { ok: true, ...result };
  } catch {
    return { ok: false };
  }
}
