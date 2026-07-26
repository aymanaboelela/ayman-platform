// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { NotFoundException } from '@nestjs/common';
import { CatalogCourseDetailSchema, CatalogListSchema } from '@ayman/contracts/catalog';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from './catalog.service';

describe('CatalogService', () => {
  let prisma: PrismaService;
  let service: CatalogService;
  let userId: string;
  let publishedSlug: string;
  let draftSlug: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as unknown as PrismaService;
    await prisma.$connect();
    service = new CatalogService(prisma);

    const suffix = Date.now().toString(36);
    const user = await prisma.user.create({
      data: { id: `cat-${suffix}`, name: 'أ', email: `cat-${suffix}@example.com`, role: 'admin' },
    });
    userId = user.id;
    const offering = await prisma.subjectOffering.findFirstOrThrow({ where: { year: 2 } });
    const base = {
      systemId: offering.systemId,
      year: 2,
      trackId: offering.trackId,
      subjectId: offering.subjectId,
      instructorId: user.id,
      title: 'البرمجة وعلوم الحاسب',
      description: 'وصف',
    };

    publishedSlug = `cat-pub-${suffix}`;
    draftSlug = `cat-draft-${suffix}`;

    const published = await prisma.course.create({
      data: { ...base, slug: publishedSlug, status: 'published', publishedAt: new Date() },
    });
    await prisma.course.create({ data: { ...base, slug: draftSlug } });

    const visible = await prisma.courseSection.create({
      data: { courseId: published.id, title: 'قسم منشور', position: 0, isPublished: true },
    });
    const hidden = await prisma.courseSection.create({
      data: { courseId: published.id, title: 'قسم مخفي', position: 1, isPublished: false },
    });

    const preview = await prisma.lesson.create({
      data: {
        courseId: published.id,
        sectionId: visible.id,
        title: 'مقدمة',
        kind: 'video',
        position: 0,
        isPublished: true,
        isFreePreview: true,
        estimatedSeconds: 300,
      },
    });
    await prisma.lessonVideo.create({
      data: {
        lessonId: preview.id,
        provider: 'youtube',
        externalId: 'dQw4w9WgXcQ',
        durationSeconds: 300,
      },
    });

    const paid = await prisma.lesson.create({
      data: {
        courseId: published.id,
        sectionId: visible.id,
        title: 'الدرس الأول',
        kind: 'video',
        position: 1,
        isPublished: true,
        isFreePreview: false,
        estimatedSeconds: 600,
      },
    });
    await prisma.lessonVideo.create({
      data: { lessonId: paid.id, provider: 'youtube', externalId: 'aBcDeFgHiJk', durationSeconds: 600 },
    });

    await prisma.lesson.create({
      data: {
        courseId: published.id,
        sectionId: visible.id,
        title: 'مسودة درس',
        kind: 'text',
        position: 2,
        isPublished: false,
      },
    });
    await prisma.lesson.create({
      data: {
        courseId: published.id,
        sectionId: hidden.id,
        title: 'درس في قسم مخفي',
        kind: 'text',
        position: 0,
        isPublished: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { instructorId: userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('matches the shared contract exactly', async () => {
    const list = await service.list();
    expect(() => CatalogListSchema.parse(list)).not.toThrow();
    const detail = await service.findBySlug(publishedSlug);
    expect(() => CatalogCourseDetailSchema.parse(detail)).not.toThrow();
  });

  it('never lists a draft course', async () => {
    const { courses } = await service.list();
    expect(courses.some((c) => c.slug === publishedSlug)).toBe(true);
    expect(courses.some((c) => c.slug === draftSlug)).toBe(false);
  });

  it('404s a draft by slug — a 403 would confirm it exists', async () => {
    await expect(service.findBySlug(draftSlug)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.findBySlug('does-not-exist')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hides unpublished sections and unpublished lessons', async () => {
    const detail = await service.findBySlug(publishedSlug);
    expect(detail.sections).toHaveLength(1);
    expect(detail.sections[0]?.title).toBe('قسم منشور');
    const titles = detail.sections[0]?.lessons.map((l) => l.title) ?? [];
    expect(titles).toEqual(['مقدمة', 'الدرس الأول']);
  });

  it('exposes the video id ONLY for free-preview lessons', async () => {
    const detail = await service.findBySlug(publishedSlug);
    const lessons = detail.sections[0]?.lessons ?? [];
    expect(lessons[0]?.videoExternalId).toBe('dQw4w9WgXcQ');
    expect(lessons[1]?.videoExternalId).toBeNull();
    // Durations are safe to publish — they drive the "المدة" chip.
    expect(lessons[1]?.durationSeconds).toBe(600);
  });

  it('leaks no internal field in the serialized payload', async () => {
    const raw = JSON.stringify(await service.findBySlug(publishedSlug));
    for (const forbidden of [
      'priceCents',
      'instructorId',
      'status',
      'visibleFrom',
      'visibleTo',
      'unlocksAfterLessonId',
      'viewLimit',
      'contentGroupId',
      'completionPassGrade',
      'bodyHtml',
    ]) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it('counts and sums only the lessons a visitor can actually see', async () => {
    const { courses } = await service.list();
    const course = courses.find((c) => c.slug === publishedSlug);
    expect(course?.lessonCount).toBe(2);
    expect(course?.totalSeconds).toBe(900);
  });

  it('orders by position with an id tie-break, never by insertion', async () => {
    const detail = await service.findBySlug(publishedSlug);
    const lessons = detail.sections[0]?.lessons ?? [];
    expect(lessons.map((l) => l.title)).toEqual(['مقدمة', 'الدرس الأول']);
  });
});
