import sharp from 'sharp';
import { STORAGE_KEY_PATTERN } from '@ayman/contracts/admin/media';
import { MediaService } from './media.service';
import type { MediaStorage } from './storage/media-storage';

/** A real, tiny PNG — enough for sharp to decode and re-encode for real. */
async function makePng(): Promise<Buffer> {
  return sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();
}

/** The same tiny image, but carrying GPS EXIF — asserts the re-encode strips it. */
async function makePngWithGpsExif(): Promise<Buffer> {
  // sharp's `withMetadata` accepts raw EXIF IFD blocks; GPSLatitude under the
  // gps IFD is enough to prove `exif` metadata round-trips through sharp
  // before the re-encode, and is GONE after it.
  return sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 1, g: 2, b: 3 } },
  })
    .withMetadata({ exif: { IFD0: { Make: 'TestCam' }, GPS: { GPSLatitude: '30/1' } } as never })
    .jpeg()
    .toBuffer();
}

/**
 * A REAL multi-frame animation, built with sharp rather than checked in as a
 * binary: `join: { animated: true }` stacks the frames into the same tall
 * strip libvips uses internally, so what comes back is a genuine animated GIF
 * with a page count, a page height and per-frame delays — the thing that was
 * missing from this file, and the reason nothing here noticed what `.rotate()`
 * does to a page stack.
 */
async function makeAnimatedGif(frameCount = 4, width = 40, height = 20): Promise<Buffer> {
  const frames: Buffer[] = [];
  for (let i = 0; i < frameCount; i += 1) {
    frames.push(
      await sharp({
        create: {
          width,
          height,
          channels: 3,
          background: { r: (i * 60) % 256, g: 40, b: 200 - i * 40 },
        },
      })
        .png()
        .toBuffer(),
    );
  }
  return sharp(frames, { join: { animated: true } }).gif({ delay: 100, loop: 0 }).toBuffer();
}

/**
 * The same animation as an animated WEBP carrying an EXIF orientation.
 *
 * GIF cannot hold one — libvips reads back `undefined` no matter what is
 * written — so animated WebP is the only way to construct the input that
 * makes `.rotate()` throw. Orientation 6 is «rotate 90° clockwise to display»,
 * one of the four (5–8) that libvips cannot apply to a page stack.
 */
async function makeAnimatedWebpWithOrientation(orientation: number): Promise<Buffer> {
  const frames: Buffer[] = [];
  for (let i = 0; i < 4; i += 1) {
    frames.push(
      await sharp({
        create: { width: 40, height: 20, channels: 3, background: { r: i * 50, g: 7, b: 7 } },
      })
        .png()
        .toBuffer(),
    );
  }
  return sharp(frames, { join: { animated: true } })
    .withMetadata({ orientation })
    .webp({ loop: 0, delay: 100 })
    .toBuffer();
}

/** A landscape still tagged «rotate 90° clockwise», i.e. it must come back portrait. */
async function makeStillWithOrientation(
  orientation: number,
  format: 'jpeg' | 'webp',
): Promise<Buffer> {
  const image = sharp({
    create: { width: 40, height: 20, channels: 3, background: { r: 1, g: 2, b: 3 } },
  }).withMetadata({ orientation });
  return format === 'jpeg' ? image.jpeg().toBuffer() : image.webp().toBuffer();
}

function makeInMemoryStorage() {
  const files = new Map<string, Buffer>();
  const storage: MediaStorage = {
    put: jest.fn(async (key: string, body: Buffer) => {
      files.set(key, body);
    }),
    getStream: jest.fn(),
    stat: jest.fn(async (key: string) => (files.has(key) ? { size: files.get(key)!.length } : null)),
    delete: jest.fn(async (key: string) => {
      files.delete(key);
    }),
  };
  return { storage, files };
}

function makeService(detected: { mime: string; ext: string } | null) {
  const audit = { record: jest.fn(async () => ({ id: 1n, prevHash: null, hash: 'x' })) };
  const prisma = {
    mediaAsset: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
        ...args.data,
        archivedAt: null,
        createdAt: new Date(),
      })),
      findUnique: jest.fn(async () => null as unknown),
      update: jest.fn(async () => ({})),
      count: jest.fn(async () => 0),
      findMany: jest.fn(async () => []),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const signature = { detect: jest.fn(async () => detected) };
  const { storage, files } = makeInMemoryStorage();
  const service = new MediaService(prisma as never, audit as never, signature as never, storage);
  return { service, prisma, audit, signature, storage, files };
}

