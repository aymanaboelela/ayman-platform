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
