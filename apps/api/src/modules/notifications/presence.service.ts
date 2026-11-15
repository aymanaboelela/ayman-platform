import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '../../redis/redis.module';

/**
 * How long one heartbeat keeps someone «متصل». The stream writes a heartbeat
 * every 25s (`HEARTBEAT_MS`), so this survives one missed beat and lapses
 * within about a minute of a laptop lid closing without a clean disconnect.
 */
const ONLINE_TTL_S = 70;
/** «آخر ظهور» is kept for a month; older than that reads as nothing at all. */
const LAST_SEEN_TTL_S = 30 * 24 * 60 * 60;

const onKey = (userId: string) => `presence:on:${userId}`;
const seenKey = (userId: string) => `presence:seen:${userId}`;

export interface Presence {
  online: boolean;
  lastSeenAt: string | null;
}

/**
 * «متصل دلوقتي» / «آخر ظهور» — derived from the notification stream, the one
 * connection every signed-in tab already holds (`NotificationsController`).
 *
 * In Redis, not a table: it is a fact about the next minute, written on every
 * heartbeat, and nothing about it is worth a row or a migration. The key has
 * a TTL, so an instance that dies without closing its streams cannot leave
 * anyone «متصل» forever.
 *
 * Fails OPEN like `NotificationsRealtimeService`, for the same reason: a
 * presence dot that cannot be drawn is cosmetic, and nothing may fail over it.
 */
@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(@Optional() @Inject(REDIS) private readonly redis?: Redis) {}

  /**
   * A stream opened or beat. Returns `true` when this flipped the person from
   * offline to online — the moment the inbox is told — and `false` when they
   * were already on (another tab, another instance, the previous beat).
   */
  async touch(userId: string): Promise<boolean> {
    if (!this.redis) return false;
    try {
      const created = await this.redis.set(onKey(userId), '1', 'EX', ONLINE_TTL_S, 'NX');
      if (created === 'OK') return true;
      await this.redis.expire(onKey(userId), ONLINE_TTL_S);
      return false;
    } catch (error) {
      this.logger.warn(`could not mark ${userId} online: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * This instance's LAST stream for the person closed. Marks them offline and
   * stamps «آخر ظهور». If another instance still holds a stream for them, its
   * next beat puts them back on within 25s (and `touch` reports that flip).
   */
  async leave(userId: string): Promise<string | null> {
    if (!this.redis) return null;
    const now = new Date().toISOString();
    try {
      await this.redis
        .multi()
        .del(onKey(userId))
        .set(seenKey(userId), now, 'EX', LAST_SEEN_TTL_S)
        .exec();
      return now;
    } catch (error) {
      this.logger.warn(`could not mark ${userId} offline: ${(error as Error).message}`);
      return null;
    }
  }

  /** Presence for a page of people, one round trip. Unknown → offline, never seen. */
  async read(userIds: readonly string[]): Promise<Map<string, Presence>> {
    const result = new Map<string, Presence>();
    const ids = [...new Set(userIds)];
    if (!this.redis || ids.length === 0) return result;
    try {
      const values = await this.redis.mget(...ids.map(onKey), ...ids.map(seenKey));
      ids.forEach((id, index) => {
        result.set(id, {
          online: values[index] !== null,
          lastSeenAt: values[ids.length + index] ?? null,
        });
      });
    } catch (error) {
      this.logger.warn(`could not read presence: ${(error as Error).message}`);
    }
    return result;
  }
}