describe('MediaService.upload', () => {
  it('rejects a renamed executable at gate 2 — a real detector returns no match', async () => {
    const { service } = makeService(null);
    await expect(
      service.upload({ originalname: 'evil.png', buffer: Buffer.from('MZ\x90\x00'), size: 4 }),
    ).rejects.toThrow('file contents are not an allowed image type');
  });

  it('rejects a 400, not an unhandled 500, when the sniffed mime is right but sharp cannot decode the body', async () => {
    // A signature check reads only the header — it cannot tell a genuine
    // image from a truncated one wearing a valid magic byte. This buffer
    // sniffs (per the mocked detector) as a GIF but has no valid GIF body
    // for sharp to decode; without the try/catch around the pipeline this
    // throws sharp's own raw error, surfacing as an unhandled 500.
    const { service, storage } = makeService({ mime: 'image/gif', ext: 'gif' });
    const notActuallyAGif = Buffer.from('GIF89a-then-garbage-not-a-real-gif-body');
    await expect(
      service.upload({ originalname: 'broken.gif', buffer: notActuallyAGif, size: notActuallyAGif.length }),
    ).rejects.toThrow('file could not be processed as an image');
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('rejects a real PNG buffer whose filename claims .svg — gate 1 blocks it before sniffing', async () => {
    const { service, signature } = makeService({ mime: 'image/png', ext: 'png' });
    const buffer = await makePng();
    await expect(service.upload({ originalname: 'logo.svg', buffer, size: buffer.length })).rejects.toThrow(
      'file extension is not allowed',
    );
    expect(signature.detect).not.toHaveBeenCalled();
  });

  it('rejects an oversized upload with 413 before any sniffing happens', async () => {
    const { service, signature } = makeService({ mime: 'image/png', ext: 'png' });
    await expect(
      service.upload({ originalname: 'big.png', buffer: Buffer.alloc(10), size: 9 * 1024 * 1024 }),
    ).rejects.toThrow();
    expect(signature.detect).not.toHaveBeenCalled();
  });

  it('stores under a key matching STORAGE_KEY_PATTERN, containing none of the original filename', async () => {
    const { service, storage } = makeService({ mime: 'image/png', ext: 'png' });
    const buffer = await makePng();
    const asset = await service.upload({
      originalname: 'my-secret-filename.png',
      buffer,
      size: buffer.length,
    });

    expect(asset.storageKey).toMatch(STORAGE_KEY_PATTERN);
    expect(asset.storageKey).not.toContain('secret');
    expect(storage.put).toHaveBeenCalledTimes(1);
  });

  it('always persists mime as image/webp, regardless of the input type', async () => {
    const { service } = makeService({ mime: 'image/png', ext: 'png' });
    const buffer = await makePng();
    const asset = await service.upload({ originalname: 'x.png', buffer, size: buffer.length });
    expect(asset.mime).toBe('image/webp');
  });

  it('writes exactly one media:upload audit entry carrying the detected mime', async () => {
    const { service, audit } = makeService({ mime: 'image/png', ext: 'png' });
    const buffer = await makePng();
    await service.upload({ originalname: 'x.png', buffer, size: buffer.length });

    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0][0]).toMatchObject({
      action: 'media:upload',
      metadata: expect.objectContaining({ detectedMime: 'image/png' }),
    });
  });

  it('strips GPS/EXIF metadata during the re-encode', async () => {
    const { service, files } = makeService({ mime: 'image/jpeg', ext: 'jpg' });
    const buffer = await makePngWithGpsExif();

    // Sanity check: the INPUT really does carry EXIF, so the assertion below
    // is proving the re-encode removed it, not that it was never there.
    const inputMeta = await sharp(buffer).metadata();
    expect(inputMeta.exif).toBeDefined();

    const asset = await service.upload({ originalname: 'photo.jpg', buffer, size: buffer.length });
    const stored = [...files.values()][0]!;
    const outputMeta = await sharp(stored).metadata();

    expect(asset.mime).toBe('image/webp');
    expect(outputMeta.exif).toBeUndefined();
  });
});

/**
 * The animated path, which had NO coverage at all until this block.
 *
 * `ALLOWED_UPLOAD_MIME` admits GIF and WebP and `gateAndEncode` opens both
 * with `animated: true`, so "an animation goes in, an animation comes out" is
 * a promise this service makes and never checked. Every assertion below reads
 * `pages` off the STORED bytes, because that is the only number that says the
 * frames are still there — an animated WebP that lost its stack is still a
 * valid WebP of the first frame, and every other assertion in this file passes
 * on it.
 */
