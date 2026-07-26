// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { BadRequestException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LessonService } from './lesson.service';

describe('LessonService', () => {
  let prisma: PrismaService;
  let service: LessonService;
  let courseId: string;
  let sectionId: string;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as unknown as PrismaService;
    await prisma.$connect();
    service = new LessonService(prisma);

    const suffix = Date.now().toString(36);
    const user = await prisma.user.create({
      data: { id: `les-${suffix}`, name: 'أيمن', email: `les-${suffix}@example.com`, role: 'admin' },
    });
    userId = user.id;
    const offering = await prisma.subjectOffering.findFirstOrThrow({ where: { year: 2 } });
    const course = await prisma.course.create({
      data: {
        slug: `les-${suffix}`,
        title: 'كورس',
        systemId: offering.systemId,
        year: 2,
        trackId: offering.trackId,
        subjectId: offering.subjectId,
        instructorId: user.id,
      },
    });
    courseId = course.id;
    const section = await prisma.courseSection.create({
      data: { courseId, title: 'قسم', position: 0 },
    });
    sectionId = section.id;
  });

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { instructorId: userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('appends new lessons at the end and denormalises courseId from the section', async () => {
    const a = await service.create(sectionId, {
      title: 'أ',
      kind: 'text',
      isPublished: false,
      isFreePreview: false,
      estimatedSeconds: 0,
      completionMode: 'manual',
      completionMinViewSeconds: null,
      completionPassGrade: null,
    });
    const b = await service.create(sectionId, {
      title: 'ب',
      kind: 'text',
      isPublished: false,
      isFreePreview: false,
      estimatedSeconds: 0,
      completionMode: 'manual',
      completionMinViewSeconds: null,
      completionPassGrade: null,
    });
    expect(a.position).toBe(0);
    expect(b.position).toBe(1);
    expect(b.courseId).toBe(courseId);
  });

  it('stores only the 11-character id for a video, never the URL', async () => {
    const lesson = await service.create(sectionId, {
      title: 'فيديو',
      kind: 'video',
      isPublished: false,
      isFreePreview: false,
      estimatedSeconds: 0,
      completionMode: 'manual',
      completionMinViewSeconds: null,
      completionPassGrade: null,
    });
    const video = await service.setVideo(lesson.id, {
      provider: 'youtube',
      externalId: 'dQw4w9WgXcQ',
      durationSeconds: 300,
      posterKey: null,
    });
    expect(video.externalId).toBe('dQw4w9WgXcQ');
    expect(video.externalId).not.toContain('http');

    const raw = await prisma.$queryRaw<Array<{ external_id: string }>>`
      SELECT "external_id" FROM "app"."lesson_videos" WHERE "lesson_id" = ${lesson.id}
    `;
    expect(raw[0]?.external_id).toBe('dQw4w9WgXcQ');
  });

  it('is refused by Postgres if a URL is ever passed through', async () => {
    const lesson = await service.create(sectionId, {
      title: 'فيديو٢',
      kind: 'video',
      isPublished: false,
      isFreePreview: false,
      estimatedSeconds: 0,
      completionMode: 'manual',
      completionMinViewSeconds: null,
      completionPassGrade: null,
    });
    await expect(
      service.setVideo(lesson.id, {
        provider: 'youtube',
        externalId: 'https://youtu.be/dQw4w9WgXcQ' as never,
        durationSeconds: 10,
        posterKey: null,
      }),
    ).rejects.toThrow();
  });

  it('sanitizes rich text on WRITE, so the stored row is already safe', async () => {
    const lesson = await service.create(sectionId, {
      title: 'نص',
      kind: 'text',
      isPublished: false,
      isFreePreview: false,
      estimatedSeconds: 0,
      completionMode: 'manual',
      completionMinViewSeconds: null,
      completionPassGrade: null,
    });
    const stored = await service.setText(lesson.id, {
      bodyHtml:
        '<p>مرحبا</p><script>alert(1)</script><iframe src="https://evil.example"></iframe>' +
        '<a href="https://example.com">لينك</a>',
    });
    expect(stored.bodyHtml).not.toContain('<script');
    expect(stored.bodyHtml).not.toContain('<iframe');
    expect(stored.bodyHtml).toContain('rel="noopener noreferrer nofollow"');
    expect(stored.bodyHtml).toContain('مرحبا');
  });

  it('refuses a payload whose kind does not match the lesson', async () => {
    const lesson = await service.create(sectionId, {
      title: 'نص٢',
      kind: 'text',
      isPublished: false,
      isFreePreview: false,
      estimatedSeconds: 0,
      completionMode: 'manual',
      completionMinViewSeconds: null,
      completionPassGrade: null,
    });
    await expect(
      service.setVideo(lesson.id, {
        provider: 'youtube',
        externalId: 'dQw4w9WgXcQ',
        durationSeconds: 10,
        posterKey: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('closes the gap left by a deletion so positions stay contiguous', async () => {
    const section = await prisma.courseSection.create({
      data: { courseId, title: 'قسم٢', position: 1 },
    });
    const made = [];
    for (const title of ['1', '2', '3']) {
      made.push(
        await service.create(section.id, {
          title,
          kind: 'text',
          isPublished: false,
          isFreePreview: false,
          estimatedSeconds: 0,
          completionMode: 'manual',
          completionMinViewSeconds: null,
          completionPassGrade: null,
        }),
      );
    }
    await service.remove(made[1]!.id);
    const remaining = await prisma.lesson.findMany({
      where: { sectionId: section.id },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { title: true, position: true },
    });
    expect(remaining).toEqual([
      { title: '1', position: 0 },
      { title: '3', position: 1 },
    ]);
  });
});
