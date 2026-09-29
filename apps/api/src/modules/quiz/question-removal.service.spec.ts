// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import type { QuestionInput } from '@ayman/contracts/quiz/question';
import { AuditService } from '../../audit/audit.service';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CourseProgressService } from '../progress/course-progress.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { LessonGateService } from '../progress/lesson-gate.service';
import { LessonProgressService } from '../progress/lesson-progress.service';
import { AttemptEventsService } from './attempt-events.service';
import { AttemptService } from './attempt.service';
import { GameService } from './game.service';
import { QuestionBankService } from './question-bank.service';
import { QuestionRemovalService } from './question-removal.service';
import { QuizAccessService } from './quiz-access.service';
import { QuizBuilderService } from './quiz-builder.service';
import { seedQuizFixture, type QuizFixture } from './testing/quiz-fixtures';

/**
 * «امسح السؤال» against a real database: what goes, what stays, and that a
 * past attempt's review still renders a question that left the bank. The
 * decision itself, branch by branch, is `question-removal.spec.ts`.
 */
describe('QuestionRemovalService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const audit = new AuditService(prisma);
  const removal = new QuestionRemovalService(prisma, audit);
  const bank = new QuestionBankService(prisma, audit);
  const builder = new QuizBuilderService(prisma, audit);
  const games = new GameService(prisma, new EnrollmentService(prisma));
  const lessonAccess = () =>
    new LessonAccessService(prisma, new LessonGateService(prisma, new EntitlementService(prisma)), new EntitlementService(prisma));
  const attempts = new AttemptService(
    prisma,
    new QuizAccessService(prisma, lessonAccess()),
    new AttemptEventsService(),
    new LessonProgressService(
      prisma,
      lessonAccess(),
      new CourseProgressService(new NotificationsService(prisma)),
      new NotificationsService(prisma),
    ),
    lessonAccess(),
    new NotificationsService(prisma),
  );

  const fixtures: QuizFixture[] = [];

  async function fixture(): Promise<QuizFixture> {
    const created = await seedQuizFixture(prisma, { retryCooldownHours: 0 });
    fixtures.push(created);
    return created;
  }

  /** A published question in the fixture's category, on no paper. Tracked for cleanup. */
  async function looseQuestion(f: QuizFixture, stem = '<p>سؤال لوحده</p>'): Promise<string> {
    const created = await bank.create(
      {
        type: 'mcq_single',
        categoryId: f.categoryId,
        stemHtml: stem,
        defaultMark: 1,
        settings: { shuffleOptions: false, caseSensitive: false },
        options: [
          { bodyHtml: '<p>صح</p>', fraction: 1 },
          { bodyHtml: '<p>غلط</p>', fraction: 0 },
        ],
      } as QuestionInput,
      f.adminId,
    );
    await bank.publish(created.versionId);
    // The fixture's cleanup deletes exactly this array before the category.
    f.bankEntryIds.push(created.bankEntryId);
    return created.bankEntryId;
  }

  /** Sits and submits the fixture's quiz as its student. */
  async function sit(f: QuizFixture): Promise<string> {
    const started = await attempts.start(f.studentId, f.quizId);
    await attempts.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken });
    return started.attemptId;
  }

  afterEach(async () => {
    for (const created of fixtures.splice(0)) await created.cleanup();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('deletes a question nobody answered outright — versions, options and all — and audits it', async () => {
    const f = await fixture();
    const id = await looseQuestion(f, '<p>عاصمة مصر إيه؟</p>');

    const plan = await removal.plan([id]);
    expect(plan.items).toEqual([expect.objectContaining({ bankEntryId: id, outcome: 'delete', quizzes: [] })]);

    const result = await removal.remove([id]);
    expect(result).toMatchObject({ deleted: 1, archived: 0, blocked: [], missing: [] });
    expect(await prisma.questionBankEntry.findUnique({ where: { id } })).toBeNull();
    expect(await prisma.questionVersion.count({ where: { bankEntryId: id } })).toBe(0);

    const row = await prisma.auditLog.findFirst({
      where: { action: 'question:delete', resourceId: id },
      orderBy: { id: 'desc' },
    });
    expect(row?.metadata).toMatchObject({ mode: 'hard', stem: 'عاصمة مصر إيه؟' });
  });

  it('refuses a question still on a published quiz, names the quiz, and changes nothing', async () => {
    const f = await fixture();
    const id = f.bankEntryIds[0]!;

    const plan = await removal.plan([id]);
    expect(plan.items[0]).toMatchObject({
      outcome: 'blocked',
      quizzes: [{ quizId: f.quizId, via: 'slot', isPublished: true }],
    });

    const result = await removal.remove([id]);
    expect(result).toMatchObject({ deleted: 0, archived: 0 });
    expect(result.blocked.map((item) => item.bankEntryId)).toEqual([id]);
    const entry = await prisma.questionBankEntry.findUniqueOrThrow({ where: { id } });
    expect(entry.archivedAt).toBeNull();
    expect(await prisma.quizSlot.count({ where: { quizId: f.quizId, bankEntryId: id } })).toBe(1);
  });

  it('archives a question somebody answered: the review still renders it, the bank and the games do not', async () => {
    const f = await fixture();
    const attemptId = await sit(f);
    await prisma.accessGrant.create({ data: { userId: f.studentId, scope: 'platform', source: 'auto_free' } });
    const id = f.bankEntryIds[0]!;
    const versionId = f.versionIds[0]!;
    const stem = (await prisma.questionVersion.findUniqueOrThrow({ where: { id: versionId } })).stemHtml;
    expect((await games.hub(f.studentId)).total).toBe(f.versionIds.length);

    // Off the paper first — while a quiz holds it, it is refused (above).
    await prisma.quizSlot.deleteMany({ where: { quizId: f.quizId, bankEntryId: id } });

    expect((await removal.plan([id])).items[0]!.outcome).toBe('archive');
    expect(await removal.remove([id])).toMatchObject({ deleted: 0, archived: 1 });

    // Nothing that pointed at it moved.
    const entry = await prisma.questionBankEntry.findUniqueOrThrow({ where: { id } });
    expect(entry.archivedAt).toBeInstanceOf(Date);
    expect(await prisma.questionVersion.count({ where: { bankEntryId: id } })).toBe(1);

    // The student's review renders the question exactly as they sat it.
    const review = await attempts.review(f.studentId, attemptId);
    expect(review.locked).toBe(false);
    const questions = review.locked ? [] : review.questions;
    expect(questions.map((question) => question.stemHtml)).toContain(stem);

    // Out of the bank list (and so out of the slot picker, which reads it) …
    const inBank = await bank.list({ categoryId: f.categoryId, take: 200, skip: 0 });
    expect(inBank.rows.map((row) => row.id)).not.toContain(id);
    // … listed under «اللي اتشالت» …
    const archived = await bank.list({ categoryId: f.categoryId, archived: true, take: 200, skip: 0 });
    expect(archived.rows.map((row) => row.id)).toEqual([id]);
    // … not counted in its category …
    const category = (await bank.listCategories()).find((row) => row.id === f.categoryId);
    expect(category?.questionCount).toBe(f.bankEntryIds.length - 1);
    // … and not in the games, even though the student sat it.
    expect((await games.hub(f.studentId)).total).toBe(f.versionIds.length - 1);

    const row = await prisma.auditLog.findFirst({
      where: { action: 'question:delete', resourceId: id },
      orderBy: { id: 'desc' },
    });
    expect(row?.metadata).toMatchObject({ mode: 'archive' });

    // «رجّعه للبنك» undoes it.
    await removal.restore(id);
    const back = await bank.list({ categoryId: f.categoryId, take: 200, skip: 0 });
    expect(back.rows.map((row) => row.id)).toContain(id);
  });

  it('will not put an archived question back on a paper through a stale picker', async () => {
    const f = await fixture();
    const id = await looseQuestion(f);
    await prisma.questionBankEntry.update({ where: { id }, data: { archivedAt: new Date() } });

    await expect(builder.addSlot(f.quizId, { bankEntryId: id, maxMark: 1 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('decides a bulk delete one question at a time', async () => {
    const f = await fixture();
    const unused = await looseQuestion(f);
    const onPaper = f.bankEntryIds[1]!;
    const gone = '00000000-0000-7000-8000-000000000000';

    const result = await removal.remove([unused, onPaper, gone]);
    expect(result).toMatchObject({ deleted: 1, archived: 0, missing: [gone] });
    expect(result.blocked.map((item) => item.bankEntryId)).toEqual([onPaper]);
  });

  it('404s a restore of a question that does not exist', async () => {
    await expect(removal.restore('00000000-0000-7000-8000-000000000000')).rejects.toBeInstanceOf(NotFoundException);
    await expect(removal.restore('not-a-uuid')).rejects.toBeInstanceOf(NotFoundException);
  });
});
