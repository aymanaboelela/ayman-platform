/**
 * «قص الفيديو» — what is saved, what is refused, and that the whole video
 * always comes back.
 */
import { BadRequestException } from '@nestjs/common';
import type { AuditService } from '../../audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { VideoArchiveService } from '../video-mirror/video-archive.service';
import type { VideoMirrorService } from '../video-mirror/video-mirror.service';
import { LessonService } from './lesson.service';
import type { YouTubeDurationService } from './youtube-duration.service';

function build(row: Record<string, unknown> | null) {
  const writes: Record<string, unknown>[] = [];
  const service = new LessonService(
    {
      lessonVideo: {
        findUnique: async () => row,
        update: async (args: { data: Record<string, unknown> }) => {
          writes.push(args.data);
          return {};
        },
      },
    } as unknown as PrismaService,
    { record: async () => undefined } as unknown as AuditService,
    {} as unknown as YouTubeDurationService,
    {} as unknown as VideoMirrorService,
    {} as unknown as VideoArchiveService,
  );
  return { service, writes };
}

const ready = { provider: 'upload', mirrorStatus: 'ready', durationSeconds: 600, fullDurationSeconds: null };

describe('LessonService.setTrim', () => {
  it('saves the cut and makes duration what the student watches', async () => {
    const { service, writes } = build(ready);
    const out = await service.setTrim('l1', { start: 10, end: 500, cuts: [{ from: 100, to: 160 }] });
    expect(out.durationSeconds).toBe(430);
    expect(writes[0]).toMatchObject({ trimStartSeconds: 10, trimEndSeconds: 500, fullDurationSeconds: 600, durationSeconds: 430 });
  });

  it('puts the whole video back from the length it kept', async () => {
    const { service, writes } = build({ ...ready, durationSeconds: 430, fullDurationSeconds: 600 });
    const out = await service.setTrim('l1', null);
    expect(out.durationSeconds).toBe(600);
    expect(writes[0]).toMatchObject({ trimStartSeconds: null, trimEndSeconds: null, fullDurationSeconds: null, durationSeconds: 600 });
  });

  it('refuses a cut past the end, and a video that is not ours or not ready', async () => {
    await expect(build(ready).service.setTrim('l1', { start: 0, end: 700, cuts: [] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(build({ ...ready, provider: 'youtube' }).service.setTrim('l1', null)).rejects.toBeInstanceOf(BadRequestException);
    await expect(build({ ...ready, mirrorStatus: 'mirroring' }).service.setTrim('l1', null)).rejects.toBeInstanceOf(BadRequestException);
  });
});
