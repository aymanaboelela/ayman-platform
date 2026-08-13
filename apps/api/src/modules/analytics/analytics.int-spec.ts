import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import {
  AnalyticsOverviewSchema,
  LessonAnalyticsDetailSchema,
  LessonAnalyticsRowSchema,
  StudentAnalyticsDetailSchema,
  StudentAnalyticsRowSchema,
} from '@ayman/contracts/admin/analytics';
import { PrismaService } from '../../prisma/prisma.service';
import { LessonAnalyticsService } from './lesson-analytics.service';
import { OverviewService } from './overview.service';
import { StudentAnalyticsService } from './student-analytics.service';

/**
 * The contract test for a module that is almost entirely hand-written SQL.
 *
 * `authorization-matrix.int-spec.ts` already proves every statement PARSES and
 * returns 200. This file proves something the matrix cannot: that what comes
 * back actually satisfies the Zod schema the web app parses it with. A column
 * that returns `numeric` where the schema says `number`, a `bigint` from a
 * `count(*)` missing its `::int`, a rate that rounds to 1.0000000000000002 —
 * every one of those is a 200 here and a 500 on the admin screen, because the
 * parse happens at the web edge.
 *
 * Seeded with a real cohort rather than run against whatever the dev database
 * happens to hold: the interesting rows are the empty ones (a student who
 * never opened the lesson, an attempt with no score) and an incidental
 * database has none of them.
 */
