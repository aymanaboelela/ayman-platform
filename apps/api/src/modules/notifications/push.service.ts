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
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      update: {
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
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
   * Sends to every browser this user has subscribed. Never throws — see the
   * class note: `announce()` has already committed the notification row it
   * is telling this user about, and a push delivery failure must not turn
   * that into an error the caller has to handle.
   */
  async notifyUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.vapidPublicKey) return;

    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subscriptions.length === 0) return;

    await Promise.all(subscriptions.map((subscription) => this.send(subscription, payload)));
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
