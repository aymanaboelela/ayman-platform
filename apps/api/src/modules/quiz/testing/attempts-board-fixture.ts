import { randomUUID } from 'node:crypto';
import { DEFAULT_REVIEW_OPTIONS } from '@ayman/contracts/quiz/quiz-settings';
import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';
import type { PrismaService } from '../../../prisma/prisma.service';

/**
 * A course shaped like a real one, for «محاولات الطلاب» by course: two
 * lectures each with its quiz, a draft quiz nobody sat, a course exam with an
 * improvement sitting, and a monthly exam on the shelf — plus two more courses
 * that exist only to be ordered against it.
 *
 * Sittings are written STRAIGHT into `quiz_attempts` rather than through
 * `AttemptService`: every assertion here is about how they are counted and
 * listed, and a real sitting would also write `attempt_events`, whose
 * append-only trigger turns the teardown into the owner-connection dance in
 * `quiz-fixtures.ts`. With no events, deleting the courses cascades cleanly.
 */
export interface AttemptsBoardFixture {
  /** The main course — position 5. */
  courseId: string;
  /** Unique per run, so a title search cannot also find a crashed run's copy. */
  courseTitle: string;
  /** Position 3, so it lists BEFORE the main course. */
  earlierCourseId: string;
  /** Archived, so it lists after both despite position 0. */
  archivedCourseId: string;
  lessons: {
    lecture1: string;
    quiz1Lesson: string;
    quiz2Lesson: string;
    draftLesson: string;
    examLesson: string;
    monthLesson: string;
  };
  quizzes: { quiz1: string; quiz2: string; draft: string; exam: string; month: string };
  students: { ahmed: string; mona: string; third: string };
  /** Ahmed's number, E.164. */
  ahmedPhone: string;
  /** Unique per run — the one name searched with no course to narrow it. */
  thirdName: string;
  cleanup: () => Promise<void>;
}

