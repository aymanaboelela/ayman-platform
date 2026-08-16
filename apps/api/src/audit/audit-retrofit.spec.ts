// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { CourseService } from '../modules/content/course.service';
import { YouTubeDurationService } from '../modules/content/youtube-duration.service';
import { LessonService } from '../modules/content/lesson.service';
import { YouTubeDurationService } from '../modules/content/youtube-duration.service';
import { SectionService } from '../modules/content/section.service';
import { AuditService } from './audit.service';
import { runWithActor } from './audit-context';

/**
 * The retrofit's regression test. Plans 3–5 shipped before the audit log
 * existed; Plan 6 Task 3 instruments their mutating services. Without this
 * spec, a later refactor drops a `record()` call and the only symptom is an
 * audit log that looks complete and is not.
 *
 * Scoped by resource id rather than "the last N rows": jest runs spec files in
 * parallel workers and other files write real audit entries into the same
 * append-only table, so "the tail of the log" is not a stable thing to assert
 * against.
 */
describe('audit retrofit (content services)', () => {
  let prisma: PrismaService;
  let audit: AuditService;
  let courses: CourseService;
  let sections: SectionService;
  let lessons: LessonService;
  let adminId: string;
  let suffix: string;
  let systemId: string;
  let trackId: string;
  let subjectId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as unknown as PrismaService;
    await prisma.$connect();

    audit = new AuditService(prisma);
    courses = new CourseService(prisma, audit, new YouTubeDurationService());
    sections = new SectionService(prisma, audit);
    lessons = new LessonService(prisma, audit, new YouTubeDurationService());

    suffix = `aud-${Date.now().toString(36)}`;
    const admin = await prisma.user.create({
      data: { id: suffix, name: 'أيمن', email: `${suffix}@example.com`, role: 'admin' },
    });
    adminId = admin.id;

    const offering = await prisma.subjectOffering.findFirstOrThrow({
      where: { trackId: { not: null }, year: 2 },
      select: { systemId: true, trackId: true, subjectId: true },
    });
    systemId = offering.systemId;
    trackId = offering.trackId as string;
    subjectId = offering.subjectId;
  });

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { instructorId: adminId } });
    await prisma.user.delete({ where: { id: adminId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('records create → lesson:create → lesson:update → publish, in order, with the real actor', async () => {
    const course = await runWithActor(
      { actorUserId: adminId, actorIp: '10.0.0.7', actorUserAgent: 'jest', requestId: 'req-1' },
      async () => {
        const created = await courses.create(adminId, {
          slug: `${suffix}-course`,
          title: 'الفيزياء',
          subtitle: null,
          description: null,
          systemId,
          year: 2,
          trackId,
          subjectId,
          coverKey: null,
        });

        const section = await sections.create(created.id, {
          title: 'الفصل الأول',
          summary: null,
          isPublished: true,
        });

        const lesson = await lessons.create(section.id, {
          title: 'مقدمة',
          kind: 'text',
          isPublished: true,
          isFreePreview: false,
          // Not null: `estimated_seconds` is a non-nullable Int with a
          // default, and a null here makes Prisma fall back to the *checked*
          // create input, whose error message ("Argument `course` is missing")
          // names a completely unrelated field.
          estimatedSeconds: 0,
          completionMode: 'manual',
          completionMinViewSeconds: null,
          completionPassGrade: null,
        });

        await lessons.update(lesson.id, { title: 'مقدمة معدّلة' });
        await courses.setStatus(created.id, 'published');
        await courses.setStatus(created.id, 'draft');

        return { courseId: created.id, sectionId: section.id, lessonId: lesson.id };
      },
    );

    const rows = await prisma.auditLog.findMany({
      where: {
        resourceId: { in: [course.courseId, course.sectionId, course.lessonId] },
      },
      orderBy: { id: 'asc' },
      select: { action: true, resourceId: true, actorUserId: true, actorIp: true, requestId: true },
    });

    expect(rows.map((row) => row.action)).toEqual([
      'course:create',
      'section:update',
      'lesson:create',
      'lesson:update',
      'course:publish',
      'course:unpublish',
    ]);

    // Every row carries the ambient actor — nothing had to thread it through a
    // controller signature.
    for (const row of rows) {
      expect(row.actorUserId).toBe(adminId);
      expect(row.actorIp).toBe('10.0.0.7');
      expect(row.requestId).toBe('req-1');
    }
  });

  it('leaves the chain verifiable after the retrofitted writes', async () => {
    await expect(audit.verifyChain()).resolves.toEqual({ ok: true });
  });
});
