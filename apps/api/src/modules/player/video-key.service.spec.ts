/**
 * Who gets an encrypted lecture's key. Asserted on the outcome — key or 404 —
 * for the people who matter: a student who may watch, one who may not, and
 * staff previewing a course.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { LessonAccessService } from '../progress/lesson-access.service';
import type { VideoMirrorService } from '../video-mirror/video-mirror.service';
import { VideoKeyService } from './video-key.service';

const VIDEO = 'a'.repeat(32);
const KEY = Buffer.alloc(16, 7);

function build(options: {
  lessons: string[];
  allowed: Record<string, 'ok' | 'forbidden' | 'missing'>;
  /** Every row shares one `encrypted` value here — a real mirror does too. */
  encrypted?: boolean;
}) {
  return new VideoKeyService(
    {
      lessonVideo: {
        findMany: async (args: { where: { externalId: string } }) =>
          args.where.externalId === VIDEO
            ? options.lessons.map((lessonId) => ({ lessonId, encrypted: options.encrypted ?? true }))
            : [],
      },
    } as unknown as PrismaService,
    {
      requireEntitled: async (_userId: string, lessonId: string) => {
        const verdict = options.allowed[lessonId] ?? 'missing';
        if (verdict === 'forbidden') throw new ForbiddenException('expired');
        if (verdict === 'missing') throw new NotFoundException('lesson not found');
        return {};
      },
    } as unknown as LessonAccessService,
    { videoKey: () => KEY } as unknown as VideoMirrorService,
  );
}

const student = { id: 'u1', role: 'student' };

describe('VideoKeyService', () => {
  it('hands the key to a student who may watch ANY lesson using the video', async () => {
    const service = build({ lessons: ['l1', 'l2'], allowed: { l1: 'forbidden', l2: 'ok' } });
    await expect(service.key(student, VIDEO)).resolves.toEqual(KEY);
  });

  it('is a 404 — never a 403 — for a student who may watch none of them', async () => {
    const service = build({ lessons: ['l1'], allowed: { l1: 'forbidden' } });
    await expect(service.key(student, VIDEO)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is a 404 for a video no lesson uses, and for a malformed id', async () => {
    const service = build({ lessons: [], allowed: {} });
    await expect(service.key(student, VIDEO)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.key(student, '../x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets staff preview without being enrolled', async () => {
    const service = build({ lessons: ['l1'], allowed: {} });
    await expect(service.key({ id: 'a1', role: 'admin' }, VIDEO)).resolves.toEqual(KEY);
  });

  /**
   * «شفّره» / «من غير تشفير» at upload time — a plain mirror's manifest
   * never carries `#EXT-X-KEY`, so hls.js never calls this route for one in
   * practice. This asserts the server side of that: a probe that asks anyway,
   * for a video the admin chose NOT to encrypt, gets refused all the same —
   * even staff, even an enrolled student.
   */
  it('refuses the key for a video the admin chose not to encrypt, even for staff', async () => {
    const service = build({ lessons: ['l1'], allowed: { l1: 'ok' }, encrypted: false });
    await expect(service.key(student, VIDEO)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.key({ id: 'a1', role: 'admin' }, VIDEO)).rejects.toBeInstanceOf(NotFoundException);
  });
});