describe('MediaService.upload — animated input', () => {
  it('stores the FRAME height, not the height of the whole frame strip', async () => {
    // The dimensions this writes are what a consumer builds an aspect-ratio box
    // from. For a multi-frame encode sharp reports `info.height` as the stacked
    // strip — a 4-frame 40x30 animation measures 40x120 — so persisting it
    // reserved four times too much vertical space and then collapsed on decode.
    // A layout shift with its origin in the database.
    const { service, prisma } = makeService({ mime: 'image/gif', ext: 'gif' });
    const buffer = await makeAnimatedGif(4, 40, 30);

    await service.upload({ originalname: 'loading.gif', buffer, size: buffer.length });

    const written = prisma.mediaAsset.create.mock.calls[0]![0].data as {
      width: number;
      height: number;
    };
    expect(written.width).toBe(40);
    expect(written.height).toBe(30);
  });

  it('keeps every frame of an animated GIF', async () => {
    const { service, files } = makeService({ mime: 'image/gif', ext: 'gif' });
    const buffer = await makeAnimatedGif(4);

    // Sanity check: the INPUT really is multi-frame, so the assertion below is
    // proving the pipeline preserved a stack rather than that there never was
    // one to lose.
    expect((await sharp(buffer).metadata()).pages).toBe(4);

    await service.upload({ originalname: 'loading.gif', buffer, size: buffer.length });
    const stored = [...files.values()][0]!;
    const meta = await sharp(stored).metadata();

    expect(meta.format).toBe('webp');
    expect(meta.pages).toBe(4);
  });

  it('keeps the frames of an animation wide enough for the 1600px bound to actually resize it', async () => {
    // The small GIF above is never resized — `withoutEnlargement` leaves it
    // alone — so on its own it cannot tell us whether the width bound added by
    // the performance work is safe for a page stack. This one is 2400px wide,
    // the same size as the oversized assets that bound was introduced for, so
    // the resize genuinely runs.
    const { service, files } = makeService({ mime: 'image/gif', ext: 'gif' });
    const buffer = await makeAnimatedGif(3, 2400, 1350);

    await service.upload({ originalname: 'wide.gif', buffer, size: buffer.length });
    const stored = [...files.values()][0]!;
    const meta = await sharp(stored).metadata();

    expect(meta.width).toBe(1600);
    expect(meta.pages).toBe(3);
  });

  it('accepts an animation tagged with a sideways EXIF orientation instead of rejecting it as unprocessable', async () => {
    // The regression this block exists for. libvips cannot turn a page stack
    // through 90°, so an unguarded `.rotate()` throws `Rotate is not supported
    // for multi-page images` — which `gateAndEncode`'s catch converts into a
    // 400 «file could not be processed as an image». A valid animation came
    // back to the uploader as a corrupt file.
    const { service, files } = makeService({ mime: 'image/webp', ext: 'webp' });
    const buffer = await makeAnimatedWebpWithOrientation(6);
    expect((await sharp(buffer).metadata()).orientation).toBe(6);

    const asset = await service.upload({ originalname: 'spin.webp', buffer, size: buffer.length });
    const stored = [...files.values()][0]!;

    expect(asset.mime).toBe('image/webp');
    expect((await sharp(stored).metadata()).pages).toBe(4);
  });

  it('still rotates a STILL WebP carrying the same orientation tag', async () => {
    // The guard has to key off the frame count, not off the MIME. WebP is both
    // the animated format here AND an ordinary photo format, and skipping the
    // rotation for everything that sniffs as WebP would silently stop
    // correcting every still WebP a phone uploads — a much bigger population
    // than animations. 40×20 tagged «rotate 90°» must be stored 20×40.
    const { service, files } = makeService({ mime: 'image/webp', ext: 'webp' });
    const buffer = await makeStillWithOrientation(6, 'webp');

    const asset = await service.upload({ originalname: 'photo.webp', buffer, size: buffer.length });
    const meta = await sharp([...files.values()][0]!).metadata();

    expect(meta.width).toBe(20);
    expect(meta.height).toBe(40);
    expect(asset.width).toBe(20);
    expect(asset.height).toBe(40);
  });

  it('still rotates a still JPEG — the case the rotate() call was added for', async () => {
    const { service, files } = makeService({ mime: 'image/jpeg', ext: 'jpg' });
    const buffer = await makeStillWithOrientation(6, 'jpeg');
    expect((await sharp(buffer).metadata()).orientation).toBe(6);

    await service.upload({ originalname: 'sideways.jpg', buffer, size: buffer.length });
    const meta = await sharp([...files.values()][0]!).metadata();

    expect(meta.width).toBe(20);
    expect(meta.height).toBe(40);
    // Applied, then dropped — the tag must not survive into what is served, or
    // a second consumer would rotate it again.
    expect(meta.orientation).toBeUndefined();
  });

  it('keeps the frames through the avatar path’s square crop too', async () => {
    // The avatar resize is a `cover` crop rather than a width bound, i.e. a
    // different libvips path, and a student uploading an animated GIF as a
    // profile picture is not an exotic input.
    const { service, files } = makeService({ mime: 'image/gif', ext: 'gif' });
    const buffer = await makeAnimatedGif(4);

    await service.uploadAvatar({ originalname: 'me.gif', buffer, size: buffer.length });
    const meta = await sharp([...files.values()][0]!).metadata();

    expect(meta.width).toBe(512);
    expect(meta.pages).toBe(4);
  });
});

