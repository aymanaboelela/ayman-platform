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
    endpoint: z.url(),
  })
  .strict();

export type PushUnsubscribeInput = z.infer<typeof PushUnsubscribeSchema>;

/** `null` when `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` are not
 *  all configured — see `env.ts`. The toggle stays silent in that case rather
 *  than subscribing a browser the API could never send to. */
export const PushPublicKeySchema = z.object({ publicKey: z.string().nullable() });
export type PushPublicKey = z.infer<typeof PushPublicKeySchema>;
