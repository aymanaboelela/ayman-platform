// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';
import { DEFAULT_REVIEW_OPTIONS } from '@ayman/contracts/quiz/quiz-settings';
import { RankNextStepsSchema } from '@ayman/contracts/rank-next';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { isFeatureEnabled } from '../../common/entitlements';
import { EntitlementService } from '../entitlement/entitlement.service';
import { LessonAccessService } from './lesson-access.service';
import { LessonGateService } from './lesson-gate.service';
import { RankNextService } from './rank-next.service';

// الفيتشرز شغّالة كلها (ستاك أيمن)، إلا في التست اللي بيقفلها.
jest.mock('../../common/entitlements', () => ({ isFeatureEnabled: jest.fn(() => true) }));
const featureEnabled = isFeatureEnabled as jest.MockedFunction<typeof isFeatureEnabled>;

/**
 * «الطريق لفوق» على داتابيز حقيقية — لأن السؤال كله «الصف ده الطالب يقدر
 * يفتحه؟»، وده مايتجاوبش بموك: الإجابة هي `LessonAccessService.require` على
 * صفوف `access_grants` و`lesson_months` حقيقية.
 *
 * طالبة واحدة في كورسين:
 *
 *   · «أ» مجاني ومن غير شهور — كل حاجة فيه مفتوحة، فبيختبر مين ناقص ومين لأ.
 *   · «ب» مقفول وبيتباع بالشهر، ومعاها «شهر ١» بس — محاضرة «شهر ٢» مقفولة
 *     عليها، فبيختبر إن المقفول مايطلعش كصف.
 */