/**
 * The avatar path is the ONLY upload every account on the platform can reach —
 * `upload` above is gated on `media:write`, which is staff. So the gates are
 * re-asserted here through `uploadAvatar` rather than assumed to be inherited:
 * the refactor that extracted `gateAndEncode` is exactly the kind of change
 * that can silently drop one of them for one caller.
 */
describe('MediaService.uploadAvatar', () => {
  it('rejects a renamed executable, same as the staff path', async () => {
    const { service } = makeService(null);
    await expect(
      service.uploadAvatar({ originalname: 'evil.png', buffer: Buffer.from('MZ\x90\x00'), size: 4 }),
    ).rejects.toThrow('file contents are not an allowed image type');
  });

  it('rejects a disallowed extension before sniffing', async () => {
    const { service, signature } = makeService({ mime: 'image/png', ext: 'png' });
    const buffer = await makePng();
    await expect(
      service.uploadAvatar({ originalname: 'me.svg', buffer, size: buffer.length }),
    ).rejects.toThrow('file extension is not allowed');
    expect(signature.detect).not.toHaveBeenCalled();
  });

  it('rejects at a much smaller cap than the staff path allows', async () => {
    const { service, signature } = makeService({ mime: 'image/png', ext: 'png' });
    // 3 MB: comfortably accepted by `upload` (8 MB), refused here (2 MB).
    await expect(
      service.uploadAvatar({ originalname: 'huge.png', buffer: Buffer.alloc(10), size: 3 * 1024 * 1024 }),
    ).rejects.toThrow();
    expect(signature.detect).not.toHaveBeenCalled();
  });

  it('stores a square 512×512 WebP whatever the input dimensions were', async () => {
    const { service, files } = makeService({ mime: 'image/png', ext: 'png' });
    // Deliberately wide and small: proves both the crop AND the upscale.
    const buffer = await sharp({
      create: { width: 200, height: 80, channels: 3, background: { r: 9, g: 9, b: 9 } },
    })
      .png()
      .toBuffer();

    const asset = await service.uploadAvatar({
      originalname: 'wide.png',
      buffer,
      size: buffer.length,
    });
    const stored = [...files.values()][0]!;
    const meta = await sharp(stored).metadata();

    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
    expect(asset.mime).toBe('image/webp');
    // What is stored is what is served — no call site has to crop.
    expect(asset.width).toBe(512);
    expect(asset.height).toBe(512);
  });

  it('strips GPS/EXIF from a student’s phone photo', async () => {
    const { service, files } = makeService({ mime: 'image/jpeg', ext: 'jpg' });
    const buffer = await makePngWithGpsExif();
    expect((await sharp(buffer).metadata()).exif).toBeDefined();

    await service.uploadAvatar({ originalname: 'selfie.jpg', buffer, size: buffer.length });
    const stored = [...files.values()][0]!;

    // Not a theoretical concern on a photo taken by a school student.
    expect((await sharp(stored).metadata()).exif).toBeUndefined();
  });

  it('audits under its own action, not the staff one', async () => {
    const { service, audit } = makeService({ mime: 'image/png', ext: 'png' });
    const buffer = await makePng();
    await service.uploadAvatar({ originalname: 'me.png', buffer, size: buffer.length });

    expect(audit.record.mock.calls[0][0]).toMatchObject({
      action: 'profile:avatar-upload',
      metadata: expect.objectContaining({ detectedMime: 'image/png' }),
    });
  });

  it('stores under an opaque key carrying none of the original filename', async () => {
    const { service } = makeService({ mime: 'image/png', ext: 'png' });
    const buffer = await makePng();
    const asset = await service.uploadAvatar({
      originalname: 'ahmed-mahmoud-national-id.png',
      buffer,
      size: buffer.length,
    });

    expect(asset.storageKey).toMatch(STORAGE_KEY_PATTERN);
    expect(asset.storageKey).not.toContain('national');
  });
});
