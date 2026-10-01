/**
 * «شفّره» / «من غير تشفير» — the admin's choice at upload time
 * (`VideoUploadStartSchema.encrypt`), stored on the row and read back here
 * when the worker actually transcodes. This is the one branch in
 * `transcodeOne` genuinely new to this flag; every path on either side of it
 * (`transcodeUpload`'s `encryption: null` handling, `VideoKeyService`
 * refusing an unencrypted video) is covered elsewhere.
 */
import { Logger } from '@nestjs/common';
import { VideoMirrorService } from './video-mirror.service';

const transcodeUpload = jest.fn();
jest.mock('./upload-pipeline', () => ({
  ...jest.requireActual('./upload-pipeline'),
  transcodeUpload: (...args: unknown[]) => transcodeUpload(...args),
}));

const UPLOAD_ID = 'a'.repeat(32);
const KEY = Buffer.alloc(16, 7);

function build(encrypted: boolean | undefined) {
  const prisma = {
    lessonVideo: {
      findFirst: async () => (encrypted === undefined ? null : { encrypted }),
      updateMany: async () => ({ count: 1 }),
    },
  };
  const storage = {
    sizeOf: async () => 1024,
    downloadTo: async () => undefined,
    deletePrefix: async () => undefined,
    uploadLadder: async () => undefined,
    deleteObject: async () => undefined,
  };
  const service = Object.create(VideoMirrorService.prototype) as VideoMirrorService;
  Object.assign(service, {
    logger: new Logger('video-mirror-encrypt-flag-spec'),
    config: {},
    storage,
    prisma,
    encoder: {},
    appUrl: 'https://example.test',
    videoKey: () => KEY,
  });
  return service;
}

const RESULT = {
  dir: '/tmp/x',
  files: [],
  maxHeight: 720,
  bytes: 10,
  durationSeconds: 60,
  cleanup: async () => undefined,
};

describe('VideoMirrorService.transcodeOne — the encrypted flag', () => {
  afterEach(() => {
    transcodeUpload.mockReset();
  });

  it('encrypts by default — a row with no flag set yet behaves as it always did', async () => {
    transcodeUpload.mockResolvedValue(RESULT);
    await build(undefined).transcodeOne(UPLOAD_ID);

    const encryption = transcodeUpload.mock.calls[0]![4];
    expect(encryption).toEqual({ key: KEY, uri: expect.stringContaining(UPLOAD_ID) });
  });

  it('encrypts when the admin asked for it', async () => {
    transcodeUpload.mockResolvedValue(RESULT);
    await build(true).transcodeOne(UPLOAD_ID);

    const encryption = transcodeUpload.mock.calls[0]![4];
    expect(encryption).toEqual({ key: KEY, uri: expect.stringContaining(UPLOAD_ID) });
  });

  it('passes `null` — plain HLS, no key at all — when the admin turned it off', async () => {
    transcodeUpload.mockResolvedValue(RESULT);
    await build(false).transcodeOne(UPLOAD_ID);

    expect(transcodeUpload.mock.calls[0]![4]).toBeNull();
  });
});
