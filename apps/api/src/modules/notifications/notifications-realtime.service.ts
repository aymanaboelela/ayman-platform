import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import type { NotificationEvent } from '@ayman/contracts/notifications';
import { REDIS } from '../../redis/redis.module';

/** One channel per recipient. Namespaced so it cannot collide with the
 *  throttler's keys on the same Redis. */
function channelFor(userId: string): string {
  return `notif:${userId}`;
}

type Listener = (event: NotificationEvent) => void;

/**
 * The fan-out behind `GET /api/me/notifications/stream`.
 *
 * ## Why Redis pub/sub and not an in-process EventEmitter
 *
 * Because the API runs as more than one container. The student's browser holds
 * an open SSE connection to whichever instance Traefik routed it to; the admin
 * who approves their payment is talking to a different one. An in-process
 * emitter would deliver the event to nobody at all in exactly the case the
 * feature exists for — and would look perfectly correct on a developer's
 * single-process machine, which is the worst way for this to be wrong.
 *
 * ## Why a SECOND Redis connection
 *
 * ioredis puts a connection into subscriber mode when it subscribes, and a
 * connection in that mode may not run ordinary commands. The shared `REDIS`
 * client is the throttler's, and the throttler must keep working — so this
 * owns a duplicate rather than borrowing it.
 *
 * ## Failure behaviour: OPEN, deliberately
 *
 * The opposite of the throttler on the same server, and the split is on
 * purpose. A rate limiter that cannot reach Redis must fail CLOSED, because
 * the alternative is no limit at all. This must fail OPEN: a publish that
 * cannot be delivered is a notification that arrives on the next poll instead
 * of instantly, and taking a payment approval down because a cache is
 * unreachable would trade a real write for a cosmetic one. Every path here
 * catches and logs.
 */
@Injectable()
export class NotificationsRealtimeService implements OnApplicationShutdown {
  private readonly logger = new Logger(NotificationsRealtimeService.name);

  /** The subscriber connection, created lazily — an API instance that never
   *  serves a stream (a worker, a test) never opens one. */
  private subscriber: Redis | null = null;

  /** userId → the open streams for that user. A student with the site open in
   *  two tabs has two, and both must be fed. */
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /**
   * Announces an event to every connection this user has open, anywhere in
   * the cluster.
   *
   * Never throws. See the class note: the caller is finishing a database
   * transaction it must not lose over a delivery optimisation.
   */
  async publish(userId: string, event: NotificationEvent): Promise<void> {
    try {
      await this.redis.publish(channelFor(userId), JSON.stringify(event));
    } catch (error) {
      this.logger.warn(
        `could not publish a notification for ${userId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Registers one open SSE connection. The returned function unregisters it
   * and MUST be called when the response closes, or a browser that navigates
   * away leaves a listener behind for the lifetime of the process.
   */
  subscribe(userId: string, listener: Listener): () => void {
    const existing = this.listeners.get(userId);
    if (existing) {
      existing.add(listener);
    } else {
      this.listeners.set(userId, new Set([listener]));
      void this.redisSubscribe(channelFor(userId));
    }

    return () => {
      const set = this.listeners.get(userId);
      if (!set) return;
      set.delete(listener);
      if (set.size > 0) return;
      // Last tab for this user on this instance — stop paying for the channel.
      this.listeners.delete(userId);
      void this.redisUnsubscribe(channelFor(userId));
    };
  }

  /** Test seam and the local delivery path: hands an event to every listener
   *  registered on THIS instance. */
  private deliver(userId: string, raw: string): void {
    const set = this.listeners.get(userId);
    if (!set || set.size === 0) return;

    let event: NotificationEvent;
    try {
      event = JSON.parse(raw) as NotificationEvent;
    } catch {
      // A malformed frame is a bug elsewhere, not a reason to drop the
      // connection the student is holding open.
      this.logger.warn('discarded an unparseable notification frame');
      return;
    }

    for (const listener of set) {
      try {
        listener(event);
      } catch (error) {
        // One dead response must not stop the others from being written to.
        this.logger.warn(`a notification listener threw: ${(error as Error).message}`);
      }
    }
  }

  private connection(): Redis {
    if (this.subscriber) return this.subscriber;

    // `duplicate()` copies the shared client's options — including the
    // connection string — and opens its own socket. Renamed so `CLIENT LIST`
    // on a shared Redis distinguishes it from the throttler's.
    const subscriber = this.redis.duplicate({
      connectionName: 'ayman-api-notifications',
      // The opposite of the throttler's setting, for the reason in the class
      // note: a subscribe issued while the connection is down should be
      // replayed on reconnect, not rejected.
      enableOfflineQueue: true,
      maxRetriesPerRequest: null,
    });

    subscriber.on('message', (channel: string, raw: string) => {
      const userId = channel.slice('notif:'.length);
      if (userId) this.deliver(userId, raw);
    });
    subscriber.on('error', (error: Error) => {
      this.logger.warn(`notification subscriber error: ${error.message}`);
    });

    this.subscriber = subscriber;
    return subscriber;
  }

  private async redisSubscribe(channel: string): Promise<void> {
    try {
      await this.connection().subscribe(channel);
    } catch (error) {
      this.logger.warn(`could not subscribe to ${channel}: ${(error as Error).message}`);
    }
  }

  private async redisUnsubscribe(channel: string): Promise<void> {
    try {
      await this.connection().unsubscribe(channel);
    } catch (error) {
      this.logger.warn(`could not unsubscribe from ${channel}: ${(error as Error).message}`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.listeners.clear();
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
  }
}
