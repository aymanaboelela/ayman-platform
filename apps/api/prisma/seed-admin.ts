/**
 * Seeds (or repairs) everything the Playwright suite (`apps/web/e2e/**`)
 * needs that cannot be created through the product's own signup flow:
 *
 *   1. The single admin account the admin-publish-course flow signs in as.
 *   2. A published, practice-mode demo quiz lesson
 *      (`QUIZ_DEMO_COURSE_ID` / `QUIZ_DEMO_LESSON_ID` below) the quiz flow
 *      attempts. Students are never seeded here — every spec mints its own
 *      via `uniqueStudent()`/`register()` (apps/web/e2e/fixtures.ts) and
 *      self-enrolls through the real `POST /api/courses/:id/enroll` route,
 *      exactly like a real student would.
 *
 * Idempotent: safe to run against a database that already has these rows
 * (CI runs it fresh every time; a developer may run it repeatedly locally).
 * Refuses to run without explicit admin credentials and refuses to run
 * against NODE_ENV=production, so it can never silently create (or repair)
 * an admin account with a guessable default outside a test environment.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { hash } from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import type { QuestionInput } from '@ayman/contracts/quiz/question';
import { DEFAULT_REVIEW_OPTIONS } from '@ayman/contracts/quiz/quiz-settings';
import { AuditService } from '../src/audit/audit.service';
import { ARGON2_OPTIONS } from '../src/auth/argon2-options';
import { PrismaClient } from '../src/generated/prisma/client';
import { QuestionBankService } from '../src/modules/quiz/question-bank.service';

const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;

if (!email || !password) {
  throw new Error('E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must both be set.');
}
if (process.env.NODE_ENV === 'production') {
  throw new Error('seed-admin.ts must never run against production.');
}

/**
 * Fixed, deterministic ids for the demo quiz chain — NOT generated, so that
 * `apps/web/e2e/fixtures.ts` (a different package; it cannot import a
 * Prisma-touching script) can reference the exact same lesson without any
 * IPC between the seed script and the test run. If this literal ever
 * changes, `fixtures.ts`'s copy must change with it — both files comment
 * the other's path for exactly that reason.
 */
export const QUIZ_DEMO_COURSE_ID = '01990000-0000-7000-8000-00000000c001';
export const QUIZ_DEMO_LESSON_ID = '01990000-0000-7000-8000-00000000c002';
/**
 * The course's FINAL EXAM — the one quiz in the seed that offers an
 * improvement sitting, with a built improvement paper.
 *
 * Separate from the demo quiz above because the two are opposites and a test
 * needs both: `QUIZ_DEMO_LESSON_ID` is an ordinary one-sitting quiz (the
 * results e2e asserts it offers no second sitting), and this one is the
 * exception (the quiz e2e sits its improvement paper end to end).
 */
export const EXAM_DEMO_LESSON_ID = '01990000-0000-7000-8000-00000000c003';
/** The exam's OWN course — see `seedDemoExam` for why it is not the demo one. */
export const EXAM_DEMO_COURSE_ID = '01990000-0000-7000-8000-00000000c005';
/** The exam's own question category — see `seedDemoExam`. */
const EXAM_CATEGORY_ID = '01990000-0000-7000-8000-00000000c004';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function seedAdmin(): Promise<string> {
  const passwordHash = await hash(password!, ARGON2_OPTIONS);
  const user = await prisma.user.upsert({
    where: { email: email! },
    update: { role: 'admin', emailVerified: true },
    create: { id: randomUUID(), email: email!, name: 'E2E Admin', role: 'admin', emailVerified: true },
  });
  await prisma.account.upsert({
    where: { providerId_accountId: { providerId: 'credential', accountId: user.id } },
    update: { password: passwordHash },
    create: {
      id: randomUUID(),
      providerId: 'credential',
      accountId: user.id,
      userId: user.id,
      password: passwordHash,
    },
  });

  // `apps/web/proxy.ts`'s redirect matrix sends any authenticated-but-not-
  // onboarded session to /onboarding on EVERY protected route, admin ones
  // included — the E2E admin flow needs to land on /admin straight after
  // login, so this profile must exist with `onboardingCompletedAt` set.
  const governorate = await prisma.governorate.findFirstOrThrow();
  await prisma.studentProfile.upsert({
    where: { userId: user.id },
    update: { onboardingCompletedAt: new Date() },
    create: {
      userId: user.id,
      fullName: 'E2E Admin',
      gender: 'male',
      phone: '01000000000',
      governorateCode: governorate.code,
      onboardingCompletedAt: new Date(),
    },
  });

  return user.id;
}