describe('RankNextService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const access = new LessonAccessService(
    prisma,
    new LessonGateService(prisma, new EntitlementService(prisma)),
    new EntitlementService(prisma),
  );
  const service = new RankNextService(prisma, access);

  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const DAY = 24 * 60 * 60 * 1000;
  let instructorId = '';
  let studentId = '';
  const ids: Record<string, string> = {};
  const slugs = { open: `rn-open-${stamp}`, months: `rn-months-${stamp}`, other: `rn-other-${stamp}` };

  beforeAll(async () => {
    await prisma.$connect();
    const systemId = (await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } })).id;
    const subjectId = (await prisma.subject.findFirstOrThrow()).id;

    instructorId = (await prisma.user.create({ data: { id: `rn-instr-${stamp}`, name: 'مدرس', email: `rn-instr-${stamp}@t.test` } })).id;
    studentId = (await prisma.user.create({ data: { id: `rn-stu-${stamp}`, name: 'طالبة', email: `rn-stu-${stamp}@t.test` } })).id;

    const course = (slug: string, requiresGrant: boolean) =>
      prisma.course.create({
        data: { slug, title: slug, status: 'published', publishedAt: new Date(), systemId, subjectId, year: 2, instructorId, requiresGrant },
      });
    const open = await course(slugs.open, false);
    const months = await course(slugs.months, true);
    const other = await course(slugs.other, false);

    const unit = (courseId: string, title = 'الوحدة', position = 0, isPublished = true) =>
      prisma.courseSection.create({ data: { courseId, title, position, isPublished } });
    const lesson = (
      courseId: string,
      sectionId: string,
      title: string,
      position: number,
      kind: 'text' | 'quiz' = 'text',
      isPublished = true,
    ) =>
      prisma.lesson
        .create({ data: { courseId, sectionId, title, kind, position, isPublished } })
        .then((row) => (ids[title] = row.id));
    const homework = (lessonId: string, isPublished = true) =>
      prisma.lessonHomework.create({ data: { lessonId, body: '١- سؤال', isPublished } });
    const quiz = (lessonId: string, opts: { isPublished?: boolean; openFrom?: Date; openUntil?: Date } = {}) =>
      prisma.quiz
        .create({
          data: {
            lessonId,
            reviewOptions: DEFAULT_REVIEW_OPTIONS,
            gradeOutOf: 100,
            isPublished: opts.isPublished ?? true,
            openFrom: opts.openFrom ?? null,
            openUntil: opts.openUntil ?? null,
          },
        })
        .then((row) => row.id);
    const sat = (quizId: string, scaled: number, submittedAt = new Date()) =>
      prisma.quizAttempt.create({
        data: {
          quizId,
          userId: studentId,
          attemptNo: 1,
          state: 'submitted',
          submittedAt,
          scaledScore: scaled,
          rawScore: scaled,
          sumMarks: 100,
          gradeOutOf: 100,
          passPercent: 50,
          passed: scaled >= 50,
        },
      });

    // ── «أ»: مفتوح كله ───────────────────────────────────────────────────
    const a = await unit(open.id);
    await homework(await lesson(open.id, a.id, 'hw-pending', 0));
    const handedIn = await lesson(open.id, a.id, 'hw-submitted', 1);
    await homework(handedIn);
    await prisma.homeworkSubmission.create({
      data: { lessonId: handedIn, userId: studentId, courseId: open.id, status: 'submitted', imageCount: 1 },
    });
    const accepted = await lesson(open.id, a.id, 'hw-accepted', 2);
    await homework(accepted);
    await prisma.homeworkSubmission.create({
      data: { lessonId: accepted, userId: studentId, courseId: open.id, status: 'accepted', imageCount: 1 },
    });
    const returned = await lesson(open.id, a.id, 'hw-needs-work', 3);
    await homework(returned);
    await prisma.homeworkSubmission.create({
      data: { lessonId: returned, userId: studentId, courseId: open.id, status: 'needs_work', imageCount: 1 },
    });
    await homework(await lesson(open.id, a.id, 'hw-draft', 4), false);
    await homework(await lesson(open.id, a.id, 'hw-unpublished-lesson', 5, 'text', false));

    await sat(await quiz(await lesson(open.id, a.id, 'quiz-70', 6, 'quiz')), 70);
    await sat(await quiz(await lesson(open.id, a.id, 'quiz-100', 7, 'quiz')), 100);
    await quiz(await lesson(open.id, a.id, 'quiz-new', 8, 'quiz'));
    await quiz(await lesson(open.id, a.id, 'quiz-draft', 9, 'quiz'), { isPublished: false });

    const hiddenUnit = await unit(open.id, 'وحدة مش منشورة', 2, false);
    await homework(await lesson(open.id, hiddenUnit.id, 'hw-hidden-unit', 0));

    const shelf = await unit(open.id, EXAM_SHELF_TITLE, 1);
    await quiz(await lesson(open.id, shelf.id, 'exam-open', 0, 'quiz'), {
      openFrom: new Date(Date.now() - DAY),
      openUntil: new Date(Date.now() + DAY),
    });
    const closedExam = await quiz(await lesson(open.id, shelf.id, 'exam-closed', 1, 'quiz'), {
      openFrom: new Date(Date.now() - 10 * DAY),
      openUntil: new Date(Date.now() - 9 * DAY),
    });
    await sat(closedExam, 85, new Date(Date.now() - 9.5 * DAY));

    // ── «ب»: بالشهور، ومعاها شهر ١ بس ─────────────────────────────────────
    const month1 = await prisma.courseMonth.create({ data: { courseId: months.id, monthIndex: 1, title: 'شهر ١' } });
    const month2 = await prisma.courseMonth.create({ data: { courseId: months.id, monthIndex: 2, title: 'شهر ٢' } });
    const b = await unit(months.id);
    const tag = (lessonId: string, monthId: string) =>
      prisma.lessonMonth.create({ data: { lessonId, monthId, courseId: months.id, isPrimary: true } });
    const m1 = await lesson(months.id, b.id, 'hw-month-1', 0);
    await homework(m1);
    await tag(m1, month1.id);
    const m2 = await lesson(months.id, b.id, 'hw-month-2', 1);
    await homework(m2);
    await tag(m2, month2.id);
    const q2 = await lesson(months.id, b.id, 'quiz-month-2', 2, 'quiz');
    await quiz(q2);
    await tag(q2, month2.id);
    await prisma.accessGrant.create({
      data: { userId: studentId, scope: 'course_month', courseId: months.id, monthId: month1.id, source: 'purchase' },
    });

    // ── كورس هي مش مشتركة فيه ─────────────────────────────────────────────
    const c = await unit(other.id);
    await homework(await lesson(other.id, c.id, 'hw-not-enrolled', 0));
    await quiz(await lesson(other.id, c.id, 'quiz-not-enrolled', 1, 'quiz'));

    // الترتيب بالاشتراك: «أ» الأول.
    await prisma.enrollment.create({ data: { userId: studentId, courseId: open.id, enrolledAt: new Date(Date.now() - 2 * DAY) } });
    await prisma.enrollment.create({ data: { userId: studentId, courseId: months.id, enrolledAt: new Date(Date.now() - DAY) } });
  });

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { instructorId } });
    await prisma.user.deleteMany({ where: { id: { in: [studentId, instructorId] } } });
    await prisma.$disconnect();
  });

  const titleOf = (id: string) => Object.entries(ids).find(([, value]) => value === id)?.[0];

  it('matches the wire contract', async () => {
    const steps = await service.forUser(studentId);
    expect(() => RankNextStepsSchema.parse(steps)).not.toThrow();
  });

  it('lists a pending homework, and never a handed-in one', async () => {
    const { homework } = await service.forUser(studentId);
    const listed = homework!.items.map((row) => titleOf(row.lessonId));

    // Sent back to redo comes first; then reading order, course «أ» before «ب».
    expect(listed).toEqual(['hw-needs-work', 'hw-pending', 'hw-month-1']);
    expect(homework!.items[0]).toMatchObject({ status: 'needs_work', courseSlug: slugs.open });
    expect(homework!.items[1]).toMatchObject({ status: 'new' });
    expect(homework!.total).toBe(3);
    // Handed in, accepted, an unpublished homework, a hidden lecture or unit,
    // and a course she is not in — none of them.
    for (const gone of ['hw-submitted', 'hw-accepted', 'hw-draft', 'hw-unpublished-lesson', 'hw-hidden-unit', 'hw-not-enrolled']) {
      expect(listed).not.toContain(gone);
    }
  });

  it('lists a quiz below 100%, and never a full-marks one', async () => {
    const { quizzes } = await service.forUser(studentId);
    const listed = quizzes.items.map((row) => titleOf(row.lessonId));

    // What can be done now first: the never-sat quiz, then the spent 70%.
    expect(listed).toEqual(['quiz-new', 'quiz-70']);
    expect(quizzes.items[0]).toMatchObject({ state: 'new', bestPercent: null });
    expect(quizzes.items[1]).toMatchObject({ state: 'spent', bestPercent: 70 });
    expect(quizzes.total).toBe(2);
    expect(quizzes.actionable).toBe(1);
    // The monthly exams are theirs, not a quiz's.
    for (const gone of ['quiz-100', 'quiz-draft', 'quiz-not-enrolled', 'exam-open', 'exam-closed']) {
      expect(listed).not.toContain(gone);
    }
  });

  it('never lists a lesson she cannot open — it is counted behind the door instead', async () => {
    const { homework, quizzes } = await service.forUser(studentId);
    expect(homework!.items.map((row) => titleOf(row.lessonId))).not.toContain('hw-month-2');
    expect(quizzes.items.map((row) => titleOf(row.lessonId))).not.toContain('quiz-month-2');
    expect(homework!.locked).toEqual({ count: 1, courseSlug: slugs.months });
    expect(quizzes.locked).toEqual({ count: 1, courseSlug: slugs.months });
  });

  it('agrees with require() on every lesson it was asked about', async () => {
    const verdicts = await access.openable(studentId, Object.values(ids));
    for (const [title, id] of Object.entries(ids)) {
      const single = await access.require(studentId, id).then(
        () => 'open',
        (error: Error) => (error.constructor.name === 'ForbiddenException' ? 'locked' : 'hidden'),
      );
      expect({ title, verdict: verdicts.get(id) }).toEqual({ title, verdict: single });
    }
  });

  it('shows the open monthly exam as next and the last sitting as the result', async () => {
    const { exams } = await service.forUser(studentId);
    expect(exams!.next).toMatchObject({ lessonId: ids['exam-open'], phase: 'open', state: 'new', bestPercent: null });
    expect(exams!.last).toMatchObject({ lessonId: ids['exam-closed'], phase: 'closed', bestPercent: 85 });
  });

  it('drops a homework the moment it is handed in — no cache', async () => {
    await prisma.homeworkSubmission.create({
      data: { lessonId: ids['hw-pending']!, userId: studentId, courseId: (await prisma.lesson.findUniqueOrThrow({ where: { id: ids['hw-pending']! } })).courseId, status: 'submitted', imageCount: 1 },
    });
    const { homework } = await service.forUser(studentId);
    expect(homework!.items.map((row) => titleOf(row.lessonId))).toEqual(['hw-needs-work', 'hw-month-1']);
  });

  it('a stack with homework or monthly exams switched off gets null, not a list', async () => {
    featureEnabled.mockImplementation((key) => key !== 'homework' && key !== 'exams');
    try {
      const steps = await service.forUser(studentId);
      expect(steps.homework).toBeNull();
      expect(steps.exams).toBeNull();
      // Quizzes are the platform itself, not a feature a stack switches on.
      expect(steps.quizzes.total).toBe(2);
    } finally {
      featureEnabled.mockImplementation(() => true);
    }
  });

  it('a student with no courses gets empty lists', async () => {
    const steps = await service.forUser(instructorId);
    expect(steps).toEqual({
      homework: { items: [], total: 0, locked: null },
      quizzes: { items: [], total: 0, actionable: 0, locked: null },
      exams: { next: null, last: null },
    });
  });
});
