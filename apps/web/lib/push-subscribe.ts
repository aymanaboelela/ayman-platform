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
 * Remembers the endpoint we last successfully registered with the API, so the
 * mount-time repair below can tell "already done" from "never done" without a
 * request. Per-browser and disposable: losing it costs one redundant upsert,
 * which is why every access is wrapped — Safari in a private window throws on
 * the property itself, not just on the call.
 */
const SYNCED_ENDPOINT_KEY = 'ayman:push:synced-endpoint';

function readSyncedEndpoint(): string | null {
  try {
    return localStorage.getItem(SYNCED_ENDPOINT_KEY);
  } catch {
    return null;
  }
}

function rememberSyncedEndpoint(endpoint: string): void {
  try {
    localStorage.setItem(SYNCED_ENDPOINT_KEY, endpoint);
  } catch {
    // A private window, or storage the user has blocked. The only cost is
    // that `ensurePushSubscribed` re-upserts on the next load.
  }
}

/** Why a subscribe attempt did not end in a live, server-known subscription.
 *  `not_configured` is the one worth SAYING out loud — see the toggle. */
export type PushSubscribeResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'not_configured' | 'failed' };

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
export async function subscribeToPush(): Promise<PushSubscribeResult> {
  if (typeof window === 'undefined') return { ok: false, reason: 'unsupported' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' };
  }

  try {
    const { publicKey } = await apiGet('/api/me/push/public-key', PushPublicKeySchema);
    /*
     * The deployment never set `VAPID_PUBLIC_KEY`. This used to return here
     * indistinguishably from success, and that is exactly how Web Push
     * managed to be completely dead in production without anyone seeing an
     * error: the admin pressed the bell, macOS asked, he granted, the bell
     * vanished (it hides once `permission === 'granted'`), and NO subscription
     * was ever created. The reason now travels so the caller can say so.
     */
    if (!publicKey) return { ok: false, reason: 'not_configured' };

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
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
      return { ok: false, reason: 'failed' };
    }
    await apiPostVoid('/api/me/push/subscribe', {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
    rememberSyncedEndpoint(json.endpoint);
    return { ok: true };
  } catch {
    // Swallowed — see the function's own note above.
    return { ok: false, reason: 'failed' };
  }
}

/**
 * The repair, and the reason this module has a second entry point.
 *
 * ## The dead end it exists to undo
 *
 * `subscribeToPush` had exactly ONE caller — the admin topbar bell — and that
 * bell renders `null` the moment `Notification.permission === 'granted'`.
 * Granting the OS permission and holding a push subscription are two separate
 * browser facts (this module's opening note says so), and the first one hides
 * the only control that could ever establish the second.
 *
 * So anyone who pressed the bell while this deployment had no VAPID key —
 * which was every press, because the key was never configured — ended in a
 * state they could not leave: permission granted, no subscription, no button
 * left to press. Setting the keys afterwards fixes nothing on its own. There
 * has to be a path that runs WITHOUT a click, and this is it.
 *
 * ## Why running it on mount is allowed
 *
 * `PushManager.subscribe` is not gated on a user gesture — only
 * `Notification.requestPermission()` is, and this never calls that. It acts
 * solely on a permission the person already granted, so it can neither raise
 * a prompt nor re-ask someone who said no.
 *
 * ## Why it is cheap
 *
 * It returns before any network call in the common case: not granted, or
 * already holding the exact endpoint we last told the API about. A signed-in
 * page load therefore costs nothing at all once the browser is in the steady
 * state, and two small requests exactly once when it is not.
 */
export async function ensurePushSubscribed(): Promise<PushSubscribeResult> {
  if (typeof window === 'undefined') return { ok: false, reason: 'unsupported' };
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    // Not an error: the person has not been asked yet, or said no. The bell
    // is what asks, and it is still rendered in both of those states.
    return { ok: false, reason: 'unsupported' };
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing && readSyncedEndpoint() === existing.endpoint) return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }

  return subscribeToPush();
}
