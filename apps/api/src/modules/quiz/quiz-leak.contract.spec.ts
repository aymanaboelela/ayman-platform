// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { type INestApplication, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
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
import { EntitlementService } from '../entitlement/entitlement.service';
import { CourseProgressService } from '../progress/course-progress.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { LessonGateService } from '../progress/lesson-gate.service';
import { LessonProgressService } from '../progress/lesson-progress.service';
import { AttemptController } from './attempt.controller';
import { AttemptEventsService } from './attempt-events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AttemptService } from './attempt.service';
import { NoAnswerLeakInterceptor } from './interceptors/no-answer-leak.interceptor';
import { QuizAccessService } from './quiz-access.service';
import { collectKeysDeep, FORBIDDEN_ANSWER_KEYS } from './serializers/learner.serializer';
import { seedQuizFixture, type QuizFixture } from './testing/quiz-fixtures';

/**
 * LAYER 3. This test does not inspect objects — it inspects the RAW HTTP BODY
 * of a real request through the real pipeline (AuthGuard -> permission check
 * -> Zod DTO pipe -> controller -> service -> the globally-registered
 * NoAnswerLeakInterceptor), because the failure mode it exists to catch is
 * "somebody added a field to a DTO or a select". If this test ever needs
 * relaxing to make a feature work, the feature is wrong.
 *
 * Same lightweight-fixture-module shape as `profile.controller.spec.ts` and
 * `sessions.controller.spec.ts` (real seeded Postgres, only the Better Auth
 * session lookup faked) rather than compiling the full `AppModule` — the full
 * app additionally mounts Better Auth's own ESM-only HTTP handler and a
 * second global body-parser, neither of which this test needs, and both of
 * which the rest of this codebase's e2e specs deliberately avoid for exactly
 * that reason.
 */
