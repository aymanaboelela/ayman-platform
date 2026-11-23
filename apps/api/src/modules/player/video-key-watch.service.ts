import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../../redis/redis.module';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Key requests one account may make in `RATE_WINDOW_SECONDS`. Our player asks
 * once per lecture it opens (hls.js caches the key by URI across every rung
 * and every seek), so a student reloading a stuck page a dozen times is far
 * below this and a script walking the catalogue is far above it.
 */
export const KEY_RATE_LIMIT = 60;
const RATE_WINDOW_SECONDS = 10 * 60;

/**
 * DIFFERENT lectures one account may open in a clock hour.
 *
 * `KEY_RATE_LIMIT` counts requests, and a downloader needs only one request
 * per lecture — so that ceiling let a script take 60 lectures every ten
 * minutes, a whole course before the burst alert below was even read. This
 * one counts lectures: the same lecture asked for again (a reload on a weak
 * phone, a stuck page, a second tab) is never counted twice, so a student
 * watching normally cannot reach it. A student revising the night before an
 * exam opens ten or fifteen lectures in the WHOLE night; twenty inside one
 * hour is a script, and it now waits for the next hour instead of finishing.
 *
 * A clock hour (`YYYY-MM-DDTHH` UTC), not a rolling one: deterministic, one
 * Redis key, and the worst case at the boundary is two hours' worth back to
 * back — still a fraction of what the request ceiling allowed.
 */
export const KEY_LECTURES_PER_HOUR = 20;
const HOUR_SECONDS = 60 * 60;

/**
 * How long a native ticket lasts — see `allowNative`. Longer than the longest
 * lecture on the platform (the unit workshops run past five hours) with room
 * for a pause, because Safari's own player may ask for the key again
 * mid-lecture and a refusal there stops the video.
 */
const NATIVE_TICKET_SECONDS = 12 * 60 * 60;

/**
 * Distinct lectures one account opened in a Cairo day before the admins are
 * told. A student revising the night before an exam opens ten or fifteen; a
 * downloader takes the whole course. High on purpose — the alert asks a human
 * to look, and every false one teaches them to stop looking.
 */
export const KEY_BURST_VIDEOS = 25;
const DAY_SECONDS = 24 * 60 * 60;

/** `YYYY-MM-DD` in Cairo, so «النهارده» is the day the admin means. */
function cairoDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(now);
}

/**
 * Who is taking keys, and how fast — the half of «مينفعش حد ينزّل» that the
 * wrapped key (`maskVideoKey`) cannot do on its own.
 *
 * The wrap stops generic downloaders. It cannot stop someone who reads our
 * player and scripts it, and a subscriber doing that has every key they are
 * entitled to. What is left is noticing: a rate ceiling that makes bulk
 * extraction slow, and an alert to staff when one account opens far more
 * lectures in a day than anyone watches. Nobody is locked out automatically —
 * the ceilings pause for an hour at most, and a lecture already open keeps
 * playing: a paying student wrongly cut off mid-revision costs more than a
 * late alert.
 *
 * Fails OPEN when Redis is down — same call as `UnlockAttemptsService`: the
 * entitlement check already ran, so the key is theirs; only the counting is lost.
 */