/**
 * Builds the demo course -> section -> lesson -> quiz chain once, at the
 * fixed ids above, if it does not already exist. A practice-mode quiz (not
 * graded) so the Playwright flow can exercise both the answer-leak contract
 * (start response carries no grading keys) and the review screen without
 * needing a timer/deadline in the mix.
 */
async function seedDemoQuiz(adminId: string): Promise<void> {
  const existing = await prisma.lesson.findUnique({ where: { id: QUIZ_DEMO_LESSON_ID } });
  if (existing) {
    // The exam is guarded SEPARATELY, below. Returning here for both would
    // mean a database seeded before the exam existed could never acquire it —
    // which is exactly the state every existing environment is in.
    await seedDemoExam(adminId);
    return;
  }

  const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
  const subject = await prisma.subject.findFirstOrThrow();

  await prisma.course.upsert({
    where: { id: QUIZ_DEMO_COURSE_ID },
    update: {},
    create: {
      id: QUIZ_DEMO_COURSE_ID,
      slug: 'e2e-demo-course',
      title: 'كورس اختبارات E2E',
      status: 'published',
      publishedAt: new Date(),
      systemId: system.id,
      year: 2,
      subjectId: subject.id,
      instructorId: adminId,
    },
  });

  const section = await prisma.courseSection.create({
    data: { courseId: QUIZ_DEMO_COURSE_ID, title: 'الوحدة التجريبية', position: 0, isPublished: true },
  });

  await prisma.lesson.create({
    data: {
      id: QUIZ_DEMO_LESSON_ID,
      courseId: QUIZ_DEMO_COURSE_ID,
      sectionId: section.id,
      title: 'اختبار تجريبي',
      kind: 'quiz',
      position: 0,
      isPublished: true,
    },
  });

  const category = await prisma.questionCategory.create({ data: { name: 'فئة اختبارات E2E' } });
  const bank = new QuestionBankService(prisma, new AuditService(prisma));
  const bankEntryIds: string[] = [];

  for (let i = 0; i < 3; i += 1) {
    const input = {
      type: 'mcq_single',
      categoryId: category.id,
      stemHtml: `<p>سؤال تجريبي رقم ${i + 1}</p>`,
      defaultMark: 1,
      generalFeedbackHtml: '<p>الإجابة الصحيحة هي أ.</p>',
      settings: { shuffleOptions: true, caseSensitive: false },
      options: [
        { bodyHtml: '<p>أ (الصحيحة)</p>', fraction: 1 },
        { bodyHtml: '<p>ب</p>', fraction: 0 },
        { bodyHtml: '<p>ج</p>', fraction: 0 },
        { bodyHtml: '<p>د</p>', fraction: 0 },
      ],
    } as QuestionInput;

    const created = await bank.create(input, adminId);
    await bank.publish(created.versionId);
    bankEntryIds.push(created.bankEntryId);
  }

  const quiz = await prisma.quiz.create({
    data: {
      lessonId: QUIZ_DEMO_LESSON_ID,
      durationSeconds: null,
      // An ordinary lesson quiz: ONE sitting, no improvement. This used to be
      // `mode: 'practice'` with `maxAttempts: 0` — unlimited attempts and the
      // answers revealed mid-attempt — which is precisely what the product no
      // longer has, and what `student-results.e2e.ts` now asserts against.
      allowsImprovement: false,
      passPercent: 60,
      shuffleQuestions: false,
      shuffleOptions: true,
      overdueHandling: 'autosubmit',
      graceSeconds: 60,
      navMethod: 'free',
      reviewOptions: DEFAULT_REVIEW_OPTIONS,
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

  await seedDemoExam(adminId);
}

/**
 * A course whose ONLY lesson is its final exam, with both papers built.
 *
 * ## Why its own course
 *
 * Two reasons, and the first is the progression gate. An exam opens only once
 * every OTHER published lesson is cleared (`gate-rule.ts`, rule 3). Dropped
 * into `e2e-demo-course` beside the demo quiz, it 404s until a test has sat
 * AND PASSED that quiz — and the demo quiz shuffles its options, so a test
 * answering "the first radio" scores at random and usually fails it. The exam
 * test would then be asserting the gate, intermittently, instead of the
 * improvement flow.
 *
 * The second is that `e2e-demo-course` is shared. `student-shell.e2e.ts` and
 * `student-results.e2e.ts` both assert against its lesson COUNT; adding a
 * second lesson to it changes their arithmetic from somewhere else entirely.
 *
 * Alone in its course, the exam has no other lesson to wait for and opens
 * immediately — which is the gate rule working, not a hole in it.
 *
 * Two papers of TWO questions each, from questions the other paper does not
 * use: that is what `QuizBuilderService.publish` requires, and what makes an
 * improvement sitting a real second exam rather than the same one again.
 *
 * Designated via `examLessonId`, because that pointer — not the lesson's title
 * or position — is what makes a lesson THE exam.
 */
async function seedDemoExam(adminId: string): Promise<void> {
  const existing = await prisma.lesson.findUnique({ where: { id: EXAM_DEMO_LESSON_ID } });
  if (existing) return;

  // Its own category, so re-running against a database that already has the
  // demo quiz does not have to find the one that quiz created.
  const category = await prisma.questionCategory.upsert({
    where: { id: EXAM_CATEGORY_ID },
    update: {},
    create: { id: EXAM_CATEGORY_ID, name: 'فئة الامتحان النهائي' },
  });
  const categoryId = category.id;
  const bank = new QuestionBankService(prisma, new AuditService(prisma));

  async function paper(label: string, count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const created = await bank.create(
        {
          type: 'mcq_single',
          categoryId,
          stemHtml: `<p>${label} — سؤال ${i + 1}</p>`,
          defaultMark: 1,
          generalFeedbackHtml: '<p>الإجابة الصحيحة هي أ.</p>',
          settings: { shuffleOptions: false, caseSensitive: false },
          options: [
            { bodyHtml: '<p>أ (الصحيحة)</p>', fraction: 1 },
            { bodyHtml: '<p>ب</p>', fraction: 0 },
            { bodyHtml: '<p>ج</p>', fraction: 0 },
            { bodyHtml: '<p>د</p>', fraction: 0 },
          ],
        } as QuestionInput,
        adminId,
      );
      await bank.publish(created.versionId);
      ids.push(created.bankEntryId);
    }
    return ids;
  }

  const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
  const subject = await prisma.subject.findFirstOrThrow();

  await prisma.course.upsert({
    where: { id: EXAM_DEMO_COURSE_ID },
    update: {},
    create: {
      id: EXAM_DEMO_COURSE_ID,
      slug: 'e2e-exam-course',
      title: 'كورس الامتحان النهائي',
      status: 'published',
      publishedAt: new Date(),
      systemId: system.id,
      year: 2,
      subjectId: subject.id,
      instructorId: adminId,
    },
  });

  const section = await prisma.courseSection.create({
    data: { courseId: EXAM_DEMO_COURSE_ID, title: 'الوحدة', position: 0, isPublished: true },
  });

  await prisma.lesson.create({
    data: {
      id: EXAM_DEMO_LESSON_ID,
      courseId: EXAM_DEMO_COURSE_ID,
      sectionId: section.id,
      title: 'الامتحان النهائي',
      kind: 'quiz',
      position: 0,
      isPublished: true,
    },
  });

  const original = await paper('الامتحان الأصلي', 2);
  const improvement = await paper('امتحان التحسين', 2);

  const exam = await prisma.quiz.create({
    data: {
      lessonId: EXAM_DEMO_LESSON_ID,
      durationSeconds: 1800,
      allowsImprovement: true,
      passPercent: 60,
      shuffleQuestions: false,
      // OFF, deliberately: the e2e answers "the first radio" on every question,
      // which only grades deterministically if the options keep their order.
      shuffleOptions: false,
      overdueHandling: 'autosubmit',
      graceSeconds: 60,
      navMethod: 'free',
      reviewOptions: DEFAULT_REVIEW_OPTIONS,
      sumMarks: original.length,
      improvementSumMarks: improvement.length,
      gradeOutOf: 100,
      isPublished: true,
    },
  });

  for (const [index, bankEntryId] of original.entries()) {
    await prisma.quizSlot.create({
      data: { quizId: exam.id, paper: 'original', position: index, maxMark: 1, bankEntryId },
    });
  }
  for (const [index, bankEntryId] of improvement.entries()) {
    await prisma.quizSlot.create({
      data: { quizId: exam.id, paper: 'improvement', position: index, maxMark: 1, bankEntryId },
    });
  }

  // The pointer is what makes it the exam.
  await prisma.course.update({
    where: { id: EXAM_DEMO_COURSE_ID },
    data: { examLessonId: EXAM_DEMO_LESSON_ID },
  });
}

/**
 * A course that can actually express the one LOCK left — two sections, two
 * lectures and a final exam.
 *
 * ## Why this exists separately from the demo quiz course above
 *
 * `e2e-demo-course` seeds exactly one lesson and no exam, so the progression
 * gate can never produce a locked row on it. `course-outline.e2e.ts` therefore
 * hunted the catalog at run time for any course with `lessonCount >= 2`, found
 * none on a freshly seeded database, and `test.skip`ped all three of its cases
 * — including the axe pass.
 *
 * The effect was that the locked dialog, the accordion, and the outline's
 * whole redesigned surface shipped with no e2e coverage at all, while the
 * suite reported green. Skipping is an honest outcome when the environment
 * cannot express the state; the fix is to make the environment express it, not
 * to loosen the test.
 *
 * `e2e-demo-course` is deliberately NOT extended to do this job. Its exact
 * shape is load-bearing for several other suites — `login-gated-content`
 * asserts the resume target is `QUIZ_DEMO_LESSON_ID`, and the shell and
 * dashboard flows read "0 من 1 درس" off it — so adding lessons there would fix
 * one suite by quietly rewriting the fixture three others are built on.
 *
 * ## The shape, and why each part of it is here
 *
 *   الوحدة الأولى   lesson 1  available  ← every lecture is open now
 *                   lesson 2  available
 *   الوحدة الثانية  the EXAM  LOCKED     ← the whole remaining gate, in one row
 *
 * ⚠️ The exam sits in the SECOND section on purpose, and the two lectures in
 * the first. `CourseOutlineView` opens only the section holding
 * `nextLessonId`, which on a fresh enrolment is lecture 1 — so a test reaching
 * the locked row has to expand a collapsed unit to get at it, which is
 * precisely the interaction a single-section fixture could never cover.
 *
 * The lectures used to be the locked rows here, behind the sequential chain
 * that `20260818140000_drop_progression_mode` removed. There is no per-course
 * mode to set any more; what makes this course express a lock is
 * `examLessonId`, and nothing else can.
 */
export const GATED_COURSE_ID = '01990000-0000-7000-8000-00000000d001';
export const GATED_COURSE_SLUG = 'e2e-gated-course';
/** The one row in that course the gate closes. */
export const EXAM_LESSON_ID = '01990000-0000-7000-8000-00000000d004';

async function seedGatedCourse(adminId: string): Promise<void> {
  const existing = await prisma.course.findUnique({ where: { id: GATED_COURSE_ID } });
  if (existing) return;

  const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
  const subject = await prisma.subject.findFirstOrThrow();

  await prisma.course.create({
    data: {
      id: GATED_COURSE_ID,
      slug: GATED_COURSE_SLUG,
      title: 'كورس الامتحان التجريبي',
      status: 'published',
      publishedAt: new Date(),
      systemId: system.id,
      year: 2,
      subjectId: subject.id,
      instructorId: adminId,
    },
  });

  const first = await prisma.courseSection.create({
    data: { courseId: GATED_COURSE_ID, title: 'الوحدة الأولى', position: 0, isPublished: true },
  });
  const second = await prisma.courseSection.create({
    data: { courseId: GATED_COURSE_ID, title: 'الوحدة الثانية', position: 1, isPublished: true },
  });

  const lessons = [
    {
      id: '01990000-0000-7000-8000-00000000d002',
      sectionId: first.id,
      title: 'المحاضرة الأولى',
      position: 0,
      kind: 'video' as const,
    },
    {
      id: '01990000-0000-7000-8000-00000000d003',
      sectionId: first.id,
      title: 'المحاضرة الثانية',
      position: 1,
      kind: 'video' as const,
    },
    {
      id: EXAM_LESSON_ID,
      sectionId: second.id,
      title: 'الامتحان النهائي',
      position: 0,
      kind: 'quiz' as const,
    },
  ];

  for (const lesson of lessons) {
    await prisma.lesson.create({
      data: {
        id: lesson.id,
        courseId: GATED_COURSE_ID,
        sectionId: lesson.sectionId,
        title: lesson.title,
        kind: lesson.kind,
        position: lesson.position,
        isPublished: true,
        // Never a free preview. It decides nothing in the gate any more, but a
        // preview flag on the exam row would still be a lie about a paper that
        // is not open.
        isFreePreview: false,
      },
    });
  }

  // The pointer IS the gate — `resolveGate` locks this lesson until every
  // published LECTURE of the course is cleared, and opens everything else
  // unconditionally. Set after the lessons exist so the
  // `courses_exam_lesson_in_same_course` constraint has a row to check.
  await prisma.course.update({
    where: { id: GATED_COURSE_ID },
    data: { examLessonId: EXAM_LESSON_ID },
  });
}

async function main(): Promise<void> {
  const adminId = await seedAdmin();
  await seedDemoQuiz(adminId);
  await seedGatedCourse(adminId);
  process.stdout.write(`seeded admin ${email}\n`);
  process.stdout.write(`seeded demo quiz lesson ${QUIZ_DEMO_LESSON_ID}\n`);
  process.stdout.write(`seeded gated course ${GATED_COURSE_SLUG}\n`);
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
