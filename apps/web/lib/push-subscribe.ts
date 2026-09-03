import { PushPublicKeySchema } from '@ayman/contracts/notifications/push';
import { apiGet, apiPostVoid } from './api';

/**
 * Turning the browser's Web Push into something wired to this account.
 *
 * The one caller today is `InboxAlertsToggle`, right after
 * `Notification.requestPermission()` resolves `'granted'` — granting the OS
 * permission and holding a live push subscription are two different browser
 * facts, and only the second one survives the tab closing. Kept in its own
 * module rather than inlined in that component so the base64url conversion
 * (`PushManager.subscribe` demands a `Uint8Array`, the API hands over a
 * string) has somewhere to be unit-tested without a DOM.
 */

/**
 * `PushManager.subscribe({ applicationServerKey })` demands a `Uint8Array`
 * backed by a plain `ArrayBuffer` (`BufferSource`, not the wider
 * `ArrayBufferLike` a bare `new Uint8Array(length)` is typed as under this
 * TypeScript lib), and the VAPID public key travels the wire as the
 * base64url string the `web-push` package itself produces. Standard
 * base64url → base64 → bytes; the only wrinkle is the padding base64url
 * omits and `atob` requires back.
 */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Subscribes this browser and tells the API about it. A quiet no-op — never
 * throws — in every case that is not "the whole thing worked":
 *
 *   - the Push API does not exist here (an old browser, a locked-down
 *     webview, iOS Safari outside a Home Screen install);
 *   - `navigator.serviceWorker` never finished registering (see
 *     `service-worker-register.tsx` — a slow or failed registration on a
 *     flaky connection);
 *   - the API reports no VAPID public key, i.e. this deployment never
 *     configured one — see `env.ts`.
 *
 * The caller is a click handler that already granted the OS permission; a
 * thrown error here would surface as a toast for a step the person did not
 * know existed, over a feature that degrades to "arrives on next tab open"
 * regardless.
 */
export async function subscribeToPush(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    const { publicKey } = await apiGet('/api/me/push/public-key', PushPublicKeySchema);
    if (!publicKey) return;

    const registration = await navigator.serviceWorker.ready;

    // Re-subscribing an already-subscribed browser returns the SAME
    // subscription rather than minting a new one — `PushService.subscribe`
    // upserts on `endpoint` either way, so calling this again (a second tab
    // granting permission) is harmless.
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));

    /*
     * Only `endpoint`/`keys`, picked out by hand rather than posting
     * `subscription.toJSON()` whole. The browser's own JSON also carries
     * `expirationTime`, and `PushSubscribeSchema` is `.strict()` — the same
     * mass-assignment closure `assistant.dto.ts` relies on — so forwarding
     * the object as-is would 400 on every real subscribe.
     */
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return;
    await apiPostVoid('/api/me/push/subscribe', {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
  } catch {
    // Swallowed — see the function's own note above.
  }
}
