import 'dotenv/config';
import { AuditService } from '../../audit/audit.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { CourseProgressService } from '../progress/course-progress.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { LessonProgressService } from '../progress/lesson-progress.service';
import { AttemptAdminService } from './attempt-admin.service';
import { AttemptEventsService } from './attempt-events.service';
import { AttemptService } from './attempt.service';
import { QuizAccessService } from './quiz-access.service';
import { seedQuizFixture, type QuizFixture, type QuizFixtureOverrides } from './testing/quiz-fixtures';

describe('AttemptAdminService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const access = new QuizAccessService(prisma, new LessonAccessService(prisma));
  const events = new AttemptEventsService();
  const progress = new LessonProgressService(prisma, new LessonAccessService(prisma), new CourseProgressService());
  const attempts = new AttemptService(prisma, access, events, progress, new LessonAccessService(prisma));
  const admin = new AttemptAdminService(prisma, events, attempts, new AuditService(prisma));

  const fixtures: QuizFixture[] = [];

  async function fixture(overrides: QuizFixtureOverrides = {}): Promise<QuizFixture> {
    const created = await seedQuizFixture(prisma, { retryCooldownHours: 0, ...overrides });
    fixtures.push(created);
    return created;
  }

  afterEach(async () => {
    for (const created of fixtures.splice(0)) await created.cleanup();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('reopens a submitted attempt and issues a NEW token', async () => {
    const f = await fixture({ durationSeconds: 600 });
    const started = await attempts.start(f.studentId, f.quizId);
    const originalToken = started.attemptToken;
    await attempts.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken });

    await admin.reopen(f.adminId, started.attemptId, { extraSeconds: 600 });

    const attempt = await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } });
    expect(attempt!.state).toBe('in_progress');
    expect(attempt!.submittedAt).toBeNull();
    expect(attempt!.attemptToken).not.toBe(originalToken);
    expect(attempt!.extraTimeSeconds).toBe(600);
  });

  // Q3 restated: reopening grants time ADDITIVELY. deadlineAt is still the
  // value written at attempt start.
  it('does not rewrite deadlineAt when reopening', async () => {
    const f = await fixture({ durationSeconds: 600 });
    const started = await attempts.start(f.studentId, f.quizId);
    await attempts.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken });

    const before = (await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } }))!.deadlineAt;
    await admin.reopen(f.adminId, started.attemptId, { extraSeconds: 600 });
    const after = (await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } }))!.deadlineAt;
    expect(after!.getTime()).toBe(before!.getTime());
  });

  it('keeps the previous score visible until the student resubmits', async () => {
    const f = await fixture();
    const started = await attempts.start(f.studentId, f.quizId);
    await attempts.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken });

    const before = (await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } }))!.rawScore;
    await admin.reopen(f.adminId, started.attemptId, { extraSeconds: 0 });
    const after = (await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } }))!.rawScore;
    expect(after).toEqual(before);
  });

  it('lets the student resubmit after a reopen and rewrites the score', async () => {
    const f = await fixture({ questionCount: 1 });
    const started = await attempts.start(f.studentId, f.quizId);
    await attempts.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken });
    const before = (await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } }))!.rawScore;

    await admin.reopen(f.adminId, started.attemptId, { extraSeconds: 0 });
    const resumed = await attempts.resume(f.studentId, started.attemptId);
    const correctOption = await prisma.questionOption.findFirstOrThrow({
      where: { questionVersionId: f.versionIds[0], fraction: 1 },
      select: { id: true },
    });
    await attempts.saveAnswers(f.studentId, started.attemptId, {
      attemptToken: resumed.attemptToken,
      seq: resumed.nextSeq,
      answers: [{ slotPosition: 0, response: { kind: 'choice', optionIds: [correctOption.id] } }],
    });
    await attempts.submit(f.studentId, started.attemptId, { attemptToken: resumed.attemptToken });

    const after = (await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } }))!.rawScore;
    expect(Number(after)).not.toBe(Number(before));
  });

  it("is the ONLY path that clears submittedAt — the student's own double-submit protection is intact for the new submission", async () => {
    const f = await fixture();
    const started = await attempts.start(f.studentId, f.quizId);
    await attempts.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken });
    await admin.reopen(f.adminId, started.attemptId, { extraSeconds: 0 });
    const resumed = await attempts.resume(f.studentId, started.attemptId);

    await attempts.submit(f.studentId, started.attemptId, { attemptToken: resumed.attemptToken });
    // A second submit with the SAME (now-consumed) token is rejected, exactly
    // like the student path always has been.
    await expect(
      attempts.submit(f.studentId, started.attemptId, { attemptToken: resumed.attemptToken }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('grants an extra attempt that the start path then honours', async () => {
    const f = await fixture({ maxAttempts: 1, questionCount: 1 });
    const started = await attempts.start(f.studentId, f.quizId);
    await attempts.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken });

    await expect(attempts.start(f.studentId, f.quizId)).rejects.toMatchObject({
      response: { code: 'no_attempts_left' },
    });

    await admin.grantExtraAttempt(f.adminId, f.quizId, f.studentId);
    const second = await attempts.start(f.studentId, f.quizId);
    expect(second.attemptId).not.toBe(started.attemptId);
  });

  it('refuses to grant an extra attempt to a student with no attempts', async () => {
    const f = await fixture();
    await expect(admin.grantExtraAttempt(f.adminId, f.quizId, f.studentId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('grants additive extra time on a still-open attempt', async () => {
    const f = await fixture({ durationSeconds: 600 });
    const started = await attempts.start(f.studentId, f.quizId);
    await admin.grantExtraTime(f.adminId, started.attemptId, 120);
    const attempt = await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } });
    expect(attempt!.extraTimeSeconds).toBe(120);

    await admin.grantExtraTime(f.adminId, started.attemptId, 30);
    const after = await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } });
    expect(after!.extraTimeSeconds).toBe(150);
  });

  it('records every action as an attempt event naming the admin', async () => {
    const f = await fixture();
    const started = await attempts.start(f.studentId, f.quizId);
    await attempts.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken });
    await admin.reopen(f.adminId, started.attemptId, { extraSeconds: 60 });
    await admin.grantExtraTime(f.adminId, started.attemptId, 30);
    await admin.grantExtraAttempt(f.adminId, f.quizId, f.studentId);

    const eventRows = await prisma.attemptEvent.findMany({
      where: { attemptId: started.attemptId, actorId: f.adminId },
    });
    expect(eventRows.map((event) => event.kind)).toEqual(
      expect.arrayContaining(['attempt_reopened', 'extra_time_granted', 'extra_attempt_granted']),
    );
  });

  it('lists attempts across quizzes, filterable by quizId/userId/state', async () => {
    const f = await fixture({ questionCount: 1 });
    const started = await attempts.start(f.studentId, f.quizId);
    await attempts.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken });

    const all = await admin.listAttempts({});
    expect(all.some((row) => row.id === started.attemptId)).toBe(true);

    const byQuiz = await admin.listAttempts({ quizId: f.quizId });
    expect(byQuiz.every((row) => row.quizId === f.quizId)).toBe(true);
    expect(byQuiz[0]).not.toHaveProperty('attemptToken');

    const bySubmitted = await admin.listAttempts({ quizId: f.quizId, state: 'submitted' });
    expect(bySubmitted.every((row) => row.state === 'submitted')).toBe(true);
  });
});
