import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

// Integration test against the real local database. The point of these
// constraints is that they hold even when a service forgets — so testing them
// through a mock would test nothing at all.
describe('question bank schema constraints', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  // Test-teardown-only connection, as the migration-owner role.
  // `attempt_events` is unconditionally append-only — the BEFORE DELETE
  // trigger fires for EVERY delete, including one cascaded from a distant
  // ancestor (course -> lesson -> quiz -> attempt -> event), for any role,
  // ayman_runtime included. That is the exact property under test; a
  // production code path must never work around it. For test cleanup only,
  // the owner role (which also holds the DML rights ayman_runtime had
  // REVOKEd) briefly disables the trigger, deletes the fixtures, then
  // re-enables it — ayman_runtime never gets this power, so the production
  // guarantee is untouched.
  const owner = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DIRECT_DATABASE_URL }),
  });

  let userId: string;
  let categoryId: string;
  let courseId: string;
  const entryIds: string[] = [];
  const quizIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    await owner.$connect();
    userId = randomUUID();
    await prisma.user.create({
      data: { id: userId, name: 'Bank Owner', email: `${userId}@example.test`, role: 'admin' },
    });
    const category = await prisma.questionCategory.create({ data: { name: `cat-${userId}` } });
    categoryId = category.id;

    // Smallest legal course → section → lesson chain, so a Quiz (1:1 with
    // Lesson, from Plan 3) has something real to attach to.
    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    const course = await prisma.course.create({
      data: {
        slug: `quiz-schema-${userId}`,
        title: 'كورس',
        status: 'published',
        publishedAt: new Date(),
        systemId: system.id,
        year: 2,
        subjectId: subject.id,
        instructorId: userId,
      },
    });
    courseId = course.id;
  });

  afterAll(async () => {
    // See the `owner` client's comment above: attempt_events must be briefly
    // unlocked, as the owner role, for this cascade to run at all.
    //
    // `pg_advisory_xact_lock` serialises this disable→delete→enable critical
    // section against `quiz-fixtures.ts`'s `cleanup()`, which does the
    // identical dance on the same shared dev database from a different Jest
    // worker process. Without it, two workers can interleave "disable,
    // delete, ENABLE (worker A), delete (worker B, now against a
    // re-enabled trigger)" and fail with "attempt_events is append-only".
    // Scoping to a transaction means the lock — and the disable itself,
    // since ALTER TABLE is transactional DDL — releases automatically even if
    // a delete throws, rather than a manual try/finally risking a permanently
    // disabled trigger on an unexpected crash.
    await owner.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ayman:quiz:attempt_events_trigger'))`;
      await tx.$executeRaw`ALTER TABLE "app"."attempt_events" DISABLE TRIGGER "attempt_events_append_only"`;
      await tx.quizSlot.deleteMany({ where: { quizId: { in: quizIds } } });
      await tx.quizPool.deleteMany({ where: { quizId: { in: quizIds } } });
      await tx.quiz.deleteMany({ where: { id: { in: quizIds } } });
      await tx.questionBankEntry.deleteMany({ where: { id: { in: entryIds } } });
      await tx.questionCategory.delete({ where: { id: categoryId } });
      await tx.course.delete({ where: { id: courseId } });
      await tx.user.delete({ where: { id: userId } });
      await tx.$executeRaw`ALTER TABLE "app"."attempt_events" ENABLE TRIGGER "attempt_events_append_only"`;
    });
    await prisma.$disconnect();
    await owner.$disconnect();
  });

  async function createEntry() {
    const entry = await prisma.questionBankEntry.create({ data: { categoryId, ownerId: userId } });
    entryIds.push(entry.id);
    return entry;
  }

  let nextSectionPosition = 1;

  async function createQuiz() {
    const position = nextSectionPosition++;
    const section = await prisma.courseSection.create({
      data: { courseId, title: 'الوحدة', position, isPublished: true },
    });
    const lesson = await prisma.lesson.create({
      data: {
        courseId,
        sectionId: section.id,
        title: 'اختبار',
        kind: 'text',
        position: 1,
        isPublished: true,
        text: { create: { bodyHtml: '<p>محتوى</p>' } },
      },
    });
    const quiz = await prisma.quiz.create({
      data: { lessonId: lesson.id, reviewOptions: {} },
    });
    quizIds.push(quiz.id);
    return quiz;
  }

  // NOTE: a version is always created in `draft` — its nested options insert
  // as a SEPARATE statement, within the same transaction, AFTER the parent
  // row. Creating the parent directly as `ready` in the same nested write
  // would make the freeze trigger see the parent already `ready` by the time
  // the option rows insert, and reject its own child rows. This mirrors
  // exactly how the real service works (Task 7): create() always writes
  // `draft`, and a later, separate publish() flips the status once the
  // options already exist.
  async function createVersion(status: 'draft' | 'ready') {
    const entry = await prisma.questionBankEntry.create({ data: { categoryId, ownerId: userId } });
    entryIds.push(entry.id);
    const version = await prisma.questionVersion.create({
      data: {
        bankEntryId: entry.id,
        version: 1,
        status: 'draft',
        type: 'mcq_single',
        stemHtml: '<p>س</p>',
        createdBy: userId,
        options: {
          create: [
            { bodyHtml: '<p>أ</p>', fraction: 1, position: 0 },
            { bodyHtml: '<p>ب</p>', fraction: 0, position: 1 },
          ],
        },
      },
    });
    if (status === 'draft') return version;
    return prisma.questionVersion.update({ where: { id: version.id }, data: { status: 'ready' } });
  }

  async function createAttemptFixture() {
    const version = await createVersion('ready');
    const quiz = await createQuiz();
    const attempt = await prisma.quizAttempt.create({
      data: { quizId: quiz.id, userId, attemptNo: 1 },
    });
    const attemptQuestion = await prisma.attemptQuestion.create({
      data: {
        attemptId: attempt.id,
        slotPosition: 0,
        questionVersionId: version.id,
        optionOrder: [0, 1],
        maxMark: 1,
        minFraction: 0,
        maxFraction: 1,
      },
    });
    return { attempt, attemptQuestion };
  }

  it('rejects a fraction above 1', async () => {
    const version = await createVersion('draft');
    await expect(
      prisma.questionOption.create({
        data: { questionVersionId: version.id, bodyHtml: '<p>ج</p>', fraction: 1.5, position: 2 },
      }),
    ).rejects.toThrow(/question_options_fraction_range/);
  });

  it('accepts a NEGATIVE fraction — negative marking is a supported feature, not a bug', async () => {
    const version = await createVersion('draft');
    const option = await prisma.questionOption.create({
      data: { questionVersionId: version.id, bodyHtml: '<p>ج</p>', fraction: -0.25, position: 2 },
    });
    expect(Number(option.fraction)).toBe(-0.25);
  });

  it('freezes the stem of a ready version', async () => {
    const version = await createVersion('ready');
    await expect(
      prisma.questionVersion.update({
        where: { id: version.id },
        data: { stemHtml: '<p>edited</p>' },
      }),
    ).rejects.toThrow(/immutable/);
  });

  it('still allows ready -> hidden, so a question can be retired', async () => {
    const version = await createVersion('ready');
    const hidden = await prisma.questionVersion.update({
      where: { id: version.id },
      data: { status: 'hidden' },
    });
    expect(hidden.status).toBe('hidden');
  });

  it('freezes the OPTIONS of a ready version — this is what protects option_order snapshots', async () => {
    const version = await createVersion('ready');
    await expect(
      prisma.questionOption.create({
        data: { questionVersionId: version.id, bodyHtml: '<p>د</p>', fraction: 0, position: 9 },
      }),
    ).rejects.toThrow(/immutable/);
    const existing = await prisma.questionOption.findFirst({
      where: { questionVersionId: version.id },
    });
    await expect(
      prisma.questionOption.delete({ where: { id: existing!.id } }),
    ).rejects.toThrow(/immutable/);
  });

  it('has no is_correct column anywhere — fraction is the only scoring primitive', async () => {
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'app' AND column_name IN ('is_correct', 'iscorrect', 'correct')
    `;
    expect(columns).toEqual([]);
  });

  it('rejects a slot that points at both a bank entry and a pool', async () => {
    const quiz = await createQuiz();
    const pool = await prisma.quizPool.create({
      data: { quizId: quiz.id, name: 'p', pickCount: 1, pointsPerQuestion: 1, sourceFilter: {} },
    });
    const entry = await createEntry();
    await expect(
      prisma.quizSlot.create({
        data: { quizId: quiz.id, position: 0, maxMark: 1, bankEntryId: entry.id, poolId: pool.id },
      }),
    ).rejects.toThrow(/quiz_slots_source_exactly_one/);
  });

  it('rejects a slot that points at neither', async () => {
    const quiz = await createQuiz();
    await expect(
      prisma.quizSlot.create({ data: { quizId: quiz.id, position: 0, maxMark: 1 } }),
    ).rejects.toThrow(/quiz_slots_source_exactly_one/);
  });

  it('allows a full reorder in ONE statement because the position unique is deferrable', async () => {
    const quiz = await createQuiz();
    const entries = await Promise.all([0, 1, 2].map(() => createEntry()));
    const slots = await Promise.all(
      entries.map((entry, index) =>
        prisma.quizSlot.create({
          data: { quizId: quiz.id, position: index, maxMark: 1, bankEntryId: entry.id },
        }),
      ),
    );

    // Rotate every position by one in a single transaction. With a
    // non-deferrable unique this throws on the first row.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET CONSTRAINTS "app"."quiz_slots_quiz_id_position_key" DEFERRED`;
      for (const [index, slot] of slots.entries()) {
        await tx.quizSlot.update({
          where: { id: slot.id },
          data: { position: (index + 1) % slots.length },
        });
      }
    });

    const after = await prisma.quizSlot.findMany({
      where: { quizId: quiz.id },
      orderBy: { position: 'asc' },
      select: { id: true, position: true },
    });
    expect(after.map((s) => s.position)).toEqual([0, 1, 2]);
    expect(after[0]!.id).toBe(slots[2]!.id);
  });

  it('refuses to update or delete an attempt event', async () => {
    const { attempt } = await createAttemptFixture();
    await prisma.attemptEvent.create({
      data: { attemptId: attempt.id, seq: 1, kind: 'attempt_started', payload: {} },
    });
    await expect(
      prisma.attemptEvent.updateMany({ where: { attemptId: attempt.id }, data: { seq: 99 } }),
    ).rejects.toThrow(/append-only|permission denied/);
    await expect(
      prisma.attemptEvent.deleteMany({ where: { attemptId: attempt.id } }),
    ).rejects.toThrow(/append-only|permission denied/);
  });

  it('allows only one live appeal per question but any number of resolved ones', async () => {
    const { attemptQuestion } = await createAttemptFixture();
    await prisma.gradeAppeal.create({
      data: { attemptQuestionId: attemptQuestion.id, studentNote: 'ن', gradeBefore: 0 },
    });
    // Prisma translates a unique-index violation (P2002) into its own generic
    // "Unique constraint failed on the fields: (...)" message — the raw
    // Postgres message naming OUR partial index only survives in
    // `error.meta`, not `error.message`. Assert on both: the code proves it is
    // a uniqueness violation, and the serialized meta proves it is
    // specifically `grade_appeals_one_open_per_question`, not some unrelated
    // unique constraint.
    const duplicate = await prisma.gradeAppeal
      .create({ data: { attemptQuestionId: attemptQuestion.id, studentNote: 'ن٢', gradeBefore: 0 } })
      .catch((error: unknown) => error);
    expect(duplicate).toMatchObject({ code: 'P2002' });
    expect(JSON.stringify((duplicate as { meta: unknown }).meta)).toContain(
      'grade_appeals_one_open_per_question',
    );

    await prisma.gradeAppeal.updateMany({
      where: { attemptQuestionId: attemptQuestion.id },
      data: { status: 'rejected', resolvedAt: new Date() },
    });
    await expect(
      prisma.gradeAppeal.create({
        data: { attemptQuestionId: attemptQuestion.id, studentNote: 'ن٣', gradeBefore: 0 },
      }),
    ).resolves.toBeDefined();
  });
});
