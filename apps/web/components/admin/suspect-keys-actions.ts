'use server';

import { z } from '@ayman/contracts/zod';
import { adminSendVoid } from '@/lib/admin-api';
import { revalidatePath } from '@/lib/revalidate-screen';

/**
 * «الإجابة المتسجّلة صح» — the band's way off for a key that is right. The id
 * is parsed before it reaches the URL: it is spliced into a path, and the API
 * would 400 anything else anyway.
 */
export async function confirmSuspectKeyAction(questionVersionId: string): Promise<{ ok: boolean }> {
  try {
    const id = z.uuid().parse(questionVersionId);
    await adminSendVoid('POST', `/api/admin/questions/suspect-keys/${id}/confirm`);
    revalidatePath('/admin');
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