describe('quiz answer-leak contract (Layer 3)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService;
  let fixture: QuizFixture;

  const DISTINCTIVE_FEEDBACK = 'SECRET_FEEDBACK_MARKER';
  const DISTINCTIVE_PATTERN = 'SECRET_PATTERN_MARKER';

  function sessionFor(userId: string, role: 'student' | 'admin' = 'student'): BetterAuthSessionResult {
    const now = new Date();
    return {
      session: { id: `sess-${userId}` },
      user: {
        id: userId,
        email: `${userId}@example.test`,
        name: 'E2E Student',
        emailVerified: true,
        role,
        createdAt: now,
        updatedAt: now,
      },
    };
  }

  async function buildApp(
    getSession: () => Promise<BetterAuthSessionResult | null>,
  ): Promise<INestApplication> {
    const fakeAuth: BetterAuthLike = { api: { getSession } };

    @Module({
      controllers: [AttemptController],
      providers: [
        Reflector,
        { provide: PrismaService, useValue: prisma },
        AttemptService,
        QuizAccessService,
        AttemptEventsService,
        LessonAccessService,
        LessonGateService,
        EntitlementService,
        CourseProgressService,
        LessonProgressService,
        // `AttemptService` emits `quiz_graded` at submit; the real service is
        // used rather than a double so this contract test still exercises the
        // genuine write path it is asserting the leak behaviour of.
        NotificationsService,
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_INTERCEPTOR, useClass: NoAnswerLeakInterceptor },
        { provide: BETTER_AUTH, useValue: fakeAuth },
      ],
    })
    class FixtureModule {}

    const moduleRef = await Test.createTestingModule({ imports: [FixtureModule] }).compile();
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

    fixture = await seedQuizFixture(prisma, {
      questionCount: 2,
      distinctiveFeedback: DISTINCTIVE_FEEDBACK,
      distinctivePattern: DISTINCTIVE_PATTERN,
    });
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  afterAll(async () => {
    await fixture.cleanup();
    await prisma.$disconnect();
  });

  function assertNoLeak(body: unknown, text: string): void {
    for (const key of collectKeysDeep(body)) {
      expect(FORBIDDEN_ANSWER_KEYS.has(key)).toBe(false);
    }
    for (const key of FORBIDDEN_ANSWER_KEYS) {
      expect(text).not.toContain(`"${key}"`);
    }
    expect(text).not.toContain(DISTINCTIVE_FEEDBACK);
    expect(text).not.toContain(DISTINCTIVE_PATTERN);
    expect(text).not.toContain('graded_right');
    expect(text).not.toContain('graded_wrong');
    expect(text).not.toContain('graded_partial');
  }

  it('POST /api/quiz/quizzes/:id/attempts leaks nothing', async () => {
    app = await buildApp(async () => sessionFor(fixture.studentId));
    const response = await request(app.getHttpServer())
      .post(`/api/quiz/quizzes/${fixture.quizId}/attempts`)
      .expect(201);

    assertNoLeak(response.body, response.text);
  });

  it('PUT …/answers leaks nothing, including on the save response', async () => {
    app = await buildApp(async () => sessionFor(fixture.studentId));
    const start = await request(app.getHttpServer())
      .post(`/api/quiz/quizzes/${fixture.quizId}/attempts`)
      .expect(201);

    const optionId = start.body.questions[0].options[0].id as string;
    const response = await request(app.getHttpServer())
      .put(`/api/quiz/attempts/${start.body.attemptId}/answers`)
      .send({
        attemptToken: start.body.attemptToken,
        seq: 1,
        answers: [{ slotPosition: 0, response: { kind: 'choice', optionIds: [optionId] } }],
      })
      .expect(200);

    assertNoLeak(response.body, response.text);
  });

  it('POST …/resume leaks nothing', async () => {
    app = await buildApp(async () => sessionFor(fixture.studentId));
    const start = await request(app.getHttpServer())
      .post(`/api/quiz/quizzes/${fixture.quizId}/attempts`)
      .expect(201);
    const response = await request(app.getHttpServer())
      .post(`/api/quiz/attempts/${start.body.attemptId}/resume`)
      .expect(201);

    assertNoLeak(response.body, response.text);
  });

  it('GET …/preflight leaks nothing', async () => {
    app = await buildApp(async () => sessionFor(fixture.studentId));
    const start = await request(app.getHttpServer())
      .post(`/api/quiz/quizzes/${fixture.quizId}/attempts`)
      .expect(201);
    const response = await request(app.getHttpServer())
      .get(`/api/quiz/attempts/${start.body.attemptId}/preflight`)
      .expect(200);

    assertNoLeak(response.body, response.text);
  });

  // IDOR — a student must not read or write another student's attempt, and
  // the failure is a 404, never a 403 (a 403 is an existence oracle).
  it("returns 404, not 403, for another student's attempt", async () => {
    app = await buildApp(async () => sessionFor(fixture.studentId));
    const start = await request(app.getHttpServer())
      .post(`/api/quiz/quizzes/${fixture.quizId}/attempts`)
      .expect(201);
    await app.close();

    app = await buildApp(async () => sessionFor(fixture.otherStudentId));
    await request(app.getHttpServer())
      .post(`/api/quiz/attempts/${start.body.attemptId}/resume`)
      .expect(404);
    await request(app.getHttpServer())
      .put(`/api/quiz/attempts/${start.body.attemptId}/answers`)
      .send({ attemptToken: start.body.attemptToken, seq: 1, answers: [{ slotPosition: 0, response: null }] })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/quiz/attempts/${start.body.attemptId}/submit`)
      .send({ attemptToken: start.body.attemptToken })
      .expect(404);
  });

  // Mass assignment — `.strict()` DTOs + `whitelist:true, forbidNonWhitelisted:true`
  // reject a hostile client's own grade at the boundary, never silently drop it.
  describe('mass assignment is rejected, not silently stripped', () => {
    it('rejects {score: 100} on the save-answers body', async () => {
      app = await buildApp(async () => sessionFor(fixture.studentId));
      const start = await request(app.getHttpServer())
        .post(`/api/quiz/quizzes/${fixture.quizId}/attempts`)
        .expect(201);
      await request(app.getHttpServer())
        .put(`/api/quiz/attempts/${start.body.attemptId}/answers`)
        .send({
          attemptToken: start.body.attemptToken,
          seq: 1,
          score: 100,
          answers: [{ slotPosition: 0, response: null }],
        })
        .expect(400);
    });

    it('rejects {fraction: 1} on an individual answer', async () => {
      app = await buildApp(async () => sessionFor(fixture.studentId));
      const start = await request(app.getHttpServer())
        .post(`/api/quiz/quizzes/${fixture.quizId}/attempts`)
        .expect(201);
      await request(app.getHttpServer())
        .put(`/api/quiz/attempts/${start.body.attemptId}/answers`)
        .send({
          attemptToken: start.body.attemptToken,
          seq: 1,
          answers: [{ slotPosition: 0, fraction: 1, response: null }],
        })
        .expect(400);
    });

    it('rejects {submittedAt: null} on the submit body', async () => {
      app = await buildApp(async () => sessionFor(fixture.studentId));
      const start = await request(app.getHttpServer())
        .post(`/api/quiz/quizzes/${fixture.quizId}/attempts`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/quiz/attempts/${start.body.attemptId}/submit`)
        .send({ attemptToken: start.body.attemptToken, submittedAt: null })
        .expect(400);
    });
  });

  // Q4 — stale token / replay, quoted at the HTTP layer.
  it('rejects a stale-token save with 409 and a replayed submit with 409', async () => {
    app = await buildApp(async () => sessionFor(fixture.studentId));
    const start = await request(app.getHttpServer())
      .post(`/api/quiz/quizzes/${fixture.quizId}/attempts`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/quiz/attempts/${start.body.attemptId}/resume`)
      .expect(201); // rotates the token

    await request(app.getHttpServer())
      .put(`/api/quiz/attempts/${start.body.attemptId}/answers`)
      .send({ attemptToken: start.body.attemptToken, seq: 1, answers: [{ slotPosition: 0, response: null }] })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/api/quiz/attempts/${start.body.attemptId}/submit`)
      .send({ attemptToken: start.body.attemptToken })
      .expect(409); // stale token, never even reaches the "already submitted" branch

    const fresh = await request(app.getHttpServer())
      .post(`/api/quiz/attempts/${start.body.attemptId}/resume`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/quiz/attempts/${start.body.attemptId}/submit`)
      .send({ attemptToken: fresh.body.attemptToken })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/quiz/attempts/${start.body.attemptId}/submit`)
      .send({ attemptToken: fresh.body.attemptToken })
      .expect(409); // replay-for-a-better-score
  });

  // The negative control (Task 13). Without it, a serializer that returns
  // `{}` for everything would pass every leak assertion above — this proves
  // the review endpoint DOES carry correctness/feedback once submitted, so
  // the absence of those markers elsewhere is a real control, not dead code.
  it('the REVIEW payload DOES carry correctness and feedback once the attempt is submitted', async () => {
    // Its OWN fixture. Every quiz now allows exactly one sitting, so a test
    // that submits cannot share a quiz with the tests that ran before it —
    // it would be handed a 403 before reaching the thing it is testing.
    const own = await seedQuizFixture(prisma, {
      questionCount: 2,
      distinctiveFeedback: DISTINCTIVE_FEEDBACK,
      distinctivePattern: DISTINCTIVE_PATTERN,
    });
    try {
    app = await buildApp(async () => sessionFor(own.studentId));
    const start = await request(app.getHttpServer())
      .post(`/api/quiz/quizzes/${own.quizId}/attempts`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/quiz/attempts/${start.body.attemptId}/submit`)
      .send({ attemptToken: start.body.attemptToken })
      .expect(201);

    const review = await request(app.getHttpServer())
      .get(`/api/quiz/attempts/${start.body.attemptId}/review`)
      .expect(200);

    expect(review.body.locked).toBe(false);
    expect(review.text).toContain(DISTINCTIVE_FEEDBACK);
    expect(review.body.questions[0]).toHaveProperty('correctness');
    } finally {
      await own.cleanup();
    }
  });

});
