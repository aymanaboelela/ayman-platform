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
import { DEFAULT_REVIEW_OPTIONS_PRACTICE } from '@ayman/contracts/quiz/quiz-settings';
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
  if (existing) return;

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
      mode: 'practice',
      durationSeconds: null,
      maxAttempts: 0,
      retryCooldownHours: 0,
      passPercent: 60,
      shuffleQuestions: false,
      shuffleOptions: true,
      overdueHandling: 'autosubmit',
      graceSeconds: 60,
      navMethod: 'free',
      reviewOptions: DEFAULT_REVIEW_OPTIONS_PRACTICE,
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
}

/**
 * A course that can actually express a LOCK — two sections, three lessons.
 *
 * ## Why this exists separately from the demo quiz course above
 *
 * `e2e-demo-course` seeds exactly one lesson, so the progression gate can
 * never produce a locked row on it: rule 5 says the first lesson is always
 * available, and there is no second. `course-outline.e2e.ts` therefore hunted
 * the catalog at run time for any course with `lessonCount >= 2`, found none on
 * a freshly seeded database, and `test.skip`ped all three of its cases —
 * including the axe pass.
 *
 * The effect was that the locked-lesson dialog, the accordion, and the
 * outline's whole redesigned surface shipped with no e2e coverage at all,
 * while the suite reported green. Skipping is an honest outcome when the
 * environment cannot express the state; the fix is to make the environment
 * express it, not to loosen the test.
 *
 * `e2e-demo-course` is deliberately NOT extended to do this job. Its exact
 * shape is load-bearing for several other suites — `login-gated-content`
 * asserts the resume target is `QUIZ_DEMO_LESSON_ID`, and the shell and
 * dashboard flows read "0 من 1 درس" off it — so adding lessons there would fix
 * one suite by quietly rewriting the fixture three others are built on.
 *
 * ## The shape, and why each part of it is here
 *
 *   الوحدة الأولى   lesson 1  available  ← the run has to start somewhere
 *                   lesson 2  LOCKED     ← visible, in the section the outline
 *                                          opens by default, so a test can
 *                                          click it without expanding anything
 *   الوحدة الثانية  lesson 3  LOCKED     ← in a section that renders COLLAPSED
 *
 * That third lesson is not padding. `CourseOutlineView` opens only the section
 * holding `nextLessonId` and collapses the rest, so a one-section fixture
 * would never exercise the collapse — and a fixture whose only locked lesson
 * lived in the collapsed section would make the locked-row test fail on a
 * hidden element. Two sections with the locked row in the OPEN one covers both
 * without either failure mode.
 *
 * `video` rather than `quiz`: a quiz blocker makes the dialog say «تنجح في»
 * instead of «تخلّص», and the demo quiz course already covers that wording.
 */
export const GATED_COURSE_ID = '01990000-0000-7000-8000-00000000d001';
export const GATED_COURSE_SLUG = 'e2e-gated-course';

async function seedGatedCourse(adminId: string): Promise<void> {
  const existing = await prisma.course.findUnique({ where: { id: GATED_COURSE_ID } });
  if (existing) return;

  const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
  const subject = await prisma.subject.findFirstOrThrow();

  await prisma.course.create({
    data: {
      id: GATED_COURSE_ID,
      slug: GATED_COURSE_SLUG,
      title: 'كورس التسلسل التجريبي',
      status: 'published',
      publishedAt: new Date(),
      systemId: system.id,
      year: 2,
      subjectId: subject.id,
      instructorId: adminId,
      // Explicit, though it is the schema default. This fixture exists ONLY to
      // produce a lock; a future change to the default must not silently turn
      // it into a course where everything is open and three tests go quiet
      // again.
      progressionMode: 'sequential',
    },
  });

  const first = await prisma.courseSection.create({
    data: { courseId: GATED_COURSE_ID, title: 'الوحدة الأولى', position: 0, isPublished: true },
  });
  const second = await prisma.courseSection.create({
    data: { courseId: GATED_COURSE_ID, title: 'الوحدة الثانية', position: 1, isPublished: true },
  });

  const lessons = [
    { id: '01990000-0000-7000-8000-00000000d002', sectionId: first.id, title: 'المحاضرة الأولى', position: 0 },
    { id: '01990000-0000-7000-8000-00000000d003', sectionId: first.id, title: 'المحاضرة الثانية', position: 1 },
    { id: '01990000-0000-7000-8000-00000000d004', sectionId: second.id, title: 'المحاضرة الثالثة', position: 0 },
  ];

  for (const lesson of lessons) {
    await prisma.lesson.create({
      data: {
        id: lesson.id,
        courseId: GATED_COURSE_ID,
        sectionId: lesson.sectionId,
        title: lesson.title,
        kind: 'video',
        position: lesson.position,
        isPublished: true,
        // Never a free preview: rule 4 makes those available unconditionally,
        // which would defeat the entire purpose of this fixture.
        isFreePreview: false,
      },
    });
  }
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
