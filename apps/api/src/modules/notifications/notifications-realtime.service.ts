import { Inject, Injectable, Logger, Optional, type OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import type { LiveQueue, NotificationEvent } from '@ayman/contracts/notifications';
import { REDIS } from '../../redis/redis.module';

/** One channel per recipient. Namespaced so it cannot collide with the
 *  throttler's keys on the same Redis. */
function channelFor(userId: string): string {
  return `notif:${userId}`;
}

/**
 * One channel per admin QUEUE, not per admin.
 *
 * A queue frame says the same thing to everyone allowed to hear it, so it is
 * published ONCE and every stream holding the permission listens — rather than
 * resolving the recipients and publishing per user the way `emitToPermission`
 * has to for a notification ROW. On the dev database that difference is
 * 2,656 publishes per click; on a stack with one teacher it is still the
 * difference between «one PUBLISH» and «one query and a loop».
 *
 * Its own prefix, and one a user id can never produce: better-auth ids are
 * nanoids, which never contain a colon, so `notif:<id>` and `notif-queue:<q>`
 * cannot name the same channel.
 */
function queueChannelFor(queue: LiveQueue): string {
  return `notif-queue:${queue}`;
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

  /** Redis CHANNEL → the open streams listening on it. A student with the site
   *  open in two tabs has two on their own channel, and both must be fed; an
   *  admin tab is also on each queue channel it may hear. */
  private readonly listeners = new Map<string, Set<Listener>>();

  /**
   * `@Optional()`, for the same reason `NotificationsService` marks THIS
   * service optional: `RedisModule` is `@Global()` and mounted by `AppModule`,
   * so the real application always has it — but the cut-down Nest fixtures the
   * authorization specs build list their providers explicitly and have no
   * `AppModule` above them. Requiring it there turns a permission test into a
   * DI failure that reads as "the route does not exist".
   *
   * Absent, every method below is a no-op and the stream simply never
   * delivers. That is the same degradation a Redis outage produces, and it is
   * the one this class is designed for — see the failure note above.
   */
  constructor(@Optional() @Inject(REDIS) private readonly redis?: Redis) {}

  /**
   * Announces an event to every connection this user has open, anywhere in
   * the cluster.
   *
   * Never throws. See the class note: the caller is finishing a database
   * transaction it must not lose over a delivery optimisation.
   */
  async publish(userId: string, event: NotificationEvent): Promise<void> {
    await this.publishOn(channelFor(userId), event, `a notification for ${userId}`);
  }

  /**
   * «The `queue` list moved; `waiting` are waiting now» — to every stream,
   * anywhere in the cluster, that subscribed to the queue.
   *
   * WHO may subscribe is not decided here: `NotificationsController.stream`
   * asks the permission before it calls `subscribeQueue`, and again before it
   * writes each frame. This class only moves bytes.
   *
   * Never throws, for the reason `publish` does not.
   */
  async publishQueue(queue: LiveQueue, waiting: number): Promise<void> {
    await this.publishOn(
      queueChannelFor(queue),
      { type: 'queue', queue, waiting },
      `the ${queue} queue`,
    );
  }

  /**
   * Registers one open SSE connection. The returned function unregisters it
   * and MUST be called when the response closes, or a browser that navigates
   * away leaves a listener behind for the lifetime of the process.
   */
  subscribe(userId: string, listener: Listener): () => void {
    return this.subscribeOn(channelFor(userId), listener);
  }

  /** `subscribe`, for a queue channel. Same contract: call the returned
   *  function when the response closes. */
  subscribeQueue(queue: LiveQueue, listener: Listener): () => void {
    return this.subscribeOn(queueChannelFor(queue), listener);
  }

  private async publishOn(channel: string, event: NotificationEvent, what: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.publish(channel, JSON.stringify(event));
    } catch (error) {
      this.logger.warn(`could not publish ${what}: ${(error as Error).message}`);
    }
  }

  private subscribeOn(channel: string, listener: Listener): () => void {
    const existing = this.listeners.get(channel);
    if (existing) {
      existing.add(listener);
    } else {
      this.listeners.set(channel, new Set([listener]));
      void this.redisSubscribe(channel);
    }

    return () => {
      const set = this.listeners.get(channel);
      if (!set) return;
      set.delete(listener);
      if (set.size > 0) return;
      // Last tab on this channel on this instance — stop paying for it.
      this.listeners.delete(channel);
      void this.redisUnsubscribe(channel);
    };
  }

  /** The local delivery path: hands an event to every listener registered on
   *  THIS instance for `channel`. */
  private deliver(channel: string, raw: string): void {
    const set = this.listeners.get(channel);
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

    // A copy: a listener whose response has just closed unsubscribes from
    // INSIDE this loop, and deleting from the Set being iterated would skip
    // the next listener.
    for (const listener of [...set]) {
      try {
        listener(event);
      } catch (error) {
        // One dead response must not stop the others from being written to.
        this.logger.warn(`a notification listener threw: ${(error as Error).message}`);
      }
    }
  }

  private connection(): Redis | null {
    if (this.subscriber) return this.subscriber;
    if (!this.redis) return null;

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

    // Keyed by the channel itself, so a user's channel and a queue's channel
    // go through the one delivery path without either parsing the other's name.
    subscriber.on('message', (channel: string, raw: string) => {
      this.deliver(channel, raw);
    });
    subscriber.on('error', (error: Error) => {
      this.logger.warn(`notification subscriber error: ${error.message}`);
    });

    this.subscriber = subscriber;
    return subscriber;
  }

  private async redisSubscribe(channel: string): Promise<void> {
    try {
      await this.connection()?.subscribe(channel);
    } catch (error) {
      this.logger.warn(`could not subscribe to ${channel}: ${(error as Error).message}`);
    }
  }

  private async redisUnsubscribe(channel: string): Promise<void> {
    try {
      await this.connection()?.unsubscribe(channel);
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
