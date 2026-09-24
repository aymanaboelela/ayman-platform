import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../../redis/redis.module';

/** Five wrong codes in a row, then a lock. */
const FAILS_PER_LOCK = 5;
/** Older misses are forgiven — five typos across a week is not an attack. */
const FAIL_WINDOW_SECONDS = 15 * 60;
/** Each lock longer than the last: a minute, five, a quarter hour, an hour. */
const LOCK_LADDER_SECONDS = [60, 5 * 60, 15 * 60, 60 * 60];
/** How long an address/account remembers having been locked — a day, so a
 *  script that pauses and comes back resumes at the top of the ladder. */
const LOCK_MEMORY_SECONDS = 24 * 60 * 60;

/**
 * ⚠️ The real protection on a six-character code — the guardian gate's ladder,
 * applied to two keys at once.
 *
 * ## Why the ACCOUNT and the ADDRESS
 *
 * The guardian gate counts by address only, because counting by code would let
 * anybody lock a stranger's parent out. Here the caller is a signed-in student,
 * so the account is a key nobody else can spend — and it is the one that holds
 * when a whole school shares one NAT address and the address key cannot be
 * made strict. The address key is the one that holds against a script that
 * makes a fresh account for every five guesses. A lock on EITHER refuses.
 *
 * Only misses count. A student redeeming three codes they paid for in a row
 * must never walk into a lock.
 *
 * If Redis is down, redemption is ALLOWED and logged. Refusing every paying
 * student because a counter is unreachable costs more than it protects, and
 * the per-route `@Throttle` on the controller still bounds the rate.
 */
@Injectable()
export class UnlockAttemptsService {
  private readonly logger = new Logger(UnlockAttemptsService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Seconds left on the longer of the two locks, or zero. */
  async lockedFor(userId: string, ip: string): Promise<number> {
    try {
      const [user, address] = await Promise.all([
        this.redis.pttl(`unlock:lock:user:${userId}`),
        this.redis.pttl(`unlock:lock:ip:${ip}`),
      ]);
      const ms = Math.max(user, address);
      return ms > 0 ? Math.ceil(ms / 1000) : 0;
    } catch (error) {
      this.logger.warn({ err: error }, 'unlock-code attempt counter unavailable — allowing');
      return 0;
    }
  }

  /** Counts one miss against both keys. Returns the lock length in seconds
   *  when this miss tripped a lock, otherwise `null`. */
  async recordFailure(userId: string, ip: string): Promise<number | null> {
    const results = await Promise.all([this.bump(`user:${userId}`), this.bump(`ip:${ip}`)]);
    const locks = results.filter((value): value is number => value !== null);
    return locks.length > 0 ? Math.max(...locks) : null;
  }

  private async bump(key: string): Promise<number | null> {
    const failKey = `unlock:fail:${key}`;
    try {
      const fails = await this.redis.incr(failKey);
      if (fails === 1) await this.redis.expire(failKey, FAIL_WINDOW_SECONDS);
      if (fails < FAILS_PER_LOCK) return null;

      const levelKey = `unlock:level:${key}`;
      const level = await this.redis.incr(levelKey);
      await this.redis.expire(levelKey, LOCK_MEMORY_SECONDS);
      const seconds = LOCK_LADDER_SECONDS[Math.min(level, LOCK_LADDER_SECONDS.length) - 1]!;
      await this.redis.set(`unlock:lock:${key}`, '1', 'EX', seconds);
      await this.redis.del(failKey);
      this.logger.warn({ key, level, seconds }, 'unlock-code redemption locked');
      return seconds;
    } catch (error) {
      this.logger.warn({ err: error }, 'unlock-code attempt counter unavailable — allowing');
      return null;
    }
  }
}
