'use server';

import { revalidatePath } from 'next/cache';
import {
  OutreachSendResultSchema,
  type FollowUpQuery,
  type IdleQuery,
  type OutreachSendResult,
} from '@ayman/contracts/outreach/follow-up';
import { adminSend } from '@/lib/admin-api';

/**
 * The four send paths behind `/admin/follow-up`.
 *
 * ## Every one of them revalidates the screen
 *
 * A row that has just been written to must stop looking identical to one that
 * has not — `lastMessagedAt` is what draws the «اتبعتله» chip and what the
 * next «ابعت للكل» skips on, and both are read on the server. Without the
 * revalidate the admin presses send, sees a toast, and then presses send on
 * the same row again because nothing on it changed.
 *
 * ## Why they never throw
 *
 * These run behind a button on a table of two hundred rows, and an unhandled
 * Server Action rejection in Next renders the route's `error.tsx` — losing the
 * whole list, the filters and the scroll position because one send failed. The
 * result shape is the same four numbers the API returns, plus `ok: false` for
 * a transport failure the caller turns into one toast.
 */

export type SendOutcome = ({ ok: true } & OutreachSendResult) | { ok: false };

async function post(path: string, body: unknown): Promise<SendOutcome> {
  try {
    const result = await adminSend('POST', path, body, OutreachSendResultSchema);
    revalidatePath('/admin/follow-up');
    return { ok: true, ...result };
  } catch {
    return { ok: false };
  }
}

/*
 * ⚠️ Every export below is `async`, and none of them may stop being.
 *
 * A `'use server'` module may only export async functions. A plain function
 * that merely RETURNS a promise typechecks, reads identically, and makes the
 * build fail with «The module has no exports at all» — pointed at the client
 * component that imports it, not at the function that is wrong.
 */
export async function sendFollowUpAction(input: {
  userId: string;
  courseId: string;
  window: number;
}): Promise<SendOutcome> {
  return post('/api/admin/follow-up/send', input);
}

export async function sendAllFollowUpAction(query: FollowUpQuery): Promise<SendOutcome> {
  return post('/api/admin/follow-up/send-all', query);
}

export async function sendSubscribeAction(input: { userId: string }): Promise<SendOutcome> {
  return post('/api/admin/follow-up/subscribe/send', input);
}

export async function sendAllSubscribeAction(query: IdleQuery): Promise<SendOutcome> {
  return post('/api/admin/follow-up/subscribe/send-all', query);
}
