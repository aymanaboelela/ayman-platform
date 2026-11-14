import 'dotenv/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { LessonGateService } from '../progress/lesson-gate.service';
import { CourseProgressService } from '../progress/course-progress.service';
import { LessonProgressService } from '../progress/lesson-progress.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AttemptEventsService } from './attempt-events.service';
import { AttemptService } from './attempt.service';
import { OpenExamAccessService } from './open-exam-access.service';
import { QuizAccessService } from './quiz-access.service';
import { ScheduledExamsService } from './scheduled-exams.service';
import { seedQuizFixture, type QuizFixture } from './testing/quiz-fixtures';

/**
 * «مفتوح لغير المشتركين» — asserted on the EFFECT (can this student start the
 * paper, does it show on their dashboard), not on the helper's boolean alone:
 * a gate whose answer nobody consults is exactly the dead guard this repo has
 * shipped before.
 */
describe('open exams (openToNonSubscribers)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const entitlement = new EntitlementService(prisma);
  const lessonAccess = new LessonAccessService(
    prisma,
    new LessonGateService(prisma, entitlement),
    entitlement,
  );
  const openExams = new OpenExamAccessService(prisma);
  const access = new QuizAccessService(prisma, lessonAccess, openExams);
  const exams = new ScheduledExamsService(prisma, new AuditService(prisma), openExams);
  const notifications = new NotificationsService(prisma);
  const attempts = new AttemptService(
    prisma,
    access,
    new AttemptEventsService(),
    new LessonProgressService(prisma, lessonAccess, new CourseProgressService(notifications), notifications),
    lessonAccess,
    notifications,
    undefined,
    undefined,
    openExams,
  );

  let fixture: QuizFixture;
  let systemId: string;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await fixture?.cleanup();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** The fixture's quiz turned into a published monthly exam on its shelf,
   *  with the fixture student UN-enrolled and placed in a cohort. */
  async function seedOpenExam(opts: {
    open: boolean;
    profile: { year: number | null; stream: 'general' | 'languages' | null; system?: boolean };
    courseFor?: { forGeneral: boolean; forLanguages: boolean };
  }) {
    fixture = await seedQuizFixture(prisma, {
      openFrom: new Date(Date.now() - 60_000),
      openUntil: new Date(Date.now() + 60 * 60_000),
    });
    const lesson = await prisma.lesson.findUniqueOrThrow({
      where: { id: fixture.lessonId },
      select: { sectionId: true },
    });
    await prisma.courseSection.update({
      where: { id: lesson.sectionId },
      data: { title: EXAM_SHELF_TITLE },
    });
    const course = await prisma.course.update({
      where: { id: fixture.courseId },
      data: opts.courseFor ?? { forGeneral: true, forLanguages: false },
      select: { systemId: true },
    });
    systemId = course.systemId;
    await prisma.quiz.update({
      where: { id: fixture.quizId },
      data: { openToNonSubscribers: opts.open },
    });
    await prisma.enrollment.deleteMany({ where: { userId: fixture.studentId } });

    const governorate = await prisma.governorate.findFirstOrThrow();
    await prisma.studentProfile.create({
      data: {
        userId: fixture.studentId,
        fullName: 'طالب',
        gender: 'male',
        phone: `010${String(Date.now()).slice(-8)}`,
        governorateCode: governorate.code,
        systemId: opts.profile.system === false ? null : systemId,
        year: opts.profile.year,
        schoolStream: opts.profile.stream,
      },
    });
  }

  it('lets a same-cohort non-subscriber open, start and see the exam', async () => {
    await seedOpenExam({ open: true, profile: { year: 2, stream: 'general' } });

    await expect(access.assertCanAttempt(fixture.studentId, fixture.quizId)).resolves.toMatchObject({
      id: fixture.quizId,
    });
    await expect(access.getLessonOverview(fixture.studentId, fixture.lessonId)).resolves.toBeDefined();

    const mine = await exams.forStudent(fixture.studentId);
    expect(mine.exams.map((e) => e.lessonId)).toContain(fixture.lessonId);
  });

  it('carries a non-subscriber through start, submit and their own review', async () => {
    await seedOpenExam({ open: true, profile: { year: 2, stream: 'general' } });

    const started = await attempts.start(fixture.studentId, fixture.quizId);
    await attempts.submit(fixture.studentId, started.attemptId, { attemptToken: started.attemptToken });
    const row = await prisma.quizAttempt.findUniqueOrThrow({
      where: { id: started.attemptId },
      select: { state: true },
    });
    expect(row.state).toBe('submitted');
    // Review is not a 404: the same cohort match that opened the paper lets
    // them read it back (it may be `locked` until the window closes).
    await expect(attempts.review(fixture.studentId, started.attemptId)).resolves.toBeDefined();
  });

  it('keeps an exam that is NOT open closed to the same student', async () => {
    await seedOpenExam({ open: false, profile: { year: 2, stream: 'general' } });

    await expect(access.assertCanAttempt(fixture.studentId, fixture.quizId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(access.getLessonOverview(fixture.studentId, fixture.lessonId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const mine = await exams.forStudent(fixture.studentId);
    expect(mine.exams.map((e) => e.lessonId)).not.toContain(fixture.lessonId);
  });

  it.each([
    ['another year', { year: 1, stream: 'general' as const }],
    ['the other stream', { year: 2, stream: 'languages' as const }],
    ['no year on the profile', { year: null, stream: 'general' as const }],
    ['no stream on the profile', { year: 2, stream: null }],
    ['no system on the profile', { year: 2, stream: 'general' as const, system: false }],
  ])('refuses a student from %s', async (_label, profile) => {
    await seedOpenExam({ open: true, profile });

    await expect(access.assertCanAttempt(fixture.studentId, fixture.quizId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const mine = await exams.forStudent(fixture.studentId);
    expect(mine.exams.map((e) => e.lessonId)).not.toContain(fixture.lessonId);
  });

  it('opens only the exam — the course lessons stay behind the enrollment', async () => {
    await seedOpenExam({ open: true, profile: { year: 2, stream: 'general' } });

    // The exam lesson itself is reachable through the open door, but the
    // regular lesson gate (player, progress) still refuses: no enrollment
    // was minted.
    await expect(lessonAccess.require(fixture.studentId, fixture.lessonId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      prisma.enrollment.count({ where: { userId: fixture.studentId } }),
    ).resolves.toBe(0);
  });
});
