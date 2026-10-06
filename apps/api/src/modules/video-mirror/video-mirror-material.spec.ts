/**
 * «رفع فيديو» جوّه مواد الدرس — the worker's half.
 *
 * A material's upload is a `lesson_resources` row, not a `lesson_videos` one,
 * and the queue used to read only the latter: a material that finished
 * uploading would have sat `pending` forever. These pin the two places the
 * worker now reaches it — the claim, and the encoder's writes — and that it
 * never reaches the lecture's own row while doing so.
 */
import { Logger } from '@nestjs/common';
import { VideoMirrorService } from './video-mirror.service';

const transcodeUpload = jest.fn();
jest.mock('./upload-pipeline', () => ({
  ...jest.requireActual('./upload-pipeline'),
  transcodeUpload: (...args: unknown[]) => transcodeUpload(...args),
}));

const MATERIAL_VIDEO = 'b'.repeat(32);

type Write = { where: Record<string, unknown>; data: Record<string, unknown> };

function build(options: { lecture: Record<string, unknown> | null; transcode?: (id: string) => Promise<void> }) {
  const lectureWrites: Write[] = [];
  const materialWrites: Write[] = [];
  const materialClaims: Record<string, unknown>[] = [];
  const transcoded: string[] = [];

  const service = Object.create(VideoMirrorService.prototype) as VideoMirrorService;
  Object.assign(service, {
    logger: new Logger('video-mirror-material-spec'),
    running: false,
    renewTimer: null,
    config: {},
    pullsFromYouTube: false,
    storage: {},
    redis: { set: async () => 'OK', pexpire: async () => 1, del: async () => 1 },
    prisma: {
      lessonVideo: {
        findFirst: async () => options.lecture,
        update: async (args: Write) => void lectureWrites.push(args),
        updateMany: async (args: Write) => {
          lectureWrites.push(args);
          return { count: 0 };
        },
      },
      lessonResource: {
        findFirst: async (args: { where: Record<string, unknown> }) => {
          materialClaims.push(args.where);
          return { id: 'r1', videoExternalId: MATERIAL_VIDEO, mirrorAttempts: 0 };
        },
        update: async (args: Write) => void materialWrites.push(args),
        updateMany: async (args: Write) => {
          materialWrites.push(args);
          return { count: 1 };
        },
      },
    },
    transcodeOne:
      options.transcode ??
      (async (id: string) => {
        transcoded.push(id);
      }),
  });

  return { service, lectureWrites, materialWrites, materialClaims, transcoded };
}

describe('VideoMirrorService.tick — a lesson material\'s upload', () => {
  it('is claimed once no lecture is waiting, and encoded by the same pipeline', async () => {
    const { service, materialClaims, materialWrites, lectureWrites, transcoded } = build({ lecture: null });
    await service.tick();

    expect(materialClaims[0]).toMatchObject({ videoProvider: 'upload' });
    expect(transcoded).toEqual([MATERIAL_VIDEO]);
    expect(materialWrites[0]).toEqual({
      where: { id: 'r1' },
      data: expect.objectContaining({ mirrorStatus: 'mirroring' }),
    });
    // The lecture's row is never the one written for a material.
    expect(lectureWrites).toEqual([]);
  });

  it('waits behind a lecture — the lecture is what the student opened the page for', async () => {
    const lecture = { lessonId: 'l1', externalId: 'a'.repeat(32), provider: 'upload', mirrorAttempts: 0, mirrorStatus: 'pending' };
    const { service, materialClaims, transcoded } = build({ lecture });
    await service.tick();

    expect(materialClaims).toEqual([]);
    expect(transcoded).toEqual(['a'.repeat(32)]);
  });

  it('records a failure on the material row, never on a lecture', async () => {
    const { service, materialWrites, lectureWrites } = build({
      lecture: null,
      transcode: async () => {
        throw new Error('ffprobe: not a video');
      },
    });
    await service.tick();

    const failed = materialWrites.find((write) => write.data.mirrorStatus === 'failed');
    expect(failed).toEqual({
      where: { id: 'r1' },
      data: expect.objectContaining({ mirrorAttempts: 1, mirrorError: 'ffprobe: not a video' }),
    });
    expect(lectureWrites).toEqual([]);
  });
});

describe('VideoMirrorService.transcodeOne — a lesson material\'s upload', () => {
  afterEach(() => transcodeUpload.mockReset());

  it('writes ready, the ladder and the duration onto the material row', async () => {
    transcodeUpload.mockResolvedValue({
      dir: '/tmp/x',
      files: [],
      maxHeight: 720,
      bytes: 10,
      durationSeconds: 95,
      cleanup: async () => undefined,
    });
    const materialWrites: Write[] = [];
    const service = Object.create(VideoMirrorService.prototype) as VideoMirrorService;
    Object.assign(service, {
      logger: new Logger('video-mirror-material-spec'),
      config: {},
      storage: {
        sizeOf: async () => 1024,
        downloadTo: async () => undefined,
        deletePrefix: async () => undefined,
        uploadLadder: async () => undefined,
        deleteObject: async () => undefined,
      },
      prisma: {
        // No lecture row names this upload, so no `encrypted` flag: always encrypted.
        lessonVideo: { findFirst: async () => null, updateMany: async () => ({ count: 0 }) },
        lessonResource: {
          updateMany: async (args: Write) => {
            materialWrites.push(args);
            return { count: 1 };
          },
        },
      },
      encoder: {},
      appUrl: 'https://example.test',
      videoKey: () => Buffer.alloc(16, 7),
    });

    await service.transcodeOne(MATERIAL_VIDEO);

    expect(transcodeUpload.mock.calls[0]![4]).toEqual({ key: expect.any(Buffer), uri: expect.stringContaining(MATERIAL_VIDEO) });
    const ready = materialWrites.find((write) => write.data.mirrorStatus === 'ready');
    expect(ready).toEqual({
      where: { videoExternalId: MATERIAL_VIDEO, videoProvider: 'upload' },
      data: expect.objectContaining({ mirrorHeight: 720, durationSeconds: 95, mirrorProgress: 100 }),
    });
  });
});
