import { Readable } from 'node:stream';
import sharp from 'sharp';
import { BadRequestException, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { DESIGN_QUOTA_BYTES } from '@ayman/contracts/designs';
import { DESIGN_KEY_PATTERN, STORAGE_KEY_PATTERN } from '@ayman/contracts/admin/media';
import type { AuditService } from '../../audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { FileSignatureService } from '../media/file-signature.service';
import type { MediaStorage } from '../media/storage/media-storage';
import { DesignsService } from './designs.service';

const FOLDER = '0199f0a0-0000-7000-8000-000000000001';
const ASSET = '0199f0a0-0000-7000-8000-000000000002';

function harness(options: { usedBytes?: number; detected?: { mime: string; ext: string } | null } = {}) {
  const files = new Map<string, Buffer>();
  const order: string[] = [];
  const storage: MediaStorage = {
    put: jest.fn(async (key: string, body: Buffer) => {
      files.set(key, body);
    }),
    getStream: jest.fn(async (key: string) => Readable.from([files.get(key) ?? Buffer.alloc(0)])),
    stat: jest.fn(async (key: string) => (files.has(key) ? { size: files.get(key)!.length } : null)),
    delete: jest.fn(async (key: string) => {
      order.push(`bytes:${key}`);
      files.delete(key);
    }),
  };

  const assetRow = (data: Record<string, unknown>) => ({
    id: ASSET,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    uploadedBy: null,
    ...data,
  });

  const prisma = {
    designFolder: {
      findUnique: jest.fn(async () => ({ id: FOLDER, name: 'غلافات', color: 'amber', createdAt: new Date(), updatedAt: new Date() })),
      update: jest.fn(async () => ({})),
      // Evaluated eagerly into the `$transaction` array, so it records nothing.
      delete: jest.fn(() => 'delete'),
    },
    designAsset: {
      aggregate: jest.fn(async () => ({ _sum: { sizeBytes: options.usedBytes ?? 0 } })),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => assetRow(data)),
      findUnique: jest.fn(async () =>
        assetRow({
          folderId: FOLDER,
          name: 'thumb',
          storageKey: 'design/aa/aaaaaaaa-0000-4000-8000-000000000000.png',
          previewKey: 'design/bb/bbbbbbbb-0000-4000-8000-000000000000.webp',
          format: 'png',
          width: 10,
          height: 10,
          sizeBytes: 100,
        }),
      ),
      findMany: jest.fn(async () => [
        { storageKey: 'design/aa/aaaaaaaa-0000-4000-8000-000000000000.png', previewKey: 'design/bb/bbbbbbbb-0000-4000-8000-000000000000.webp' },
      ]),
      delete: jest.fn(async () => {
        order.push('row:asset');
        return {};
      }),
      deleteMany: jest.fn(() => 'deleteMany'),
    },
    mediaAsset: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        altAr: null,
        archivedAt: null,
        createdAt: new Date(),
        ...data,
      })),
    },
    user: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async () => {
      order.push('row:folder-and-assets');
      return [];
    }),
  };
  const audit = { record: jest.fn(async () => ({})) };
  const signature = {
    detect: jest.fn(async () => (options.detected === undefined ? { mime: 'image/png', ext: 'png' } : options.detected)),
  };

  const service = new DesignsService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    signature as unknown as FileSignatureService,
    storage,
  );
  return { service, prisma, audit, storage, files, order };
}

async function pngFile(name = 'غلاف المحاضرة 3.png') {
  const buffer = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: '#335' } }).png().toBuffer();
  // Multer hands the name over as latin1-decoded UTF-8 bytes; mimic it.
  return { originalname: Buffer.from(name, 'utf8').toString('latin1'), buffer, size: buffer.length };
}

describe('DesignsService — the gates in front of the studio', () => {
  it('uploads: the name comes from the file, the keys are fresh private ones', async () => {
    const h = harness();
    const asset = await h.service.upload(FOLDER, await pngFile(), 'designer-1');
    expect(asset.name).toBe('غلاف المحاضرة 3');
    expect([asset.width, asset.height, asset.format]).toEqual([1920, 1080, 'png']);
    const keys = [...h.files.keys()];
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      expect(DESIGN_KEY_PATTERN.test(key)).toBe(true);
      // Never addressable by the public two-segment media route.
      expect(STORAGE_KEY_PATTERN.test(key)).toBe(false);
    }
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'design:upload' }));
  });

  it('refuses an extension outside the allowlist (SVG is a script, not a picture)', async () => {
    const h = harness();
    await expect(h.service.upload(FOLDER, await pngFile('logo.svg'), 'u')).rejects.toBeInstanceOf(BadRequestException);
    expect(h.files.size).toBe(0);
  });

  it('refuses bytes that are not an image, whatever the file is called', async () => {
    const h = harness({ detected: { mime: 'application/x-msdownload', ext: 'exe' } });
    const exe = { originalname: 'thumbnail.png', buffer: Buffer.from('MZ fake'), size: 7 };
    await expect(h.service.upload(FOLDER, exe, 'u')).rejects.toBeInstanceOf(BadRequestException);
    expect(h.files.size).toBe(0);
  });

  it('refuses once the studio is full — before decoding anything', async () => {
    const h = harness({ usedBytes: DESIGN_QUOTA_BYTES });
    await expect(h.service.upload(FOLDER, await pngFile(), 'u')).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(h.files.size).toBe(0);
  });

  it('an id that is not a uuid is a 404, never a database cast error', async () => {
    const h = harness();
    await expect(h.service.folder("1' OR '1'='1")).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.service.file('../../etc/passwd', 'master')).rejects.toBeInstanceOf(NotFoundException);
    expect(h.prisma.designFolder.findUnique).not.toHaveBeenCalled();
  });

  it('delete removes the row FIRST and the bytes after — never a row without its picture', async () => {
    const h = harness();
    await h.service.deleteAsset(ASSET);
    expect(h.order[0]).toBe('row:asset');
    expect(h.order.slice(1).every((step) => step.startsWith('bytes:'))).toBe(true);
  });

  it('a folder delete takes every picture in it, rows before bytes', async () => {
    const h = harness();
    await h.service.deleteFolder(FOLDER);
    expect(h.order[0]).toBe('row:folder-and-assets');
    expect(h.order.filter((step) => step.startsWith('bytes:'))).toHaveLength(2);
  });

  it('publish writes a NEW public library image — the design itself stays private', async () => {
    const h = harness();
    const master = (await pngFile()).buffer;
    h.files.set('design/aa/aaaaaaaa-0000-4000-8000-000000000000.png', master);
    const media = await h.service.publish(ASSET, 'cover', 'ayman');
    expect(STORAGE_KEY_PATTERN.test(media.storageKey)).toBe(true);
    expect([media.width, media.height]).toEqual([1920, 1080]);
    expect(h.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'design:publish', metadata: expect.objectContaining({ mediaAssetId: media.id }) }),
    );
  });
});
