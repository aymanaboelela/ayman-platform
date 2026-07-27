import { randomUUID } from 'node:crypto';
import { AuditService } from '../../../audit/audit.service';
import { PrismaPg } from '@prisma/adapter-pg';
import type { QuestionInput } from '@ayman/contracts/quiz/question';
import {
  DEFAULT_REVIEW_OPTIONS_GRADED,
  DEFAULT_REVIEW_OPTIONS_PRACTICE,
} from '@ayman/contracts/quiz/quiz-settings';
import { PrismaClient } from '../../../generated/prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { QuestionBankService } from '../question-bank.service';

export interface QuizFixture {
  studentId: string;
  otherStudentId: string;
  adminId: string;
  courseId: string;
  lessonId: string;
  quizId: string;
  categoryId: string;
  bankEntryIds: string[];
  versionIds: string[];
  cleanup: () => Promise<void>;
}

export interface QuizFixtureOverrides {
  /** How many mcq_single questions (4 options, index 0 correct). Default 3. */
  questionCount?: number;
  durationSeconds?: number | null;
  maxAttempts?: number;
  retryCooldownHours?: number;
  mode?: 'practice' | 'graded';
  shuffleOptions?: boolean;
  shuffleQuestions?: boolean;
  openFrom?: Date | null;
  openUntil?: Date | null;
  graceSeconds?: number;
  overdueHandling?: 'autosubmit' | 'graceperiod' | 'autoabandon';
  passPercent?: number;
  navMethod?: 'free' | 'sequential';
  /** Appended as one more essay question (needs_grading, pending_review). */
  includeEssay?: boolean;
  /**
   * Carried through to the correct option's feedback and the version's
   * general feedback, so the layer-3 contract test can assert on a value, not
   * just a key — a leak that renames the field still ships the string.
   */
  distinctiveFeedback?: string;
  /** Stashed on an unused `answerPattern` column as an extra leak surface. */
  distinctivePattern?: string;
}

/**
 * `questionCount` fixed questions, each mcq_single with 4 options where the
 * option at index 0 is the correct one (fraction 1). Deterministic so a test
 * can assert an exact score. Builds the smallest legal
 * course → section → lesson → quiz → slots chain plus a student (and a
 * second, `otherStudentId`, enrolled the same way so it can run its own
 * independent attempts) — every attempt spec uses this instead of repeating
 * that setup by hand.
 */
