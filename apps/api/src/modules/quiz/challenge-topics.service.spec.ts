// Prisma 7 doesn't auto-load .env — same reason as `game.service.spec.ts`.
import 'dotenv/config';
import { BadRequestException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AdminChallengeTopicsSchema } from '@ayman/contracts/quiz/challenges';
import { GameHubSchema } from '@ayman/contracts/quiz/game';
import { DEFAULT_REVIEW_OPTIONS } from '@ayman/contracts/quiz/quiz-settings';
import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { ChallengeTopicsService } from './challenge-topics.service';
import { GameService } from './game.service';
import { QuestionBankService } from './question-bank.service';
import { seedQuizFixture, type QuizFixture } from './testing/quiz-fixtures';

/**
 * «قسم التحديات» من أوله لآخره على Postgres حقيقي: الأدمن بيعمل التحدّي،
 * الطالب بيشوفه ويلعبه، والأسئلة من دروسه سواء امتحن الكويز ولا لأ — ومن غير
 * تكرار لحد ما البنك يخلص.
 *
 * الفيكستشر بيعمل كورس فيه وحدة فيها كويز منشور بتلات أسئلة، والطالب **مش**
 * بيمتحنه في أي تست هنا — ده بالظبط اللي اتطلب: «سواء حل الكويز ولا لأ».
 */
