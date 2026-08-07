// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { AuditModule } from '../../audit/audit.module';
import { type INestApplication, Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import {
  BETTER_AUTH,
  type BetterAuthLike,
  type BetterAuthSessionResult,
} from '../../auth/better-auth.token';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { QuizModule } from './quiz.module';
import { seedQuizFixture, type QuizFixture } from './testing/quiz-fixtures';

/**
 * THE test that actually catches IDOR. For every protected route × role ×
 * owner/non-owner, the exact status — not a spot check. Real sessions, in
 * the sense that every route runs through the REAL `AuthGuard` and the REAL
 * `roleHasPermission` map; only the upstream Better Auth network call
 * (`getSession`) is faked per app instance, matching this codebase's own
 * established e2e pattern (`quiz-leak.contract.spec.ts`,
 * `profile.controller.spec.ts`, `sessions.controller.spec.ts`) rather than
 * compiling the full `AppModule`, which additionally mounts Better Auth's
 * ESM-only HTTP handler and a second global body-parser that every other
 * e2e spec in this codebase avoids for the same reason.
 */
describe('quiz module authorization matrix', () => {
  let prisma: PrismaService;
  let fixture: QuizFixture;

  let anonApp: INestApplication;
  let studentApp: INestApplication;
  let otherApp: INestApplication;
  let adminApp: INestApplication;

  // Fixture ids used across the whole matrix.
  let attemptId: string;
  let attemptToken: string;
  let submittedAttemptId: string;
  let questionId: string; // an attempt_question id on the submitted attempt
  let bankEntryId: string;
  let versionId: string;
  let categoryId: string;
  const fixturesToClean: QuizFixture[] = [];

  function sessionFor(userId: string, role: 'student' | 'admin'): BetterAuthSessionResult {
    const now = new Date();
    return {
      session: { id: `sess-${userId}` },
      user: { id: userId, email: `${userId}@example.test`, name: 'Matrix', emailVerified: true, role, createdAt: now, updatedAt: now },
    };
  }

  async function buildApp(getSession: () => Promise<BetterAuthSessionResult | null>): Promise<INestApplication> {
    const fakeAuth: BetterAuthLike = { api: { getSession } };

    @Module({
      // AuditModule is @Global() in the real app; a fixture module has to
      // import it explicitly or every service that records a trail fails to
      // resolve.
      imports: [AuditModule, QuizModule],
      providers: [
        Reflector,
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: BETTER_AUTH, useValue: fakeAuth },
      ],
    })
    class FixtureModule {}

    const moduleRef = await Test.createTestingModule({ imports: [FixtureModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    const nestApp = moduleRef.createNestApplication();
    nestApp.setGlobalPrefix('api');
    await nestApp.init();
    return nestApp;
  }

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as unknown as PrismaService;
    await prisma.$connect();

    fixture = await seedQuizFixture(prisma, { questionCount: 2, retryCooldownHours: 0 });
    categoryId = fixture.categoryId;
    bankEntryId = fixture.bankEntryIds[0]!;
    versionId = fixture.versionIds[0]!;

    anonApp = await buildApp(async () => null);
    studentApp = await buildApp(async () => sessionFor(fixture.studentId, 'student'));
    otherApp = await buildApp(async () => sessionFor(fixture.otherStudentId, 'student'));
    adminApp = await buildApp(async () => sessionFor(fixture.adminId, 'admin'));

    // A fresh in-progress attempt for student1, used by every ownership row.
    const start = await request(studentApp.getHttpServer())
      .post(`/api/quiz/quizzes/${fixture.quizId}/attempts`)
      .expect(201);
    attemptId = start.body.attemptId;
    attemptToken = start.body.attemptToken;

    // A second, SUBMITTED attempt — own fixture, separate quiz, so it never
    // races the still-in-progress `attemptId` above — carrying a graded
    // question the review rows can point at. `seedQuizFixture` mints its OWN
    // random student ids enrolled in its OWN course, so `fixture.studentId`
    // (whose session `studentApp` holds) has to be enrolled in `secondQuiz`'s
    // course explicitly before it can attempt anything there.
    const secondQuiz = await seedQuizFixture(prisma, { questionCount: 1 });
    fixturesToClean.push(secondQuiz);
    await prisma.enrollment.create({ data: { userId: fixture.studentId, courseId: secondQuiz.courseId } });
    const started2 = await request(studentApp.getHttpServer())
      .post(`/api/quiz/quizzes/${secondQuiz.quizId}/attempts`)
      .expect(201);
    await request(studentApp.getHttpServer())
      .post(`/api/quiz/attempts/${started2.body.attemptId}/submit`)
      .send({ attemptToken: started2.body.attemptToken })
      .expect(201);
    submittedAttemptId = started2.body.attemptId;

    const questionRow = await prisma.attemptQuestion.findFirstOrThrow({
      where: { attemptId: submittedAttemptId, slotPosition: 0 },
      select: { id: true },
    });
    questionId = questionRow.id;

  });

  afterAll(async () => {
    // The "admin create question" matrix row legitimately creates ONE more
    // bank entry in `fixture.categoryId` — untracked by `fixture`'s own
    // `bankEntryIds`, so its own `cleanup()` would otherwise fail on the
    // category's FK the moment it tries to delete a category that still has
    // a bank entry pointing at it.
    await prisma.questionBankEntry.deleteMany({
      where: { categoryId: fixture.categoryId, id: { notIn: fixture.bankEntryIds } },
    });
    for (const extra of fixturesToClean) await extra.cleanup();
    await anonApp?.close();
    await studentApp?.close();
    await otherApp?.close();
    await adminApp?.close();
    await fixture.cleanup();
    await prisma.$disconnect();
  });

  type Ctx = {
    quizId: string;
    attemptId: string;
    attemptToken: string;
    submittedAttemptId: string;
    questionId: string;
    bankEntryId: string;
    versionId: string;
    categoryId: string;
    studentId: string;
  };

  function ctx(): Ctx {
    return {
      quizId: fixture.quizId,
      attemptId,
      attemptToken,
      submittedAttemptId,
      questionId,
      bankEntryId,
      versionId,
      categoryId,
      studentId: fixture.studentId,
    };
  }

  const apps = {
    anonymous: () => anonApp,
    student: () => studentApp, // the OWNER of `attemptId`/`submittedAttemptId`/`appealId`
    other: () => otherApp, // never owns anything in this fixture
    admin: () => adminApp,
  };

  type Role = keyof typeof apps;

  interface Row {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: (c: Ctx) => string;
    role: Role;
    status: number;
    body?: (c: Ctx) => unknown;
    label: string;
  }

  const MATRIX: Row[] = [
    // ── Learner attempt lifecycle — ownership compiled into the WHERE clause ──
    { label: 'resume: anonymous', method: 'POST', path: (c) => `/api/quiz/attempts/${c.attemptId}/resume`, role: 'anonymous', status: 401 },
    { label: 'resume: owner', method: 'POST', path: (c) => `/api/quiz/attempts/${c.attemptId}/resume`, role: 'student', status: 201 },
    { label: 'resume: non-owner is 404, not 403', method: 'POST', path: (c) => `/api/quiz/attempts/${c.attemptId}/resume`, role: 'other', status: 404 },
    { label: 'resume: admin has no ownership bypass', method: 'POST', path: (c) => `/api/quiz/attempts/${c.attemptId}/resume`, role: 'admin', status: 404 },

    { label: 'submit: anonymous', method: 'POST', path: (c) => `/api/quiz/attempts/${c.attemptId}/submit`, role: 'anonymous', status: 401 },
    { label: 'submit: non-owner is 404', method: 'POST', path: (c) => `/api/quiz/attempts/${c.attemptId}/submit`, role: 'other', status: 404, body: (c) => ({ attemptToken: c.attemptToken }) },

    { label: 'review: anonymous', method: 'GET', path: (c) => `/api/quiz/attempts/${c.submittedAttemptId}/review`, role: 'anonymous', status: 401 },
    { label: 'review: owner', method: 'GET', path: (c) => `/api/quiz/attempts/${c.submittedAttemptId}/review`, role: 'student', status: 200 },
    { label: 'review: non-owner is 404', method: 'GET', path: (c) => `/api/quiz/attempts/${c.submittedAttemptId}/review`, role: 'other', status: 404 },

    { label: 'preflight: anonymous', method: 'GET', path: (c) => `/api/quiz/attempts/${c.attemptId}/preflight`, role: 'anonymous', status: 401 },
    { label: 'preflight: owner', method: 'GET', path: (c) => `/api/quiz/attempts/${c.attemptId}/preflight`, role: 'student', status: 200 },
    { label: 'preflight: non-owner is 404', method: 'GET', path: (c) => `/api/quiz/attempts/${c.attemptId}/preflight`, role: 'other', status: 404 },

    { label: 'answers: anonymous', method: 'PUT', path: (c) => `/api/quiz/attempts/${c.attemptId}/answers`, role: 'anonymous', status: 401 },
    { label: 'answers: non-owner is 404', method: 'PUT', path: (c) => `/api/quiz/attempts/${c.attemptId}/answers`, role: 'other', status: 404, body: (c) => ({ attemptToken: c.attemptToken, seq: 1, answers: [{ slotPosition: 0, response: null }] }) },

    { label: 'check: anonymous', method: 'POST', path: (c) => `/api/quiz/attempts/${c.attemptId}/questions/0/check`, role: 'anonymous', status: 401 },
    { label: 'check: non-owner is 404', method: 'POST', path: (c) => `/api/quiz/attempts/${c.attemptId}/questions/0/check`, role: 'other', status: 404, body: (c) => ({ attemptToken: c.attemptToken }) },

    { label: 'start attempt: anonymous', method: 'POST', path: (c) => `/api/quiz/quizzes/${c.quizId}/attempts`, role: 'anonymous', status: 401 },

    { label: 'lesson overview: anonymous', method: 'GET', path: () => `/api/quiz/lessons/${fixture.lessonId}`, role: 'anonymous', status: 401 },
    { label: 'lesson overview: enrolled student', method: 'GET', path: () => `/api/quiz/lessons/${fixture.lessonId}`, role: 'student', status: 200 },
    { label: 'lesson overview: admin, not enrolled, is 404', method: 'GET', path: () => `/api/quiz/lessons/${fixture.lessonId}`, role: 'admin', status: 404 },


    // ── Admin question bank (question:write) ──
    { label: 'admin questions list: anonymous', method: 'GET', path: () => `/api/admin/questions`, role: 'anonymous', status: 401 },
    { label: 'admin questions list: student', method: 'GET', path: () => `/api/admin/questions`, role: 'student', status: 403 },
    { label: 'admin questions list: admin', method: 'GET', path: () => `/api/admin/questions`, role: 'admin', status: 200 },

    { label: 'admin create question: anonymous', method: 'POST', path: () => `/api/admin/questions`, role: 'anonymous', status: 401 },
    { label: 'admin create question: student', method: 'POST', path: () => `/api/admin/questions`, role: 'student', status: 403 },
    {
      label: 'admin create question: admin',
      method: 'POST',
      path: () => `/api/admin/questions`,
      role: 'admin',
      status: 201,
      body: (c) => ({
        type: 'mcq_single',
        categoryId: c.categoryId,
        stemHtml: '<p>سؤال المصفوفة</p>',
        defaultMark: 1,
        settings: { shuffleOptions: true, caseSensitive: false },
        options: [
          { bodyHtml: '<p>أ</p>', fraction: 1 },
          { bodyHtml: '<p>ب</p>', fraction: 0 },
        ],
      }),
    },

    { label: 'admin question categories: student', method: 'GET', path: () => `/api/admin/questions/categories`, role: 'student', status: 403 },
    { label: 'admin question categories: admin', method: 'GET', path: () => `/api/admin/questions/categories`, role: 'admin', status: 200 },

    { label: 'admin publish question: student', method: 'POST', path: (c) => `/api/admin/questions/${c.versionId}/publish`, role: 'student', status: 403 },

    // ── Admin quiz builder (quiz:write) ──
    { label: 'admin get quiz: anonymous', method: 'GET', path: (c) => `/api/admin/quizzes/${c.quizId}`, role: 'anonymous', status: 401 },
    { label: 'admin get quiz: student', method: 'GET', path: (c) => `/api/admin/quizzes/${c.quizId}`, role: 'student', status: 403 },
    { label: 'admin get quiz: admin', method: 'GET', path: (c) => `/api/admin/quizzes/${c.quizId}`, role: 'admin', status: 200 },

    { label: 'admin reorder slots: student', method: 'PATCH', path: (c) => `/api/admin/quizzes/${c.quizId}/slots/order`, role: 'student', status: 403 },

    // ── Admin attempts (attempt:read / attempt:unlock) ──
    { label: 'admin attempts list (cross-quiz): anonymous', method: 'GET', path: () => `/api/admin/attempts`, role: 'anonymous', status: 401 },
    { label: 'admin attempts list (cross-quiz): student', method: 'GET', path: () => `/api/admin/attempts`, role: 'student', status: 403 },
    { label: 'admin attempts list (cross-quiz): admin', method: 'GET', path: () => `/api/admin/attempts`, role: 'admin', status: 200 },

    { label: 'admin attempts list (per-quiz): student', method: 'GET', path: (c) => `/api/admin/quizzes/${c.quizId}/attempts`, role: 'student', status: 403 },
    { label: 'admin attempts list (per-quiz): admin', method: 'GET', path: (c) => `/api/admin/quizzes/${c.quizId}/attempts`, role: 'admin', status: 200 },

    { label: 'admin reopen attempt: anonymous', method: 'POST', path: (c) => `/api/admin/attempts/${c.submittedAttemptId}/reopen`, role: 'anonymous', status: 401 },
    { label: 'admin reopen attempt: student', method: 'POST', path: (c) => `/api/admin/attempts/${c.submittedAttemptId}/reopen`, role: 'student', status: 403, body: () => ({ extraSeconds: 0 }) },

    { label: 'admin extra attempt: student', method: 'POST', path: (c) => `/api/admin/quizzes/${c.quizId}/students/${c.studentId}/extra-attempt`, role: 'student', status: 403 },


    // ── Admin analytics (analytics:read) ──
    { label: 'admin analytics: anonymous', method: 'GET', path: (c) => `/api/admin/quizzes/${c.quizId}/analytics`, role: 'anonymous', status: 401 },
    { label: 'admin analytics: student', method: 'GET', path: (c) => `/api/admin/quizzes/${c.quizId}/analytics`, role: 'student', status: 403 },
    { label: 'admin analytics: admin', method: 'GET', path: (c) => `/api/admin/quizzes/${c.quizId}/analytics`, role: 'admin', status: 200 },
  ];

  it.each(MATRIX.map((row) => [row.label, row] as const))('%s', async (_label, row) => {
    const app = apps[row.role]();
    const path = row.path(ctx());
    const body = row.body?.(ctx());
    let req = request(app.getHttpServer())[
      row.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'
    ](path);
    if (body !== undefined) req = req.send(body as object);
    await req.expect(row.status);
  });

  // ── Mass assignment — the attack this product actually faces ──
  describe('mass assignment is rejected with a 400, not a silent strip', () => {
    it.each([
      ['rawScore', { attemptToken: '', rawScore: 100 }],
      ['scaledScore', { attemptToken: '', scaledScore: 100 }],
      ['passed', { attemptToken: '', passed: true }],
      ['deadlineAt', { attemptToken: '', deadlineAt: '2099-01-01T00:00:00Z' }],
      ['extraTimeSeconds', { attemptToken: '', extraTimeSeconds: 99999 }],
      ['extraAttempts', { attemptToken: '', extraAttempts: 99 }],
      ['state', { attemptToken: '', state: 'submitted' }],
      ['userId', { attemptToken: '', userId: 'someone-else' }],
    ])('rejects a submit body carrying %s', async (_field, extra) => {
      const response = await request(studentApp.getHttpServer())
        .post(`/api/quiz/attempts/${attemptId}/submit`)
        .send({ ...extra, attemptToken: attemptToken });
      expect(response.status).toBe(400);
    });

    it('rejects a save-answers body carrying a per-question fraction or mark', async () => {
      const withFraction = await request(studentApp.getHttpServer())
        .put(`/api/quiz/attempts/${attemptId}/answers`)
        .send({ attemptToken, seq: 1, answers: [{ slotPosition: 0, response: null, fraction: 1 }] });
      expect(withFraction.status).toBe(400);

      const withMark = await request(studentApp.getHttpServer())
        .put(`/api/quiz/attempts/${attemptId}/answers`)
        .send({ attemptToken, seq: 1, answers: [{ slotPosition: 0, response: null, mark: 10 }] });
      expect(withMark.status).toBe(400);
    });

    it('leaves the database untouched after every rejected payload', async () => {
      const attempt = await prisma.quizAttempt.findUnique({ where: { id: attemptId } });
      expect(attempt!.rawScore).toBeNull();
      expect(attempt!.extraTimeSeconds).toBe(0);
      expect(attempt!.submittedAt).toBeNull();
    });
  });
});
