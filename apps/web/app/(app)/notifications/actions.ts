'use server';

import { revalidatePath } from 'next/cache';
import { apiCommand } from '@/lib/api-server';

/**
 * Marking notifications read.
 *
 * ## Why both revalidate the LAYOUT
 *
 * The unread badge lives in the topbar, which is part of `(app)/layout.tsx` —
 * not of any page. Revalidating only `/notifications` would update the list
 * and leave the badge showing the old count until a hard reload, which reads
 * as "the click didn't work".
 *
 * ## Why the id is not validated here
 *
 * It goes into a path segment on a request the API authorises by
 * `{ id, userId }`, where a guessed or malformed id updates zero rows. A UUID
 * check here would move the rejection earlier for honest callers while proving
 * nothing about hostile ones. It IS encoded, because a path segment must be.
 */
export async function markNotificationReadAction(id: string): Promise<void> {
  await apiCommand('POST', `/api/me/notifications/${encodeURIComponent(id)}/read`);
  revalidatePath('/', 'layout');
}

export async function markAllNotificationsReadAction(): Promise<void> {
  await apiCommand('POST', '/api/me/notifications/read-all');
  revalidatePath('/', 'layout');
}
