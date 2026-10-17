// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { AdminAttemptListQuerySchema } from '@ayman/contracts/admin/attempts';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AttemptAdminService } from './attempt-admin.service';
import { seedAttemptsBoard, type AttemptsBoardFixture } from './testing/attempts-board-fixture';

/**
 * `GET /api/admin/attempts` as the quiz view and the student search read it.
 *
 * The query goes through the CONTRACT's parser first, exactly as the
 * controller's DTO does, so the defaults under test are the real ones.
 *
 * The other four collaborators are never touched by a read — they are the
 * write half (reopen, extra time) — so they are `as never` rather than four
 * more real services to construct. A rename there is caught by
 * `attempt-admin.service.spec.ts`, which builds them all.
 */
describe('AttemptAdminService.searchAttempts', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const admin = new AttemptAdminService(prisma, {} as never, {} as never, {} as never, {} as never);
  let f: AttemptsBoardFixture;

  const search = (query: Record<string, unknown>) => admin.searchAttempts(AdminAttemptListQuerySchema.parse(query));

  beforeAll(async () => {
    await prisma.$connect();
    f = await seedAttemptsBoard(prisma);
  }, 30_000);

  afterAll(async () => {
    await f?.cleanup();
    await prisma.$disconnect();
  }, 30_000);

  it('pages one quiz with its total and the counts the tabs print', async () => {
    const page = await search({ quizId: f.quizzes.quiz1, perPage: '10' });
    expect(page.rowCount).toBe(3);
    expect(page.rows).toHaveLength(3);
    expect(page.stateCounts).toEqual({ in_progress: 1, overdue: 0, submitted: 2, pending_review: 0, abandoned: 0 });

    // A tab narrows the rows and the total — never the counts on the tabs.
    const submitted = await search({ quizId: f.quizzes.quiz1, state: 'submitted', perPage: '10' });
    expect(submitted.rowCount).toBe(2);
    expect(submitted.rows.every((row) => row.state === 'submitted')).toBe(true);
    expect(submitted.stateCounts).toEqual(page.stateCounts);
  });

  it('sorts by score with the unmarked papers last, and pages with a stable tiebreak', async () => {
    const byScore = await search({ quizId: f.quizzes.quiz1, sort: 'score_desc', perPage: '10' });
    expect(byScore.rows.map((row) => row.score)).toEqual([18, 8, null]);

    const first = await search({ quizId: f.quizzes.quiz1, perPage: '10', sort: 'oldest' });
    expect(first.rows.map((row) => row.userId)).toEqual([f.students.ahmed, f.students.mona, f.students.third]);
  });

  it('carries which exam, in which course, and only a FINAL percentage', async () => {
    const { rows } = await search({ lessonId: f.lessons.examLesson, sort: 'oldest', perPage: '10' });
    expect(rows.map((row) => [row.kind, row.paper, row.percent, row.passed])).toEqual([
      ['course_exam', 'original', 60, false],
      // Mona's paper waits on an essay: its 40 and its «failed» are provisional.
      ['course_exam', 'original', null, null],
      ['course_exam', 'improvement', 80, true],
    ]);
    expect(rows[0]).toMatchObject({
      courseId: f.courseId,
      courseTitle: f.courseTitle,
      sectionTitle: 'الامتحان النهائي',
      lessonTitle: 'الامتحان الشامل',
      quizTitle: 'الامتحان الشامل',
      gradeOutOf: 100,
      score: 60,
    });
  });

  it('finds a student by the name typed without its hamza, or by a run of the phone', async () => {
    const byName = await search({ courseId: f.courseId, q: 'احمد', perPage: '10' });
    expect(byName.rowCount).toBe(3);
    expect(byName.rows.every((row) => row.userId === f.students.ahmed)).toBe(true);

    // `+2010…` stored, `010…` typed — and only a run of it.
    const typed = `0${f.ahmedPhone.slice(3, 11)}`;
    const byPhone = await search({ courseId: f.courseId, q: typed, perPage: '10' });
    expect(byPhone.rows.map((row) => row.userId)).toEqual([f.students.ahmed, f.students.ahmed, f.students.ahmed]);

    const literal = await search({ courseId: f.courseId, q: 'منى', perPage: '10' });
    expect(literal.rows.map((row) => row.kind).sort()).toEqual(['course_exam', 'lecture_quiz', 'monthly_exam']);
  });

  it('scopes a search to one course', async () => {
    const all = await search({ q: f.thirdName, perPage: '10' });
    expect(new Set(all.rows.map((row) => row.courseId))).toEqual(
      new Set([f.courseId, f.earlierCourseId, f.archivedCourseId]),
    );
    const one = await search({ q: f.thirdName, courseId: f.earlierCourseId, perPage: '10' });
    expect(one.rowCount).toBe(1);
    expect(one.rows[0]!.courseId).toBe(f.earlierCourseId);
  });

  it('keeps the bare-array per-quiz route answering the same rows', async () => {
    const rows = await admin.listAttempts({ quizId: f.quizzes.quiz1 });
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.quizId === f.quizzes.quiz1)).toBe(true);
    expect(rows[0]).not.toHaveProperty('attemptToken');
  });
});
