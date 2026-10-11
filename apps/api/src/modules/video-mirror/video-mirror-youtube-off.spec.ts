/**
 * «السحب من يوتيوب مقفول» must still encode uploads.
 *
 * Both pipelines are one queue, and the flag used to end the whole tick — so
 * turning YouTube off would have left every uploaded lecture `pending` for
 * ever. That is why the compose default stayed `true` after #431, and why a
 * failing YouTube pull and a bucket listing kept running every minute on every
 * stack.
 */
import { Logger } from '@nestjs/common';
import { VideoMirrorService } from './video-mirror.service';

type Row = { lessonId: string; externalId: string; provider: 'upload' | 'youtube'; mirrorAttempts: number; mirrorStatus: string };

function build(pullsFromYouTube: boolean, row: Row | null) {
  const wheres: Record<string, unknown>[] = [];
  const transcoded: string[] = [];
  const pulled: string[] = [];
  let listings = 0;

  // The constructor reads the whole environment; the tick needs none of it.
  const service = Object.create(VideoMirrorService.prototype) as VideoMirrorService;
  Object.assign(service, {
    logger: new Logger('video-mirror-spec'),
    running: false,
    renewTimer: null,
    config: {},
    pullsFromYouTube,
    storage: {
      listMirroredIds: async () => {
        listings += 1;
        return new Set<string>();
      },
    },
    redis: { set: async () => 'OK', pexpire: async () => 1, del: async () => 1 },
    prisma: {
      lessonVideo: {
        findFirst: async (args: { where: Record<string, unknown> }) => {
          wheres.push(args.where);
          return row;
        },
        update: async () => ({}),
      },
      // No material waiting either — see the material spec for that queue.
      lessonResource: { findFirst: async () => null },
    },
    transcodeOne: async (id: string) => void transcoded.push(id),
    mirrorOne: async (id: string) => void pulled.push(id),
  });

  return { service, wheres, transcoded, pulled, listings: () => listings };
}

const UPLOAD: Row = { lessonId: 'l1', externalId: 'a'.repeat(32), provider: 'upload', mirrorAttempts: 0, mirrorStatus: 'pending' };

describe('VideoMirrorService.tick with YouTube pulls off', () => {
  it('still encodes an uploaded lecture', async () => {
    const { service, transcoded } = build(false, UPLOAD);
    await service.tick();
    expect(transcoded).toEqual([UPLOAD.externalId]);
  });

  it('claims uploads only, and an empty queue asks the bucket nothing', async () => {
    const { service, wheres, pulled, listings } = build(false, null);
    await service.tick();
    expect(wheres[0]).toMatchObject({ provider: 'upload' });
    expect(pulled).toEqual([]);
    expect(listings()).toBe(0);
  });
});

describe('VideoMirrorService.tick with YouTube pulls on', () => {
  it('claims every provider and sweeps the bucket when the queue is empty', async () => {
    const { service, wheres, listings } = build(true, null);
    await service.tick();
    expect(wheres[0]).not.toHaveProperty('provider');
    expect(listings()).toBe(1);
  });
});