export async function seedQuizFixture(
  prisma: PrismaService,
  overrides: QuizFixtureOverrides = {},
): Promise<QuizFixture> {
  const questionCount = overrides.questionCount ?? 3;
  const mode = overrides.mode ?? 'graded';
  const bank = new QuestionBankService(prisma, new AuditService(prisma));

  const adminId = randomUUID();
  const studentId = randomUUID();
  const otherStudentId = randomUUID();

  await prisma.user.createMany({
    data: [
      { id: adminId, name: 'Admin', email: `${adminId}@example.test`, role: 'admin' },
      { id: studentId, name: 'Student', email: `${studentId}@example.test`, role: 'student' },
      {
        id: otherStudentId,
        name: 'Other Student',
        email: `${otherStudentId}@example.test`,
        role: 'student',
      },
    ],
  });

  const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
  const subject = await prisma.subject.findFirstOrThrow();

  const course = await prisma.course.create({
    data: {
      slug: `quiz-fixture-${randomUUID()}`,
      title: 'كورس الاختبار',
      status: 'published',
      publishedAt: new Date(),
      systemId: system.id,
      year: 2,
      subjectId: subject.id,
      instructorId: adminId,
    },
  });

  const section = await prisma.courseSection.create({
    data: { courseId: course.id, title: 'الوحدة', position: 0, isPublished: true },
  });

  const lesson = await prisma.lesson.create({
    data: {
      courseId: course.id,
      sectionId: section.id,
      title: 'اختبار',
      kind: 'quiz',
      position: 0,
      isPublished: true,
    },
  });

  await prisma.enrollment.createMany({
    data: [
      { userId: studentId, courseId: course.id },
      { userId: otherStudentId, courseId: course.id },
    ],
  });

  const category = await prisma.questionCategory.create({
    data: { name: `فئة-${randomUUID()}` },
  });

  const feedback = overrides.distinctiveFeedback ?? 'ملاحظة صحيحة';
  const bankEntryIds: string[] = [];
  const versionIds: string[] = [];

  for (let i = 0; i < questionCount; i += 1) {
    const input = {
      type: 'mcq_single',
      categoryId: category.id,
      stemHtml: `<p>سؤال ${i + 1}</p>`,
      defaultMark: 1,
      generalFeedbackHtml: `<p>${feedback}</p>`,
      settings: { shuffleOptions: true, caseSensitive: false },
      options: [
        { bodyHtml: '<p>أ (الصحيحة)</p>', fraction: 1, feedbackHtml: `<p>${feedback}</p>` },
        { bodyHtml: '<p>ب</p>', fraction: 0 },
        { bodyHtml: '<p>ج</p>', fraction: 0 },
        { bodyHtml: '<p>د</p>', fraction: 0 },
      ],
    } as QuestionInput;

    const created = await bank.create(input, adminId);

    // Stashed on an unused `answerPattern` column of the FIRST question,
    // WHILE it is still draft — a question_options row is frozen the moment
    // its parent version is `ready`, so this must land before `publish()`.
    if (i === 0 && overrides.distinctivePattern) {
      const draftVersion = await prisma.questionVersion.findFirstOrThrow({
        where: { id: created.versionId },
        select: { options: { orderBy: { position: 'asc' }, select: { id: true } } },
      });
      await prisma.questionOption.update({
        where: { id: draftVersion.options[0]!.id },
        data: { answerPattern: overrides.distinctivePattern },
      });
    }

    await bank.publish(created.versionId);
    bankEntryIds.push(created.bankEntryId);
    versionIds.push(created.versionId);
  }

  if (overrides.includeEssay) {
    const essayInput = {
      type: 'essay',
      categoryId: category.id,
      stemHtml: '<p>اكتب مقالاً قصيراً</p>',
      defaultMark: 1,
      settings: {},
      options: [],
    } as QuestionInput;
    const created = await bank.create(essayInput, adminId);
    await bank.publish(created.versionId);
    bankEntryIds.push(created.bankEntryId);
    versionIds.push(created.versionId);
  }

  const quiz = await prisma.quiz.create({
    data: {
      lessonId: lesson.id,
      mode,
      durationSeconds: overrides.durationSeconds ?? null,
      openFrom: overrides.openFrom ?? null,
      openUntil: overrides.openUntil ?? null,
      maxAttempts: overrides.maxAttempts ?? 0,
      retryCooldownHours: overrides.retryCooldownHours ?? 24,
      passPercent: overrides.passPercent ?? 70,
      shuffleQuestions: overrides.shuffleQuestions ?? false,
      shuffleOptions: overrides.shuffleOptions ?? true,
      overdueHandling: overrides.overdueHandling ?? 'autosubmit',
      graceSeconds: overrides.graceSeconds ?? 60,
      navMethod: overrides.navMethod ?? 'free',
      reviewOptions:
        mode === 'practice' ? DEFAULT_REVIEW_OPTIONS_PRACTICE : DEFAULT_REVIEW_OPTIONS_GRADED,
      sumMarks: bankEntryIds.length,
      gradeOutOf: 100,
      isPublished: true,
    },
  });

  for (const [index, bankEntryId] of bankEntryIds.entries()) {
    await prisma.quizSlot.create({
      data: { quizId: quiz.id, position: index, maxMark: 1, bankEntryId },
    });
  }

  async function cleanup(): Promise<void> {
    // `attempt_events` is append-only for EVERY role, enforced by a BEFORE
    // DELETE trigger that fires even on a cascade several tables away
    // (quiz_attempts -> attempt_events). Deleting the attempt tree therefore
    // needs the owner connection with the trigger briefly disabled — exactly
    // schema.spec.ts's pattern, scoped here so every attempt spec gets it for
    // free instead of repeating the dance.
    //
    // `pg_advisory_xact_lock` (NOT the session-level variant) serialises this
    // disable→delete→enable critical section against every OTHER test file
    // doing the identical dance (schema.spec.ts) — Jest runs suites in
    // separate worker processes by default, and two workers interleaving
    // "disable, disable(no-op), delete, ENABLE, delete" would re-enable the
    // trigger out from under the other worker's still-pending delete. Scoping
    // the lock to a transaction (rather than session lock/unlock, which could
    // land on different pooled connections) means it releases automatically
    // on commit OR on a thrown error, so a failed cleanup can never leave the
    // trigger permanently disabled.
    const owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DIRECT_DATABASE_URL }),
    });
    await owner.$connect();
    try {
      await owner.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ayman:quiz:attempt_events_trigger'))`;
        await tx.$executeRaw`ALTER TABLE "app"."attempt_events" DISABLE TRIGGER "attempt_events_append_only"`;
        await tx.quizAttempt.deleteMany({ where: { quizId: quiz.id } });
        await tx.$executeRaw`ALTER TABLE "app"."attempt_events" ENABLE TRIGGER "attempt_events_append_only"`;
      });
      await owner.quizSlot.deleteMany({ where: { quizId: quiz.id } });
      await owner.quizPool.deleteMany({ where: { quizId: quiz.id } });
      await owner.quiz.delete({ where: { id: quiz.id } });
      await owner.questionBankEntry.deleteMany({ where: { id: { in: bankEntryIds } } });
      await owner.questionCategory.delete({ where: { id: category.id } });
      await owner.enrollment.deleteMany({ where: { courseId: course.id } });
      await owner.lesson.delete({ where: { id: lesson.id } });
      await owner.courseSection.delete({ where: { id: section.id } });
      await owner.course.delete({ where: { id: course.id } });
      await owner.user.deleteMany({ where: { id: { in: [adminId, studentId, otherStudentId] } } });
    } finally {
      await owner.$disconnect();
    }
  }

  return {
    studentId,
    otherStudentId,
    adminId,
    courseId: course.id,
    lessonId: lesson.id,
    quizId: quiz.id,
    categoryId: category.id,
    bankEntryIds,
    versionIds,
    cleanup,
  };
}