@Injectable()
export class VideoKeyWatchService {
  private readonly logger = new Logger(VideoKeyWatchService.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Counts one key handed to `userId` for `videoId`. Throws 429 past the rate
   * ceiling or past `KEY_LECTURES_PER_HOUR`; otherwise records the lecture
   * and, once a day per account, tells staff when the day's count crosses
   * `KEY_BURST_VIDEOS`.
   */
  async admit(userId: string, videoId: string, now = new Date()): Promise<void> {
    let requests: number;
    try {
      const rateKey = `vk:rate:${userId}`;
      requests = await this.redis.incr(rateKey);
      if (requests === 1) await this.redis.expire(rateKey, RATE_WINDOW_SECONDS);
    } catch (error) {
      this.logger.warn({ err: error }, 'video-key counter unavailable — allowing');
      return;
    }
    if (requests > KEY_RATE_LIMIT) {
      this.logger.warn({ userId, videoId, requests }, 'video-key rate ceiling hit');
      throw new HttpException('too many key requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    await this.admitLecture(userId, videoId, now);
    // Not awaited by the route: the student's video must not wait on the
    // bookkeeping, and a failure here loses an alert, never a lecture.
    void this.record(userId, videoId, now).catch((error: unknown) => {
      this.logger.warn({ err: error, userId }, 'video-key burst record failed');
    });
  }

  /**
   * The `KEY_LECTURES_PER_HOUR` ceiling. A lecture already opened this hour
   * always passes; a new one past the line is refused and NOT kept in the
   * set, so the refusal does not use up a place. Fails open like `admit`.
   */
  private async admitLecture(userId: string, videoId: string, now: Date): Promise<void> {
    const hourKey = `vk:hour:${userId}:${now.toISOString().slice(0, 13)}`;
    let lectures: number;
    try {
      const added = await this.redis.sadd(hourKey, videoId);
      if (added === 0) return;
      lectures = await this.redis.scard(hourKey);
      if (lectures === 1) await this.redis.expire(hourKey, 2 * HOUR_SECONDS);
      if (lectures <= KEY_LECTURES_PER_HOUR) return;
      await this.redis.srem(hourKey, videoId);
    } catch (error) {
      this.logger.warn({ err: error }, 'video-key lecture counter unavailable — allowing');
      return;
    }
    this.logger.warn({ userId, videoId, lectures }, 'video-key lectures-per-hour ceiling hit');
    throw new HttpException('too many lectures this hour', HttpStatus.TOO_MANY_REQUESTS);
  }

  /**
   * A native ticket: this account's page is about to hand this lecture's
   * playlist to an iPhone's own player, which will fetch the key with no
   * nonce. Refreshed on every call, so a student who reopens the lecture
   * tomorrow gets a fresh twelve hours.
   */
  async allowNative(userId: string, videoId: string): Promise<void> {
    try {
      await this.redis.set(`vk:native:${userId}:${videoId}`, '1', 'EX', NATIVE_TICKET_SECONDS);
    } catch (error) {
      // `nativeAllowed` fails open on the same outage, so the lecture still plays.
      this.logger.warn({ err: error, userId }, 'video-key native ticket not stored');
    }
  }

  /**
   * Whether `allowNative` ran for this account and lecture recently. Fails
   * OPEN when Redis is down, like `admit`: the iPhone is entitled (that check
   * runs after this), and a student on an old phone losing the lecture to an
   * outage costs more than a downloader getting one window.
   */
  async nativeAllowed(userId: string, videoId: string): Promise<boolean> {
    try {
      return (await this.redis.exists(`vk:native:${userId}:${videoId}`)) === 1;
    } catch (error) {
      this.logger.warn({ err: error, userId }, 'video-key native ticket unreadable — allowing');
      return true;
    }
  }

  private async record(userId: string, videoId: string, now: Date): Promise<void> {
    const day = cairoDay(now);
    const seenKey = `vk:seen:${userId}:${day}`;
    await this.redis.sadd(seenKey, videoId);
    await this.redis.expire(seenKey, 2 * DAY_SECONDS);
    const videos = await this.redis.scard(seenKey);
    if (videos < KEY_BURST_VIDEOS) return;

    // «متابعة التنزيل» — the durable record, grown with every new lecture past
    // the line so the screen shows the day's real count, not the 25th.
    const videoIds = await this.redis.smembers(seenKey);
    const dayDate = new Date(`${day}T00:00:00.000Z`);
    await this.prisma.videoKeyFlag.upsert({
      where: { userId_day: { userId, day: dayDate } },
      create: { userId, day: dayDate, videos, videoIds },
      update: { videos, videoIds },
    });

    // Once per account per day — the 26th lecture and the 60th are the same news.
    const first = await this.redis.set(`vk:alerted:${userId}:${day}`, '1', 'EX', 2 * DAY_SECONDS, 'NX');
    if (first !== 'OK') return;

    const student = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    this.logger.warn({ userId, videos, day }, 'video-key burst — staff alerted');
    await this.notifications.notifyPermission('student:read', 'video_key_burst', {
      studentId: userId,
      // A snapshot, like `assistant_question_received`'s preview: the alert is
      // about what this account did today, under the name it had today.
      studentName: student?.name ?? '',
      videos,
    });
  }
}
