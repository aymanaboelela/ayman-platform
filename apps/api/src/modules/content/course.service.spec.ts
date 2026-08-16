// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { AuditService } from '../../audit/audit.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EXAM_SECTION_TITLE } from '@ayman/contracts/content';
import { seedQuizFixture } from '../quiz/testing/quiz-fixtures';
import { CourseService } from './course.service';
import { YouTubeDurationService } from './youtube-duration.service';

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
    service = new CourseService(prisma, new AuditService(prisma), new YouTubeDurationService());

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

  it('gives the admin editor the lesson body, the student count and the quiz shape', async () => {
    const course = await service.create(adminId, input());
    const section = await prisma.courseSection.create({
      data: { courseId: course.id, title: 'قسم', position: 0 },
    });
    const textLesson = await prisma.lesson.create({
      data: { courseId: course.id, sectionId: section.id, title: 'قراءة', kind: 'text', position: 0 },
    });
    await prisma.lessonText.create({
      data: { lessonId: textLesson.id, bodyHtml: '<p>نص المحاضرة</p>' },
    });
    const quizLesson = await prisma.lesson.create({
      data: { courseId: course.id, sectionId: section.id, title: 'اختبار', kind: 'quiz', position: 1 },
    });
    await prisma.quiz.create({
      data: { lessonId: quizLesson.id, reviewOptions: {}, isPublished: true },
    });

    const detail = await service.findForAdmin(course.id);
    const lessons = detail.sections[0]!.lessons;

    // Without this the editor's textarea renders empty over an existing body
    // and the instructor overwrites content they never saw.
    expect(lessons[0]!.text).toEqual({ bodyHtml: '<p>نص المحاضرة</p>' });
    expect(lessons[0]!._count.progress).toBe(0);
    expect(lessons[1]!.quiz).toMatchObject({ isPublished: true, _count: { slots: 0 } });
    expect(lessons[0]!.quiz).toBeNull();
    // A key that is not in a payload is a key that cannot leak from one.
    expect(JSON.stringify(detail)).not.toContain('storageKey');
  });

  describe('scaffoldExam', () => {
    it('builds an improvable exam and everything unpublished', async () => {
      const course = await service.create(adminId, input());

      const result = await service.scaffoldExam(course.id);
      expect(result.created).toBe(true);

      const quiz = await prisma.quiz.findUniqueOrThrow({ where: { id: result.quizId } });
      // The final exam is the one quiz that offers a second sitting. Its
      // improvement paper starts empty, and the publish guard refuses to ship
      // it that way — scaffolding an exam does not finish it.
      expect(quiz.allowsImprovement).toBe(true);
      expect(quiz.improvementSumMarks.toNumber()).toBe(0);
      expect(quiz.shuffleQuestions).toBe(true);
      expect(quiz.isPublished).toBe(false);

      const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: result.lessonId } });
      expect(lesson.kind).toBe('quiz');
      expect(lesson.isPublished).toBe(false);
      expect(lesson.courseId).toBe(course.id);

      const after = await prisma.course.findUniqueOrThrow({ where: { id: course.id } });
      expect(after.examLessonId).toBe(result.lessonId);
    });

    it('returns the existing exam on a second press instead of building another', async () => {
      const course = await service.create(adminId, input());

      const first = await service.scaffoldExam(course.id);
      const second = await service.scaffoldExam(course.id);

      expect(second).toEqual({ ...first, created: false });
      // The real regression this guards: a second press that produced a second
      // orphan section and lesson no course points at.
      await expect(prisma.courseSection.count({ where: { courseId: course.id } })).resolves.toBe(1);
      await expect(prisma.lesson.count({ where: { courseId: course.id } })).resolves.toBe(1);
    });

    it('appends the exam section after the existing ones', async () => {
      const course = await service.create(adminId, input());
      await prisma.courseSection.create({
        data: { courseId: course.id, title: 'الوحدة الأولى', position: 0 },
      });

      const result = await service.scaffoldExam(course.id);

      const lesson = await prisma.lesson.findUniqueOrThrow({
        where: { id: result.lessonId },
        select: { section: { select: { position: true, title: true } } },
      });
      expect(lesson.section.position).toBe(1);
      expect(lesson.section.title).toBe(EXAM_SECTION_TITLE);
    });

    it('creates only the quiz when a bare exam lesson was designated by hand', async () => {
      const course = await service.create(adminId, input());
      const section = await prisma.courseSection.create({
        data: { courseId: course.id, title: 'قسم', position: 0 },
      });
      const lesson = await prisma.lesson.create({
        data: { courseId: course.id, sectionId: section.id, title: 'امتحان', kind: 'quiz', position: 0 },
      });
      await service.setExamLesson(course.id, lesson.id);

      const result = await service.scaffoldExam(course.id);

      expect(result.lessonId).toBe(lesson.id);
      expect(result.created).toBe(true);
      // No second section invented for a lesson that already had one.
      await expect(prisma.courseSection.count({ where: { courseId: course.id } })).resolves.toBe(1);
    });

    it('404s on a course that does not exist', async () => {
      await expect(
        service.scaffoldExam('00000000-0000-7000-8000-000000000000'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  /**
   * The one-press cascade. Publishing is four independent flags, and pressing
   * only the course-level one produced a live course showing students nothing —
   * which is what «في كلمة واحدة بس» is asking to end.
   *
   * The load-bearing half is what it REFUSES to publish: a lecture a student
   * could not do (no video, no body, no materials, an unpublished quiz) is left
   * a draft and named, which is what makes it safe to press on the
   * half-finished course «حتى لو ما كملتش» describes.
   */
  describe('publishAll', () => {
    /** One lesson per readiness case, in one section. */
    async function seedMixedCourse() {
      const course = await service.create(adminId, input());
      const section = await prisma.courseSection.create({
        data: { courseId: course.id, title: 'المقدمة', position: 0 },
      });

      const ready = await prisma.lesson.create({
        data: {
          courseId: course.id,
          sectionId: section.id,
          title: 'محاضرة فيها فيديو',
          kind: 'video',
          position: 0,
        },
      });
      await prisma.lessonVideo.create({
        data: {
          lessonId: ready.id,
          provider: 'youtube',
          externalId: 'dQw4w9WgXcQ',
          durationSeconds: 600,
        },
      });

      const noVideo = await prisma.lesson.create({
        data: {
          courseId: course.id,
          sectionId: section.id,
          title: 'محاضرة من غير فيديو',
          kind: 'video',
          position: 1,
        },
      });
      const noText = await prisma.lesson.create({
        data: {
          courseId: course.id,
          sectionId: section.id,
          title: 'قراءة فاضية',
          kind: 'text',
          position: 2,
        },
      });
      const noQuiz = await prisma.lesson.create({
        data: {
          courseId: course.id,
          sectionId: section.id,
          title: 'اختبار من غير أسئلة',
          kind: 'quiz',
          position: 3,
        },
      });

      return { course, section, ready, noVideo, noText, noQuiz };
    }

    it('publishes the course, its section and only the lessons a student could do', async () => {
      const { course, section, ready, noVideo } = await seedMixedCourse();

      const result = await service.publishAll(course.id);

      expect(result.publishedLessons).toBe(1);
      expect(result.publishedSections).toBe(1);

      const after = await prisma.course.findUniqueOrThrow({ where: { id: course.id } });
      expect(after.status).toBe('published');
      expect(after.publishedAt).toBeInstanceOf(Date);

      await expect(
        prisma.courseSection.findUniqueOrThrow({ where: { id: section.id } }),
      ).resolves.toMatchObject({ isPublished: true });
      await expect(
        prisma.lesson.findUniqueOrThrow({ where: { id: ready.id } }),
      ).resolves.toMatchObject({ isPublished: true });
      // The whole point: an unfinished lecture stays a draft rather than going
      // live as a blank player.
      await expect(
        prisma.lesson.findUniqueOrThrow({ where: { id: noVideo.id } }),
      ).resolves.toMatchObject({ isPublished: false });
    });

    it('names every lecture it left behind, with the reason it is not ready', async () => {
      const { course, noVideo, noText, noQuiz } = await seedMixedCourse();

      const { skipped } = await service.publishAll(course.id);

      // Named, not counted: «٣ محاضرات ما اتنشرتش» says there is a problem and
      // not where it is, and each of these is fixable in the panel it names.
      expect(skipped).toEqual(
        expect.arrayContaining([
          { id: noVideo.id, title: 'محاضرة من غير فيديو', reason: 'noVideo' },
          { id: noText.id, title: 'قراءة فاضية', reason: 'noText' },
          { id: noQuiz.id, title: 'اختبار من غير أسئلة', reason: 'quizNotPublished' },
        ]),
      );
      expect(skipped).toHaveLength(3);
    });

    it('reports an attachment lesson with no materials, and publishes one that has them', async () => {
      const course = await service.create(adminId, input());
      const section = await prisma.courseSection.create({
        data: { courseId: course.id, title: 'مواد', position: 0 },
      });
      const empty = await prisma.lesson.create({
        data: {
          courseId: course.id,
          sectionId: section.id,
          title: 'مرفقات فاضية',
          kind: 'attachment',
          position: 0,
        },
      });
      const filled = await prisma.lesson.create({
        data: {
          courseId: course.id,
          sectionId: section.id,
          title: 'مرفقات فيها ملف',
          kind: 'attachment',
          position: 1,
        },
      });
      await prisma.lessonResource.create({
        data: {
          lessonId: filled.id,
          kind: 'link',
          title: 'رابط',
          linkUrl: 'https://example.com/deck',
          position: 0,
        },
      });

      const { skipped } = await service.publishAll(course.id);

      expect(skipped).toEqual([{ id: empty.id, title: 'مرفقات فاضية', reason: 'noResources' }]);
      await expect(
        prisma.lesson.findUniqueOrThrow({ where: { id: filled.id } }),
      ).resolves.toMatchObject({ isPublished: true });
    });

    it('never unpublishes a live lecture that has since lost its content', async () => {
      const course = await service.create(adminId, input());
      const section = await prisma.courseSection.create({
        data: { courseId: course.id, title: 'قسم', position: 0, isPublished: true },
      });
      // Published, and its video removed afterwards. Students may be part-way
      // through it, and a «نشر» button must not quietly hide it — nor report it
      // as something that was skipped, which would read as a new problem.
      const live = await prisma.lesson.create({
        data: {
          courseId: course.id,
          sectionId: section.id,
          title: 'محاضرة شغالة',
          kind: 'video',
          position: 0,
          isPublished: true,
        },
      });

      const { skipped } = await service.publishAll(course.id);

      expect(skipped).toHaveLength(0);
      await expect(
        prisma.lesson.findUniqueOrThrow({ where: { id: live.id } }),
      ).resolves.toMatchObject({ isPublished: true });
    });

    it('refuses when nothing in the course could be shown, and does not half-publish', async () => {
      const course = await service.create(adminId, input());
      const section = await prisma.courseSection.create({
        data: { courseId: course.id, title: 'قسم', position: 0 },
      });
      await prisma.lesson.create({
        data: {
          courseId: course.id,
          sectionId: section.id,
          title: 'محاضرة من غير فيديو',
          kind: 'video',
          position: 0,
        },
      });

      await expect(service.publishAll(course.id)).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        prisma.course.findUniqueOrThrow({ where: { id: course.id } }),
      ).resolves.toMatchObject({ status: 'draft' });
      await expect(
        prisma.courseSection.findUniqueOrThrow({ where: { id: section.id } }),
      ).resolves.toMatchObject({ isPublished: false });
    });

    it('stamps publishedAt once, like setStatus', async () => {
      const { course } = await seedMixedCourse();

      await service.publishAll(course.id);
      const stamped = await prisma.course.findUniqueOrThrow({ where: { id: course.id } });

      await service.setStatus(course.id, 'draft');
      await service.publishAll(course.id);
      const again = await prisma.course.findUniqueOrThrow({ where: { id: course.id } });

      expect(again.publishedAt?.getTime()).toBe(stamped.publishedAt?.getTime());
    });

    it('404s on a course that does not exist', async () => {
      await expect(
        service.publishAll('00000000-0000-7000-8000-000000000000'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  /**
   * The whole-course video check.
   *
   * `probe` is stubbed here on purpose: what is under test is which lectures
   * get REPORTED and how they are described, not YouTube's answers — those have
   * their own tests in `youtube-duration.service.spec.ts`, including the
   * regression where a challenged watch page accused a working video.
   */
  describe('checkVideos', () => {
    async function seedVideos(
      rows: { title: string; externalId: string | null; published?: boolean }[],
    ) {
      const course = await service.create(adminId, input());
      const section = await prisma.courseSection.create({
        data: { courseId: course.id, title: 'المقدمة', position: 0 },
      });
      let position = 0;
      for (const row of rows) {
        const lesson = await prisma.lesson.create({
          data: {
            courseId: course.id,
            sectionId: section.id,
            title: row.title,
            kind: 'video',
            position: position += 1,
            isPublished: row.published ?? false,
          },
        });
        if (row.externalId !== null) {
          await prisma.lessonVideo.create({
            data: {
              lessonId: lesson.id,
              provider: 'youtube',
              externalId: row.externalId,
              durationSeconds: 600,
            },
          });
        }
      }
      return course;
    }

    it('reports only the broken ones, and counts every video it asked about', async () => {
      const course = await seedVideos([
        { title: 'شغّالة', externalId: 'aaaaaaaaaaa' },
        { title: 'التضمين مقفول', externalId: 'bbbbbbbbbbb', published: true },
        { title: 'من غير فيديو', externalId: null },
      ]);

      const answers: Record<string, 'ok' | 'blocked'> = {
        aaaaaaaaaaa: 'ok',
        bbbbbbbbbbb: 'blocked',
      };
      const spy = jest
        .spyOn(YouTubeDurationService.prototype, 'probe')
        .mockImplementation(async (id: string) => ({
          durationSeconds: 600,
          embed: answers[id] ?? 'unknown',
        }));

      const result = await service.checkVideos(course.id);
      spy.mockRestore();

      expect(result.checked).toBe(3);
      expect(result.problems).toEqual([
        expect.objectContaining({ title: 'التضمين مقفول', embed: 'blocked', isPublished: true }),
        // No video row means nothing was asked, so there is no embed answer to
        // report — `null`, where `unknown` would claim we had tried.
        expect.objectContaining({ title: 'من غير فيديو', embed: null, externalId: null }),
      ]);
    });

    it('reports an unknown rather than passing it off as fine', async () => {
      // The probe could not get an answer — the instructor is told exactly
      // that. Treating it as an all-clear is the failure the check exists for.
      const course = await seedVideos([{ title: 'مش متأكدين', externalId: 'ccccccccccc' }]);
      const spy = jest
        .spyOn(YouTubeDurationService.prototype, 'probe')
        .mockResolvedValue({ durationSeconds: null, embed: 'unknown' });

      const result = await service.checkVideos(course.id);
      spy.mockRestore();

      expect(result.problems).toHaveLength(1);
      expect(result.problems[0]).toMatchObject({ embed: 'unknown' });
    });

    it('says nothing at all when every video plays', async () => {
      const course = await seedVideos([
        { title: 'واحدة', externalId: 'ddddddddddd' },
        { title: 'اتنين', externalId: 'eeeeeeeeeee' },
      ]);
      const spy = jest
        .spyOn(YouTubeDurationService.prototype, 'probe')
        .mockResolvedValue({ durationSeconds: 600, embed: 'ok' });

      const result = await service.checkVideos(course.id);
      spy.mockRestore();

      expect(result).toEqual({ checked: 2, problems: [] });
    });

    it('ignores lessons that are not videos', async () => {
      const course = await service.create(adminId, input());
      const section = await prisma.courseSection.create({
        data: { courseId: course.id, title: 'قسم', position: 0 },
      });
      await prisma.lesson.create({
        data: { courseId: course.id, sectionId: section.id, title: 'قراءة', kind: 'text', position: 0 },
      });

      await expect(service.checkVideos(course.id)).resolves.toEqual({ checked: 0, problems: [] });
    });

    it('404s on a course that does not exist', async () => {
      await expect(
        service.checkVideos('00000000-0000-7000-8000-000000000000'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
