/**
 * A deploy must not park an upload for 45 minutes.
 *
 * «١٣٩ ميجا … بقالها ربع ساعة ثابتة» on «بيتجهّز على السيرفر… 22%»: the API
 * restarted under the encode, and the row stayed `mirroring` — claimed by a
 * process that no longer existed — until the reaper's 45 minutes ran out.
 * The claim now carries a heartbeat, so a dead one is noticed in minutes.
 */
import { Logger } from '@nestjs/common';
import { VideoMirrorService } from './video-mirror.service';

type Where = { OR?: Array<Record<string, unknown>> } & Record<string, unknown>;

function build(transcode: () => Promise<void>) {
  const wheres: Where[] = [];
  const beats: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];

  const service = Object.create(VideoMirrorService.prototype) as VideoMirrorService;
  Object.assign(service, {
    logger: new Logger('video-mirror-heartbeat-spec'),
    running: false,
    renewTimer: null,
    config: {},
    pullsFromYouTube: false,
    storage: {},
    redis: { set: async () => 'OK', pexpire: async () => 1, del: async () => 1 },
    prisma: {
      lessonVideo: {
        findFirst: async (args: { where: Where }) => {
          wheres.push(args.where);
          return { lessonId: 'l1', externalId: 'a'.repeat(32), provider: 'upload', mirrorAttempts: 0, mirrorStatus: 'pending' };
        },
        update: async () => ({}),
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          beats.push(args);
          return { count: 1 };
        },
      },
    },
    transcodeOne: transcode,
  });

  return { service, wheres, beats };
}

describe('VideoMirrorService — a claim nobody holds', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('is taken back after minutes, not three quarters of an hour', async () => {
    const { service, wheres } = build(async () => undefined);
    const before = Date.now();
    await service.tick();

    const reaper = wheres[0]!.OR!.find((branch) => branch.mirrorStatus === 'mirroring') as {
      mirrorAt: { lt: Date };
    };
    const ageMs = before - reaper.mirrorAt.lt.getTime();
    expect(ageMs).toBeGreaterThanOrEqual(2 * 60_000);
    expect(ageMs).toBeLessThanOrEqual(5 * 60_000);
  });

  it('is kept alive by a heartbeat for as long as the encode runs — and not a beat after', async () => {
    jest.useFakeTimers();
    const { service, beats } = build(() => new Promise<void>((resolve) => setTimeout(resolve, 60_000)));

    const tick = service.tick();
    await jest.advanceTimersByTimeAsync(60_000);
    await tick;

    // A minute of encoding is four beats at fifteen seconds, each scoped to
    // the row it claimed and only while it is still `mirroring`.
    expect(beats.length).toBeGreaterThanOrEqual(3);
    for (const beat of beats) {
      expect(beat.where).toEqual({ lessonId: 'l1', mirrorStatus: 'mirroring' });
      expect(beat.data.mirrorAt).toBeInstanceOf(Date);
    }

    const count = beats.length;
    await jest.advanceTimersByTimeAsync(120_000);
    expect(beats.length).toBe(count);
  });

  it('stops the heartbeat when the encode FAILS too', async () => {
    jest.useFakeTimers();
    const { service, beats } = build(
      () => new Promise<void>((_, reject) => setTimeout(() => reject(new Error('ffmpeg died')), 30_000)),
    );

    const tick = service.tick();
    await jest.advanceTimersByTimeAsync(30_000);
    await tick;

    const count = beats.length;
    await jest.advanceTimersByTimeAsync(120_000);
    expect(beats.length).toBe(count);
  });
});
