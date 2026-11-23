/**
 * The bulk-download alarm: a request ceiling, a lectures-per-hour ceiling that
 * a reload never counts against, one alert per account per day once it opens
 * `KEY_BURST_VIDEOS` distinct lectures, and the iPhone native ticket. Fails
 * open on Redis.
 */
import type Redis from 'ioredis';
import type { PrismaService } from '../../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { KEY_BURST_VIDEOS, KEY_LECTURES_PER_HOUR, KEY_RATE_LIMIT, VideoKeyWatchService } from './video-key-watch.service';

/** Just enough of Redis for incr/expire/sadd/srem/scard/set/exists. */
function fakeRedis() {
  const counters = new Map<string, number>();
  const sets = new Map<string, Set<string>>();
  const strings = new Map<string, string>();
  return {
    incr: async (key: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    expire: async () => 1,
    sadd: async (key: string, member: string) => {
      const set = sets.get(key) ?? new Set<string>();
      sets.set(key, set);
      if (set.has(member)) return 0;
      set.add(member);
      return 1;
    },
    srem: async (key: string, member: string) => (sets.get(key)?.delete(member) ? 1 : 0),
    scard: async (key: string) => sets.get(key)?.size ?? 0,
    smembers: async (key: string) => [...(sets.get(key) ?? [])],
    set: async (key: string, value: string, ...options: string[]) => {
      if (options.includes('NX') && strings.has(key)) return null;
      strings.set(key, value);
      return 'OK';
    },
    exists: async (key: string) => (strings.has(key) ? 1 : 0),
  };
}

function build(redis: unknown = fakeRedis()) {
  const alerts: unknown[] = [];
  const flags = new Map<string, { videos: number; videoIds: string[] }>();
  const service = new VideoKeyWatchService(
    redis as Redis,
    {
      user: { findUnique: async () => ({ name: 'طالب تجربة' }) },
      videoKeyFlag: {
        upsert: async (args: { where: { userId_day: { userId: string; day: Date } }; create: { videos: number; videoIds: string[] } }) => {
          const { userId, day } = args.where.userId_day;
          flags.set(`${userId}:${day.toISOString().slice(0, 10)}`, args.create);
        },
      },
    } as unknown as PrismaService,
    {
      notifyPermission: async (_permission: string, kind: string, payload: unknown) => {
        alerts.push({ kind, payload });
      },
    } as unknown as NotificationsService,
  );
  return { service, alerts, flags };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const vid = (n: number) => n.toString(16).padStart(32, '0');

describe('VideoKeyWatchService', () => {
  it('tells staff once when an account opens many distinct lectures in a day', async () => {
    const { service, alerts, flags } = build();
    // Ten lectures an hour through one Cairo day — under the hourly ceiling,
    // over the daily alert.
    const at = (n: number) => new Date(Date.parse('2026-11-14T06:00:00Z') + n * 6 * 60 * 1000);
    for (let n = 0; n < KEY_BURST_VIDEOS - 1; n += 1) {
      await service.admit('u1', vid(n), at(n));
      await service.admit('u1', vid(n), at(n)); // a reload is the same lecture
    }
    await flush();
    expect(alerts).toHaveLength(0);

    await service.admit('u1', vid(KEY_BURST_VIDEOS), at(KEY_BURST_VIDEOS));
    await service.admit('u1', vid(KEY_BURST_VIDEOS + 1), at(KEY_BURST_VIDEOS + 1));
    await flush();
    expect(alerts).toEqual([
      { kind: 'video_key_burst', payload: { studentId: 'u1', studentName: 'طالب تجربة', videos: KEY_BURST_VIDEOS } },
    ]);
    // «متابعة التنزيل» keeps the day's real count, past the line.
    expect(flags.get('u1:2026-11-14')?.videos).toBe(KEY_BURST_VIDEOS + 1);
    expect(flags.get('u1:2026-11-14')?.videoIds).toHaveLength(KEY_BURST_VIDEOS + 1);
  });

  it('refuses past the rate ceiling with a 429', async () => {
    const { service } = build();
    for (let n = 0; n < KEY_RATE_LIMIT; n += 1) await service.admit('u2', vid(1));
    await expect(service.admit('u2', vid(1))).rejects.toMatchObject({ status: 429 });
  });

  it('pauses a new lecture past the hourly ceiling, and never one already open', async () => {
    const { service } = build();
    const now = new Date('2026-11-14T10:05:00Z');
    for (let n = 0; n < KEY_LECTURES_PER_HOUR; n += 1) await service.admit('u4', vid(n), now);
    await expect(service.admit('u4', vid(KEY_LECTURES_PER_HOUR), now)).rejects.toMatchObject({ status: 429 });
    // The refusal did not take a place, and the lectures already open keep playing.
    await expect(service.admit('u4', vid(KEY_LECTURES_PER_HOUR), now)).rejects.toMatchObject({ status: 429 });
    await expect(service.admit('u4', vid(0), now)).resolves.toBeUndefined();
    // The next hour starts clean.
    await expect(service.admit('u4', vid(KEY_LECTURES_PER_HOUR), new Date('2026-11-14T11:00:00Z'))).resolves.toBeUndefined();
  });

  it('never counts a reload of the same lecture against the hourly ceiling', async () => {
    const { service } = build();
    const now = new Date('2026-11-14T10:05:00Z');
    for (let n = 0; n < KEY_RATE_LIMIT; n += 1) {
      await expect(service.admit('u5', vid(n % 3), now)).resolves.toBeUndefined();
    }
  });

  it('keeps a native ticket to the account and lecture it was taken for', async () => {
    const { service } = build();
    expect(await service.nativeAllowed('u6', vid(1))).toBe(false);
    await service.allowNative('u6', vid(1));
    expect(await service.nativeAllowed('u6', vid(1))).toBe(true);
    expect(await service.nativeAllowed('u6', vid(2))).toBe(false);
    expect(await service.nativeAllowed('u7', vid(1))).toBe(false);
  });

  it('lets an iPhone through when Redis cannot say whether it took a ticket', async () => {
    const { service } = build({
      exists: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    expect(await service.nativeAllowed('u8', vid(1))).toBe(true);
  });

  it('lets the key through when Redis is down', async () => {
    const { service } = build({
      incr: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    await expect(service.admit('u3', vid(1))).resolves.toBeUndefined();
  });
});