describe('challenge topics', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const audit = new AuditService(prisma);
  const game = new GameService(prisma, new EnrollmentService(prisma));
  const topics = new ChallengeTopicsService(prisma, audit);
  const bank = new QuestionBankService(prisma, audit);

  let fixture: QuizFixture;
  const cleanups: Array<() => Promise<unknown>> = [];

  async function grant(userId: string) {
    await prisma.accessGrant.create({ data: { userId, scope: 'platform', source: 'auto_free' } });
  }

  async function courseSectionId(): Promise<string> {
    return (await prisma.lesson.findUniqueOrThrow({ where: { id: fixture.lessonId }, select: { sectionId: true } })).sectionId;
  }

  async function category(): Promise<string> {
    const created = await prisma.questionCategory.create({ data: { name: `تحديات-${Date.now()}-${Math.random()}` } });
    cleanups.push(async () => {
      await prisma.questionBankEntry.deleteMany({ where: { categoryId: created.id } });
      await prisma.questionCategory.delete({ where: { id: created.id } });
    });
    return created.id;
  }

  /** سؤال اختيار من متعدد في التصنيف ده، مربوط (أو لأ) بدرس ومجموعة. */
  async function question(
    categoryId: string,
    options: { lessonId?: string; group?: string; draft?: boolean; stem?: string } = {},
  ): Promise<{ bankEntryId: string; versionId: string }> {
    const entry = await prisma.questionBankEntry.create({
      data: {
        categoryId,
        ownerId: fixture.adminId,
        lessonId: options.lessonId ?? null,
        variantGroupKey: options.group ?? null,
      },
    });
    const version = await prisma.questionVersion.create({
      data: {
        bankEntryId: entry.id,
        version: 1,
        status: 'draft',
        type: 'mcq_single',
        stemHtml: `<p>${options.stem ?? 'سؤال تحدّي'}</p>`,
        generalFeedbackHtml: '<p>الشرح</p>',
        createdBy: fixture.adminId,
        options: {
          create: [
            { bodyHtml: '<p>صح</p>', fraction: 1, position: 0 },
            { bodyHtml: '<p>غلط</p>', fraction: 0, position: 1 },
          ],
        },
      },
    });
    if (!options.draft) await prisma.questionVersion.update({ where: { id: version.id }, data: { status: 'ready' } });
    return { bankEntryId: entry.id, versionId: version.id };
  }

  /** محاضرة جديدة في الوحدة، بعد الكويز — من غير ما تتربط بكويز. */
  async function lecture(title: string, stream: { forGeneral?: boolean; forLanguages?: boolean } = {}): Promise<string> {
    const lesson = await prisma.lesson.create({
      data: {
        courseId: fixture.courseId,
        sectionId: await courseSectionId(),
        title,
        kind: 'video',
        position: 10 + cleanups.length,
        isPublished: true,
        ...stream,
      },
    });
    cleanups.push(() => prisma.lesson.delete({ where: { id: lesson.id } }));
    return lesson.id;
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    for (const run of cleanups.reverse()) await run().catch(() => undefined);
    cleanups.length = 0;
    await fixture?.cleanup();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('pools a topic from its lessons — a quiz nobody sat, the lesson game bank, and a direct link — and nothing else', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await grant(fixture.studentId);
    const categoryId = await category();
    const lessonB = await lecture('الدرس التاني');
    const direct = await question(categoryId, { lessonId: lessonB });
    // مسودة مربوطة بنفس الدرس — عمرها ما توصل طالب.
    await question(categoryId, { lessonId: lessonB, draft: true });
    // سؤال مش مربوط بأي درس — مش في أي تحدّي.
    await question(categoryId);

    // «أسئلة الألعاب» بتاعة الدرس التاني.
    const lessonCategory = await prisma.questionCategory.create({ data: { name: 'ألعاب درس', gameLessonId: lessonB } });
    cleanups.push(async () => {
      await prisma.questionBankEntry.deleteMany({ where: { categoryId: lessonCategory.id } });
      await prisma.questionCategory.delete({ where: { id: lessonCategory.id } });
    });
    const fromLessonBank = await question(lessonCategory.id);

    const sectionId = await courseSectionId();
    const unit = await topics.create(fixture.courseId, { title: 'الوحدة الأولى', sectionIds: [sectionId], lessonIds: [], isActive: true });
    const onlyB = await topics.create(fixture.courseId, { title: 'الدرس التاني بس', sectionIds: [], lessonIds: [lessonB], isActive: true });
    expect(() => AdminChallengeTopicsSchema.parse(onlyB)).not.toThrow();
    // اللوحة بتعدّ بنفس كويري الطالب: ٣ كويز + مباشر + ألعاب الدرس = ٥، والدرس التاني لوحده ٢.
    expect(onlyB.topics.map((topic) => [topic.title, topic.ready.total])).toEqual([
      ['الوحدة الأولى', 5],
      ['الدرس التاني بس', 2],
    ]);
    expect(unit.topics).toHaveLength(1);

    const hub = await game.hub(fixture.studentId);
    expect(() => GameHubSchema.parse(hub)).not.toThrow();
    const course = hub.courses.find((entry) => entry.id === fixture.courseId)!;
    // الطالب ماامتحنش الكويز — ومع ذلك أسئلته في التحدّي.
    expect(course.topics.map((topic) => topic.title)).toEqual(['الوحدة الأولى', 'الدرس التاني بس']);
    const counted = course.topicBuckets.reduce((sum, bucket) => sum + bucket.counts.easy + bucket.counts.medium + bucket.counts.hard, 0);
    expect(counted).toBe(5);

    const topicB = course.topics.find((topic) => topic.title === 'الدرس التاني بس')!;
    const round = await game.start(fixture.studentId, {
      mode: 'race',
      level: 'medium',
      scope: 'all',
      courseId: fixture.courseId,
      topicIds: [topicB.id],
    });
    expect(round.questions.map((q) => q.id).sort()).toEqual([direct.versionId, fromLessonBank.versionId].sort());
    const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: round.sessionId! }, select: { topicIds: true } });
    expect(session.topicIds).toEqual([topicB.id]);
  });

  it('hides inactive topics, and a topic from another course widens nothing', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await grant(fixture.studentId);
    const sectionId = await courseSectionId();
    const detail = await topics.create(fixture.courseId, { title: 'مقفول', sectionIds: [sectionId], lessonIds: [], isActive: false });
    const hub = await game.hub(fixture.studentId);
    expect(hub.courses.find((entry) => entry.id === fixture.courseId)?.topics ?? []).toEqual([]);

    const round = await game.start(fixture.studentId, {
      mode: 'race',
      level: 'medium',
      scope: 'all',
      courseId: fixture.courseId,
      topicIds: [detail.topics[0]!.id],
    });
    expect(round.questions).toEqual([]);
    expect(round.sessionId).toBeNull();
  });

  it('keeps a lesson for languages schools away from a general-school student', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await grant(fixture.studentId);
    const categoryId = await category();
    const languagesOnly = await lecture('درس لغات', { forGeneral: false, forLanguages: true });
    await question(categoryId, { lessonId: languagesOnly });
    const detail = await topics.create(fixture.courseId, { title: 'لغات', sectionIds: [], lessonIds: [languagesOnly], isActive: true });
    expect(detail.topics[0]!.ready).toEqual({ total: 1, general: 0, languages: 1 });

    await prisma.studentProfile.create({
      data: {
        userId: fixture.studentId,
        fullName: 'طالب',
        gender: 'female',
        phone: `010${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
        governorateCode: (await prisma.governorate.findFirstOrThrow()).code,
        schoolStream: 'general',
      },
    });
    cleanups.push(() => prisma.studentProfile.deleteMany({ where: { userId: fixture.studentId } }));
    const hub = await game.hub(fixture.studentId);
    const course = hub.courses.find((entry) => entry.id === fixture.courseId)!;
    expect(course.topicBuckets.some((bucket) => bucket.lessonId === languagesOnly)).toBe(false);
  });

  it('holds back a question an open monthly exam uses until the student hands that exam in', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await grant(fixture.studentId);
    const shelf = await prisma.courseSection.create({
      data: { courseId: fixture.courseId, title: EXAM_SHELF_TITLE, position: 90, isPublished: true },
    });
    const examLesson = await prisma.lesson.create({
      data: { courseId: fixture.courseId, sectionId: shelf.id, title: 'امتحان الشهر', kind: 'quiz', position: 0, isPublished: true },
    });
    const exam = await prisma.quiz.create({ data: { lessonId: examLesson.id, reviewOptions: DEFAULT_REVIEW_OPTIONS, isPublished: true } });
    await prisma.quizSlot.create({ data: { quizId: exam.id, position: 0, maxMark: 1, bankEntryId: fixture.bankEntryIds[0]! } });
    // مسودة امتحان تانية بتسحب سؤال تاني — بتتجهّز، فمتتسرّبش.
    const draftLesson = await prisma.lesson.create({
      data: { courseId: fixture.courseId, sectionId: shelf.id, title: 'امتحان جاي', kind: 'quiz', position: 1, isPublished: false },
    });
    const draft = await prisma.quiz.create({ data: { lessonId: draftLesson.id, reviewOptions: DEFAULT_REVIEW_OPTIONS, isPublished: false } });
    await prisma.quizSlot.create({ data: { quizId: draft.id, position: 0, maxMark: 1, bankEntryId: fixture.bankEntryIds[1]! } });
    cleanups.push(async () => {
      await prisma.quizAttempt.deleteMany({ where: { quizId: exam.id } }).catch(() => undefined);
      await prisma.quizSlot.deleteMany({ where: { quizId: { in: [exam.id, draft.id] } } });
      await prisma.quiz.deleteMany({ where: { id: { in: [exam.id, draft.id] } } });
      await prisma.lesson.deleteMany({ where: { id: { in: [examLesson.id, draftLesson.id] } } });
      await prisma.courseSection.delete({ where: { id: shelf.id } });
    });

    const sectionId = await courseSectionId();
    const detail = await topics.create(fixture.courseId, { title: 'الوحدة', sectionIds: [sectionId], lessonIds: [], isActive: true });
    // اللوحة (من غير طالب): الامتحان المفتوح والمسودة الاتنين برّه.
    expect(detail.topics[0]!.ready.total).toBe(1);

    const round = await game.start(fixture.studentId, {
      mode: 'race',
      level: 'medium',
      scope: 'all',
      courseId: fixture.courseId,
      topicIds: [detail.topics[0]!.id],
    });
    expect(round.questions.map((q) => q.id)).toEqual([fixture.versionIds[2]]);

    // سلّم الامتحان — سؤاله يرجع، والمسودة لسه برّه.
    await prisma.quizAttempt.create({
      data: {
        quizId: exam.id,
        userId: fixture.studentId,
        attemptNo: 1,
        state: 'submitted',
        submittedAt: new Date(),
        scaledScore: 100,
        rawScore: 1,
        sumMarks: 1,
        gradeOutOf: 100,
        passPercent: 50,
        passed: true,
      },
    });
    const after = await game.start(fixture.studentId, {
      mode: 'race',
      level: 'medium',
      scope: 'all',
      courseId: fixture.courseId,
      topicIds: [detail.topics[0]!.id],
    });
    expect(after.questions.map((q) => q.id).sort()).toEqual([fixture.versionIds[0], fixture.versionIds[2]].sort());
  });

  it('never repeats a question until the topic runs out, and rotates the wordings of one idea', async () => {
    fixture = await seedQuizFixture(prisma, { questionCount: 0 });
    await grant(fixture.studentId);
    const categoryId = await category();
    const lesson = await lecture('الحلقات');
    // ٦ أسئلة: ٤ لوحدهم، وصيغتين لنفس الفكرة.
    const singles = await Promise.all([1, 2, 3, 4].map((n) => question(categoryId, { lessonId: lesson, stem: `سؤال ${n}` })));
    const variantA = await question(categoryId, { lessonId: lesson, group: 'loops-1', stem: 'صيغة أ' });
    const variantB = await question(categoryId, { lessonId: lesson, group: 'loops-1', stem: 'صيغة ب' });
    const detail = await topics.create(fixture.courseId, { title: 'الحلقات', sectionIds: [], lessonIds: [lesson], isActive: true });
    const topicIds = [detail.topics[0]!.id];

    /** جولة «تدريب» (١٠ أسئلة) وكل سؤال فيها اتجاوب — يعني اتشاف. */
    const play = async () => {
      const round = await game.start(fixture.studentId, {
        mode: 'race',
        level: 'medium',
        scope: 'all',
        courseId: fixture.courseId,
        topicIds,
        practice: true,
      });
      for (const q of round.questions) {
        await game.answer(fixture.studentId, { questionId: q.id, optionId: null, sessionId: round.sessionId! });
      }
      return round.questions.map((q) => q.id);
    };

    const first = await play();
    // المجموعة بتدخل الجولة مرة واحدة: ٤ لوحدهم + صيغة واحدة.
    expect(first).toHaveLength(5);
    const firstVariant = first.find((id) => id === variantA.versionId || id === variantB.versionId)!;
    expect(firstVariant).toBeDefined();
    expect(first.filter((id) => id === variantA.versionId || id === variantB.versionId)).toHaveLength(1);
    expect(singles.every((single) => first.includes(single.versionId))).toBe(true);

    // الجولة التانية: البنك خلص، فبيرجع من الأقدم — والمجموعة بتيجي بالصيغة التانية.
    const second = await play();
    const secondVariant = second.find((id) => id === variantA.versionId || id === variantB.versionId);
    expect(secondVariant).toBeDefined();
    expect(secondVariant).not.toBe(firstVariant);

    const exposures = await prisma.questionExposure.findMany({ where: { userId: fixture.studentId } });
    // ٦ أسئلة (e:) + مجموعة واحدة (g:)، والمجموعة اتشافت مرتين.
    expect(exposures).toHaveLength(7);
    expect(exposures.find((row) => row.groupKey === 'g:loops-1')?.times).toBe(2);
  });

  it('feeds each lecture from the book lesson in the same place — and a lecture added later finds its own', async () => {
    fixture = await seedQuizFixture(prisma, {});
    await grant(fixture.studentId);
    const lectureA = await lecture('الدرس الاول');
    // فيديو حلول وسط الوحدة — لو اتعدّ، الدرس التاني كان هياخد أسئلة درس الكتاب التالت.
    await lecture('حل تقيم الاسبوع الاول');
    const lectureB = await lecture('الدرس الثاني');

    const book = await prisma.externalBook.create({ data: { title: 'كتاب', courseId: fixture.courseId } });
    const root = await prisma.questionCategory.create({ data: { name: 'كتاب', externalBookId: book.id } });
    const unit = await prisma.questionCategory.create({ data: { name: 'الوحدة ١', parentId: root.id } });
    const lessons = await Promise.all(
      [0, 1, 2].map((sortOrder) => prisma.questionCategory.create({ data: { name: `درس ${sortOrder + 1}`, parentId: unit.id, sortOrder } })),
    );
    cleanups.push(async () => {
      await prisma.questionBankEntry.deleteMany({ where: { categoryId: { in: lessons.map((lesson) => lesson.id) } } });
      await prisma.questionCategory.deleteMany({ where: { id: { in: lessons.map((lesson) => lesson.id) } } });
      await prisma.questionCategory.delete({ where: { id: unit.id } });
      await prisma.questionCategory.delete({ where: { id: root.id } });
      await prisma.externalBook.delete({ where: { id: book.id } });
    });
    const [first, second, third] = await Promise.all(lessons.map((lesson) => question(lesson.id)));

    const onA = await topics.create(fixture.courseId, { title: 'أ', sectionIds: [], lessonIds: [lectureA], isActive: true });
    const onB = await topics.create(fixture.courseId, { title: 'ب', sectionIds: [], lessonIds: [lectureB], isActive: true });
    expect(onB.topics.map((topic) => topic.ready.total)).toEqual([1, 1]);

    const start = (title: string) =>
      game.hub(fixture.studentId).then((hub) => {
        const topic = hub.courses.find((entry) => entry.id === fixture.courseId)!.topics.find((entry) => entry.title === title)!;
        return game.start(fixture.studentId, { mode: 'race', level: 'medium', scope: 'all', courseId: fixture.courseId, topicIds: [topic.id] });
      });
    expect((await start('أ')).questions.map((q) => q.id)).toEqual([first!.versionId]);
    expect((await start('ب')).questions.map((q) => q.id)).toEqual([second!.versionId]);

    // المحاضرة التالتة لسه ماتضافتش — أسئلة درس الكتاب التالت مستنياها، وأول
    // ما تتضاف بتلاقيها من غير ما حد يلمس البنك.
    const lectureC = await lecture('الدرس الثالث');
    const onC = await topics.create(fixture.courseId, { title: 'ج', sectionIds: [], lessonIds: [lectureC], isActive: true });
    expect(onC.topics.find((topic) => topic.title === 'ج')!.ready.total).toBe(1);
    expect((await start('ج')).questions.map((q) => q.id)).toEqual([third!.versionId]);
    expect(onA.topics).toHaveLength(1);
  });

  it('refuses the foundation course and a topic with nothing in it', async () => {
    fixture = await seedQuizFixture(prisma, {});
    const sectionId = await courseSectionId();
    await expect(
      topics.create(fixture.courseId, { title: 'فاضي', sectionIds: [], lessonIds: ['01990000-0000-7000-8000-00000000abcd'], isActive: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await prisma.course.update({ where: { id: fixture.courseId }, data: { title: 'الكورس التأسيسي' } });
    await expect(
      topics.create(fixture.courseId, { title: 'الوحدة', sectionIds: [sectionId], lessonIds: [], isActive: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect((await topics.detail(fixture.courseId)).foundation).toBe(true);
  });

  it('edits, reorders and deletes, keeping only units and lessons of the course', async () => {
    fixture = await seedQuizFixture(prisma, {});
    const sectionId = await courseSectionId();
    const a = await topics.create(fixture.courseId, { title: 'أ', sectionIds: [sectionId], lessonIds: [], isActive: true });
    const b = await topics.create(fixture.courseId, { title: 'ب', sectionIds: [], lessonIds: [fixture.lessonId], isActive: true });
    const [idA, idB] = [a.topics[0]!.id, b.topics[1]!.id];

    const edited = await topics.update(fixture.courseId, idA, {
      title: 'أ الجديدة',
      isActive: false,
      lessonIds: [fixture.lessonId, '01990000-0000-7000-8000-00000000abcd'],
    });
    const row = edited.topics.find((topic) => topic.id === idA)!;
    expect(row).toMatchObject({ title: 'أ الجديدة', isActive: false, sectionIds: [sectionId], lessonIds: [fixture.lessonId] });

    const reordered = await topics.reorder(fixture.courseId, [idB, idA]);
    expect(reordered.topics.map((topic) => topic.id)).toEqual([idB, idA]);

    const removed = await topics.remove(fixture.courseId, idB);
    expect(removed.topics.map((topic) => topic.id)).toEqual([idA]);
  });

  it('imports a paste straight into a lesson, with explanations and variant groups, and drafts stay drafts', async () => {
    fixture = await seedQuizFixture(prisma, { questionCount: 0 });
    await grant(fixture.studentId);
    const categoryId = await category();
    const lesson = await lecture('الاستيراد');
    const text = [
      'س١: range(3) بتطلّع كام رقم؟\nA. 2\nB. 3\nANSWER: B\nEXPLANATION: 0 و1 و2.\nGROUP: range-1',
      'س٢: كام رقم في range(3)؟\nA. 3\nB. 4\nANSWER: A\nالشرح: تلاتة.\nالمجموعة: range-1',
    ].join('\n\n');

    expect(await bank.bulkImport(text, categoryId, fixture.adminId, { lessonId: lesson, status: 'draft' })).toEqual({ created: 2, errors: [] });
    const entries = await prisma.questionBankEntry.findMany({
      where: { categoryId },
      select: { lessonId: true, variantGroupKey: true, versions: { select: { status: true, generalFeedbackHtml: true } } },
    });
    expect(entries.map((entry) => [entry.lessonId, entry.variantGroupKey, entry.versions[0]!.status])).toEqual([
      [lesson, 'range-1', 'draft'],
      [lesson, 'range-1', 'draft'],
    ]);
    expect(entries.map((entry) => entry.versions[0]!.generalFeedbackHtml).sort()).toEqual(['<p>0 و1 و2.</p>', '<p>تلاتة.</p>']);

    // المسودات مابتوصلش التحدّي.
    const detail = await topics.create(fixture.courseId, { title: 'الاستيراد', sectionIds: [], lessonIds: [lesson], isActive: true });
    expect(detail.topics[0]!.ready.total).toBe(0);

    // نفس اللصق «جاهز» — بيدخل على طول.
    await bank.bulkImport(text, categoryId, fixture.adminId, { lessonId: lesson });
    expect((await topics.detail(fixture.courseId)).topics[0]!.ready.total).toBe(2);

    // درس مش موجود في سطر `LESSON:` = خطأ على البلوك، ومفيش حاجة بتتكتب.
    const stale = await bank.bulkImport(
      'س\nA. x\nB. y\nANSWER: A\nLESSON: 01990000-0000-7000-8000-00000000abcd',
      categoryId,
      fixture.adminId,
    );
    expect(stale.created).toBe(0);
    expect(stale.errors.map((error) => error.blockIndex)).toEqual([1]);
  });
});
