// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { LearningPathSchema } from '@ayman/contracts/path';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LessonGateService } from '../progress/lesson-gate.service';
import { PathService } from './path.service';

/**
 * What `/api/me/path` says about a course the instructor has taken down while
 * a student is enrolled in it.
 *
 * ## The bug this pins
 *
 * `forUser` selects enrollments by their own status and has never filtered on
 * the COURSE's. An instructor unpublishing a course to edit it does not un-enrol
 * anybody, so the map went on drawing the whole run — as pressable links. Every
 * one of them dead-ended: `LessonAccessService` compiles `status: 'published'`
 * into its `where`, the lesson page turns that 404 into a redirect to
 * `/library/:slug`, and the catalog — published-only — answers `notFound()`.
 * A student pressing their own next lesson landed on «الصفحة مش موجودة».
 *
 * ## Why the fix is a flag and not a `where`
 *
 * Filtering would have been one line and would have deleted the course from the
 * student's learning path mid-term with no explanation — the same failure with
 * the evidence removed. The course ships with `published: false` instead and the
 * UI says «مقفول مؤقتاً».
 *
 * These cases assert the CONSEQUENCES, not the field: that nothing on a closed
 * course is offered as a resume target, and that the course does not silently
 * vanish. A future rewrite that keeps both is free to move the field.
 */
describe('PathService — a course unpublished under an enrolled student', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new PathService(prisma, new LessonGateService(prisma));

  let userId = '';
  let instructorId = '';
  let courseId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();

    userId = (
      await prisma.user.create({
        data: { id: `pc-${stamp}`, name: 'طالب', email: `pc-${stamp}@t.test` },
      })
    ).id;
    instructorId = (
      await prisma.user.create({
        data: { id: `pci-${stamp}`, name: 'مُحاضر', email: `pci-${stamp}@t.test` },
      })
    ).id;

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();

    courseId = (
      await prisma.course.create({
        data: {
          slug: `pc-course-${stamp}`,
          title: 'كورس البرمجة',
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          year: 2,
          subjectId: subject.id,
          instructorId,
        },
      })
    ).id;

    const section = await prisma.courseSection.create({
      data: { courseId, title: 'الوحدة', position: 1, isPublished: true },
    });
    await prisma.lesson.create({
      data: {
        courseId,
        sectionId: section.id,
        title: 'الدرس الأول',
        kind: 'text',
        position: 1,
        isPublished: true,
      },
    });

    await prisma.enrollment.create({
      data: { userId, courseId, source: 'free', status: 'active' },
    });
  });

  afterEach(async () => {
    // Every case decides the course's own status; put it back so the order of
    // the cases below cannot matter.
    await prisma.course.update({ where: { id: courseId }, data: { status: 'published' } });
  });

  afterAll(async () => {
    await prisma.enrollment.deleteMany({ where: { courseId } });
    await prisma.lesson.deleteMany({ where: { courseId } });
    await prisma.courseSection.deleteMany({ where: { courseId } });
    await prisma.course.delete({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, instructorId] } } });
    await prisma.$disconnect();
  });

  it('reports a live course as published, with something to resume', async () => {
    const path = await service.forUser(userId);
    const course = path.courses.find((entry) => entry.id === courseId);

    expect(course?.published).toBe(true);
    expect(course?.nextLessonId).not.toBeNull();
  });

  it('keeps the course on the path once it is unpublished, rather than deleting it', async () => {
    await prisma.course.update({ where: { id: courseId }, data: { status: 'draft' } });

    const path = await service.forUser(userId);
    const course = path.courses.find((entry) => entry.id === courseId);

    // The whole argument against a `where` clause: the student can still see
    // the thing they are enrolled in, and its lessons, and its progress.
    expect(course).toBeDefined();
    expect(course?.published).toBe(false);
    expect(course?.nodes.length).toBeGreaterThan(0);
  });

  /**
   * The one that actually removes the 404. `nextLessonId` is what «نكمّل»
   * links to and what `currentCourseId` is derived from, so a value here is a
   * button pointing at a lesson the routes will refuse.
   */
  it('offers nothing to resume on a closed course', async () => {
    await prisma.course.update({ where: { id: courseId }, data: { status: 'draft' } });

    const path = await service.forUser(userId);

    expect(path.courses.find((entry) => entry.id === courseId)?.nextLessonId).toBeNull();
    expect(path.currentCourseId).not.toBe(courseId);
  });

  it('treats an archived course as closed too, not only a draft', async () => {
    await prisma.course.update({ where: { id: courseId }, data: { status: 'archived' } });

    const course = (await service.forUser(userId)).courses.find((e) => e.id === courseId);

    expect(course?.published).toBe(false);
    expect(course?.nextLessonId).toBeNull();
  });

  it('still matches the shared contract with the course closed', async () => {
    await prisma.course.update({ where: { id: courseId }, data: { status: 'draft' } });

    const path = await service.forUser(userId);

    expect(() => LearningPathSchema.parse(path)).not.toThrow();
  });
});
