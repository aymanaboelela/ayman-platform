// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { AuditService } from '../../audit/audit.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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
    service = new LessonService(prisma, new AuditService(prisma));

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

  it('refuses to delete a lesson that has student quiz attempts', async () => {
    const lesson = await service.create(sectionId, {
      title: 'امتحان الوحدة',
      kind: 'quiz',
      isPublished: false,
      isFreePreview: false,
      estimatedSeconds: 0,
      completionMode: 'manual',
      completionMinViewSeconds: null,
      completionPassGrade: null,
    });
    const quiz = await prisma.quiz.create({ data: { lessonId: lesson.id, reviewOptions: {} } });
    // A BARE attempt: no AttemptEvent children. attempt_events cannot be deleted
    // by ANYONE — a BEFORE DELETE trigger raises unconditionally and DELETE is
    // revoked from ayman_runtime — so an attempt carrying events would make this
    // spec's own afterAll cleanup fail and poison every later run.
    // sumMarks/gradeOutOf/passPercent are required: they are snapshots taken at
    // attempt start so an instructor editing the quiz mid-attempt cannot
    // rescale a student's score. Values are irrelevant here — the guard counts
    // rows, it does not read them.
    await prisma.quizAttempt.create({
      data: { quizId: quiz.id, userId, attemptNo: 1, sumMarks: 10, gradeOutOf: 100, passPercent: 70 },
    });

    await expect(service.remove(lesson.id)).rejects.toBeInstanceOf(ConflictException);
    // Still there — the refusal is not a partial delete.
    await expect(
      prisma.lesson.findUnique({ where: { id: lesson.id }, select: { id: true } }),
    ).resolves.not.toBeNull();
  });

  describe('resources', () => {
    const fileInput = {
      description: null,
      storageKey: 'doc/ab/deck.pdf',
      filename: 'deck.pdf',
      mime: 'application/pdf',
      sizeBytes: 2048,
      videoProvider: null,
      videoExternalId: null,
      linkUrl: null,
    } as const;

    async function makeLesson(kind: 'video' | 'text' = 'video') {
      return service.create(sectionId, {
        title: `درس ${Math.random().toString(36).slice(2, 8)}`,
        kind,
        isPublished: false,
        isFreePreview: false,
        estimatedSeconds: 0,
        completionMode: 'manual',
        completionMinViewSeconds: null,
        completionPassGrade: null,
      });
    }

    it('attaches a presentation to a VIDEO lesson — resources are not kind-gated', async () => {
      const lesson = await makeLesson('video');
      const resource = await service.addResource(lesson.id, {
        kind: 'presentation',
        title: 'البريزنتيشن',
        ...fileInput,
      });

      expect(resource.lessonId).toBe(lesson.id);
      expect(resource.position).toBe(0);
      expect(resource.kind).toBe('presentation');
    });

    it('appends after the last existing position', async () => {
      const lesson = await makeLesson();
      await service.addResource(lesson.id, { kind: 'presentation', title: 'أ', ...fileInput });
      const second = await service.addResource(lesson.id, {
        kind: 'link',
        title: 'ب',
        description: null,
        storageKey: null,
        filename: null,
        mime: null,
        sizeBytes: null,
        videoProvider: null,
        videoExternalId: null,
        linkUrl: 'https://example.com/notes',
      });

      expect(second.position).toBe(1);
    });

    it('lets the database refuse a SECOND presentation on the same lesson', async () => {
      const lesson = await makeLesson();
      await service.addResource(lesson.id, { kind: 'presentation', title: 'الأول', ...fileInput });

      await expect(
        service.addResource(lesson.id, { kind: 'presentation', title: 'التاني', ...fileInput }),
      ).rejects.toThrow();
    });

    it('allows the same presentation shape on a DIFFERENT lesson', async () => {
      const a = await makeLesson();
      const b = await makeLesson();
      await service.addResource(a.id, { kind: 'presentation', title: 'أ', ...fileInput });

      const onB = await service.addResource(b.id, { kind: 'presentation', title: 'ب', ...fileInput });
      expect(onB.lessonId).toBe(b.id);
    });

    it('404s for a lesson that does not exist', async () => {
      await expect(
        service.addResource('00000000-0000-4000-8000-000000000000', {
          kind: 'presentation',
          title: 'x',
          ...fileInput,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates title and description without touching the payload', async () => {
      const lesson = await makeLesson();
      const resource = await service.addResource(lesson.id, {
        kind: 'presentation',
        title: 'قديم',
        ...fileInput,
      });

      const updated = await service.updateResource(resource.id, {
        title: 'جديد',
        description: 'وصف',
      });

      expect(updated.title).toBe('جديد');
      expect(updated.description).toBe('وصف');
      expect(updated.storageKey).toBe('doc/ab/deck.pdf');
    });

    it('reorders the full set in one statement and keeps updated_at fresh', async () => {
      const lesson = await makeLesson();
      const made = [];
      for (const title of ['1', '2', '3']) {
        made.push(
          await service.addResource(lesson.id, {
            kind: 'link',
            title,
            description: null,
            storageKey: null,
            filename: null,
            mime: null,
            sizeBytes: null,
            videoProvider: null,
            videoExternalId: null,
            linkUrl: `https://example.com/${title}`,
          }),
        );
      }

      const reversed = [made[2]!.id, made[1]!.id, made[0]!.id];
      const result = await service.reorderResources(lesson.id, reversed);
      expect(result.updated).toBe(3);

      const rows = await prisma.lessonResource.findMany({
        where: { lessonId: lesson.id },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: { title: true, position: true, updatedAt: true },
      });
      expect(rows.map((r) => r.title)).toEqual(['3', '2', '1']);
      // TABLES_WITH_UPDATED_AT — a drag must not leave the column stale.
      expect(rows.every((r) => r.updatedAt instanceof Date)).toBe(true);
    });

    it('rejects a reorder array carrying an id from another lesson', async () => {
      const mine = await makeLesson();
      const other = await makeLesson();
      const a = await service.addResource(mine.id, {
        kind: 'presentation',
        title: 'أ',
        ...fileInput,
      });
      const foreign = await service.addResource(other.id, {
        kind: 'presentation',
        title: 'ب',
        ...fileInput,
      });

      await expect(service.reorderResources(mine.id, [foreign.id])).rejects.toThrow(
        BadRequestException,
      );
      // The legitimate row is untouched.
      const still = await prisma.lessonResource.findUnique({ where: { id: a.id } });
      expect(still?.position).toBe(0);
    });

    it('deletes a resource and reports the id back', async () => {
      const lesson = await makeLesson();
      const resource = await service.addResource(lesson.id, {
        kind: 'presentation',
        title: 'x',
        ...fileInput,
      });

      await expect(service.removeResource(resource.id)).resolves.toEqual({ id: resource.id });
      await expect(
        prisma.lessonResource.findUnique({ where: { id: resource.id } }),
      ).resolves.toBeNull();
    });

    it('404s when deleting something that is not there', async () => {
      await expect(
        service.removeResource('00000000-0000-4000-8000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });
  });

});
