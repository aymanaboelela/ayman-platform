import 'dotenv/config';
import { AuditService } from '../../audit/audit.service';
import { randomUUID } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import type { QuestionInput } from '@ayman/contracts/quiz/question';
import { DEFAULT_REVIEW_OPTIONS, QuizSettingsSchema } from '@ayman/contracts/quiz/quiz-settings';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { QuestionBankService } from './question-bank.service';
import { QuizBuilderService } from './quiz-builder.service';

describe('QuizBuilderService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    log: [{ emit: 'event', level: 'query' }],
  }) as unknown as PrismaService;
  const service = new QuizBuilderService(prisma, new AuditService(prisma));
  const bank = new QuestionBankService(prisma, new AuditService(prisma));

  let adminId: string;
  let courseId: string;
  let categoryId: string;
  const entries: string[] = [];
  const extraLessonIds: string[] = [];
  const extraQuizIds: string[] = [];
  const extraCategoryIds: string[] = [];

  function defaultSettings() {
    return QuizSettingsSchema.parse({ reviewOptions: DEFAULT_REVIEW_OPTIONS });
  }

  async function createReadyQuestion(overrides: { categoryId?: string } = {}): Promise<string> {
    const input = {
      type: 'mcq_single',
      categoryId: overrides.categoryId ?? categoryId,
      stemHtml: `<p>سؤال ${randomUUID()}</p>`,
      defaultMark: 1,
      settings: { shuffleOptions: false, caseSensitive: false },
      options: [
        { bodyHtml: '<p>أ</p>', fraction: 1 },
        { bodyHtml: '<p>ب</p>', fraction: 0 },
      ],
    } as QuestionInput;
    const created = await bank.create(input, adminId);
    await bank.publish(created.versionId);
    return created.bankEntryId;
  }

  /** A fresh lesson (and, if requested, N ready questions) — every test gets
   *  its own lesson so quiz creation never collides across tests. */
  async function createLesson(): Promise<string> {
    const section = await prisma.courseSection.create({
      data: { courseId, title: 'وحدة', position: extraLessonIds.length + 1, isPublished: true },
    });
    const lesson = await prisma.lesson.create({
      data: {
        courseId,
        sectionId: section.id,
        title: 'اختبار',
        kind: 'quiz',
        position: 0,
        isPublished: true,
      },
    });
    extraLessonIds.push(lesson.id);
    return lesson.id;
  }

  async function seedSlots(count: number): Promise<string> {
    const quizId = await service.upsertForLesson(await createLesson(), defaultSettings());
    extraQuizIds.push(quizId);
    for (let i = 0; i < count; i += 1) {
      const bankEntryId = await createReadyQuestion();
      entries.push(bankEntryId);
      await service.addSlot(quizId, { bankEntryId, maxMark: 1 });
    }
    return quizId;
  }

  beforeAll(async () => {
    await prisma.$connect();
    adminId = randomUUID();
    await prisma.user.create({
      data: { id: adminId, name: 'Admin', email: `${adminId}@example.test`, role: 'admin' },
    });
    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    const course = await prisma.course.create({
      data: {
        slug: `quiz-builder-${randomUUID()}`,
        title: 'كورس',
        status: 'published',
        publishedAt: new Date(),
        systemId: system.id,
        year: 2,
        subjectId: subject.id,
        instructorId: adminId,
      },
    });
    courseId = course.id;
    categoryId = (await prisma.questionCategory.create({ data: { name: `builder-${randomUUID()}` } })).id;
  });

  afterAll(async () => {
    await prisma.quizSlot.deleteMany({ where: { quizId: { in: extraQuizIds } } });
    await prisma.quizPool.deleteMany({ where: { quizId: { in: extraQuizIds } } });
    await prisma.quiz.deleteMany({ where: { id: { in: extraQuizIds } } });
    await prisma.questionBankEntry.deleteMany({ where: { id: { in: entries } } });
    await prisma.questionCategory.delete({ where: { id: categoryId } });
    await prisma.questionCategory.deleteMany({ where: { id: { in: extraCategoryIds } } });
    await prisma.lesson.deleteMany({ where: { id: { in: extraLessonIds } } });
    await prisma.courseSection.deleteMany({ where: { courseId } });
    await prisma.course.delete({ where: { id: courseId } });
    await prisma.user.delete({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it('creates a quiz for a lesson that offers exactly one sitting', async () => {
    const quizId = await service.upsertForLesson(await createLesson(), defaultSettings());
    extraQuizIds.push(quizId);
    const quiz = await prisma.quiz.findUniqueOrThrow({ where: { id: quizId } });
    // The default matters more than it looks: its predecessor defaulted to
    // unlimited attempts with answers revealed mid-attempt, so a quiz built by
    // clicking straight through the form was one a student could sit forever.
    expect(quiz.allowsImprovement).toBe(false);
    expect(quiz.graceSeconds).toBe(60);
  });

  it('is idempotent per lesson — a second upsert updates instead of duplicating', async () => {
    const freshLessonId = await createLesson();
    const first = await service.upsertForLesson(freshLessonId, defaultSettings());
    extraQuizIds.push(first);
    const second = await service.upsertForLesson(freshLessonId, {
      ...defaultSettings(),
      passPercent: 55,
    });
    expect(second).toBe(first);
    expect(
      Number((await prisma.quiz.findUniqueOrThrow({ where: { id: first } })).passPercent),
    ).toBe(55);
    expect(await prisma.quiz.count({ where: { lessonId: freshLessonId } })).toBe(1);
  });

  it('recomputes sumMarks on every slot write', async () => {
    const quizId = await service.upsertForLesson(await createLesson(), defaultSettings());
    extraQuizIds.push(quizId);
    const entryA = await createReadyQuestion();
    const entryB = await createReadyQuestion();
    entries.push(entryA, entryB);

    await service.addSlot(quizId, { bankEntryId: entryA, maxMark: 2 });
    await service.addSlot(quizId, { bankEntryId: entryB, maxMark: 3 });
    expect(Number((await prisma.quiz.findUniqueOrThrow({ where: { id: quizId } })).sumMarks)).toBe(5);

    const slots = await prisma.quizSlot.findMany({ where: { quizId }, orderBy: { position: 'asc' } });
    await service.removeSlot(quizId, slots[0]!.id);
    expect(Number((await prisma.quiz.findUniqueOrThrow({ where: { id: quizId } })).sumMarks)).toBe(3);
  });

  it('closes the position gap left by a removed slot', async () => {
    const quizId = await seedSlots(3);
    const slots = await prisma.quizSlot.findMany({ where: { quizId }, orderBy: { position: 'asc' } });
    await service.removeSlot(quizId, slots[1]!.id);

    const after = await prisma.quizSlot.findMany({ where: { quizId }, orderBy: { position: 'asc' } });
    expect(after.map((slot) => slot.position)).toEqual([0, 1]);
    expect(after.map((slot) => slot.id)).toEqual([slots[0]!.id, slots[2]!.id]);
  });

  // Spec §5.4: reordering 40 lessons is ONE debounced write, not 40.
  it('reorders 40 slots in a single UPDATE round trip', async () => {
    const quizId = await seedSlots(40);
    const slots = await prisma.quizSlot.findMany({ where: { quizId }, orderBy: { position: 'asc' } });
    const reversed = [...slots].reverse().map((slot) => slot.id);

    const queries: string[] = [];
    const listener = (event: { query: string }) => queries.push(event.query);
    prisma.$on('query', listener);
    await service.reorderSlots(quizId, reversed);

    const updates = queries.filter((query) => query.startsWith('UPDATE'));
    expect(updates.length).toBeLessThanOrEqual(2); // the single VALUES-based UPDATE

    const after = await prisma.quizSlot.findMany({ where: { quizId }, orderBy: { position: 'asc' } });
    expect(after.map((slot) => slot.id)).toEqual(reversed);
    expect(after.map((slot) => slot.position)).toEqual([...Array(40).keys()]);
  }, 15_000);

  it('rejects a reorder that does not name every slot exactly once', async () => {
    const quizId = await seedSlots(3);
    const slots = await prisma.quizSlot.findMany({ where: { quizId } });
    await expect(
      service.reorderSlots(quizId, [slots[0]!.id, slots[0]!.id, slots[1]!.id]),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.reorderSlots(quizId, [slots[0]!.id])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a reorder naming a slot from another quiz', async () => {
    const quizA = await seedSlots(2);
    const quizB = await seedSlots(2);
    const slotsA = await prisma.quizSlot.findMany({ where: { quizId: quizA } });
    const slotsB = await prisma.quizSlot.findMany({ where: { quizId: quizB } });
    await expect(
      service.reorderSlots(quizA, [slotsB[0]!.id, slotsA[1]!.id]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to publish a quiz with no slots', async () => {
    const quizId = await service.upsertForLesson(await createLesson(), defaultSettings());
    extraQuizIds.push(quizId);
    await expect(service.publish(quizId)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to publish a quiz whose slot points at a question with no ready version', async () => {
    const quizId = await service.upsertForLesson(await createLesson(), defaultSettings());
    extraQuizIds.push(quizId);
    // A draft-only question: created but never published.
    const draft = await bank.create(
      {
        type: 'mcq_single',
        categoryId,
        stemHtml: '<p>مسودة</p>',
        defaultMark: 1,
        settings: { shuffleOptions: false, caseSensitive: false },
        options: [
          { bodyHtml: '<p>أ</p>', fraction: 1 },
          { bodyHtml: '<p>ب</p>', fraction: 0 },
        ],
      } as QuestionInput,
      adminId,
    );
    entries.push(draft.bankEntryId);
    await service.addSlot(quizId, { bankEntryId: draft.bankEntryId, maxMark: 1 });
    await expect(service.publish(quizId)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to publish a pool that cannot fill its pickCount', async () => {
    const quizId = await service.upsertForLesson(await createLesson(), defaultSettings());
    extraQuizIds.push(quizId);
    const smallCategoryId = (
      await prisma.questionCategory.create({ data: { name: `small-${randomUUID()}` } })
    ).id;
    extraCategoryIds.push(smallCategoryId);
    for (let i = 0; i < 3; i += 1) {
      const entry = await createReadyQuestion({ categoryId: smallCategoryId });
      entries.push(entry);
    }
    await service.addPool(quizId, {
      name: 'كبيرة',
      pickCount: 10,
      pointsPerQuestion: 1,
      sourceFilter: { categoryIds: [smallCategoryId] },
    });
    await expect(service.publish(quizId)).rejects.toThrow(/pool/i);
  });

  it('leaves in-flight attempts alone when settings change', async () => {
    // The Q3 regression guard, stated from the builder side: upsertForLesson
    // never touches quiz_attempts, so an in-flight attempt's persisted
    // deadlineAt survives a settings save untouched.
    const quizId = await service.upsertForLesson(await createLesson(), {
      ...defaultSettings(),
      durationSeconds: 600,
    });
    extraQuizIds.push(quizId);
    const bankEntryId = await createReadyQuestion();
    entries.push(bankEntryId);
    await service.addSlot(quizId, { bankEntryId, maxMark: 1 });
    await service.publish(quizId);

    const student = randomUUID();
    await prisma.user.create({
      data: { id: student, name: 'Student', email: `${student}@example.test`, role: 'student' },
    });
    await prisma.enrollment.create({ data: { userId: student, courseId } });
    const startedAt = new Date();
    const deadlineAt = new Date(startedAt.getTime() + 600_000);
    // B7: sumMarks/gradeOutOf/passPercent are snapshotted at start() now — a
    // direct create() bypassing that flow supplies them itself, from the
    // just-published quiz this attempt belongs to.
    const publishedQuiz = await prisma.quiz.findUniqueOrThrow({ where: { id: quizId } });
    const attempt = await prisma.quizAttempt.create({
      data: {
        quizId,
        userId: student,
        attemptNo: 1,
        startedAt,
        deadlineAt,
        sumMarks: publishedQuiz.sumMarks,
        gradeOutOf: publishedQuiz.gradeOutOf,
        passPercent: publishedQuiz.passPercent,
      },
    });

    await service.upsertForLesson(
      (await prisma.quiz.findUniqueOrThrow({ where: { id: quizId } })).lessonId,
      { ...defaultSettings(), durationSeconds: 60 },
    );

    const after = await prisma.quizAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.deadlineAt!.getTime()).toBe(deadlineAt.getTime());

    await prisma.quizAttempt.delete({ where: { id: attempt.id } });
    await prisma.enrollment.deleteMany({ where: { userId: student } });
    await prisma.user.delete({ where: { id: student } });
  });

  it('findByLesson answers null for a lesson with no quiz yet, and the id once one exists', async () => {
    const lessonId = await createLesson();
    expect(await service.findByLesson(lessonId)).toBeNull();

    const quizId = await service.upsertForLesson(lessonId, defaultSettings());
    extraQuizIds.push(quizId);
    expect(await service.findByLesson(lessonId)).toEqual({ id: quizId });
  });

  it('getForEdit hydrates settings and every slot with a question label, never the answer columns', async () => {
    const quizId = await service.upsertForLesson(await createLesson(), defaultSettings());
    extraQuizIds.push(quizId);
    const bankEntryId = await createReadyQuestion();
    entries.push(bankEntryId);
    await service.addSlot(quizId, { bankEntryId, maxMark: 2 });

    const hydrated = await service.getForEdit(quizId);
    expect(hydrated.settings.allowsImprovement).toBe(false);
    expect(hydrated.sumMarks).toBe(2);
    expect(hydrated.improvementSumMarks).toBe(0);
    expect(hydrated.slots).toHaveLength(1);
    expect(hydrated.slots[0]).toMatchObject({
      maxMark: 2,
      kind: 'question',
      type: 'mcq_single',
      paper: 'original',
      // The builder's row opens the question in place, and the bank's editor
      // is keyed on the entry. This was SELECTed and then dropped from the
      // response for as long as the endpoint existed.
      bankEntryId,
    });
    expect(hydrated.slots[0]).not.toHaveProperty('fraction');
  });

  it('a pool slot hydrates with a null bankEntryId, because it points at no one question', async () => {
    const quizId = await service.upsertForLesson(await createLesson(), defaultSettings());
    extraQuizIds.push(quizId);
    await service.addPool(quizId, {
      name: 'مجموعة',
      pickCount: 1,
      pointsPerQuestion: 2,
      sourceFilter: {},
    });

    const hydrated = await service.getForEdit(quizId);
    expect(hydrated.slots[0]).toMatchObject({ kind: 'pool', bankEntryId: null });
  });

  describe('setSlotMark', () => {
    it('rewrites the slot mark and the quiz total with it', async () => {
      const quizId = await service.upsertForLesson(await createLesson(), defaultSettings());
      extraQuizIds.push(quizId);
      const entryA = await createReadyQuestion();
      const entryB = await createReadyQuestion();
      entries.push(entryA, entryB);
      await service.addSlot(quizId, { bankEntryId: entryA, maxMark: 2 });
      await service.addSlot(quizId, { bankEntryId: entryB, maxMark: 3 });

      const slots = await prisma.quizSlot.findMany({ where: { quizId }, orderBy: { position: 'asc' } });
      await service.setSlotMark(quizId, slots[0]!.id, 7);

      expect(Number((await prisma.quizSlot.findUniqueOrThrow({ where: { id: slots[0]!.id } })).maxMark)).toBe(7);
      // 7 + 3, not 7 — a mark write that forgets the total leaves the exam
      // scored out of a number nothing on the page agrees with.
      expect(Number((await prisma.quiz.findUniqueOrThrow({ where: { id: quizId } })).sumMarks)).toBe(10);
    });

    it('totals the slot OWN paper, leaving the other one alone', async () => {
      const quizId = await service.upsertForLesson(
        await createLesson(),
        { ...defaultSettings(), allowsImprovement: true },
      );
      extraQuizIds.push(quizId);
      const original = await createReadyQuestion();
      const improvement = await createReadyQuestion();
      entries.push(original, improvement);
      await service.addSlot(quizId, { bankEntryId: original, maxMark: 2, paper: 'original' });
      await service.addSlot(quizId, { bankEntryId: improvement, maxMark: 3, paper: 'improvement' });

      const slot = await prisma.quizSlot.findFirstOrThrow({ where: { quizId, paper: 'improvement' } });
      await service.setSlotMark(quizId, slot.id, 9);

      const quiz = await prisma.quiz.findUniqueOrThrow({ where: { id: quizId } });
      expect(Number(quiz.improvementSumMarks)).toBe(9);
      expect(Number(quiz.sumMarks)).toBe(2);
    });

    it('refuses a slot that belongs to another quiz', async () => {
      const mine = await service.upsertForLesson(await createLesson(), defaultSettings());
      const theirs = await service.upsertForLesson(await createLesson(), defaultSettings());
      extraQuizIds.push(mine, theirs);
      const entry = await createReadyQuestion();
      entries.push(entry);
      await service.addSlot(theirs, { bankEntryId: entry, maxMark: 2 });

      const slot = await prisma.quizSlot.findFirstOrThrow({ where: { quizId: theirs } });
      await expect(service.setSlotMark(mine, slot.id, 5)).rejects.toThrow(NotFoundException);
      // And the mark it refused to move has not moved.
      expect(Number((await prisma.quizSlot.findUniqueOrThrow({ where: { id: slot.id } })).maxMark)).toBe(2);
    });
  });
});
