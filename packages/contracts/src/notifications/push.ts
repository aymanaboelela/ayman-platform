import { z } from '@ayman/contracts/zod';

/**
 * Web Push subscriptions — the leg of the notification system that reaches a
 * browser with NO tab open at all.
 *
 * `NotificationsRealtimeService` (SSE) and the toast/OS-`Notification` pair in
 * `notification-stream.tsx` only ever reach a tab that is already open
 * somewhere. This is the other half: `PushSubscription.toJSON()` from
 * `PushManager.subscribe()`, handed to the API so it can wake the browser's
 * own push service later, on `announce()`, whether or not anything of this
 * site is running.
 *
 * Its own leaf module rather than a few more exports on `notifications.ts` —
 * that file is reached from the root barrel via `@ayman/contracts/notifications`
 * by both signed-in shells on every page; this one is reached only by the
 * admin toggle that performs the subscribe call, and does not need to ride
 * along with it.
 */

/**
 * The shape `PushSubscription.toJSON()` produces in every browser that
 * implements the Push API. `endpoint` is the browser vendor's own push
 * service URL — opaque, and the natural dedup key: re-subscribing the same
 * browser reliably returns the same one.
 */
export const PushSubscribeSchema = z
  .object({
    endpoint: z.url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  })
  .strict();

export type PushSubscribeInput = z.infer<typeof PushSubscribeSchema>;

export const PushUnsubscribeSchema = z
  .object({
    /**
     * ⚠️ NOT `z.url()`, unlike the subscribe schema.
     *
     * A browser endpoint is a URL; an FCM registration token is an opaque
     * string that is not one. Unsubscribing has to work for both — a phone
     * that signs out must be able to retire its token — and a `z.url()` here
     * would 400 every native device while succeeding for every browser, which
     * is the kind of asymmetry nobody notices until tokens pile up.
     */
    endpoint: z.string().trim().min(1).max(4096),
  })
  .strict();

export type PushUnsubscribeInput = z.infer<typeof PushUnsubscribeSchema>;

/**
 * A NATIVE device registering for push.
 *
 * Its own schema rather than making the web one's `keys` optional, because the
 * two are genuinely different objects: a browser hands over an endpoint URL
 * plus the two keys `web-push` needs to encrypt with, and a phone hands over
 * one opaque FCM token and nothing else. Merging them produces a shape where
 * half the fields are conditionally required, and a `.strict()` schema that
 * says nothing about which half.
 *
 * The database keeps them in ONE table — see `PushSubscription` — because the
 * question a fan-out asks ("everywhere this person can be reached") is the
 * same for both. It is the WIRE that differs.
 */
export const DevicePushRegisterSchema = z
  .object({
    /**
     * The FCM registration token. Opaque, ~160 characters today, and the
     * length is not contracted anywhere by Google — hence a generous ceiling
     * rather than a fixed size.
     */
    token: z.string().trim().min(1).max(4096),
    /**
     * `web` is deliberately absent: a browser has its own route with its own
     * shape, and accepting `web` here would mean accepting a row with no keys,
     * which the CHECK constraint refuses anyway.
     */
    platform: z.enum(['android', 'ios']),
    /**
     * The build that registered, e.g. `1.4.0 (312)`. Optional, and worth
     * having: when push breaks for some students and not others, "only on the
     * build from before the APNs key was rotated" is a diagnosis.
     */
    appVersion: z.string().trim().max(40).optional(),
  })
  .strict();

export type DevicePushRegisterInput = z.infer<typeof DevicePushRegisterSchema>;

/** `null` when `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` are not
 *  all configured — see `env.ts`. The toggle stays silent in that case rather
 *  than subscribing a browser the API could never send to. */
export const PushPublicKeySchema = z.object({ publicKey: z.string().nullable() });
export type PushPublicKey = z.infer<typeof PushPublicKeySchema>;
