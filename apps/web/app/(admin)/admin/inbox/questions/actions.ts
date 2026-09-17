'use server';

import { AssistantQuestionContextSchema, type AssistantQuestionContext } from '@ayman/contracts/assistant/questions';
import { AdminApiError, adminGet } from '@/lib/admin-api';

/**
 * The one read this section's client side needs.
 *
 * `ActionResult<T>`, not a thrown error — the caller is a CLIENT component
 * (the row's detail dialog), and `AdminApiError` lives in `admin-api.ts`
 * alongside `import { headers } from 'next/headers'`. A client component that
 * imports that class for an `instanceof` check drags the whole module into
 * the browser bundle, and the production build refuses it outright. See
 * `apps/web/app/(admin)/admin/marketing/actions.ts`'s own note — this is the
 * same fix, once discovered there, applied here before it could recur.
 */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

export async function questionContextAction(id: string): Promise<ActionResult<AssistantQuestionContext>> {
  try {
    const data = await adminGet(`/api/admin/assistant/questions/${encodeURIComponent(id)}/context`, AssistantQuestionContextSchema);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, message: error instanceof AdminApiError ? error.message : 'حصل خطأ، حاول تاني' };
  }
}
