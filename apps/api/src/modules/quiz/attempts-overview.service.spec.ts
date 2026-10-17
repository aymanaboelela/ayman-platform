// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AttemptsOverviewService } from './attempts-overview.service';
import { seedAttemptsBoard, type AttemptsBoardFixture } from './testing/attempts-board-fixture';

/**
 * «الدنيا ملخبطة… عايز أعرف ده امتحان إيه وفي أنهي كورس» — the overview,
 * against a real database.
 *
 * The local database is shared and full of other suites' courses, so every
 * assertion narrows to this fixture's own ids before it compares anything.
 */
describe('AttemptsOverviewService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new AttemptsOverviewService(prisma);
  let f: AttemptsBoardFixture;

  // Thirty-odd sequential inserts: well inside Jest's 5 s on a quiet database,
  // not on the shared, bloated local one.
  beforeAll(async () => {
    await prisma.$connect();
    f = await seedAttemptsBoard(prisma);
  }, 30_000);

  afterAll(async () => {
    await f?.cleanup();
    await prisma.$disconnect();
  }, 30_000);

  it('lists the courses with sittings in course order, archived last', async () => {
    const { courses } = await service.overview({});
    const mine = courses.filter((course) =>
      [f.courseId, f.earlierCourseId, f.archivedCourseId].includes(course.courseId),
    );
    expect(mine.map((course) => course.courseId)).toEqual([f.earlierCourseId, f.courseId, f.archivedCourseId]);
    expect(mine.find((course) => course.courseId === f.courseId)?.attempts).toBe(7);
  });

  it('lays one course out unit by unit, in its own order, skipping only the draft nobody sat', async () => {
    const { quizzes } = await service.overview({ courseId: f.courseId });
    expect(quizzes.map((quiz) => quiz.quizId)).toEqual([f.quizzes.quiz1, f.quizzes.quiz2, f.quizzes.exam, f.quizzes.month]);
    expect(quizzes.map((quiz) => [quiz.sectionTitle, quiz.kind, quiz.lectureNumber])).toEqual([
      ['الوحدة الأولى', 'lecture_quiz', 1],
      // Nobody has sat it — and it is still listed, with its lecture's number.
      ['الوحدة الأولى', 'lecture_quiz', 2],
      ['الامتحان النهائي', 'course_exam', null],
      ['امتحانات الشهر', 'monthly_exam', null],
    ]);
  });

  it('counts a lecture quiz the way the card prints it', async () => {
    const { quizzes } = await service.overview({ courseId: f.courseId });
    const quiz1 = quizzes.find((quiz) => quiz.quizId === f.quizzes.quiz1)!;
    expect(quiz1).toMatchObject({
      lessonTitle: 'كويز الدرس الأول',
      courseTitle: f.courseTitle,
      published: true,
      courseArchived: false,
      gradeOutOf: 20,
      attempts: 3,
      students: 3,
      inProgress: 1,
      submitted: 2,
      pendingReview: 0,
      // 18/20 and 8/20.
      averagePercent: 65,
      passRatePercent: 50,
    });
    expect(quiz1.lastActivityAt).toBe('2026-10-10T18:21:00.000Z');

    const quiz2 = quizzes.find((quiz) => quiz.quizId === f.quizzes.quiz2)!;
    expect(quiz2).toMatchObject({ attempts: 0, students: 0, averagePercent: null, passRatePercent: null, lastActivityAt: null });
  });

  it('keeps a paper waiting on an essay out of the average and the pass rate', async () => {
    const { quizzes } = await service.overview({ courseId: f.courseId });
    const exam = quizzes.find((quiz) => quiz.quizId === f.quizzes.exam)!;
    expect(exam).toMatchObject({
      attempts: 3,
      // The improvement sitting is the same student twice.
      students: 2,
      submitted: 2,
      pendingReview: 1,
      allowsImprovement: true,
      gradeOutOf: 100,
      // 60 and 80 — Mona's provisional 40 counts nowhere.
      averagePercent: 70,
      passRatePercent: 50,
    });
    expect(quizzes.find((quiz) => quiz.quizId === f.quizzes.month)).toMatchObject({ attempts: 1, abandoned: 1 });
  });

  it('searches quiz, unit and course titles, hamza-insensitively', async () => {
    // Typed without the hamza the title is stored with.
    const byLesson = await service.overview({ courseId: f.courseId, q: 'درس الاول' });
    expect(byLesson.quizzes.map((quiz) => quiz.quizId)).toEqual([f.quizzes.quiz1]);

    // A unit title brings its whole unit…
    const byUnit = await service.overview({ courseId: f.courseId, q: 'الوحده الاولي' });
    expect(byUnit.quizzes.map((quiz) => quiz.quizId)).toEqual([f.quizzes.quiz1, f.quizzes.quiz2]);
    const byShelf = await service.overview({ courseId: f.courseId, q: 'الشهر' });
    expect(byShelf.quizzes.map((quiz) => quiz.quizId)).toEqual([f.quizzes.month]);

    // …and a course title its whole course.
    const byCourse = await service.overview({ q: f.courseTitle });
    expect(byCourse.quizzes.map((quiz) => quiz.courseId)).toEqual([f.courseId, f.courseId, f.courseId, f.courseId]);
    // The picker never narrows: it is every course with a sitting.
    expect(byCourse.courses.some((course) => course.courseId === f.earlierCourseId)).toBe(true);
  });

  it('answers ONE quiz for the quiz view — by quiz, by lesson, even a draft — and nothing for a stranger', async () => {
    expect((await service.overview({ quizId: f.quizzes.quiz2 })).quizzes.map((quiz) => quiz.quizId)).toEqual([
      f.quizzes.quiz2,
    ]);
    expect((await service.overview({ lessonId: f.lessons.examLesson })).quizzes.map((quiz) => quiz.kind)).toEqual([
      'course_exam',
    ]);
    const draft = await service.overview({ quizId: f.quizzes.draft });
    expect(draft.quizzes).toHaveLength(1);
    expect(draft.quizzes[0]!.published).toBe(false);

    expect((await service.overview({ quizId: randomUUID() })).quizzes).toEqual([]);
    // Filters AND together: the right quiz under the wrong course is no quiz.
    expect((await service.overview({ quizId: f.quizzes.quiz1, courseId: f.earlierCourseId })).quizzes).toEqual([]);
  });
});
