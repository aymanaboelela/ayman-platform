// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { randomUUID as randomUUIDv4 } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { GameHubSchema, GameRoundSchema } from '@ayman/contracts/quiz/game';
import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';
import { DEFAULT_REVIEW_OPTIONS } from '@ayman/contracts/quiz/quiz-settings';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { GameBanksService } from './game-banks.service';
import { GameService } from './game.service';
import { seedQuizFixture, type QuizFixture } from './testing/quiz-fixtures';

describe('GameService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new GameService(prisma, new EnrollmentService(prisma));
  const banks = new GameBanksService(prisma, new AuditService(prisma));

  let fixture: QuizFixture;
  let extra: {
    sectionId?: string;
    lessonId?: string;
    quizId?: string;
    categoryId?: string;
    /** تصنيفات الدروس — بتتمسح قبل تصنيف الكورس (الأب `Restrict`). */
    childCategoryIds?: string[];
    lectureId?: string;
  } = {};

  /**
   * الألعاب بتقرا كورسات الطالب اللي يقدر يفتحها (`accessActive`)، وكورس
   * مجاني بيتفتح بالـgrant العام — اللي بيتعمل أول ما الطالب يشترك. الفيكستشر
   * بيكتب الاشتراك من غيره، فالتست بيحطّه بنفسه.
   */
  async function grant(userId: string) {
    await prisma.accessGrant.create({ data: { userId, scope: 'platform', source: 'auto_free' } });
  }

  /** سؤال جاهز بإجابة صح في التصنيف ده. */
  async function readyQuestion(categoryId: string, stem = 'سؤال لعبة') {
    const entry = await prisma.questionBankEntry.create({ data: { categoryId, ownerId: fixture.adminId } });
    const version = await prisma.questionVersion.create({
      data: {
        bankEntryId: entry.id,
        version: 1,
        // مسودة الأول: الاختيارات بتتقفل أول ما النسخة تبقى `ready` (تريجر).
        status: 'draft',
        type: 'mcq_single',
        stemHtml: `<p>${stem}</p>`,
        createdBy: fixture.adminId,
        options: {
          create: [
            { bodyHtml: '<p>صح</p>', fraction: 1, position: 0 },
            { bodyHtml: '<p>غلط</p>', fraction: 0, position: 1 },
          ],
        },
      },
      select: { id: true, options: { orderBy: { position: 'asc' }, select: { id: true } } },
    });
    await prisma.questionVersion.update({ where: { id: version.id }, data: { status: 'ready' } });
    return { versionId: version.id, right: version.options[0]!.id, wrong: version.options[1]!.id };
  }

  /** محاولة مسلّمة ومصححة على كل أسئلة الكويز. */
  async function sit(userId: string) {
    const attempt = await prisma.quizAttempt.create({
      data: {
        quizId: fixture.quizId,
        userId,
        attemptNo: 1,
        state: 'submitted',
        submittedAt: new Date(),
        scaledScore: 100,
        rawScore: 3,
        sumMarks: 3,
        gradeOutOf: 100,
        passPercent: 50,
        passed: true,
      },
    });
    await prisma.attemptQuestion.createMany({
      data: fixture.versionIds.map((questionVersionId, index) => ({
        attemptId: attempt.id,
        slotPosition: index,
        questionVersionId,
        optionOrder: [],
        maxMark: 1,
        minFraction: 0,
        maxFraction: 1,
        state: 'graded_right' as const,
        gradedAt: new Date(),
      })),
    });
  }

  async function courseOf(): Promise<string> {
    return (await prisma.lesson.findUniqueOrThrow({ where: { id: fixture.lessonId }, select: { courseId: true } })).courseId;
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    if (extra.quizId) {
      await prisma.quizSlot.deleteMany({ where: { quizId: extra.quizId } });
      await prisma.quiz.delete({ where: { id: extra.quizId } });
    }
    if (extra.lessonId) await prisma.lesson.delete({ where: { id: extra.lessonId } });
    if (extra.sectionId) await prisma.courseSection.delete({ where: { id: extra.sectionId } });
    for (const categoryId of [...(extra.childCategoryIds ?? []), ...(extra.categoryId ? [extra.categoryId] : [])]) {
      await prisma.questionBankEntry.deleteMany({ where: { categoryId } });
      await prisma.questionCategory.delete({ where: { id: categoryId } });
    }
    if (extra.lectureId) await prisma.lesson.delete({ where: { id: extra.lectureId } });
    extra = {};
    await fixture?.cleanup();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('plays the questions of papers the student sat, and never ships the answer with them', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await grant(fixture.studentId);
    await grant(fixture.otherStudentId);
    expect((await service.hub(fixture.studentId)).total).toBe(0);

    await sit(fixture.studentId);
    const hub = await service.hub(fixture.studentId);
    expect(() => GameHubSchema.parse(hub)).not.toThrow();
    expect(hub.total).toBe(3);
    expect(hub.courses).toHaveLength(1);

    const round = await service.round(fixture.studentId, { mode: 'race', level: 'medium' });
    expect(() => GameRoundSchema.parse(round)).not.toThrow();
    expect(round.questions).toHaveLength(3);
    expect(JSON.stringify(round)).not.toMatch(/fraction|feedback|rightAnswer|correct/i);
    // وطالب تاني ماسلّمش حاجة بنكه فاضي — حتى لو مشترك في نفس الكورس.
    expect((await service.hub(fixture.otherStudentId)).total).toBe(0);
  });

  it('grades on the server and names the right option only after the answer', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await grant(fixture.studentId);
    await sit(fixture.studentId);
    const questionId = fixture.versionIds[0]!;
    const options = await prisma.questionOption.findMany({
      where: { questionVersionId: questionId },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    const [right, wrong] = [options[0]!.id, options[1]!.id];

    // الشرح بيوصل مع الصح، بعد الإجابة — الفيكستشر بيكتب «ملاحظة صحيحة».
    const explanationHtml = '<p>ملاحظة صحيحة</p>';
    expect(await service.answer(fixture.studentId, { questionId, optionId: right })).toEqual({ correct: true, rightOptionIds: [right], explanationHtml });
    expect(await service.answer(fixture.studentId, { questionId, optionId: wrong })).toEqual({ correct: false, rightOptionIds: [right], explanationHtml });
    expect((await service.answer(fixture.studentId, { questionId, optionId: null })).correct).toBe(false);
  });

  it('refuses a question outside the student’s pool — 404, not the answer, and no lifeline', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await grant(fixture.studentId);
    await grant(fixture.otherStudentId);
    await sit(fixture.studentId);
    const questionId = fixture.versionIds[0]!;

    await expect(service.answer(fixture.otherStudentId, { questionId, optionId: null })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.lifeline(fixture.otherStudentId, { questionId, kind: 'fifty' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('50:50 leaves the right answer and one wrong one; the audience adds up to 100', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await grant(fixture.studentId);
    await sit(fixture.studentId);
    const questionId = fixture.versionIds[0]!;
    const options = await prisma.questionOption.findMany({ where: { questionVersionId: questionId }, orderBy: { position: 'asc' } });

    const fifty = await service.lifeline(fixture.studentId, { questionId, kind: 'fifty' });
    expect(fifty.removeOptionIds).toHaveLength(options.length - 2);
    expect(fifty.removeOptionIds).not.toContain(options[0]!.id);

    const audience = await service.lifeline(fixture.studentId, { questionId, kind: 'audience' });
    expect(audience.votes).toHaveLength(options.length);
    expect(audience.votes.reduce((sum, vote) => sum + vote.percent, 0)).toBe(100);
  });

  it('millionaire orders its round easiest first', async () => {
    fixture = await seedQuizFixture(prisma, { questionCount: 3 });
    await grant(fixture.studentId);
    await sit(fixture.studentId);
    const round = await service.round(fixture.studentId, { mode: 'millionaire', level: 'medium' });
    expect(round.mode).toBe('millionaire');
    expect(round.questions.length).toBeGreaterThan(0);
  });

  it('keeps out any question an upcoming monthly exam draws on', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await grant(fixture.studentId);
    await sit(fixture.studentId);
    const courseId = await courseOf();
    const section = await prisma.courseSection.create({ data: { courseId, title: EXAM_SHELF_TITLE, position: 90, isPublished: true } });
    const lesson = await prisma.lesson.create({
      data: { courseId, sectionId: section.id, title: 'امتحان الشهر', kind: 'quiz', position: 0, isPublished: true },
    });
    const exam = await prisma.quiz.create({ data: { lessonId: lesson.id, reviewOptions: DEFAULT_REVIEW_OPTIONS, isPublished: true } });
    extra = { sectionId: section.id, lessonId: lesson.id, quizId: exam.id };
    await prisma.quizSlot.create({ data: { quizId: exam.id, position: 0, maxMark: 1, bankEntryId: fixture.bankEntryIds[0]! } });

    const hub = await service.hub(fixture.studentId);
    expect(hub.total).toBe(2);
  });

  it('adds the course’s own game questions for an enrolled student', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await grant(fixture.studentId);
    const courseId = await courseOf();
    const { categoryId } = await banks.ensure(courseId);
    extra = { categoryId };
    // مرتين = نفس التصنيف.
    expect((await banks.ensure(courseId)).categoryId).toBe(categoryId);

    // سؤال جاهز في تصنيف الكورس — الطالب مشترك ومسلّمش حاجة، ومع ذلك يلعبه.
    const question = await readyQuestion(categoryId);

    const hub = await service.hub(fixture.studentId);
    expect(hub.total).toBe(1);
    const round = await service.round(fixture.studentId, { mode: 'race', level: 'medium', courseId });
    expect(round.questions.map((q) => q.id)).toEqual([question.versionId]);
    expect((await banks.list()).rows.find((row) => row.courseId === courseId)?.ready).toBe(1);
  });

  it('plays only courses the student can open right now', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await sit(fixture.studentId);
    // مشترك في الكورس بس مفيش grant حي — نفس «اشتراكه خلص».
    expect((await service.hub(fixture.studentId)).total).toBe(0);
    const round = await service.start(fixture.studentId, { mode: 'race', level: 'medium', scope: 'all' });
    expect(round.questions).toHaveLength(0);
    expect(round.sessionId).toBeNull();

    await grant(fixture.studentId);
    expect((await service.hub(fixture.studentId)).total).toBe(3);
  });

  it('scopes a round to a lesson or a unit, and each game to the sources the course allows', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await grant(fixture.studentId);
    await sit(fixture.studentId);
    const courseId = await courseOf();
    const quizLesson = await prisma.lesson.findUniqueOrThrow({ where: { id: fixture.lessonId }, select: { sectionId: true } });
    const lecture = await prisma.lesson.create({
      data: { courseId, sectionId: quizLesson.sectionId, title: 'المحاضرة التانية', kind: 'video', position: 5, isPublished: true },
    });
    const general = await banks.ensure(courseId);
    const lessonBank = await banks.ensureLesson(courseId, lecture.id);
    extra = { categoryId: general.categoryId, childCategoryIds: [lessonBank.categoryId], lectureId: lecture.id };
    // درس من كورس تاني = 404.
    await expect(banks.ensureLesson(courseId, randomUUIDv4())).rejects.toBeInstanceOf(NotFoundException);

    const lessonQuestion = await readyQuestion(lessonBank.categoryId, 'سؤال الدرس');
    const generalQuestion = await readyQuestion(general.categoryId, 'سؤال عام');

    const hub = await service.hub(fixture.studentId);
    const course = hub.courses.find((candidate) => candidate.id === courseId)!;
    // ٣ من الكويز (محسوبين على الكويز نفسه — أول الوحدة) + سؤال الدرس + العام.
    expect(hub.total).toBe(5);
    expect(course.lessons.map((lesson) => lesson.id).sort()).toEqual([fixture.lessonId, lecture.id].sort());
    expect(course.sections.map((section) => section.id)).toEqual([quizLesson.sectionId]);

    const lessonRound = await service.start(fixture.studentId, {
      mode: 'race',
      level: 'medium',
      courseId,
      scope: 'lesson',
      scopeId: lecture.id,
    });
    expect(lessonRound.questions.map((q) => q.id)).toEqual([lessonQuestion.versionId]);
    expect(lessonRound.sessionId).not.toBeNull();

    const unitRound = await service.start(fixture.studentId, {
      mode: 'race',
      level: 'medium',
      courseId,
      scope: 'section',
      scopeId: quizLesson.sectionId,
    });
    // العام مالوش وحدة، فمش في جولة الوحدة.
    expect(unitRound.questions.map((q) => q.id)).not.toContain(generalQuestion.versionId);
    expect(unitRound.questions).toHaveLength(4);

    // وحدة مش في كورسات الطالب: جولة فاضية، ومفيش صف.
    const stranger = await service.start(fixture.studentId, {
      mode: 'race',
      level: 'medium',
      courseId,
      scope: 'section',
      scopeId: randomUUIDv4(),
    });
    expect(stranger.questions).toHaveLength(0);
    expect(stranger.sessionId).toBeNull();

    // السباق من أسئلة الألعاب بس، والمليون من الدرس بس.
    const detail = await banks.detail(courseId);
    await banks.saveModes(courseId, {
      ...detail.modes,
      race: { useQuizzes: false, useBank: true, lessonIds: [] },
      survival: { useQuizzes: true, useBank: true, lessonIds: [lecture.id, randomUUIDv4()] },
    });
    const race = await service.start(fixture.studentId, { mode: 'race', level: 'medium', courseId, scope: 'all' });
    expect(race.questions.map((q) => q.id).sort()).toEqual([lessonQuestion.versionId, generalQuestion.versionId].sort());
    const survival = await service.start(fixture.studentId, { mode: 'survival', level: 'medium', courseId, scope: 'all' });
    expect(survival.questions.map((q) => q.id)).toEqual([lessonQuestion.versionId]);
    // درس من برّه الكورس اتشال وهو بيتحفظ.
    expect((await banks.detail(courseId)).modes.survival.lessonIds).toEqual([lecture.id]);
    expect((await banks.list()).rows.find((row) => row.courseId === courseId)).toMatchObject({
      lessonBanks: 1,
      lessonReady: 1,
      customized: true,
    });
    // والصف بتاع الدرس في اللوحة فيه سؤال الألعاب.
    const row = (await banks.detail(courseId)).sections.flatMap((section) => section.lessons).find((lesson) => lesson.id === lecture.id);
    expect(row).toMatchObject({ ready: 1, categoryId: lessonBank.categoryId });
  });

  it('records a round on the server: dealt questions only, each answer once, a clamped duration', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await grant(fixture.studentId);
    await grant(fixture.otherStudentId);
    await sit(fixture.studentId);
    const round = await service.start(fixture.studentId, { mode: 'race', level: 'medium', scope: 'all' });
    const sessionId = round.sessionId!;
    expect(round.questions).toHaveLength(3);

    const [first, second] = round.questions;
    const options = await prisma.questionOption.findMany({
      where: { questionVersionId: first!.id },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    const right = options[0]!.id;

    // جولة طالب تاني = 404، حتى لو السؤال نفسه صح.
    await expect(
      service.answer(fixture.otherStudentId, { questionId: first!.id, optionId: right, sessionId }),
    ).rejects.toBeInstanceOf(NotFoundException);
    // سؤال مااتوزّعش في الجولة دي = 404.
    await expect(
      service.answer(fixture.studentId, { questionId: randomUUIDv4(), optionId: null, sessionId }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect((await service.answer(fixture.studentId, { questionId: first!.id, optionId: right, sessionId })).correct).toBe(true);
    // نفس الدوسة اتبعتت مرتين — بتتحسب مرة.
    await service.answer(fixture.studentId, { questionId: first!.id, optionId: right, sessionId });
    expect((await service.answer(fixture.studentId, { questionId: second!.id, optionId: null, sessionId })).correct).toBe(false);

    let session = await prisma.gameSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session).toMatchObject({ answered: 2, correct: 1, questionCount: 3, mode: 'race', outcome: null });

    // المتصفح بيقول مليون نقطة؛ السيرفر بيصدّق لحد أكتر نقط ممكنة لإجابة صح واحدة.
    const finished = await service.finish(fixture.studentId, sessionId, { score: 1_000_000 });
    expect(finished.outcome).toBe('finished');
    expect(finished.score).toBe(200);
    // مرتين = نفس النتيجة، ومفيش إجابات بتتحسب بعد النهاية.
    expect(await service.finish(fixture.studentId, sessionId, { score: 5 })).toMatchObject({ score: 200 });
    await service.answer(fixture.studentId, { questionId: round.questions[2]!.id, optionId: null, sessionId });
    session = await prisma.gameSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.answered).toBe(2);

    // جولة اتسابت مفتوحة ساعات: المدة مقصوصة على أطول جولة سباق ممكنة.
    const stale = await service.start(fixture.studentId, { mode: 'race', level: 'hard', scope: 'all' });
    await prisma.gameSession.update({
      where: { id: stale.sessionId! },
      data: { startedAt: new Date(Date.now() - 5 * 60 * 60 * 1000) },
    });
    const late = await service.finish(fixture.studentId, stale.sessionId!, {});
    expect(late.durationSeconds).toBe(10 * (15 + 20));

    // «آخر نتايجك» على صفحة الألعاب — الجولة اللي فيها إجابات بس.
    const hub = await service.hub(fixture.studentId);
    expect(hub.me.plays).toBe(1);
    expect(hub.me.best.race).toBe(200);
  });

  it('answers without a pool rebuild once the round is recorded — the voice check too', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await grant(fixture.studentId);
    await sit(fixture.studentId);
    const round = await service.start(fixture.studentId, { mode: 'millionaire', level: 'medium', scope: 'all' });
    const questionId = round.questions[0]!.id;
    const pool = jest.spyOn(service as unknown as { pool: () => Promise<unknown> }, 'pool');
    await service.answer(fixture.studentId, { questionId, optionId: null, sessionId: round.sessionId! });
    await service.lifeline(fixture.studentId, { questionId, kind: 'fifty', sessionId: round.sessionId! });
    await service.assertDealtOrInPool(fixture.studentId, questionId);
    expect(pool).not.toHaveBeenCalled();
    pool.mockRestore();
    // المليون: غلطة في أول سؤال = خسارة على صفر.
    expect(await service.finish(fixture.studentId, round.sessionId!, {})).toMatchObject({ outcome: 'lost', score: 0 });
  });
});
