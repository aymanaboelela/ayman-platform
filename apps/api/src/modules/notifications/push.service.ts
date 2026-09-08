import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service';
import { loadEnv } from '../../config/env';

/** What a `notifyUser` caller hands over. Small on purpose — see
 *  `pushPayloadFor` in `notifications.service.ts`, which builds one of these
 *  from an already-resolved feed entry rather than this service reaching
 *  back into any content table itself. */
export interface PushPayload {
  title: string;
  body: string;
  /** Where `notificationclick` in `sw.js` navigates to. Always app-relative —
   *  the service worker resolves it against its own origin. */
  url: string;
  /** Collapses repeats in the OS tray — three questions in a minute replace
   *  one another instead of stacking three times. */
  tag: string;
}

/** The shape `PushSubscription.toJSON()` produces in the browser, and what
 *  `PushSubscribeSchema` (contracts) validates on the way in. */
export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Web Push: subscribing a browser, unsubscribing it, and sending to it.
 *
 * ## Why this is a separate service, not more methods on `NotificationsService`
 *
 * `NotificationsService` writes and reads `Notification` rows and knows
 * nothing about browsers. This one knows about browsers — `web-push`,
 * `PushSubscription` rows, VAPID keys — and nothing about what a notification
 * MEANS. `notifications.service.ts`'s `announce()` is the only caller of
 * `notifyUser`, and it decides whether a given kind is worth pushing at all
 * (`pushPayloadFor`) before ever reaching this file.
 *
 * ## Why "configured" is checked at the START of every method, not once at boot
 *
 * `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` are ALL OPTIONAL —
 * see `env.ts`'s own note. A deployment that has not set them (every local
 * checkout, CI, and a fresh production box before the operator generates a
 * key pair) must boot exactly as before and every call here must be a quiet
 * no-op, never a thrown error that turns a missing feature into a 500 on a
 * route (`/api/me/notifications/*`) that has nothing to do with push.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly vapidPublicKey: string | null;

  constructor(private readonly prisma: PrismaService) {
    const env = loadEnv(process.env);
    this.vapidPublicKey = env.VAPID_PUBLIC_KEY ?? null;

    // The `.refine()` in `env.ts` guarantees all three or none — if the
    // public key is set, the other two are too.
    if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT) {
      webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    }
  }

  /** `null` when push is not configured — the toggle stays quiet rather than
   *  subscribing a browser the API could never send to. */
  publicKey(): string | null {
    return this.vapidPublicKey;
  }

  /**
   * Upserts on `endpoint`, never `create`s blindly.
   *
   * `endpoint` is `@unique` on the table — the push service's own URL for
   * this browser, stable across repeat subscribes. Clicking the toggle again
   * on an already-subscribed browser (a second tab, a permission re-check)
   * must update the same row, not grow a duplicate that would double-send
   * every future notification to the same device.
   *
   * Ownership is deliberately overwritten on every upsert: a browser that
   * subscribed as one admin and is now used by another (a shared machine, an
   * account handed off) sends to whoever asked LAST, which is the only
   * consistent answer — the alternative is a subscription owned by an
   * account that is no longer the one sitting at that browser.
   */
  async subscribe(userId: string, subscription: PushSubscriptionInput): Promise<void> {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: {
        userId,
        endpoint: subscription.endpoint,
        platform: 'web',
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      update: {
        userId,
        platform: 'web',
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        lastSeenAt: new Date(),
      },
    });
  }

  /**
   * Register a NATIVE device's FCM token.
   *
   * ## Why `userId` is on the UPDATE as well as the CREATE
   *
   * A token belongs to an APP INSTALL, not to a person. Two students sharing a
   * phone — which happens, siblings — produce the same token under two
   * accounts, and whoever registered last is the one currently signed in.
   * Re-pointing the row at them is what stops the first student's
   * notifications from being delivered to the second.
   *
   * ## Why the web keys are explicitly nulled
   *
   * They cannot be set on a native row — `push_subscriptions_web_keys` refuses
   * it — but an endpoint could in principle have been a web subscription
   * before. Writing NULL makes the transition legal instead of a constraint
   * violation at a moment nobody is watching.
   */
  async registerDevice(
    userId: string,
    input: { token: string; platform: 'android' | 'ios'; appVersion?: string },
  ): Promise<void> {
    const now = new Date();
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.token },
      create: {
        userId,
        endpoint: input.token,
        platform: input.platform,
        appVersion: input.appVersion ?? null,
        lastSeenAt: now,
      },
      update: {
        userId,
        platform: input.platform,
        appVersion: input.appVersion ?? null,
        p256dh: null,
        auth: null,
        lastSeenAt: now,
      },
    });
  }

  /**
   * `deleteMany` scoped by `{ endpoint, userId }`, not `delete` by endpoint
   * alone — the same ownership discipline `NotificationsService.markRead`
   * documents: a caller cannot unsubscribe a browser that is not theirs by
   * guessing its endpoint, and a mismatch deletes zero rows rather than
   * confirming the endpoint exists.
   */
  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
  }

  /**
   * Sends to every BROWSER this user has subscribed. Never throws — see the
   * class note: `announce()` has already committed the notification row it
   * is telling this user about, and a push delivery failure must not turn
   * that into an error the caller has to handle.
   *
   * ## ⚠️ `platform: 'web'` in the WHERE, and it is load-bearing
   *
   * `push_subscriptions` now holds native FCM tokens beside browser
   * subscriptions. An FCM token is not a push-service URL and has no
   * encryption keys, so handing one to `web-push` is not a delivery that fails
   * — it is a crash inside a fan-out, for one recipient, after the
   * notification row is already committed.
   *
   * The filter is what keeps the two transports apart. The TypeScript checker
   * enforces the same thing from the other side: `p256dh` and `auth` are
   * nullable on the model now, and `send()` below still requires them, so a
   * query that forgot this filter would not compile.
   *
   * TODO(fcm): the native half. `PushSubscription` rows with
   * `platform IN ('android','ios')` are collected and stored today and nothing
   * sends to them — the FCM v1 API needs a service-account credential the
   * server does not have yet. See docs/runbooks/mobile-push.md §2.
   */
  async notifyUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.vapidPublicKey) return;

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId, platform: 'web' },
    });
    if (subscriptions.length === 0) return;

    await Promise.all(
      subscriptions.map((subscription) =>
        this.send(
          {
            id: subscription.id,
            endpoint: subscription.endpoint,
            // Non-null by the `platform: 'web'` filter above AND by the
            // `push_subscriptions_web_keys` CHECK, which refuses a web row
            // without both. Asserted rather than defaulted: a `?? ''` here
            // would send an unencryptable payload and log a warning nobody
            // would connect back to this line.
            p256dh: subscription.p256dh!,
            auth: subscription.auth!,
          },
          payload,
        ),
      ),
    );
  }

  private async send(
    subscription: { id: string; endpoint: string; p256dh: string; auth: string },
    payload: PushPayload,
  ): Promise<void> {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(payload),
      );
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      // 404/410: the push service itself says this endpoint is gone — an
      // uninstall, a permission reset, a wiped profile. Pruning it here means
      // the NEXT notification does not pay for a send that can never succeed
      // again; leaving it would mean this row is dead weight forever, since
      // nothing else in the app ever revisits it.
      if (statusCode === 404 || statusCode === 410) {
        await this.prisma.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => {
          // Already gone — a second tab's send lost the race to prune it first.
        });
        return;
      }
      this.logger.warn(
        `push send failed for subscription ${subscription.id}: ${(error as Error).message}`,
      );
    }
  }
}
