/**
 * «كمّل الرفع» — only the parts the bucket does not have are sent again, and
 * a different file is never stitched onto the first one's parts.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { uploadPartCount, uploadPartSize } from '@ayman/contracts/video';
import type Redis from 'ioredis';
import type { PrismaService } from '../../prisma/prisma.service';
import type { VideoMirrorService } from './video-mirror.service';
import { VideoUploadService } from './video-upload.service';

const VIDEO = 'a'.repeat(32);
const SIZE = 400 * 1024 * 1024 + 123; // a few parts, the last one short
const PART = uploadPartSize(SIZE);
const TOTAL = uploadPartCount(SIZE);

function build(listed: { partNumber: number; etag: string; size: number }[] | null) {
  const signed: number[][] = [];
  const service = new VideoUploadService(
    {
      lessonVideo: {
        findUnique: async () => ({
          lessonId: 'l1',
          externalId: VIDEO,
          mirrorStatus: 'uploading',
          sourceBytes: BigInt(SIZE),
        }),
      },
    } as unknown as PrismaService,
    {
      objectStorage: {
        listParts: async () => listed,
        presignPartNumbers: async (_key: string, _upload: string, numbers: number[]) => {
          signed.push(numbers);
          return numbers.map((partNumber) => ({ partNumber, url: `https://x/${partNumber}` }));
        },
      },
    } as unknown as VideoMirrorService,
    {} as unknown as Redis,
  );
  return { service, signed };
}

describe('VideoUploadService.resume', () => {
  it('re-signs only the parts the bucket does not hold WHOLE', async () => {
    const { service, signed } = build([
      { partNumber: 1, etag: '"e1"', size: PART },
      { partNumber: 2, etag: '"e2"', size: PART - 5 }, // cut short — sent again
    ]);
    const session = await service.resume('l1', { videoId: VIDEO, uploadId: 'u', sizeBytes: SIZE });
    expect(session.done).toEqual([{ partNumber: 1, etag: '"e1"' }]);
    expect(signed[0]).toEqual(Array.from({ length: TOTAL - 1 }, (_, i) => i + 2));
    expect(session.partSizeBytes).toBe(PART);
  });

  it('refuses a file of a different size — it is not the same lecture', async () => {
    const { service } = build([]);
    await expect(service.resume('l1', { videoId: VIDEO, uploadId: 'u', sizeBytes: SIZE + 1 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('says so when the bucket has already reaped the upload', async () => {
    const { service } = build(null);
    await expect(service.resume('l1', { videoId: VIDEO, uploadId: 'u', sizeBytes: SIZE })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