function phone(): string {
  // Random rather than clock-derived: `users.phone_number` is UNIQUE and a
  // Date.now() suffix recycles every ~28 hours across runs.
  return `+2010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
}

export async function seedAttemptsBoard(prisma: PrismaService): Promise<AttemptsBoardFixture> {
  const stamp = randomUUID().slice(0, 8);
  const adminId = `board-admin-${stamp}`;
  const ahmed = `board-ahmed-${stamp}`;
  const mona = `board-mona-${stamp}`;
  const third = `board-third-${stamp}`;
  const ahmedPhone = phone();
  // Letters only: three digits anywhere in a search switch on its PHONE leg
  // (`phoneSearchDigits`), and that leg would find strangers' numbers.
  const thirdName = `Third ${stamp.replace(/[0-9]/g, (digit) => 'ghijklmnop'[Number(digit)]!)}`;

  await prisma.user.createMany({
    data: [
      { id: adminId, name: 'أدمن اللوحة', email: `${adminId}@example.test`, role: 'admin' },
      // Stored WITH the hamza — the folded search must find it typed without.
      { id: ahmed, name: 'أحمد سمير', email: `${ahmed}@example.test`, phoneNumber: ahmedPhone },
      { id: mona, name: 'منى خالد', email: `${mona}@example.test`, phoneNumber: phone() },
      { id: third, name: thirdName, email: `${third}@example.test` },
    ],
  });

  const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
  const subject = await prisma.subject.findFirstOrThrow();
  const course = (title: string, position: number, status: 'published' | 'archived' = 'published') =>
    prisma.course.create({
      data: {
        slug: `board-${stamp}-${position}`,
        title,
        status,
        publishedAt: new Date(),
        systemId: system.id,
        year: 2,
        subjectId: subject.id,
        instructorId: adminId,
        position,
      },
      select: { id: true },
    });

  const courseTitle = `كورس اللوحة ${stamp}`;
  const main = await course(courseTitle, 5);
  const earlier = await course('كورس قبله', 3);
  const archived = await course('كورس قديم', 0, 'archived');

  const section = (courseId: string, title: string, position: number, isPublished = true) =>
    prisma.courseSection.create({ data: { courseId, title, position, isPublished }, select: { id: true } });
  const lesson = (courseId: string, sectionId: string, title: string, kind: 'video' | 'quiz', position: number) =>
    prisma.lesson.create({
      data: { courseId, sectionId, title, kind, position, isPublished: true },
      select: { id: true },
    });
  const quiz = (lessonId: string, overrides: { gradeOutOf?: number; isPublished?: boolean; allowsImprovement?: boolean } = {}) =>
    prisma.quiz.create({
      data: {
        lessonId,
        reviewOptions: DEFAULT_REVIEW_OPTIONS,
        gradeOutOf: overrides.gradeOutOf ?? 20,
        sumMarks: 10,
        passPercent: 50,
        allowsImprovement: overrides.allowsImprovement ?? false,
        isPublished: overrides.isPublished ?? true,
      },
      select: { id: true },
    });

  // ── the main course ─────────────────────────────────────────────────────
  const unit1 = await section(main.id, 'الوحدة الأولى', 0);
  const lecture1 = await lesson(main.id, unit1.id, 'الدرس الأول', 'video', 0);
  const quiz1Lesson = await lesson(main.id, unit1.id, 'كويز الدرس الأول', 'quiz', 1);
  await lesson(main.id, unit1.id, 'الدرس التاني', 'video', 2);
  const quiz2Lesson = await lesson(main.id, unit1.id, 'كويز الدرس التاني', 'quiz', 3);
  const draftLesson = await lesson(main.id, unit1.id, 'كويز لسه بيتكتب', 'quiz', 4);

  const examUnit = await section(main.id, 'الامتحان النهائي', 1);
  const examLesson = await lesson(main.id, examUnit.id, 'الامتحان الشامل', 'quiz', 0);
  await prisma.course.update({ where: { id: main.id }, data: { examLessonId: examLesson.id } });

  const shelf = await section(main.id, EXAM_SHELF_TITLE, 2);
  const monthLesson = await lesson(main.id, shelf.id, 'امتحان شهر أكتوبر', 'quiz', 0);

  const quiz1 = await quiz(quiz1Lesson.id);
  const quiz2 = await quiz(quiz2Lesson.id);
  const draft = await quiz(draftLesson.id, { isPublished: false });
  const exam = await quiz(examLesson.id, { gradeOutOf: 100, allowsImprovement: true });
  const month = await quiz(monthLesson.id);

  // ── the two courses that exist to be ordered against it ─────────────────
  const earlierUnit = await section(earlier.id, 'الوحدة', 0);
  const earlierQuiz = await quiz((await lesson(earlier.id, earlierUnit.id, 'كويز', 'quiz', 0)).id);
  const archivedUnit = await section(archived.id, 'الوحدة', 0);
  const archivedQuiz = await quiz((await lesson(archived.id, archivedUnit.id, 'كويز', 'quiz', 0)).id);

  const at = (minutes: number) => new Date(Date.UTC(2026, 9, 10, 18, minutes));
  const sitting = (
    quizId: string,
    userId: string,
    data: {
      state: 'in_progress' | 'submitted' | 'pending_review' | 'abandoned';
      score?: number;
      passed?: boolean;
      attemptNo?: number;
      paper?: 'original' | 'improvement';
      gradeOutOf?: number;
      startedMinute: number;
    },
  ) =>
    prisma.quizAttempt.create({
      data: {
        quizId,
        userId,
        attemptNo: data.attemptNo ?? 1,
        paper: data.paper ?? 'original',
        state: data.state,
        startedAt: at(data.startedMinute),
        lastActivityAt: at(data.startedMinute + 5),
        submittedAt: data.state === 'submitted' || data.state === 'pending_review' ? at(data.startedMinute + 20) : null,
        scaledScore: data.score ?? null,
        passed: data.passed ?? null,
        sumMarks: 10,
        gradeOutOf: data.gradeOutOf ?? 20,
        passPercent: 50,
      },
    });

  // Lecture 1's quiz: 18/20 and 8/20 marked, one still open.
  await sitting(quiz1.id, ahmed, { state: 'submitted', score: 18, passed: true, startedMinute: 0 });
  await sitting(quiz1.id, mona, { state: 'submitted', score: 8, passed: false, startedMinute: 1 });
  await sitting(quiz1.id, third, { state: 'in_progress', startedMinute: 2 });
  // The course exam: Ahmed fails the original and passes the improvement;
  // Mona's paper waits on an essay — its provisional 40 must count nowhere.
  await sitting(exam.id, ahmed, { state: 'submitted', score: 60, passed: false, gradeOutOf: 100, startedMinute: 10 });
  await sitting(exam.id, ahmed, {
    state: 'submitted',
    score: 80,
    passed: true,
    gradeOutOf: 100,
    attemptNo: 2,
    paper: 'improvement',
    startedMinute: 40,
  });
  await sitting(exam.id, mona, { state: 'pending_review', score: 40, passed: false, gradeOutOf: 100, startedMinute: 11 });
  // The monthly exam: walked away from.
  await sitting(month.id, mona, { state: 'abandoned', startedMinute: 30 });
  await sitting(earlierQuiz.id, third, { state: 'submitted', score: 10, passed: true, startedMinute: 3 });
  await sitting(archivedQuiz.id, third, { state: 'submitted', score: 10, passed: true, startedMinute: 4 });

  async function cleanup(): Promise<void> {
    // Courses cascade to units, lessons, quizzes and every sitting under them;
    // nothing here wrote an event, a notification or a conversation, so the
    // users go straight after.
    await prisma.course.deleteMany({ where: { id: { in: [main.id, earlier.id, archived.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, ahmed, mona, third] } } });
  }

  return {
    courseId: main.id,
    courseTitle,
    earlierCourseId: earlier.id,
    archivedCourseId: archived.id,
    lessons: {
      lecture1: lecture1.id,
      quiz1Lesson: quiz1Lesson.id,
      quiz2Lesson: quiz2Lesson.id,
      draftLesson: draftLesson.id,
      examLesson: examLesson.id,
      monthLesson: monthLesson.id,
    },
    quizzes: { quiz1: quiz1.id, quiz2: quiz2.id, draft: draft.id, exam: exam.id, month: month.id },
    students: { ahmed, mona, third },
    ahmedPhone,
    thirdName,
    cleanup,
  };
}
