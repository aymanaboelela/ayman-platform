// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { AuditService } from '../../audit/audit.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { seedQuizFixture } from '../quiz/testing/quiz-fixtures';
import { CourseService } from './course.service';

// Integration test against the real database — the same reasoning as
// entitlement.service.spec.ts: a mock would only prove the mock matches
// itself, and the taxonomy re-validation is half the behaviour under test.
describe('CourseService', () => {
  let prisma: PrismaService;
  let service: CourseService;
  let adminId: string;
  let trackId: string;
  let subjectId: string;
  let systemId: string;
  let suffix: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as unknown as PrismaService;
    await prisma.$connect();
    service = new CourseService(prisma, new AuditService(prisma));

    suffix = Date.now().toString(36);
    const admin = await prisma.user.create({
      data: { id: `crs-${suffix}`, name: 'أيمن', email: `crs-${suffix}@example.com`, role: 'admin' },
    });
    adminId = admin.id;

    // A real offering, so the tuple validation has something legitimate to pass.
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

  const input = (overrides: Record<string, unknown> = {}) => ({
    slug: `course-${suffix}-${Math.random().toString(36).slice(2, 8)}`,
    title: 'البرمجة وعلوم الحاسب',
    subtitle: null,
    description: null,
    systemId,
    year: 2,
    trackId,
    subjectId,
    coverKey: null,
    ...overrides,
  });

  it('creates a draft and stamps the instructor from the session, not the body', async () => {
    const course = await service.create(adminId, input());
    expect(course.status).toBe('draft');
    expect(course.publishedAt).toBeNull();
    expect(course.instructorId).toBe(adminId);
    expect(course.position).toBe(0);
  });

  it('rejects a (system, year, track, subject) tuple with no matching offering', async () => {
    const otherSubject = await prisma.subject.findFirstOrThrow({ where: { id: { not: subjectId } } });
    await expect(
      service.create(adminId, input({ subjectId: otherSubject.id, year: 3 })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a grade-1 course carrying a track, at the service layer too', async () => {
    await expect(service.create(adminId, input({ year: 1 }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('turns a duplicate slug into a 409, not a 500', async () => {
    const slug = `dup-${suffix}`;
    await service.create(adminId, input({ slug }));
    await expect(service.create(adminId, input({ slug }))).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses to publish a course with no published lesson', async () => {
    const course = await service.create(adminId, input());
    await expect(service.setStatus(course.id, 'published')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('stamps publishedAt once and never moves it on republish', async () => {
    const course = await service.create(adminId, input());
    const section = await prisma.courseSection.create({
      data: { courseId: course.id, title: 'قسم', position: 0, isPublished: true },
    });
    await prisma.lesson.create({
      data: {
        courseId: course.id,
        sectionId: section.id,
        title: 'محاضرة',
        kind: 'text',
        position: 0,
        isPublished: true,
      },
    });

    const published = await service.setStatus(course.id, 'published');
    expect(published.status).toBe('published');
    expect(published.publishedAt).toBeInstanceOf(Date);

    await service.setStatus(course.id, 'draft');
    const republished = await service.setStatus(course.id, 'published');
    expect(republished.publishedAt?.getTime()).toBe(published.publishedAt?.getTime());
  });

  it('never lets update() change status, even if the object somehow carries one', async () => {
    const course = await service.create(adminId, input());
    // Simulates a caller that bypassed the DTO — the service must not spread.
    await service.update(course.id, { title: 'اسم جديد', status: 'published' } as never);
    const after = await prisma.course.findUniqueOrThrow({ where: { id: course.id } });
    expect(after.title).toBe('اسم جديد');
    expect(after.status).toBe('draft');
  });

  it('404s on an unknown id rather than returning null', async () => {
    await expect(service.findForAdmin(crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundException);
  });

  // I4 (audit): a course's lessons cascade to quizzes -> quiz_attempts ->
  // attempt_events, and attempt_events is append-only at the DB level
  // (a trigger REVOKEs DELETE/UPDATE outright). Before this fix, deleting a
  // course with any student attempt rolled the whole transaction back with a
  // raw Postgres error surfacing as an opaque 500 — permanently, since the
  // attempts can never be removed. `remove()` must now catch this BEFORE
  // Prisma ever issues the cascading DELETE.
  it('refuses to hard-delete a course with student quiz attempts, and points the admin at archiving', async () => {
    const fixture = await seedQuizFixture(prisma);
    try {
      const quiz = await prisma.quiz.findUniqueOrThrow({
        where: { id: fixture.quizId },
        select: { sumMarks: true, gradeOutOf: true, passPercent: true },
      });
      await prisma.quizAttempt.create({
        data: {
          quizId: fixture.quizId,
          userId: fixture.studentId,
          attemptNo: 1,
          ...quiz,
        },
      });

      try {
        await service.remove(fixture.courseId);
        throw new Error('expected service.remove to reject');
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toMatchObject({
          code: 'course_has_attempts',
        });
      }

      // The refusal must be a no-op, not a partial delete.
      await expect(
        prisma.course.findUniqueOrThrow({ where: { id: fixture.courseId } }),
      ).resolves.toBeTruthy();
    } finally {
      await fixture.cleanup();
    }
  });

  it('still hard-deletes a course with no attempts at all (cascading its empty lesson tree)', async () => {
    const course = await service.create(adminId, input());
    const section = await prisma.courseSection.create({
      data: { courseId: course.id, title: 'قسم', position: 0 },
    });
    await prisma.lesson.create({
      data: {
        courseId: course.id,
        sectionId: section.id,
        title: 'محاضرة',
        kind: 'text',
        position: 0,
      },
    });

    await expect(service.remove(course.id)).resolves.toEqual({ id: course.id });
    await expect(prisma.course.findUnique({ where: { id: course.id } })).resolves.toBeNull();
  });

  describe('setExamLesson', () => {
    async function courseWithLessons() {
      const course = await service.create(adminId, input());
      const section = await prisma.courseSection.create({
        data: { courseId: course.id, title: 'وحدة', position: 0, isPublished: true },
      });
      const quizLesson = await prisma.lesson.create({
        data: {
          courseId: course.id,
          sectionId: section.id,
          title: 'الامتحان',
          kind: 'quiz',
          position: 0,
          isPublished: true,
        },
      });
      const videoLesson = await prisma.lesson.create({
        data: {
          courseId: course.id,
          sectionId: section.id,
          title: 'محاضرة',
          kind: 'video',
          position: 1,
          isPublished: true,
        },
      });
      return { course, quizLesson, videoLesson };
    }

    it('designates a quiz lesson of the same course', async () => {
      const { course, quizLesson } = await courseWithLessons();
      const updated = await service.setExamLesson(course.id, quizLesson.id);
      expect(updated.examLessonId).toBe(quizLesson.id);
    });

    it('clears the designation with null', async () => {
      const { course, quizLesson } = await courseWithLessons();
      await service.setExamLesson(course.id, quizLesson.id);
      const cleared = await service.setExamLesson(course.id, null);
      expect(cleared.examLessonId).toBeNull();
    });

    it('refuses a lesson that is not a quiz', async () => {
      const { course, videoLesson } = await courseWithLessons();
      await expect(service.setExamLesson(course.id, videoLesson.id)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("refuses a quiz lesson belonging to ANOTHER course", async () => {
      const mine = await courseWithLessons();
      const theirs = await courseWithLessons();

      await expect(
        service.setExamLesson(mine.course.id, theirs.quizLesson.id),
      ).rejects.toThrow(BadRequestException);

      const untouched = await prisma.course.findUniqueOrThrow({ where: { id: mine.course.id } });
      expect(untouched.examLessonId).toBeNull();
    });

    it('404s for a course that does not exist', async () => {
      await expect(
        service.setExamLesson('00000000-0000-4000-8000-000000000000', null),
      ).rejects.toThrow(NotFoundException);
    });

    it('lets the DATABASE refuse a cross-course exam even without the service check', async () => {
      // The service validates first; this proves the composite FK behind it is
      // real, so a direct write cannot point a course at foreign content.
      const mine = await courseWithLessons();
      const theirs = await courseWithLessons();

      await expect(
        prisma.course.update({
          where: { id: mine.course.id },
          data: { examLessonId: theirs.quizLesson.id },
        }),
      ).rejects.toThrow();
    });

    it('unsets the pointer when the exam lesson is deleted, rather than losing the course', async () => {
      const { course, quizLesson } = await courseWithLessons();
      await service.setExamLesson(course.id, quizLesson.id);

      await prisma.lesson.delete({ where: { id: quizLesson.id } });

      const after = await prisma.course.findUnique({ where: { id: course.id } });
      expect(after).not.toBeNull();
      expect(after?.examLessonId).toBeNull();
    });
  });

});