describe('analytics (integration)', () => {
  let prisma: PrismaService;
  let overview: OverviewService;
  let lessons: LessonAnalyticsService;
  let students: StudentAnalyticsService;

  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  let courseId: string;
  let lessonId: string;
  let quizId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    overview = new OverviewService(prisma);
    lessons = new LessonAnalyticsService(prisma);
    students = new StudentAnalyticsService(prisma);

    const governorate = await prisma.governorate.findFirstOrThrow();
    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    const author = await prisma.user.create({
      data: { id: `an-author-${suffix}`, name: 'Analytics Author', email: `author-${suffix}@t.test`, role: 'admin' },
    });

    const course = await prisma.course.create({
      data: {
        title: `Analytics Course ${suffix}`,
        slug: `analytics-course-${suffix}`,
        status: 'published',
        publishedAt: new Date(),
        systemId: system.id,
        year: 2,
        subjectId: subject.id,
        instructorId: author.id,
      },
    });
    courseId = course.id;

    const section = await prisma.courseSection.create({
      data: { courseId, title: 'الوحدة', position: 1, isPublished: true },
    });
    const lesson = await prisma.lesson.create({
      data: { courseId, sectionId: section.id, title: 'الدرس', kind: 'video', position: 1, isPublished: true },
    });
    lessonId = lesson.id;
    await prisma.lessonVideo.create({
      data: { lessonId, provider: 'youtube', externalId: 'abcdefghijk', durationSeconds: 600 },
    });

    const quiz = await prisma.quiz.create({
      data: { lessonId, gradeOutOf: 20, passPercent: 50, reviewOptions: {}, isPublished: true },
    });
    quizId = quiz.id;

    // Four students spanning every shape the screens have to render:
    // watched+passed, watched+failed, watched only, and enrolled-but-absent.
    const shapes = [
      { watched: 540, completion: 0.9, state: 'completed' as const, score: 18, passed: true, minutes: 12 },
      { watched: 300, completion: 0.5, state: 'in_progress' as const, score: 6, passed: false, minutes: 3 },
      { watched: 120, completion: 0.2, state: 'in_progress' as const, score: null, passed: null, minutes: null },
      { watched: 0, completion: 0, state: null, score: null, passed: null, minutes: null },
    ];

    for (const [index, shape] of shapes.entries()) {
      const id = `an-student-${suffix}-${index}`;
      userIds.push(id);
      await prisma.user.create({
        data: { id, name: `Student ${index}`, email: `${id}@t.test`, role: 'student' },
      });
      await prisma.studentProfile.create({
        data: {
          userId: id,
          fullName: `طالب ${index}`,
          gender: 'male',
          phone: `0100000${String(index)}${suffix.slice(0, 3)}`,
          governorateCode: governorate.code,
          year: 2,
          onboardingCompletedAt: new Date(),
        },
      });
      const enrollment = await prisma.enrollment.create({ data: { userId: id, courseId } });

      if (shape.state !== null) {
        await prisma.lessonProgress.create({
          data: {
            enrollmentId: enrollment.id,
            lessonId,
            completion: shape.completion,
            state: shape.state,
            watchedSeconds: shape.watched,
            maxPositionSeconds: shape.watched,
            openCount: 1,
            firstOpenedAt: new Date(),
            lastHeartbeatAt: new Date(),
          },
        });
        await prisma.lessonViewSession.create({
          data: {
            enrollmentId: enrollment.id,
            lessonId,
            startedAt: new Date(),
            lastSeenAt: new Date(),
            watchedSeconds: shape.watched,
          },
        });
      }

      if (shape.minutes !== null) {
        const startedAt = new Date(Date.now() - shape.minutes * 60_000);
        await prisma.quizAttempt.create({
          data: {
            quizId,
            userId: id,
            attemptNo: 1,
            state: 'submitted',
            startedAt,
            submittedAt: new Date(),
            rawScore: shape.score,
            scaledScore: shape.score,
            passed: shape.passed,
            sumMarks: 20,
            gradeOutOf: 20,
            passPercent: 50,
          },
        });
      }
    }
  });

  afterAll(async () => {
    // Course before author: `courses.instructor_id` is a RESTRICT FK, so
    // deleting the users first fails and leaves the whole fixture behind.
    // Everything else (sections, lessons, progress, attempts) cascades.
    await prisma.course.deleteMany({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: { in: [...userIds, `an-author-${suffix}`] } } });
    await prisma.$disconnect();
  });

  it('returns an overview that satisfies the wire contract', async () => {
    const result = await overview.build({ days: 30, courseId });
    expect(() => AnalyticsOverviewSchema.parse(result)).not.toThrow();
  });

  it('counts the four eligible students and the three who watched', async () => {
    const result = await overview.build({ days: 30, courseId });
    expect(result.video.eligible).toBe(4);
    expect(result.video.watchers).toBe(3);
    expect(result.video.watchRate).toBeCloseTo(0.75, 5);
    // The one enrolled student who never opened anything is the whole reason
    // the denominator is `eligible` and not "students with progress rows".
    expect(result.engagement.find((slice) => slice.segment === 'neither')?.n).toBe(1);
  });

  it('scales scores against grade_out_of rather than reporting raw marks', async () => {
    const result = await overview.build({ days: 30, courseId });
    // 18/20 and 6/20 → mean 0.6, median 0.6.
    expect(result.quiz.meanScore).toBeCloseTo(0.6, 5);
    expect(result.quiz.attempts).toBe(2);
    expect(result.quiz.passRate).toBeCloseTo(0.5, 5);
  });

  it('bands the two graded attempts as one A and one F', async () => {
    const result = await overview.build({ days: 30, courseId });
    const bands = Object.fromEntries(result.gradeBands.map((row) => [row.band, row.n]));
    expect(bands).toMatchObject({ a: 1, b: 0, c: 0, d: 0, f: 1 });
  });

  it('emits one daily point per day with no holes', async () => {
    const result = await overview.build({ days: 30, courseId });
    expect(result.daily).toHaveLength(31);
    expect(result.daily.at(-1)?.watchMinutes).toBeGreaterThan(0);
  });

  it('returns a lesson row that satisfies the wire contract', async () => {
    const [row] = await lessons.list(courseId);
    expect(row).toBeDefined();
    expect(() => LessonAnalyticsRowSchema.parse(row)).not.toThrow();
    expect(row?.eligible).toBe(4);
    expect(row?.opened).toBe(3);
    expect(row?.quizAttempts).toBe(2);
    expect(row?.hasVideo).toBe(true);
  });

  it('lists EVERY eligible student on the lesson roster, absentees included', async () => {
    const detail = await lessons.detail(lessonId);
    expect(() => LessonAnalyticsDetailSchema.parse(detail)).not.toThrow();
    expect(detail.students).toHaveLength(4);
    const absent = detail.students.find((student) => student.watchedSeconds === 0);
    expect(absent).toBeDefined();
    // `null`, not 0 — never sat it is a different fact from scored zero.
    expect(absent?.bestScore).toBeNull();
    expect(absent?.attempts).toBe(0);
  });

  it('returns a student roster row and a detail that satisfy the wire contract', async () => {
    const { rows, rowCount } = await students.list({
      page: 1,
      perPage: 25,
      q: `طالب`,
      sort: 'meanScore',
      dir: 'desc',
      year: [],
      courseId,
    });
    expect(rowCount).toBeGreaterThanOrEqual(4);
    for (const row of rows) expect(() => StudentAnalyticsRowSchema.parse(row)).not.toThrow();

    const detail = await students.detail(userIds[0]!);
    expect(() => StudentAnalyticsDetailSchema.parse(detail)).not.toThrow();
    expect(detail.summary.meanScore).toBeCloseTo(0.9, 5);
    expect(detail.attempts).toHaveLength(1);
    expect(detail.attempts[0]?.seconds).toBeGreaterThan(0);
  });

  it('sorts by a mapped column and puts NULL scores last in both directions', async () => {
    const descending = await students.list({
      page: 1, perPage: 25, q: `طالب`, sort: 'meanScore', dir: 'desc', year: [], courseId,
    });
    const ascending = await students.list({
      page: 1, perPage: 25, q: `طالب`, sort: 'meanScore', dir: 'asc', year: [], courseId,
    });
    expect(descending.rows[0]?.meanScore).toBeCloseTo(0.9, 5);
    expect(ascending.rows[0]?.meanScore).toBeCloseTo(0.3, 5);
    expect(descending.rows.at(-1)?.meanScore).toBeNull();
    expect(ascending.rows.at(-1)?.meanScore).toBeNull();
  });
});
