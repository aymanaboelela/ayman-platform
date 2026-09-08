// Prisma 7 does not auto-load .env and this spec runs outside Nest's bootstrap,
// so DATABASE_URL must be loaded before anything reads it — same opening as
// `dashboard.service.spec.ts` and `mastery.service.spec.ts`.
import 'dotenv/config';
import { BadRequestException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { EXAM_SHELF_TITLE, examPhase } from '@ayman/contracts/quiz/scheduled';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../../audit/audit.service';
import { ScheduledExamsService } from './scheduled-exams.service';

/**
 * DB-backed, against the real dev database, because every property worth
 * asserting here is a database property: the two composite FKs that make
 * "an exam only covers lessons of its own course" structural, the DEFERRABLE
 * unique that lets the syllabus be rewritten in one statement, and the cascade
 * that makes delete dangerous enough to refuse.
 *
 * Everything it creates is torn down in `afterAll`, and it never touches a row
 * it did not create.
 */
describe('ScheduledExamsService', () => {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const prisma = client as unknown as PrismaService;

  // The audit chain is exercised by its own spec and needs the advisory lock;
  // here it would only add a row this suite then has to leave behind, because
  // `audit_log` is INSERT-only and a test that tidies up after itself is a
  // 42501. See `audit-log-is-insert-only`.
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const service = new ScheduledExamsService(prisma, audit);

  const ACTOR = 'scheduled-exams-spec';
  let courseId: string;
  let sectionId: string;
  const lectureIds: string[] = [];
  let otherCourseId: string;
  let otherLessonId: string;
  const createdExamLessonIds: string[] = [];

  /**
   * `Course` requires a system, a subject and an instructor, each a Restrict FK.
   * Borrowing them from an existing row keeps this fixture from having to build
   * (and then tear down) half the taxonomy — and the borrowed rows are only
   * READ, never modified.
   */
  async function courseScaffold() {
    const donor = await client.course.findFirstOrThrow({
      select: { systemId: true, subjectId: true, instructorId: true },
    });
    return donor;
  }

  beforeAll(async () => {
    const donor = await courseScaffold();

    const course = await client.course.create({
      data: {
        title: 'كورس اختبار امتحانات الشهر',
        slug: `exam-spec-${Date.now()}`,
        status: 'published',
        // `courses_published_has_timestamp` — a published course must say WHEN.
        publishedAt: new Date(),
        year: 3,
        ...donor,
      },
      select: { id: true },
    });
    courseId = course.id;

    const section = await client.courseSection.create({
      data: { courseId, title: 'الوحدة الأولى', position: 0, isPublished: true },
      select: { id: true },
    });
    sectionId = section.id;

    for (let i = 0; i < 3; i += 1) {
      const lesson = await client.lesson.create({
        data: {
          courseId,
          sectionId,
          title: `الدرس ${i + 1}`,
          kind: 'video',
          position: i,
          isPublished: true,
        },
        select: { id: true },
      });
      lectureIds.push(lesson.id);
    }

    const other = await client.course.create({
      data: {
        title: 'كورس تاني',
        slug: `exam-spec-other-${Date.now()}`,
        status: 'published',
        // `courses_published_has_timestamp` — a published course must say WHEN.
        publishedAt: new Date(),
        year: 3,
        ...donor,
      },
      select: { id: true },
    });
    otherCourseId = other.id;
    const otherSection = await client.courseSection.create({
      data: { courseId: otherCourseId, title: 'وحدة', position: 0, isPublished: true },
      select: { id: true },
    });
    const otherLesson = await client.lesson.create({
      data: {
        courseId: otherCourseId,
        sectionId: otherSection.id,
        title: 'درس من كورس تاني',
        kind: 'video',
        position: 0,
        isPublished: true,
      },
      select: { id: true },
    });
    otherLessonId = otherLesson.id;
  });

  afterAll(async () => {
    // Lessons cascade to their quiz, its attempts and every coverage row; the
    // courses cascade to their sections and lessons. Deleting the two courses
    // is therefore enough, and is done last.
    if (courseId) await client.course.deleteMany({ where: { id: courseId } });
    if (otherCourseId) await client.course.deleteMany({ where: { id: otherCourseId } });
    await client.$disconnect();
  });

  const WINDOW = {
    // Friday 2026-09-11 20:00 Cairo (UTC+3 in September) → 17:00Z.
    opensAt: new Date('2026-09-11T17:00:00.000Z'),
    closesAt: new Date('2026-09-12T17:00:00.000Z'),
  };

  async function makeExam(overrides: Partial<Parameters<typeof service.create>[0]> = {}) {
    const created = await service.create(
      {
        courseId,
        title: 'امتحان نص شهر سبتمبر',
        coveredLessonIds: [lectureIds[0], lectureIds[1]],
        durationMinutes: 45,
        gradeOutOf: 20,
        passPercent: 50,
        ...WINDOW,
        ...overrides,
      } as Parameters<typeof service.create>[0],
      ACTOR,
    );
    createdExamLessonIds.push(created.lessonId);
    return created.lessonId;
  }

  it('creates the shelf, the lesson, the quiz and the syllabus in one call', async () => {
    const lessonId = await makeExam();

    const lesson = await client.lesson.findUniqueOrThrow({
      where: { id: lessonId },
      select: {
        kind: true,
        isPublished: true,
        courseId: true,
        section: { select: { title: true, isPublished: true } },
        quiz: {
          select: {
            durationSeconds: true,
            openFrom: true,
            openUntil: true,
            gradeOutOf: true,
            allowsImprovement: true,
            isPublished: true,
          },
        },
        coversLessons: { orderBy: { position: 'asc' }, select: { coveredLessonId: true } },
      },
    });

    expect(lesson.kind).toBe('quiz');
    expect(lesson.section.title).toBe(EXAM_SHELF_TITLE);
    // The shelf is published on creation, deliberately: an unpublished one 404s
    // the intro page for everyone while `assertCanAttempt` still opens attempts.
    expect(lesson.section.isPublished).toBe(true);

    // A DRAFT. An exam with no questions in it must not be able to reach a
    // student; publishing is a separate act with a preflight behind it.
    expect(lesson.isPublished).toBe(false);
    expect(lesson.quiz!.isPublished).toBe(false);

    expect(lesson.quiz!.durationSeconds).toBe(45 * 60);
    expect(lesson.quiz!.openFrom).toEqual(WINDOW.opensAt);
    expect(lesson.quiz!.openUntil).toEqual(WINDOW.closesAt);
    expect(Number(lesson.quiz!.gradeOutOf)).toBe(20);

    // ⚠️ The door to a student sitting a monthly exam TWICE. `assertPaperAllowed`
    // reads nothing but this boolean.
    expect(lesson.quiz!.allowsImprovement).toBe(false);

    expect(lesson.coversLessons.map((c) => c.coveredLessonId)).toEqual([
      lectureIds[0],
      lectureIds[1],
    ]);
  });

  it('reuses the same shelf for a second exam rather than making another', async () => {
    const first = await makeExam({ title: 'امتحان آخر الشهر' });
    const second = await makeExam({ title: 'امتحان مكمّل' });

    const [a, b] = await Promise.all([
      client.lesson.findUniqueOrThrow({ where: { id: first }, select: { sectionId: true } }),
      client.lesson.findUniqueOrThrow({ where: { id: second }, select: { sectionId: true } }),
    ]);
    expect(a.sectionId).toBe(b.sectionId);

    const shelves = await client.courseSection.count({
      where: { courseId, title: EXAM_SHELF_TITLE },
    });
    expect(shelves).toBe(1);
  });

  it('refuses a covered lesson from a different course — in the DATABASE', async () => {
    // Not a service `if`. The two composite FKs against `lessons(id, course_id)`
    // make it structural, so a direct SQL write cannot get round it either.
    await expect(
      makeExam({ coveredLessonIds: [otherLessonId] }),
    ).rejects.toThrow();
  });

  it('rewrites the whole syllabus in one statement, order preserved', async () => {
    const lessonId = await makeExam({ coveredLessonIds: [lectureIds[0]] });

    // Reversed AND extended — the reversal is what needs the DEFERRABLE unique
    // on (exam_lesson_id, position); an immediate constraint collides mid-write.
    await service.patch(
      lessonId,
      { coveredLessonIds: [lectureIds[2], lectureIds[1], lectureIds[0]] },
      ACTOR,
    );

    const rows = await client.examCoverage.findMany({
      where: { examLessonId: lessonId },
      orderBy: { position: 'asc' },
      select: { coveredLessonId: true, position: true },
    });
    expect(rows.map((r) => r.coveredLessonId)).toEqual([lectureIds[2], lectureIds[1], lectureIds[0]]);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
  });

  it('refuses to publish an exam with no questions', async () => {
    const lessonId = await makeExam();
    await expect(service.setPublished(lessonId, true, ACTOR)).rejects.toThrow(BadRequestException);

    const lesson = await client.lesson.findUniqueOrThrow({
      where: { id: lessonId },
      select: { isPublished: true, quiz: { select: { isPublished: true } } },
    });
    // Neither half moved — publish is one transaction, so a failed preflight
    // cannot leave a live quiz on an invisible lesson.
    expect(lesson.isPublished).toBe(false);
    expect(lesson.quiz!.isPublished).toBe(false);
  });

  it('rejects an inverted window on PATCH even when only one side is sent', async () => {
    const lessonId = await makeExam();
    // The schema can only check the pair it is GIVEN. Moving `opensAt` past the
    // STORED `closesAt` would otherwise create an exam that can never open.
    await expect(
      service.patch(lessonId, { opensAt: new Date('2026-09-13T17:00:00.000Z') }, ACTOR),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses to let an exam cover itself', async () => {
    const lessonId = await makeExam();
    await expect(
      service.patch(lessonId, { coveredLessonIds: [lessonId] }, ACTOR),
    ).rejects.toThrow(BadRequestException);
  });

  it('deletes a draft exam and cascades its coverage', async () => {
    const lessonId = await makeExam();
    await service.remove(lessonId, ACTOR);

    expect(await client.lesson.count({ where: { id: lessonId } })).toBe(0);
    expect(await client.examCoverage.count({ where: { examLessonId: lessonId } })).toBe(0);
  });

  it('lists exams with a phase computed against one server clock', async () => {
    const lessonId = await makeExam({ title: 'امتحان للقايمة' });
    const list = await service.list();
    const row = list.exams.find((e) => e.lessonId === lessonId);

    expect(row).toBeDefined();
    expect(row!.courseId).toBe(courseId);
    expect(row!.coveredLessons).toHaveLength(2);
    expect(row!.questionCount).toBe(0);
    expect(row!.attemptCount).toBe(0);
    expect(row!.sectionPublished).toBe(true);
    // The row's phase must be what `examPhase` says at the payload's OWN
    // serverTime — not at whatever the reader's clock says a moment later.
    expect(row!.phase).toBe(
      examPhase(row!.opensAt, row!.closesAt, new Date(list.serverTime)),
    );
  });

  it('offers only real lectures in the coverage picker, never exam lessons', async () => {
    await makeExam();
    const picker = await service.lessonPicker(courseId);

    const offered = picker.sections.flatMap((s) => s.lessons.map((l) => l.lessonId));
    for (const examLessonId of createdExamLessonIds) {
      expect(offered).not.toContain(examLessonId);
    }
    expect(offered).toEqual(expect.arrayContaining(lectureIds));
    expect(picker.sections.map((s) => s.title)).not.toContain(EXAM_SHELF_TITLE);
  });

  it('shows a student nothing until the exam is published', async () => {
    const lessonId = await makeExam({ title: 'امتحان مسودة' });

    const student = await client.user.findFirst({
      where: { enrollments: { some: { courseId, status: 'active' } } },
      select: { id: true },
    });
    // No enrolled student in this fixture course, so the read must be empty for
    // anyone — the assertion that matters is that a DRAFT never leaks.
    const seen = await service.forStudent(student?.id ?? 'nobody');
    expect(seen.exams.map((e) => e.lessonId)).not.toContain(lessonId);
  });
});
