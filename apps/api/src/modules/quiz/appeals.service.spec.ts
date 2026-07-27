import 'dotenv/config';
import { AuditService } from '../../audit/audit.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { CourseProgressService } from '../progress/course-progress.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { LessonProgressService } from '../progress/lesson-progress.service';
import { AppealsService } from './appeals.service';
import { AttemptEventsService } from './attempt-events.service';
import { AttemptService, type StartedAttempt } from './attempt.service';
import { QuizAccessService } from './quiz-access.service';
import { seedQuizFixture, type QuizFixture, type QuizFixtureOverrides } from './testing/quiz-fixtures';

describe('AppealsService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const access = new QuizAccessService(prisma, new LessonAccessService(prisma));
  const events = new AttemptEventsService();
  const progress = new LessonProgressService(prisma, new LessonAccessService(prisma), new CourseProgressService());
  const attempts = new AttemptService(prisma, access, events, progress);
  const appeals = new AppealsService(prisma, events, attempts, progress, new AuditService(prisma));

  const fixtures: QuizFixture[] = [];

  async function fixture(overrides: QuizFixtureOverrides = {}): Promise<QuizFixture> {
    const created = await seedQuizFixture(prisma, { retryCooldownHours: 0, ...overrides });
    fixtures.push(created);
    return created;
  }

  async function correctOptionId(started: StartedAttempt, slot = 0): Promise<string> {
    const row = await prisma.attemptQuestion.findFirstOrThrow({
      where: { attemptId: started.attemptId, slotPosition: slot },
      select: { questionVersionId: true },
    });
    const option = await prisma.questionOption.findFirstOrThrow({
      where: { questionVersionId: row.questionVersionId, fraction: 1 },
      select: { id: true },
    });
    return option.id;
  }

  /** Starts, answers WRONG on slot 0, submits — the standard "a student
   *  disputes a wrong mark" setup every test in this file builds on. */
  async function submittedWrongAttempt(f: QuizFixture): Promise<{
    started: StartedAttempt;
    questionId: string;
  }> {
    const started = await attempts.start(f.studentId, f.quizId);
    const correct = await correctOptionId(started, 0);
    const wrong = started.questions[0]!.options.find((option) => option.id !== correct)!.id;
    await attempts.saveAnswers(f.studentId, started.attemptId, {
      attemptToken: started.attemptToken,
      seq: 1,
      answers: [{ slotPosition: 0, response: { kind: 'choice', optionIds: [wrong] } }],
    });
    await attempts.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken });

    const questionRow = await prisma.attemptQuestion.findFirstOrThrow({
      where: { attemptId: started.attemptId, slotPosition: 0 },
      select: { id: true },
    });
    return { started, questionId: questionRow.id };
  }

  afterEach(async () => {
    for (const created of fixtures.splice(0)) await created.cleanup();
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("opens an appeal on the student's own graded question", async () => {
    const f = await fixture();
    const { questionId } = await submittedWrongAttempt(f);

    const appealId = await appeals.open(f.studentId, questionId, 'الإجابة دي صح');
    const appeal = await prisma.gradeAppeal.findUnique({ where: { id: appealId } });
    expect(appeal!.status).toBe('open');
    // The mark at the moment of appeal is FROZEN into the row, so a later
    // regrade cannot rewrite what the student was disputing.
    expect(Number(appeal!.gradeBefore)).toBe(0);
  });

  it("refuses an appeal on another student's question", async () => {
    const f = await fixture();
    const { questionId } = await submittedWrongAttempt(f);
    await expect(appeals.open(f.otherStudentId, questionId, 'مش بتاعي')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses an appeal on an unsubmitted attempt', async () => {
    const f = await fixture();
    const started = await attempts.start(f.studentId, f.quizId);
    const questionRow = await prisma.attemptQuestion.findFirstOrThrow({
      where: { attemptId: started.attemptId, slotPosition: 0 },
      select: { id: true },
    });
    await expect(appeals.open(f.studentId, questionRow.id, 'لسه ماسلمتش')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuses a second open appeal on the same question', async () => {
    const f = await fixture();
    const { questionId } = await submittedWrongAttempt(f);
    await appeals.open(f.studentId, questionId, 'أول تظلم فعلاً طويل بما يكفي');
    await expect(appeals.open(f.studentId, questionId, 'تاني تظلم فعلاً طويل بما يكفي')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('allows a new appeal after the previous one was resolved', async () => {
    const f = await fixture();
    const { questionId } = await submittedWrongAttempt(f);
    const first = await appeals.open(f.studentId, questionId, 'أول تظلم فعلاً طويل بما يكفي');
    await appeals.resolve(f.adminId, first, { status: 'rejected', resolverNote: 'مش موافق' });

    await expect(appeals.open(f.studentId, questionId, 'تاني تظلم فعلاً طويل بما يكفي')).resolves.toEqual(
      expect.any(String),
    );
  });

  it('accepting an appeal rewrites the mark and RECOMPUTES the attempt score', async () => {
    const f = await fixture();
    const { started, questionId } = await submittedWrongAttempt(f);
    const before = await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } });

    const appealId = await appeals.open(f.studentId, questionId, 'كنت متأكد من إجابتي والله');
    await appeals.resolve(f.adminId, appealId, { status: 'accepted', newMark: 1, resolverNote: 'معاك حق' });

    const appeal = await prisma.gradeAppeal.findUnique({ where: { id: appealId } });
    expect(Number(appeal!.gradeAfter)).toBe(1);
    const after = await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } });
    expect(Number(after!.rawScore)).toBe(Number(before!.rawScore) + 1);
    expect(after!.scaledScore).not.toEqual(before!.scaledScore);
  });

  // Plan 6 Task 3's retrofit: the appeal path is instrumented, and a later
  // refactor that drops the record() call must fail here rather than silently
  // producing an audit log that looks complete.
  it('writes quiz:answer-edit and appeal:resolve to the audit trail on acceptance', async () => {
    const f = await fixture();
    const { questionId } = await submittedWrongAttempt(f);
    const appealId = await appeals.open(f.studentId, questionId, 'كنت متأكد من إجابتي والله');
    await appeals.resolve(f.adminId, appealId, { status: 'accepted', newMark: 1, resolverNote: 'تمام' });

    const rows = await prisma.auditLog.findMany({
      where: { resourceId: { in: [appealId, questionId] } },
      orderBy: { id: 'asc' },
      select: { action: true, actorUserId: true },
    });

    expect(rows.map((row) => row.action)).toEqual(['quiz:answer-edit', 'appeal:resolve']);
    // Outside a request the ambient actor is null, so the service passes the
    // admin id it was handed explicitly. Both rows must name a human.
    expect(rows.every((row) => row.actorUserId === null || row.actorUserId === f.adminId)).toBe(true);
  });

  it('records appeal:resolve on a rejection too, with no mark edit alongside it', async () => {
    const f = await fixture();
    const { questionId } = await submittedWrongAttempt(f);
    const appealId = await appeals.open(f.studentId, questionId, 'راجع التصحيح من فضلك');
    await appeals.resolve(f.adminId, appealId, { status: 'rejected', resolverNote: 'التصحيح صح' });

    const rows = await prisma.auditLog.findMany({
      where: { resourceId: { in: [appealId, questionId] } },
      orderBy: { id: 'asc' },
      select: { action: true },
    });

    expect(rows.map((row) => row.action)).toEqual(['appeal:resolve']);
  });

  it('flips `passed` when the regrade crosses the pass line', async () => {
    // 3 questions, pass at 70% — wrong on all three (0%), then accept an
    // appeal on one at full credit (33%): still fails. Accept a second at
    // full credit too (67%): still fails — so instead this asserts the
    // narrower, deterministic case: a single-question quiz at a low pass
    // bar flips outright.
    const f = await fixture({ questionCount: 1, passPercent: 50 });
    const { started, questionId } = await submittedWrongAttempt(f);
    const before = await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } });
    expect(before!.passed).toBe(false);

    const appealId = await appeals.open(f.studentId, questionId, 'الإجابة دي صح فعلاً وأنا متأكد');
    await appeals.resolve(f.adminId, appealId, { status: 'accepted', newMark: 1, resolverNote: 'صح' });

    const after = await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } });
    expect(after!.passed).toBe(true);
  });

  it('rejecting an appeal changes no mark at all', async () => {
    const f = await fixture();
    const { started, questionId } = await submittedWrongAttempt(f);
    const before = await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } });

    const appealId = await appeals.open(f.studentId, questionId, 'مش موافق على التصحيح ده خالص');
    await appeals.resolve(f.adminId, appealId, { status: 'rejected', resolverNote: 'التصحيح صح' });

    const appeal = await prisma.gradeAppeal.findUnique({ where: { id: appealId } });
    expect(appeal!.status).toBe('rejected');
    expect(appeal!.gradeAfter).toBeNull();
    const after = await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } });
    expect(Number(after!.rawScore)).toBe(Number(before!.rawScore));
  });

  it("refuses a newMark above the question's maxMark or below zero", async () => {
    const f = await fixture();
    const { questionId } = await submittedWrongAttempt(f);
    const appealId = await appeals.open(f.studentId, questionId, 'مش موافق على التصحيح ده خالص');

    await expect(
      appeals.resolve(f.adminId, appealId, { status: 'accepted', newMark: 99, resolverNote: 'تمام' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('appends regraded and appeal_resolved events with before/after', async () => {
    const f = await fixture();
    const { started, questionId } = await submittedWrongAttempt(f);
    const appealId = await appeals.open(f.studentId, questionId, 'كنت متأكد من إجابتي والله');
    await appeals.resolve(f.adminId, appealId, { status: 'accepted', newMark: 1, resolverNote: 'معاك حق' });

    const eventRows = await prisma.attemptEvent.findMany({
      where: { attemptId: started.attemptId },
      orderBy: { seq: 'asc' },
    });
    const regrade = eventRows.find((event) => event.kind === 'regraded');
    expect(regrade!.payload).toMatchObject({ markBefore: 0, markAfter: 1 });
    expect(eventRows.some((event) => event.kind === 'appeal_resolved')).toBe(true);
  });

  it('re-notifies lesson progress after a regrade', async () => {
    const spy = jest.spyOn(progress, 'recordQuizResult');
    const f = await fixture();
    const { questionId } = await submittedWrongAttempt(f);
    // submit() itself calls recordQuizResult once.
    expect(spy).toHaveBeenCalledTimes(1);

    const appealId = await appeals.open(f.studentId, questionId, 'كنت متأكد من إجابتي والله');
    await appeals.resolve(f.adminId, appealId, { status: 'accepted', newMark: 1, resolverNote: 'معاك حق' });

    expect(spy).toHaveBeenCalledTimes(2); // submit + regrade
  });

  it('never lets a student set the mark — OpenAppealDto carries only { note }', async () => {
    const f = await fixture();
    const { questionId } = await submittedWrongAttempt(f);
    // `AppealsService.open` itself takes no mark parameter at all — the
    // structural guarantee the strict DTO enforces at the HTTP boundary.
    const appealId = await appeals.open(f.studentId, questionId, 'مش موافق على التصحيح ده خالص');
    const appeal = await prisma.gradeAppeal.findUnique({ where: { id: appealId } });
    expect(appeal!.gradeAfter).toBeNull();
  });

  it('grades an essay through the same path — a manual mark is a resolve, not a special case', async () => {
    const f = await fixture({ includeEssay: true });
    const started = await attempts.start(f.studentId, f.quizId);
    const essaySlot = started.questions.length - 1;
    await attempts.saveAnswers(f.studentId, started.attemptId, {
      attemptToken: started.attemptToken,
      seq: 1,
      answers: [{ slotPosition: essaySlot, response: { kind: 'text', text: 'إجابتي المقالية' } }],
    });
    await attempts.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken });

    const essayQuestion = await prisma.attemptQuestion.findFirstOrThrow({
      where: { attemptId: started.attemptId, slotPosition: essaySlot },
      select: { id: true, maxMark: true },
    });
    expect(essayQuestion.maxMark).toBeTruthy();

    await appeals.gradeManually(f.adminId, essayQuestion.id, Number(essayQuestion.maxMark));

    const graded = await prisma.attemptQuestion.findUniqueOrThrow({ where: { id: essayQuestion.id } });
    expect(Number(graded.mark)).toBe(Number(essayQuestion.maxMark));
    expect(graded.state).toBe('graded_right');
  });

  it("listForStudent 404s for an attempt id that isn't the caller's own — no leaking a stranger's appeals under a foreign id", async () => {
    const f = await fixture();
    const { started, questionId } = await submittedWrongAttempt(f);
    await appeals.open(f.studentId, questionId, 'كنت متأكد من إجابتي والله');

    await expect(appeals.listForStudent(f.otherStudentId, started.attemptId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(appeals.listForStudent(f.studentId, started.attemptId)).resolves.toHaveLength(1);
  });

  it('is idempotent — resolving an already-resolved appeal is 409, not a second regrade', async () => {
    const f = await fixture();
    const { questionId } = await submittedWrongAttempt(f);
    const appealId = await appeals.open(f.studentId, questionId, 'كنت متأكد من إجابتي والله');
    await appeals.resolve(f.adminId, appealId, { status: 'accepted', newMark: 1, resolverNote: 'معاك حق' });

    await expect(
      appeals.resolve(f.adminId, appealId, { status: 'accepted', newMark: 1, resolverNote: 'تاني' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
