'use server';

import { revalidatePath } from '@/lib/revalidate-screen';
import {
  GameBankEnsureResultSchema,
  GameModesConfigSchema,
  type GameModesConfig,
} from '@ayman/contracts/quiz/game';
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

/** تصنيف درس واحد — ابن تصنيف الكورس (بيتعمل هو كمان لو مش موجود). */
export async function ensureLessonBankAction(courseId: string, lessonId: string): Promise<EnsureResult> {
  try {
    const result = await adminSend(
      'POST',
      `/api/admin/game-banks/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`,
      undefined,
      GameBankEnsureResultSchema,
    );
    revalidatePath('/admin/games');
    revalidatePath(`/admin/games/${courseId}`);
    return { ok: true, ...result };
  } catch {
    return { ok: false };
  }
}

export type SaveModesResult = { ok: true; modes: GameModesConfig } | { ok: false };

/** التلات ألعاب مع بعض — السيرفر بيشيل أي درس مش من الكورس ده. */
export async function saveGameModesAction(courseId: string, modes: GameModesConfig): Promise<SaveModesResult> {
  try {
    const saved = await adminSend(
      'PUT',
      `/api/admin/game-banks/${encodeURIComponent(courseId)}/modes`,
      { modes },
      GameModesConfigSchema,
    );
    revalidatePath('/admin/games');
    revalidatePath(`/admin/games/${courseId}`);
    return { ok: true, modes: saved };
  } catch {
    return { ok: false };
  }
}
