/**
 * The bulk-download alarm: a rate ceiling, and one alert per account per day
 * once it opens `KEY_BURST_VIDEOS` distinct lectures. Fails open on Redis.
 */
import type Redis from 'ioredis';
import type { PrismaService } from '../../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { KEY_BURST_VIDEOS, KEY_RATE_LIMIT, VideoKeyWatchService } from './video-key-watch.service';

/** Just enough of Redis for incr/expire/sadd/scard/set NX. */
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
      set.add(member);
      return 1;
    },
    scard: async (key: string) => sets.get(key)?.size ?? 0,
    set: async (key: string, value: string) => {
      if (strings.has(key)) return null;
      strings.set(key, value);
      return 'OK';
    },
  };
}

function build(redis: unknown = fakeRedis()) {
  const alerts: unknown[] = [];
  const service = new VideoKeyWatchService(
    redis as Redis,
    { user: { findUnique: async () => ({ name: 'طالب تجربة' }) } } as unknown as PrismaService,
    {
      notifyPermission: async (_permission: string, kind: string, payload: unknown) => {
        alerts.push({ kind, payload });
      },
    } as unknown as NotificationsService,
  );
  return { service, alerts };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const vid = (n: number) => n.toString(16).padStart(32, '0');

describe('VideoKeyWatchService', () => {
  it('tells staff once when an account opens many distinct lectures in a day', async () => {
    const { service, alerts } = build();
    const now = new Date('2026-11-14T10:00:00Z');
    for (let n = 0; n < KEY_BURST_VIDEOS - 1; n += 1) {
      await service.admit('u1', vid(n), now);
      await service.admit('u1', vid(n), now); // a reload is the same lecture
    }
    await flush();
    expect(alerts).toHaveLength(0);

    await service.admit('u1', vid(KEY_BURST_VIDEOS), now);
    await service.admit('u1', vid(KEY_BURST_VIDEOS + 1), now);
    await flush();
    expect(alerts).toEqual([
      { kind: 'video_key_burst', payload: { studentId: 'u1', studentName: 'طالب تجربة', videos: KEY_BURST_VIDEOS } },
    ]);
  });

  it('refuses past the rate ceiling with a 429', async () => {
    const { service } = build();
    for (let n = 0; n < KEY_RATE_LIMIT; n += 1) await service.admit('u2', vid(1));
    await expect(service.admit('u2', vid(1))).rejects.toMatchObject({ status: 429 });
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
