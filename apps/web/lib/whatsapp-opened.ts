'use client';

import { apiPostVoid } from '@/lib/api';

/**
 * Tells the server this student has followed a WhatsApp link, so «رسايل م.
 * أيمن» stops inviting them to the channel.
 *
 * ## Fire and forget, deliberately
 *
 * Every caller is a click handler on an `<a>` that is about to open WhatsApp.
 * The press must not wait on this, must not be cancelled by it, and must not
 * show anything if it fails — the worst case of a lost call is one more
 * reminder in three weeks, which is exactly what the student was living with
 * before this existed. So the promise is dropped and the rejection swallowed.
 *
 * ## Why not `sendBeacon`
 *
 * The links open in a NEW TAB (`target="_blank"`), so this page is not
 * unloading and an ordinary `fetch` completes normally. `sendBeacon` cannot
 * carry the CSRF header the API requires on every write, which would make the
 * call a 403 for the one thing it is for.
 *
 * ## Signed-in students only
 *
 * The route needs `profile:write`, so a guest reading the landing page gets a
 * 401 here — caught and ignored. There is nothing to record for someone the
 * platform cannot message anyway.
 */
export function recordWhatsappOpened(): void {
  void apiPostVoid('/api/profile/whatsapp-opened').catch(() => undefined);
}
