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
 * `/api/me/path` for a lesson carrying an ATTACHED quiz — `LessonPanel`'s
 * admin-side arrangement where `Lesson.quiz` hangs off a video (or any
 * non-`quiz`-kind) lesson rather than a dedicated `kind: 'quiz'` lesson.
 *
 * ## The bug this pins
 *
 * `forUser` built one `PathNode` per `Lesson` row, full stop. A dedicated
 * quiz-kind lesson is its own row, so it always drew its own stop on the map.
 * An attached quiz is not a separate row — it is `Lesson.quiz` on the SAME
 * video lesson — so it produced no stop at all: the map showed the lecture,
 * completed, and nothing else, with no way to tell a student a quiz existed
 * on it or that they had (or had not) sat it.
 *
 * ## Why state comes from `QuizAttempt`, not `lesson_progress`
 *
 * `recordQuizResultTx` writes a quiz result into the SAME `lesson_progress`
 * row the video's watch-progress already owns, and a fail can never regress
 * an already-`completed` lesson. So a lecture watched in full and THEN failed
 * on its attached quiz still reads `completed` — accurate for the video,
 * silent about the quiz. These cases assert the synthetic quiz node reads its
 * own attempts instead, so that distinction survives onto the map.
 */
describe('PathService — a quiz attached to a non-quiz-kind lesson', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new PathService(prisma, new LessonGateService(prisma));

  let userId = '';
  let instructorId = '';
  let courseId = '';
  let videoLessonId = '';
  let draftLessonId = '';
  let quizId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();

    userId = (
      await prisma.user.create({
        data: { id: `paq-${stamp}`, name: 'طالب', email: `paq-${stamp}@t.test` },
      })
    ).id;
    instructorId = (
      await prisma.user.create({
        data: { id: `paqi-${stamp}`, name: 'مُحاضر', email: `paqi-${stamp}@t.test` },
      })
    ).id;

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();

    courseId = (
      await prisma.course.create({
        data: {
          slug: `paq-course-${stamp}`,
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

    videoLessonId = (
      await prisma.lesson.create({
        data: {
          courseId,
          sectionId: section.id,
          title: 'المحاضرة الأولى',
          kind: 'video',
          position: 1,
          isPublished: true,
          quiz: { create: { reviewOptions: {}, isPublished: true } },
        },
        select: { id: true, quiz: { select: { id: true } } },
      })
    ).id;
    quizId = (
      await prisma.lesson.findUniqueOrThrow({
        where: { id: videoLessonId },
        select: { quiz: { select: { id: true } } },
      })
    ).quiz!.id;

    // A second lesson whose attached quiz is still a DRAFT — must draw no
    // stop at all, same as no quiz existing.
    draftLessonId = (
      await prisma.lesson.create({
        data: {
          courseId,
          sectionId: section.id,
          title: 'المحاضرة الثانية',
          kind: 'video',
          position: 2,
          isPublished: true,
          quiz: { create: { reviewOptions: {}, isPublished: false } },
        },
      })
    ).id;

    await prisma.enrollment.create({
      data: { userId, courseId, source: 'free', status: 'active' },
    });
  });

  afterEach(async () => {
    await prisma.quizAttempt.deleteMany({ where: { quizId } });
  });

  afterAll(async () => {
    await prisma.quizAttempt.deleteMany({ where: { quizId } });
    await prisma.enrollment.deleteMany({ where: { courseId } });
    await prisma.quiz.deleteMany({ where: { lessonId: { in: [videoLessonId, draftLessonId] } } });
    await prisma.lesson.deleteMany({ where: { courseId } });
    await prisma.courseSection.deleteMany({ where: { courseId } });
    await prisma.course.delete({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, instructorId] } } });
    await prisma.$disconnect();
  });

  it('draws a separate stop for the attached quiz, pointing at the SAME lesson page', async () => {
    const path = await service.forUser(userId);
    const course = path.courses.find((entry) => entry.id === courseId)!;

    const videoNode = course.nodes.find((node) => node.id === videoLessonId)!;
    const quizNode = course.nodes.find((node) => node.id === quizId)!;

    expect(videoNode).toBeDefined();
    expect(quizNode).toBeDefined();
    expect(quizNode.kind).toBe('quiz');
    // A distinct stop (own id, own React key) that still opens the video
    // lesson's own page — there is no separate page for it.
    expect(quizNode.id).not.toBe(quizNode.lessonId);
    expect(quizNode.lessonId).toBe(videoLessonId);
    expect(videoNode.lessonId).toBe(videoLessonId);
  });

  it('draws no stop at all for a DRAFT attached quiz', async () => {
    const path = await service.forUser(userId);
    const course = path.courses.find((entry) => entry.id === courseId)!;

    expect(course.nodes.some((node) => node.lessonId === draftLessonId && node.kind === 'quiz')).toBe(
      false,
    );
  });

  it('does not count the attached quiz toward the lecture total', async () => {
    const path = await service.forUser(userId);
    const course = path.courses.find((entry) => entry.id === courseId)!;

    // Two video lessons, one visible quiz stop — the stop must not inflate
    // the lecture count the percentage is computed from.
    expect(course.totalLessons).toBe(2);
  });

  it('reports not_started with no attempts', async () => {
    const path = await service.forUser(userId);
    const quizNode = path.courses
      .find((entry) => entry.id === courseId)!
      .nodes.find((node) => node.id === quizId)!;

    expect(quizNode.state).toBe('not_started');
  });

  it('reports failed after a submitted, non-passing attempt — even though the video is already completed', async () => {
    const enrollment = await prisma.enrollment.findFirstOrThrow({ where: { userId, courseId } });
    // The video's own watch-progress is already `completed` — the exact
    // condition `recordQuizResultTx` cannot regress, which is why the quiz
    // node must NOT read this row.
    await prisma.lessonProgress.create({
      data: {
        enrollmentId: enrollment.id,
        lessonId: videoLessonId,
        state: 'completed',
        completion: 1,
        completedAt: new Date(),
        completedVia: 'auto',
      },
    });

    await prisma.quizAttempt.create({
      data: {
        quizId,
        userId,
        attemptNo: 1,
        state: 'submitted',
        submittedAt: new Date(),
        passed: false,
        sumMarks: 10,
        gradeOutOf: 100,
        passPercent: 70,
      },
    });

    const path = await service.forUser(userId);
    const nodes = path.courses.find((entry) => entry.id === courseId)!.nodes;
    const videoNode = nodes.find((node) => node.id === videoLessonId)!;
    const quizNode = nodes.find((node) => node.id === quizId)!;

    expect(videoNode.state).toBe('completed');
    expect(quizNode.state).toBe('failed');

    await prisma.lessonProgress.deleteMany({ where: { enrollmentId: enrollment.id, lessonId: videoLessonId } });
  });

  it('reports passed once any attempt passes, even alongside an earlier failure', async () => {
    await prisma.quizAttempt.create({
      data: {
        quizId,
        userId,
        attemptNo: 1,
        state: 'submitted',
        submittedAt: new Date(),
        passed: false,
        sumMarks: 10,
        gradeOutOf: 100,
        passPercent: 70,
      },
    });
    await prisma.quizAttempt.create({
      data: {
        quizId,
        userId,
        attemptNo: 2,
        paper: 'improvement',
        state: 'submitted',
        submittedAt: new Date(),
        passed: true,
        sumMarks: 10,
        gradeOutOf: 100,
        passPercent: 70,
      },
    });

    const path = await service.forUser(userId);
    const quizNode = path.courses
      .find((entry) => entry.id === courseId)!
      .nodes.find((node) => node.id === quizId)!;

    expect(quizNode.state).toBe('passed');
  });

  it('still matches the shared contract', async () => {
    const path = await service.forUser(userId);
    expect(() => LearningPathSchema.parse(path)).not.toThrow();
  });
});
