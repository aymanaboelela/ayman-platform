/**
 * «اترفع قد إيه» — any screen reads the upload's progress from the bucket,
 * counting only parts that arrived whole.
 */
import { uploadPartCount, uploadPartSize } from '@ayman/contracts/video';
import type Redis from 'ioredis';
import type { PrismaService } from '../../prisma/prisma.service';
import type { VideoArchiveService } from './video-archive.service';
import type { VideoMirrorService } from './video-mirror.service';
import { VideoUploadService } from './video-upload.service';

const VIDEO = 'b'.repeat(32);
const SIZE = 400 * 1024 * 1024 + 123;
const PART = uploadPartSize(SIZE);
const TOTAL = uploadPartCount(SIZE);

function build(options: {
  status?: string;
  open?: { uploadId: string; initiated: Date | null } | null;
  parts?: { partNumber: number; etag: string; size: number; lastModified: Date | null }[] | null;
}) {
  const findMultipartUpload = jest.fn(async () => (options.open === undefined ? { uploadId: 'u1', initiated: new Date('2026-11-07T14:51:00Z') } : options.open));
  const listParts = jest.fn(async () => options.parts ?? []);
  const service = new VideoUploadService(
    {
      lessonVideo: {
        findUnique: async () => ({
          provider: 'upload',
          externalId: VIDEO,
          mirrorStatus: options.status ?? 'uploading',
          sourceBytes: BigInt(SIZE),
          sourceName: 'workshop.mp4',
        }),
      },
    } as unknown as PrismaService,
    { objectStorage: { findMultipartUpload, listParts } } as unknown as VideoMirrorService,
    {} as unknown as Redis,
    {} as unknown as VideoArchiveService,
  );
  return { service, findMultipartUpload, listParts };
}

describe('VideoUploadService.progress', () => {
  it('sums only whole parts and reports the newest one', async () => {
    const { service } = build({
      parts: [
        { partNumber: 1, etag: '"1"', size: PART, lastModified: new Date('2026-11-07T15:00:00Z') },
        { partNumber: 2, etag: '"2"', size: PART, lastModified: new Date('2026-11-07T15:05:00Z') },
        { partNumber: 3, etag: '"3"', size: PART - 7, lastModified: new Date('2026-11-07T15:09:00Z') }, // cut short
      ],
    });
    const progress = await service.progress('l1');
    expect(progress).toMatchObject({
      uploading: true,
      uploadId: 'u1',
      videoId: VIDEO,
      fileName: 'workshop.mp4',
      sentBytes: PART * 2,
      totalBytes: SIZE,
      partsDone: 2,
      partsTotal: TOTAL,
      lastPartAt: '2026-11-07T15:05:00.000Z',
      startedAt: '2026-11-07T14:51:00.000Z',
    });
  });

  it('counts a short LAST part as whole', async () => {
    const last = SIZE - PART * (TOTAL - 1);
    const { service } = build({ parts: [{ partNumber: TOTAL, etag: '"x"', size: last, lastModified: null }] });
    expect((await service.progress('l1')).sentBytes).toBe(last);
  });

  it('does not touch the bucket once the upload is sealed', async () => {
    const { service, findMultipartUpload } = build({ status: 'ready' });
    const progress = await service.progress('l1');
    expect(progress.uploading).toBe(false);
    expect(findMultipartUpload).not.toHaveBeenCalled();
  });

  it('reports uploading with nothing sent when the bucket has no open upload', async () => {
    const { service, listParts } = build({ open: null });
    const progress = await service.progress('l1');
    expect(progress).toMatchObject({ uploading: true, uploadId: null, sentBytes: 0 });
    expect(listParts).not.toHaveBeenCalled();
  });
});
