import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication, Module } from '@nestjs/common';
import { APP_GUARD, DiscoveryModule, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';

import {
  BETTER_AUTH,
  type BetterAuthLike,
  type BetterAuthSessionResult,
} from '../auth/better-auth.token';
import { AuthGuard } from '../auth/guards/auth.guard';
import { HealthController } from '../health/health.controller';
import { SessionController } from '../auth/session.controller';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

import { AuditModule } from '../audit/audit.module';
import { TaxonomyModule } from '../modules/taxonomy/taxonomy.module';
import { ProfileModule } from '../modules/profile/profile.module';
import { SessionsModule } from '../modules/sessions/sessions.module';
import { EnrollmentModule as EnrollmentProviderModule } from '../modules/enrollment/enrollment.module';
import { EntitlementModule } from '../modules/entitlement/entitlement.module';
import { ProgressModule } from '../modules/progress/progress.module';
import { ContentModule } from '../modules/content/content.module';
import { CatalogModule } from '../modules/catalog/catalog.module';
import { PlayerModule } from '../modules/player/player.module';
import { DashboardModule } from '../modules/dashboard/dashboard.module';
import { SettingsModule } from '../modules/admin/settings/settings.module';
import { StudentsModule } from '../modules/admin/students/students.module';
import { AdminTaxonomyModule } from '../modules/admin/taxonomy/admin-taxonomy.module';
import { MediaModule } from '../modules/media/media.module';
import { FlagsModule } from '../modules/admin/flags/flags.module';
import { NavigationModule } from '../modules/admin/navigation/navigation.module';
import { HomeBlocksModule } from '../modules/admin/home-blocks/home-blocks.module';
import { AuditReadModule } from '../modules/admin/audit/audit-read.module';
import { AssistantController } from '../modules/assistant/assistant.controller';
import { AdminInboxController } from '../modules/assistant/admin-inbox.controller';
import { AssistantService } from '../modules/assistant/assistant.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { OptionalSessionService } from '../auth/optional-session.service';

import { enumerateRoutes, type RouteRef } from './route-inventory';

/**
 * THE full-product authorization matrix. Plan 5's `quiz.authz.spec.ts`
 * already covers the quiz module's ~36 routes (attempt lifecycle, appeals,
 * admin quiz/question/attempt/analytics controllers) with its own 64-case
 * table against the real `AuthGuard` and the real permission map — this file
 * does not duplicate that, it extends the SAME PATTERN to every controller
 * quiz.authz.spec.ts does not touch: content, catalog, player, progress,
 * dashboard, enrollment, profile, sessions, taxonomy, and every Plan 6 admin
 * module (settings, students, taxonomy, media, flags, navigation, home-
 * blocks, audit).
 *
 * Deliberately excludes `AuthModule` (real Better Auth + its ESM-only HTTP
 * handler) and `SecurityModule` (registers `CsrfGuard` as a second
 * `APP_GUARD`) — both for the same reason `quiz.authz.spec.ts` excludes
 * them: this matrix's job is AUTHORIZATION (who may call what), not session
 * issuance or CSRF, and mixing either in would make every POST/PATCH/DELETE
 * row need a real cookie-based CSRF token for no benefit to what this file
 * is actually checking. `SessionController` (`GET /api/session`) and
 * `HealthController` (`GET /api/health`) are added directly, by class, so
 * their routes are exercised without importing `AuthModule`.
 */
describe('authorization matrix (every route Plan 5 does not already cover)', () => {
  let prisma: PrismaService;
  let owner: PrismaClient;

  let anonApp: INestApplication;
  let studentApp: INestApplication;
  let otherApp: INestApplication;
  let adminApp: INestApplication;
  let routes: RouteRef[];

  // Actors.
  let adminId: string;
  let studentId: string;
  let otherStudentId: string;

  // Content the STUDENT owns/has access to; `otherStudentId` has neither.
  let courseId: string;
  let courseSlug: string;
  let sectionId: string;
  let lessonId: string;
  let resourceId: string;

  // A second, throwaway course/section/lesson for mutate-permission rows
  // that must not disturb the fixtures above.
  let scratchCourseId: string;
  let scratchSectionId: string;
  let scratchLessonId: string;

  // Sessions/devices: one belonging to the student, one to otherStudent.
  let studentDeviceId: string;
  let otherDeviceId: string;

  // Existing seeded taxonomy (from `prisma/seed.ts`), read-only here.
  let governorateCode: string;

  // Admin-content fixtures created fresh by this file.
  let homeBlockId: string;
  let navItemId: string;
  const FLAG_KEY = 'catalog.showComingSoon';

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
      /*
       * المساعد's two controllers are registered BY CLASS rather than by
       * importing `AssistantModule`, which imports `AuthModule` — the one
       * module this file deliberately excludes (real Better Auth, ESM-only
       * HTTP handler). The three providers below are what that module would
       * have supplied, and `OptionalSessionService` resolves `BETTER_AUTH`
       * from the fake session factory already provided here.
       */
      controllers: [
        HealthController,
        SessionController,
        AssistantController,
        AdminInboxController,
      ],
      imports: [
        DiscoveryModule,
        AuditModule,
        TaxonomyModule,
        ProfileModule,
        SessionsModule,
        EnrollmentProviderModule,
        EntitlementModule,
        ProgressModule,
        ContentModule,
        CatalogModule,
        PlayerModule,
        DashboardModule,
        SettingsModule,
        StudentsModule,
        AdminTaxonomyModule,
        MediaModule,
        FlagsModule,
        NavigationModule,
        HomeBlocksModule,
        AuditReadModule,
      ],
      providers: [
        Reflector,
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: BETTER_AUTH, useValue: fakeAuth },
        AssistantService,
        NotificationsService,
        OptionalSessionService,
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
    // The REAL PrismaService (not a bare PrismaClient cast, unlike some
    // sibling specs): HealthController's route calls this service's own
    // `isHealthy()` method, which only the real class has. It self-
    // configures from DATABASE_URL, so no adapter wiring is needed here.
    prisma = new PrismaService();
    await prisma.$connect();
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DIRECT_DATABASE_URL }),
    });
    await owner.$connect();

    adminId = randomUUID();
    studentId = randomUUID();
    otherStudentId = randomUUID();
    await prisma.user.createMany({
      data: [
        { id: adminId, name: 'Matrix Admin', email: `${adminId}@example.test`, role: 'admin' },
        { id: studentId, name: 'Matrix Student', email: `${studentId}@example.test`, role: 'student' },
        { id: otherStudentId, name: 'Matrix Other', email: `${otherStudentId}@example.test`, role: 'student' },
      ],
    });

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    const governorate = await prisma.governorate.findFirstOrThrow();
    governorateCode = governorate.code;

    const course = await prisma.course.create({
      data: {
        slug: `authz-matrix-${randomUUID()}`,
        title: 'كورس مصفوفة الصلاحيات',
        status: 'published',
        publishedAt: new Date(),
        systemId: system.id,
        year: 2,
        subjectId: subject.id,
        instructorId: adminId,
      },
    });
    courseId = course.id;
    courseSlug = course.slug;
    const section = await prisma.courseSection.create({
      data: { courseId, title: 'وحدة', position: 0, isPublished: true },
    });
    sectionId = section.id;
    const lesson = await prisma.lesson.create({
      data: { courseId, sectionId, title: 'درس', kind: 'text', position: 0, isPublished: true },
    });
    lessonId = lesson.id;
    await prisma.lessonText.create({ data: { lessonId, bodyHtml: '<p>محتوى</p>' } });
    const resource = await prisma.lessonResource.create({
      data: {
        lessonId,
        kind: 'document',
        title: 'ملف المصفوفة',
        storageKey: `matrix/${randomUUID()}.pdf`,
        filename: 'matrix.pdf',
        mime: 'application/pdf',
        sizeBytes: 1024,
      },
    });
    resourceId = resource.id;

    await prisma.enrollment.create({ data: { userId: studentId, courseId } });
    // `otherStudentId` is deliberately NOT enrolled anywhere -- the whole
    // point of this fixture pair is proving 404, not 403, on every
    // ownership-scoped route below.

    // `StudentsService.detail` looks up `student_profiles` by userId, so the
    // admin-detail row below needs one to exist -- a bare `User` row (which
    // is all `registerActors`-style fixtures normally need) is not enough.
    await prisma.studentProfile.create({
      data: {
        userId: studentId,
        fullName: 'Matrix Student',
        gender: 'male',
        phone: `010${Date.now().toString().slice(-8)}`,
        governorateCode,
      },
    });

    // A second, throwaway course for admin-mutation rows that must not
    // corrupt the fixture course above (e.g. status changes, deletes).
    const scratchCourse = await prisma.course.create({
      data: {
        slug: `authz-matrix-scratch-${randomUUID()}`,
        title: 'كورس مؤقت',
        status: 'draft',
        systemId: system.id,
        year: 2,
        subjectId: subject.id,
        instructorId: adminId,
      },
    });
    scratchCourseId = scratchCourse.id;
    const scratchSection = await prisma.courseSection.create({
      data: { courseId: scratchCourseId, title: 'وحدة مؤقتة', position: 0, isPublished: false },
    });
    scratchSectionId = scratchSection.id;
    const scratchLesson = await prisma.lesson.create({
      data: {
        courseId: scratchCourseId,
        sectionId: scratchSectionId,
        title: 'درس مؤقت',
        kind: 'text',
        position: 0,
        isPublished: false,
      },
    });
    scratchLessonId = scratchLesson.id;

    const studentDevice = await prisma.sessionDevice.create({
      data: {
        userId: studentId,
        sessionId: `matrix-${randomUUID()}`,
        deviceName: 'matrix-fixture',
        deviceType: 'desktop',
        lastSeenAt: new Date(),
      },
    });
    studentDeviceId = studentDevice.id;
    const otherDevice = await prisma.sessionDevice.create({
      data: {
        userId: otherStudentId,
        sessionId: `matrix-${randomUUID()}`,
        deviceName: 'matrix-fixture',
        deviceType: 'desktop',
        lastSeenAt: new Date(),
      },
    });
    otherDeviceId = otherDevice.id;

    const homeBlock = await prisma.homeBlock.create({
      data: {
        key: `matrix-${randomUUID()}`,
        type: 'courseGrid',
        // `HomeBlocksService.toDto` re-parses `props` through the real
        // discriminated-union schema on every read -- an empty object fails
        // that parse (500), so this must be a genuinely valid `courseGrid`
        // shape, not a placeholder.
        props: { type: 'courseGrid', titleAr: 'مصفوفة', courseIds: [], limit: 6 },
        position: 999,
        isPublished: false,
      },
    });
    homeBlockId = homeBlock.id;
    const navItem = await prisma.navigationItem.create({
      data: { labelAr: 'مصفوفة', href: '/matrix', position: 999 },
    });
    navItemId = navItem.id;

    anonApp = await buildApp(async () => null);
    studentApp = await buildApp(async () => sessionFor(studentId, 'student'));
    otherApp = await buildApp(async () => sessionFor(otherStudentId, 'student'));
    adminApp = await buildApp(async () => sessionFor(adminId, 'admin'));

    routes = enumerateRoutes(adminApp);
  });

  afterAll(async () => {
    await anonApp?.close();
    await studentApp?.close();
    await otherApp?.close();
    await adminApp?.close();

    await owner.homeBlock.delete({ where: { id: homeBlockId } }).catch(() => undefined);
    await owner.navigationItem.delete({ where: { id: navItemId } }).catch(() => undefined);
    await owner.sessionDevice.deleteMany({ where: { id: { in: [studentDeviceId, otherDeviceId] } } });
    await owner.enrollment.deleteMany({ where: { courseId: { in: [courseId, scratchCourseId] } } });
    await owner.lesson.deleteMany({ where: { courseId: { in: [courseId, scratchCourseId] } } });
    await owner.courseSection.deleteMany({ where: { courseId: { in: [courseId, scratchCourseId] } } });
    await owner.course.deleteMany({ where: { id: { in: [courseId, scratchCourseId] } } });
    await owner.user.deleteMany({ where: { id: { in: [adminId, studentId, otherStudentId] } } });
    await owner.$disconnect();
    await prisma.$disconnect();
  });

  type Actor = 'anonymous' | 'student' | 'other' | 'admin';
  const apps = { anonymous: () => anonApp, student: () => studentApp, other: () => otherApp, admin: () => adminApp };

  interface Row {
    label: string;
    method: 'get' | 'post' | 'put' | 'patch' | 'delete';
    path: () => string;
    actor: Actor;
    status: number;
    body?: () => unknown;
  }

  const MATRIX: Row[] = [
    // ── Public (health / taxonomy / catalog) — no session needed at all ──
    { label: 'health', method: 'get', path: () => '/api/health', actor: 'anonymous', status: 200 },
    { label: 'taxonomy', method: 'get', path: () => '/api/taxonomy', actor: 'anonymous', status: 200 },
    { label: 'catalog list', method: 'get', path: () => '/api/catalog/courses', actor: 'anonymous', status: 200 },
    { label: 'catalog course', method: 'get', path: () => `/api/catalog/courses/${courseId}`, actor: 'anonymous', status: 404 },

    // ── Session echo — authenticated only, no permission string ──
    { label: 'session: anonymous', method: 'get', path: () => '/api/session', actor: 'anonymous', status: 401 },
    { label: 'session: student', method: 'get', path: () => '/api/session', actor: 'student', status: 200 },

    // ── Profile — self-scoped, no id in the URL at all ──
    { label: 'profile me: anonymous', method: 'get', path: () => '/api/profile/me', actor: 'anonymous', status: 401 },
    { label: 'profile me: student', method: 'get', path: () => '/api/profile/me', actor: 'student', status: 200 },
    { label: 'profile onboarding: anonymous', method: 'patch', path: () => '/api/profile/onboarding', actor: 'anonymous', status: 401 },
    // The avatar upload's ONE authorization question. `profile:write` guards
    // it — the permission every student already holds — so unlike
    // `POST /api/media` there is no role to deny and no 403 row to write; the
    // signed-in/anonymous boundary is the whole of it. The 2xx is a documented
    // gap below.
    { label: 'profile avatar: anonymous', method: 'post', path: () => '/api/profile/avatar', actor: 'anonymous', status: 401 },
    // The section editor. Same self-scoped shape as onboarding above — the
    // userId comes from the session and never from the body, so there is no id
    // to tamper with and the anonymous/authenticated boundary is the whole
    // authorization question.
    //
    // `{ year: 1 }` is the smallest legal payload: every field on
    // `StudentSectionSchema` is optional, and year 1 is the one year that
    // needs neither a track nor an elective to be internally consistent.
    { label: 'profile section: anonymous', method: 'patch', path: () => '/api/profile/section', actor: 'anonymous', status: 401, body: () => ({ year: 1 }) },
    { label: 'profile section: student', method: 'patch', path: () => '/api/profile/section', actor: 'student', status: 200, body: () => ({ year: 1 }) },
    // Mass assignment, denied by the DTO rather than by the service: the
    // schema is `.strict()`, so a payload reaching for a column this route has
    // no business writing is a 400 before any handler runs. This is the row
    // that would catch someone "helpfully" relaxing that.
    { label: 'profile section: rejects a field outside the section', method: 'patch', path: () => '/api/profile/section', actor: 'student', status: 400, body: () => ({ year: 1, fullName: 'مش من حقه' }) },

    // ── Sessions/devices — self-scoped; a 404 on someone else's device id ──
    { label: 'sessions list: anonymous', method: 'get', path: () => '/api/sessions', actor: 'anonymous', status: 401 },
    { label: 'sessions list: student', method: 'get', path: () => '/api/sessions', actor: 'student', status: 200 },
    { label: 'revoke device: anonymous', method: 'delete', path: () => `/api/sessions/${studentDeviceId}`, actor: 'anonymous', status: 401 },
    { label: 'revoke device: non-owner is 404', method: 'delete', path: () => `/api/sessions/${otherDeviceId}`, actor: 'student', status: 404 },
    { label: 'revoke device: owner', method: 'delete', path: () => `/api/sessions/${studentDeviceId}`, actor: 'student', status: 204 },

    // ── Enrollment ──
    { label: 'enrollments list: anonymous', method: 'get', path: () => '/api/enrollments', actor: 'anonymous', status: 401 },
    { label: 'enrollments list: student', method: 'get', path: () => '/api/enrollments', actor: 'student', status: 200 },
    { label: 'enroll: anonymous', method: 'post', path: () => `/api/courses/${scratchCourseId}/enroll`, actor: 'anonymous', status: 401 },
    { label: 'enroll: draft course is 404', method: 'post', path: () => `/api/courses/${scratchCourseId}/enroll`, actor: 'other', status: 404 },

    // ── Progress — ownership is ENROLLMENT, not a permission string; both
    // students hold `progress:write`, so only enrollment distinguishes them.
    // (`heartbeat` is deliberately not exercised here: it 400s for anything
    // but a video-kind lesson, a business rule this fixture's text lesson
    // would trip regardless of actor -- open/dwell/complete already cover
    // the ownership dimension this matrix cares about.)
    { label: 'progress open: anonymous', method: 'post', path: () => `/api/lessons/${lessonId}/open`, actor: 'anonymous', status: 401, body: () => ({}) },
    { label: 'progress open: enrolled student', method: 'post', path: () => `/api/lessons/${lessonId}/open`, actor: 'student', status: 201, body: () => ({}) },
    { label: 'progress open: non-enrolled is 404', method: 'post', path: () => `/api/lessons/${lessonId}/open`, actor: 'other', status: 404, body: () => ({}) },
    { label: 'progress open: admin has no enrollment bypass', method: 'post', path: () => `/api/lessons/${lessonId}/open`, actor: 'admin', status: 404, body: () => ({}) },
    { label: 'progress dwell: non-enrolled is 404', method: 'post', path: () => `/api/lessons/${lessonId}/dwell`, actor: 'other', status: 404, body: () => ({}) },
    { label: 'progress complete: non-enrolled is 404', method: 'post', path: () => `/api/lessons/${lessonId}/complete`, actor: 'other', status: 404, body: () => ({}) },

    // ── Player — course:read is held by students too (Plan 2), so the
    // ownership dimension is enrollment, exactly like progress. `outline`
    // takes the course SLUG, not its id.
    { label: 'player outline: anonymous', method: 'get', path: () => `/api/courses/${courseSlug}/outline`, actor: 'anonymous', status: 401 },
    { label: 'player outline: enrolled student', method: 'get', path: () => `/api/courses/${courseSlug}/outline`, actor: 'student', status: 200 },
    { label: 'player outline: non-enrolled is 404', method: 'get', path: () => `/api/courses/${courseSlug}/outline`, actor: 'other', status: 404 },
    { label: 'player outline: admin has no enrollment bypass', method: 'get', path: () => `/api/courses/${courseSlug}/outline`, actor: 'admin', status: 404 },
    { label: 'player lesson: enrolled student', method: 'get', path: () => `/api/lessons/${lessonId}/player`, actor: 'student', status: 200 },
    { label: 'player lesson: non-enrolled is 404', method: 'get', path: () => `/api/lessons/${lessonId}/player`, actor: 'other', status: 404 },
    { label: 'resource view: anonymous', method: 'get', path: () => `/api/lessons/${lessonId}/resources/${resourceId}/view`, actor: 'anonymous', status: 401 },
    { label: 'resource view: non-enrolled is 404', method: 'get', path: () => `/api/lessons/${lessonId}/resources/${resourceId}/view`, actor: 'other', status: 404 },
    { label: 'resource download: anonymous', method: 'get', path: () => `/api/lessons/${lessonId}/resources/${resourceId}/download`, actor: 'anonymous', status: 401 },
    { label: 'resource download: non-enrolled is 404', method: 'get', path: () => `/api/lessons/${lessonId}/resources/${resourceId}/download`, actor: 'other', status: 404 },

    // ── Dashboard — self-scoped, no id in the URL ──
    { label: 'dashboard: anonymous', method: 'get', path: () => '/api/me/dashboard', actor: 'anonymous', status: 401 },
    { label: 'path: anonymous', method: 'get', path: () => '/api/me/path', actor: 'anonymous', status: 401 },
    { label: 'dashboard: student', method: 'get', path: () => '/api/me/dashboard', actor: 'student', status: 200 },
    { label: 'path: student', method: 'get', path: () => '/api/me/path', actor: 'student', status: 200 },
    // Same self-scoped shape, but guarded by `quiz:read` rather than the
    // dashboard's own permission — so it earns its own rows instead of riding
    // on theirs. There is no id to tamper with; the session IS the identity.
    { label: 'quiz history: anonymous', method: 'get', path: () => '/api/me/quizzes', actor: 'anonymous', status: 401 },
    { label: 'quiz history: student', method: 'get', path: () => '/api/me/quizzes', actor: 'student', status: 200 },
    // Same again for the activity feed, guarded by `progress:read` — the READ
    // half of the pair the heartbeat writes. Its own rows for the same reason
    // the quiz history has its own: a different permission is a different
    // authorization question, even where the URL shape is identical.
    { label: 'activity feed: anonymous', method: 'get', path: () => '/api/me/activity', actor: 'anonymous', status: 401 },
    { label: 'activity feed: student', method: 'get', path: () => '/api/me/activity', actor: 'student', status: 200 },
    // Notifications (slice 4), guarded by `profile:read` for the two reads and
    // `profile:write` for the two writes — deliberately NOT `quiz:read`, even
    // though two of the three kinds are emitted by the quiz engine: the list is
    // about the CALLER, not about a quiz. Each permission is its own
    // authorization question, so each gets its own rows.
    { label: 'notifications feed: anonymous', method: 'get', path: () => '/api/me/notifications', actor: 'anonymous', status: 401 },
    { label: 'notifications feed: student', method: 'get', path: () => '/api/me/notifications', actor: 'student', status: 200 },
    { label: 'notifications unread count: anonymous', method: 'get', path: () => '/api/me/notifications/unread-count', actor: 'anonymous', status: 401 },
    { label: 'notifications unread count: student', method: 'get', path: () => '/api/me/notifications/unread-count', actor: 'student', status: 200 },
    { label: 'notifications read-all: anonymous', method: 'post', path: () => '/api/me/notifications/read-all', actor: 'anonymous', status: 401 },
    { label: 'notifications read-all: student', method: 'post', path: () => '/api/me/notifications/read-all', actor: 'student', status: 204 },
    // A notification id that belongs to nobody. It answers 204 rather than 404
    // BY DESIGN: `markRead` scopes its `updateMany` on `{ id, userId }`, so a
    // guessed id updates zero rows and says nothing about whether it exists.
    // A 404 here would be an existence oracle over another student's ids.
    { label: 'notification read: anonymous', method: 'post', path: () => `/api/me/notifications/${randomUUID()}/read`, actor: 'anonymous', status: 401 },
    { label: 'notification read: student (someone else’s id is a silent no-op)', method: 'post', path: () => `/api/me/notifications/${randomUUID()}/read`, actor: 'student', status: 204 },

    // ── المساعد: the visitor side is PUBLIC on purpose ──────────────────
    // These are the only public routes in the product that WRITE, which is
    // why they carry `@RequireCsrf()` on top of `@Public()`. CSRF is not what
    // this file tests (see the header — `SecurityModule` is excluded
    // deliberately), so what these rows prove is the other half: that an
    // anonymous visitor is not turned away by the auth guard, and that a
    // signed-in student reaches the same routes without a permission gate.
    { label: 'assistant my thread: anonymous (200 with null, never 401)', method: 'get', path: () => '/api/assistant/conversations/mine', actor: 'anonymous', status: 200 },
    { label: 'assistant my thread: student', method: 'get', path: () => '/api/assistant/conversations/mine', actor: 'student', status: 200 },
    // An anonymous open with no name or phone: reachable (not 401), and
    // rejected on its CONTENT (400) rather than on identity. If the guard
    // ever started gating this route, this row would turn into a 401 and say
    // so — a prospective student would silently lose the ability to ask.
    { label: 'assistant open: anonymous with no contact details is a 400, not a 401', method: 'post', path: () => '/api/assistant/conversations', actor: 'anonymous', status: 400, body: () => ({ entryPath: ['root'], message: 'الكورس بكام؟' }) },
    { label: 'assistant follow-up: anonymous with no thread', method: 'post', path: () => `/api/assistant/conversations/${randomUUID()}/messages`, actor: 'anonymous', status: 403, body: () => ({ message: 'تاني' }) },
    { label: 'assistant follow-up: student who owns no such thread', method: 'post', path: () => `/api/assistant/conversations/${randomUUID()}/messages`, actor: 'student', status: 404, body: () => ({ message: 'تاني' }) },
    // Scoped by `{ id, userId }` in an `updateMany`, so a guessed id updates
    // zero rows and returns 204 — the same existence-oracle reasoning as the
    // notification read route directly above.
    { label: 'assistant mark read: student (someone else’s id is a silent no-op)', method: 'post', path: () => `/api/assistant/conversations/${randomUUID()}/read`, actor: 'student', status: 204 },

    // ── المساعد: the inbox is admin-only, on three separate permissions ──
    { label: 'inbox list: anonymous', method: 'get', path: () => '/api/admin/conversations', actor: 'anonymous', status: 401 },
    { label: 'inbox list: student', method: 'get', path: () => '/api/admin/conversations', actor: 'student', status: 403 },
    { label: 'inbox list: admin', method: 'get', path: () => '/api/admin/conversations', actor: 'admin', status: 200 },
    { label: 'inbox unread count: student', method: 'get', path: () => '/api/admin/conversations/unread-count', actor: 'student', status: 403 },
    { label: 'inbox unread count: admin', method: 'get', path: () => '/api/admin/conversations/unread-count', actor: 'admin', status: 200 },
    { label: 'inbox detail: anonymous', method: 'get', path: () => `/api/admin/conversations/${randomUUID()}`, actor: 'anonymous', status: 401 },
    { label: 'inbox detail: student', method: 'get', path: () => `/api/admin/conversations/${randomUUID()}`, actor: 'student', status: 403 },
    // `conversation:reply` is a DIFFERENT permission from `conversation:read`,
    // so it is a different authorization question and gets its own rows —
    // exactly the split that lets a reply-but-never-close role exist later.
    { label: 'inbox reply: anonymous', method: 'post', path: () => `/api/admin/conversations/${randomUUID()}/reply`, actor: 'anonymous', status: 401, body: () => ({ message: 'أهلاً' }) },
    { label: 'inbox reply: student', method: 'post', path: () => `/api/admin/conversations/${randomUUID()}/reply`, actor: 'student', status: 403, body: () => ({ message: 'أهلاً' }) },
    { label: 'inbox status: anonymous', method: 'patch', path: () => `/api/admin/conversations/${randomUUID()}/status`, actor: 'anonymous', status: 401, body: () => ({ status: 'closed' }) },
    { label: 'inbox status: student', method: 'patch', path: () => `/api/admin/conversations/${randomUUID()}/status`, actor: 'student', status: 403, body: () => ({ status: 'closed' }) },

    // ── Content admin: course/section/lesson — admin-only CRUD, no per-
    // resource ownership dimension (any admin may touch any course). ──
    { label: 'admin courses list: anonymous', method: 'get', path: () => '/api/admin/courses', actor: 'anonymous', status: 401 },
    { label: 'admin courses list: student', method: 'get', path: () => '/api/admin/courses', actor: 'student', status: 403 },
    { label: 'admin courses list: admin', method: 'get', path: () => '/api/admin/courses', actor: 'admin', status: 200 },
    { label: 'admin course detail: student', method: 'get', path: () => `/api/admin/courses/${courseId}`, actor: 'student', status: 403 },
    { label: 'admin course detail: admin', method: 'get', path: () => `/api/admin/courses/${courseId}`, actor: 'admin', status: 200 },
    { label: 'admin course create: anonymous', method: 'post', path: () => '/api/admin/courses', actor: 'anonymous', status: 401 },
    { label: 'admin course create: student', method: 'post', path: () => '/api/admin/courses', actor: 'student', status: 403 },
    { label: 'admin course update: student', method: 'patch', path: () => `/api/admin/courses/${scratchCourseId}`, actor: 'student', status: 403 },
    { label: 'admin course status: student', method: 'patch', path: () => `/api/admin/courses/${scratchCourseId}/status`, actor: 'student', status: 403 },
    { label: 'admin course delete: anonymous', method: 'delete', path: () => `/api/admin/courses/${scratchCourseId}`, actor: 'anonymous', status: 401 },
    { label: 'admin course delete: student', method: 'delete', path: () => `/api/admin/courses/${scratchCourseId}`, actor: 'student', status: 403 },

    { label: 'admin section reorder: anonymous', method: 'patch', path: () => `/api/admin/courses/${scratchCourseId}/sections/order`, actor: 'anonymous', status: 401 },
    { label: 'admin section reorder: student', method: 'patch', path: () => `/api/admin/courses/${scratchCourseId}/sections/order`, actor: 'student', status: 403 },
    { label: 'admin section create: anonymous', method: 'post', path: () => `/api/admin/courses/${scratchCourseId}/sections`, actor: 'anonymous', status: 401 },
    { label: 'admin section create: student', method: 'post', path: () => `/api/admin/courses/${scratchCourseId}/sections`, actor: 'student', status: 403 },
    {
      label: 'admin section create: admin',
      method: 'post',
      path: () => `/api/admin/courses/${scratchCourseId}/sections`,
      actor: 'admin',
      status: 201,
      body: () => ({ title: 'قسم من المصفوفة', summary: null, isPublished: false }),
    },
    { label: 'admin section update: student', method: 'patch', path: () => `/api/admin/sections/${scratchSectionId}`, actor: 'student', status: 403 },
    { label: 'admin section delete: anonymous', method: 'delete', path: () => `/api/admin/sections/${scratchSectionId}`, actor: 'anonymous', status: 401 },
    { label: 'admin section delete: student', method: 'delete', path: () => `/api/admin/sections/${scratchSectionId}`, actor: 'student', status: 403 },

    { label: 'admin lesson reorder: student', method: 'patch', path: () => `/api/admin/sections/${scratchSectionId}/lessons/order`, actor: 'student', status: 403 },
    { label: 'admin lesson create: anonymous', method: 'post', path: () => `/api/admin/sections/${scratchSectionId}/lessons`, actor: 'anonymous', status: 401 },
    { label: 'admin lesson create: student', method: 'post', path: () => `/api/admin/sections/${scratchSectionId}/lessons`, actor: 'student', status: 403 },
    {
      label: 'admin lesson create: admin',
      method: 'post',
      path: () => `/api/admin/sections/${scratchSectionId}/lessons`,
      actor: 'admin',
      status: 201,
      body: () => ({
        title: 'درس من المصفوفة',
        kind: 'text',
        isPublished: false,
        isFreePreview: false,
        estimatedSeconds: 0,
        completionMode: 'manual',
        completionMinViewSeconds: null,
        completionPassGrade: null,
      }),
    },
    { label: 'admin lesson update: student', method: 'patch', path: () => `/api/admin/lessons/${scratchLessonId}`, actor: 'student', status: 403 },
    { label: 'admin lesson delete: anonymous', method: 'delete', path: () => `/api/admin/lessons/${scratchLessonId}`, actor: 'anonymous', status: 401 },
    { label: 'admin lesson delete: student', method: 'delete', path: () => `/api/admin/lessons/${scratchLessonId}`, actor: 'student', status: 403 },
    { label: 'admin lesson video put: student', method: 'put', path: () => `/api/admin/lessons/${scratchLessonId}/video`, actor: 'student', status: 403 },
    { label: 'admin lesson video delete: student', method: 'delete', path: () => `/api/admin/lessons/${scratchLessonId}/video`, actor: 'student', status: 403 },
    { label: 'admin lesson text put: anonymous', method: 'put', path: () => `/api/admin/lessons/${scratchLessonId}/text`, actor: 'anonymous', status: 401 },
    { label: 'admin lesson text put: student', method: 'put', path: () => `/api/admin/lessons/${scratchLessonId}/text`, actor: 'student', status: 403 },
    {
      label: 'admin lesson text put: admin',
      method: 'put',
      path: () => `/api/admin/lessons/${scratchLessonId}/text`,
      actor: 'admin',
      status: 200,
      body: () => ({ bodyHtml: '<p>محدث من المصفوفة</p>' }),
    },
    { label: 'admin lesson resources post: student', method: 'post', path: () => `/api/admin/lessons/${scratchLessonId}/resources`, actor: 'student', status: 403 },
    { label: 'admin course exam put: anonymous', method: 'put', path: () => `/api/admin/courses/${scratchCourseId}/exam`, actor: 'anonymous', status: 401 },
    { label: 'admin course exam put: student', method: 'put', path: () => `/api/admin/courses/${scratchCourseId}/exam`, actor: 'student', status: 403 },
    { label: 'admin resource delete: anonymous', method: 'delete', path: () => `/api/admin/resources/${randomUUID()}`, actor: 'anonymous', status: 401 },
    { label: 'admin resource delete: student', method: 'delete', path: () => `/api/admin/resources/${randomUUID()}`, actor: 'student', status: 403 },
    { label: 'admin resource patch: student', method: 'patch', path: () => `/api/admin/resources/${randomUUID()}`, actor: 'student', status: 403 },
    { label: 'admin resource reorder: student', method: 'patch', path: () => `/api/admin/lessons/${lessonId}/resources/order`, actor: 'student', status: 403 },
    { label: 'document upload: student', method: 'post', path: () => `/api/media/documents`, actor: 'student', status: 403 },
    { label: 'document upload: anonymous', method: 'post', path: () => `/api/media/documents`, actor: 'anonymous', status: 401 },

    // ── Media — admin-only ──
    { label: 'media upload: anonymous', method: 'post', path: () => '/api/media', actor: 'anonymous', status: 401 },
    { label: 'media upload: student', method: 'post', path: () => '/api/media', actor: 'student', status: 403 },
    { label: 'media admin list: anonymous', method: 'get', path: () => '/api/admin/media', actor: 'anonymous', status: 401 },
    { label: 'media admin list: student', method: 'get', path: () => '/api/admin/media', actor: 'student', status: 403 },
    { label: 'media admin list: admin', method: 'get', path: () => '/api/admin/media', actor: 'admin', status: 200 },
    { label: 'media patch: student', method: 'patch', path: () => `/api/admin/media/${randomUUID()}`, actor: 'student', status: 403 },
    { label: 'media archive: anonymous', method: 'post', path: () => `/api/admin/media/${randomUUID()}/archive`, actor: 'anonymous', status: 401 },
    { label: 'media archive: student', method: 'post', path: () => `/api/admin/media/${randomUUID()}/archive`, actor: 'student', status: 403 },
    { label: 'media restore: student', method: 'post', path: () => `/api/admin/media/${randomUUID()}/restore`, actor: 'student', status: 403 },
    // Public by design (Global Constraint: media is served from its own
    // origin, outside /api's auth boundary) -- a nonexistent key 404s
    // without ever reaching a permission check, which is itself the proof.
    { label: 'media serve: anonymous, nonexistent key', method: 'get', path: () => '/api/media/ab/nonexistent.webp', actor: 'anonymous', status: 404 },

    // ── Settings — two public reads, admin-only read/write ──
    { label: 'settings branding: anonymous', method: 'get', path: () => '/api/settings/branding', actor: 'anonymous', status: 200 },
    { label: 'settings public: anonymous', method: 'get', path: () => '/api/settings/public', actor: 'anonymous', status: 200 },
    { label: 'settings admin read: anonymous', method: 'get', path: () => '/api/admin/settings', actor: 'anonymous', status: 401 },
    { label: 'settings admin read: student', method: 'get', path: () => '/api/admin/settings', actor: 'student', status: 403 },
    { label: 'settings admin read: admin', method: 'get', path: () => '/api/admin/settings', actor: 'admin', status: 200 },
    { label: 'settings admin write: anonymous', method: 'patch', path: () => '/api/admin/settings/contact', actor: 'anonymous', status: 401 },
    { label: 'settings admin write: student', method: 'patch', path: () => '/api/admin/settings/contact', actor: 'student', status: 403 },

    // ── Students admin — admin manages OTHER students; no self-service route ──
    { label: 'students list: anonymous', method: 'get', path: () => '/api/admin/students', actor: 'anonymous', status: 401 },
    { label: 'students list: student', method: 'get', path: () => '/api/admin/students', actor: 'student', status: 403 },
    { label: 'students list: admin', method: 'get', path: () => '/api/admin/students', actor: 'admin', status: 200 },
    { label: 'student detail: student', method: 'get', path: () => `/api/admin/students/${studentId}`, actor: 'student', status: 403 },
    { label: 'student detail: admin', method: 'get', path: () => `/api/admin/students/${studentId}`, actor: 'admin', status: 200 },
    { label: 'student patch: anonymous', method: 'patch', path: () => `/api/admin/students/${studentId}`, actor: 'anonymous', status: 401 },
    { label: 'student patch: student', method: 'patch', path: () => `/api/admin/students/${studentId}`, actor: 'student', status: 403 },
    { label: 'student role change: anonymous', method: 'post', path: () => `/api/admin/students/${studentId}/role`, actor: 'anonymous', status: 401 },
    { label: 'student role change: student', method: 'post', path: () => `/api/admin/students/${studentId}/role`, actor: 'student', status: 403 },

    // ── Admin taxonomy — reads split off with `taxonomy:read`, writes need
    // `taxonomy:write`; neither is granted to `student`. ──
    { label: 'admin taxonomy governorates: anonymous', method: 'get', path: () => '/api/admin/taxonomy/governorates', actor: 'anonymous', status: 401 },
    { label: 'admin taxonomy governorates: student', method: 'get', path: () => '/api/admin/taxonomy/governorates', actor: 'student', status: 403 },
    { label: 'admin taxonomy governorates: admin', method: 'get', path: () => '/api/admin/taxonomy/governorates', actor: 'admin', status: 200 },
    { label: 'admin taxonomy governorate patch: anonymous', method: 'patch', path: () => `/api/admin/taxonomy/governorates/${governorateCode}`, actor: 'anonymous', status: 401 },
    { label: 'admin taxonomy governorate patch: student', method: 'patch', path: () => `/api/admin/taxonomy/governorates/${governorateCode}`, actor: 'student', status: 403 },
    { label: 'admin taxonomy systems: admin', method: 'get', path: () => '/api/admin/taxonomy/systems', actor: 'admin', status: 200 },
    { label: 'admin taxonomy system patch: student', method: 'patch', path: () => `/api/admin/taxonomy/systems/${randomUUID()}`, actor: 'student', status: 403 },
    { label: 'admin taxonomy academic-year patch: anonymous', method: 'patch', path: () => `/api/admin/taxonomy/academic-years/${randomUUID()}`, actor: 'anonymous', status: 401 },
    { label: 'admin taxonomy academic-year patch: student', method: 'patch', path: () => `/api/admin/taxonomy/academic-years/${randomUUID()}`, actor: 'student', status: 403 },
    { label: 'admin taxonomy tracks: admin', method: 'get', path: () => '/api/admin/taxonomy/tracks', actor: 'admin', status: 200 },
    { label: 'admin taxonomy track create: anonymous', method: 'post', path: () => '/api/admin/taxonomy/tracks', actor: 'anonymous', status: 401 },
    { label: 'admin taxonomy track create: student', method: 'post', path: () => '/api/admin/taxonomy/tracks', actor: 'student', status: 403 },
    { label: 'admin taxonomy track patch: student', method: 'patch', path: () => `/api/admin/taxonomy/tracks/${randomUUID()}`, actor: 'student', status: 403 },
    { label: 'admin taxonomy subjects: admin', method: 'get', path: () => '/api/admin/taxonomy/subjects', actor: 'admin', status: 200 },
    { label: 'admin taxonomy subject create: anonymous', method: 'post', path: () => '/api/admin/taxonomy/subjects', actor: 'anonymous', status: 401 },
    { label: 'admin taxonomy subject create: student', method: 'post', path: () => '/api/admin/taxonomy/subjects', actor: 'student', status: 403 },
    { label: 'admin taxonomy subject patch: student', method: 'patch', path: () => `/api/admin/taxonomy/subjects/${randomUUID()}`, actor: 'student', status: 403 },
    { label: 'admin taxonomy subject delete: anonymous', method: 'delete', path: () => `/api/admin/taxonomy/subjects/${randomUUID()}`, actor: 'anonymous', status: 401 },
    { label: 'admin taxonomy subject delete: student', method: 'delete', path: () => `/api/admin/taxonomy/subjects/${randomUUID()}`, actor: 'student', status: 403 },
    { label: 'admin taxonomy subject-offerings: admin', method: 'get', path: () => '/api/admin/taxonomy/subject-offerings', actor: 'admin', status: 200 },
    { label: 'admin taxonomy subject-offering create: student', method: 'post', path: () => '/api/admin/taxonomy/subject-offerings', actor: 'student', status: 403 },
    { label: 'admin taxonomy subject-offering patch: student', method: 'patch', path: () => `/api/admin/taxonomy/subject-offerings/${randomUUID()}`, actor: 'student', status: 403 },

    // ── Navigation — one public read, admin-only write ──
    { label: 'navigation public: anonymous', method: 'get', path: () => '/api/navigation', actor: 'anonymous', status: 200 },
    { label: 'navigation admin read: anonymous', method: 'get', path: () => '/api/admin/navigation', actor: 'anonymous', status: 401 },
    { label: 'navigation admin read: student', method: 'get', path: () => '/api/admin/navigation', actor: 'student', status: 403 },
    { label: 'navigation admin read: admin', method: 'get', path: () => '/api/admin/navigation', actor: 'admin', status: 200 },
    { label: 'navigation create: anonymous', method: 'post', path: () => '/api/admin/navigation', actor: 'anonymous', status: 401 },
    { label: 'navigation create: student', method: 'post', path: () => '/api/admin/navigation', actor: 'student', status: 403 },
    { label: 'navigation patch: student', method: 'patch', path: () => `/api/admin/navigation/${navItemId}`, actor: 'student', status: 403 },
    {
      label: 'navigation patch: admin',
      method: 'patch',
      path: () => `/api/admin/navigation/${navItemId}`,
      actor: 'admin',
      status: 200,
      body: () => ({ labelAr: 'مصفوفة محدثة' }),
    },
    { label: 'navigation delete: anonymous', method: 'delete', path: () => `/api/admin/navigation/${navItemId}`, actor: 'anonymous', status: 401 },
    { label: 'navigation delete: student', method: 'delete', path: () => `/api/admin/navigation/${navItemId}`, actor: 'student', status: 403 },
    { label: 'navigation restore: student', method: 'post', path: () => `/api/admin/navigation/${navItemId}/restore`, actor: 'student', status: 403 },
    { label: 'navigation order: anonymous', method: 'post', path: () => '/api/admin/navigation/order', actor: 'anonymous', status: 401 },
    { label: 'navigation order: student', method: 'post', path: () => '/api/admin/navigation/order', actor: 'student', status: 403 },

    // ── Home blocks — one public read, admin-only write ──
    { label: 'home-blocks public: anonymous', method: 'get', path: () => '/api/home-blocks', actor: 'anonymous', status: 200 },
    { label: 'home-blocks admin read: anonymous', method: 'get', path: () => '/api/admin/home-blocks', actor: 'anonymous', status: 401 },
    { label: 'home-blocks admin read: student', method: 'get', path: () => '/api/admin/home-blocks', actor: 'student', status: 403 },
    { label: 'home-blocks admin read: admin', method: 'get', path: () => '/api/admin/home-blocks', actor: 'admin', status: 200 },
    { label: 'home-blocks create: anonymous', method: 'post', path: () => '/api/admin/home-blocks', actor: 'anonymous', status: 401 },
    { label: 'home-blocks create: student', method: 'post', path: () => '/api/admin/home-blocks', actor: 'student', status: 403 },
    { label: 'home-blocks patch: student', method: 'patch', path: () => `/api/admin/home-blocks/${homeBlockId}`, actor: 'student', status: 403 },
    {
      label: 'home-blocks published toggle: admin',
      method: 'patch',
      path: () => `/api/admin/home-blocks/${homeBlockId}/published`,
      actor: 'admin',
      status: 200,
      body: () => ({ isPublished: true }),
    },
    { label: 'home-blocks published toggle: student', method: 'patch', path: () => `/api/admin/home-blocks/${homeBlockId}/published`, actor: 'student', status: 403 },
    { label: 'home-blocks delete: anonymous', method: 'delete', path: () => `/api/admin/home-blocks/${homeBlockId}`, actor: 'anonymous', status: 401 },
    { label: 'home-blocks delete: student', method: 'delete', path: () => `/api/admin/home-blocks/${homeBlockId}`, actor: 'student', status: 403 },
    { label: 'home-blocks restore: student', method: 'post', path: () => `/api/admin/home-blocks/${homeBlockId}/restore`, actor: 'student', status: 403 },
    { label: 'home-blocks order: anonymous', method: 'post', path: () => '/api/admin/home-blocks/order', actor: 'anonymous', status: 401 },
    { label: 'home-blocks order: student', method: 'post', path: () => '/api/admin/home-blocks/order', actor: 'student', status: 403 },

    // ── Flags — one public read, admin-only read/write ──
    { label: 'flags public: anonymous', method: 'get', path: () => '/api/flags', actor: 'anonymous', status: 200 },
    { label: 'flags admin read: anonymous', method: 'get', path: () => '/api/admin/flags', actor: 'anonymous', status: 401 },
    { label: 'flags admin read: student', method: 'get', path: () => '/api/admin/flags', actor: 'student', status: 403 },
    { label: 'flags admin read: admin', method: 'get', path: () => '/api/admin/flags', actor: 'admin', status: 200 },
    { label: 'flags write: anonymous', method: 'patch', path: () => `/api/admin/flags/${FLAG_KEY}`, actor: 'anonymous', status: 401 },
    { label: 'flags write: student', method: 'patch', path: () => `/api/admin/flags/${FLAG_KEY}`, actor: 'student', status: 403 },
    {
      label: 'flags write: admin',
      method: 'patch',
      path: () => `/api/admin/flags/${FLAG_KEY}`,
      actor: 'admin',
      status: 200,
      body: () => ({ enabled: true }),
    },

    // ── Audit — admin-only, read-only surface ──
    { label: 'audit verify: anonymous', method: 'get', path: () => '/api/admin/audit/verify', actor: 'anonymous', status: 401 },
    { label: 'audit verify: student', method: 'get', path: () => '/api/admin/audit/verify', actor: 'student', status: 403 },
    { label: 'audit verify: admin', method: 'get', path: () => '/api/admin/audit/verify', actor: 'admin', status: 200 },
    { label: 'audit list: anonymous', method: 'get', path: () => '/api/admin/audit', actor: 'anonymous', status: 401 },
    { label: 'audit list: student', method: 'get', path: () => '/api/admin/audit', actor: 'student', status: 403 },
    { label: 'audit list: admin', method: 'get', path: () => '/api/admin/audit', actor: 'admin', status: 200 },
  ];

  it.each(MATRIX.map((row) => [row.label, row] as const))('%s', async (_label, row) => {
    const app = apps[row.actor]();
    let call = request(app.getHttpServer())[row.method](row.path());
    if (row.body) call = call.send(row.body() as object);
    await call.expect(row.status);
  });

  describe('coverage', () => {
    /**
     * Routes intentionally NOT covered by this file's own MATRIX, with the
     * reason greppable in one place. `quiz.authz.spec.ts` covers the first
     * group in full; the rest are documented, narrow gaps (see the Task
     * 9-15 report for the honest count).
     */
    const COVERED_BY_QUIZ_AUTHZ_SPEC = new Set<string>([
      'GET /api/quiz/lessons/:lessonId',
      'POST /api/quiz/quizzes/:quizId/attempts',
      'POST /api/quiz/attempts/:attemptId/resume',
      'PUT /api/quiz/attempts/:attemptId/answers',
      'POST /api/quiz/attempts/:attemptId/flag',
      'POST /api/quiz/attempts/:attemptId/submit',
      'GET /api/quiz/attempts/:attemptId/preflight',
      'GET /api/quiz/attempts/:attemptId/review',
      'POST /api/quiz/attempts/:attemptId/questions/:slotPosition/check',
      'POST /api/quiz/attempt-questions/:id/appeals',
      'GET /api/quiz/attempts/:attemptId/appeals',
      'GET /api/admin/appeals',
      'PATCH /api/admin/appeals/:id',
      'GET /api/admin/questions/categories',
      'POST /api/admin/questions/categories',
      'GET /api/admin/questions',
      'POST /api/admin/questions',
      'GET /api/admin/questions/:bankEntryId',
      'PATCH /api/admin/questions/:bankEntryId',
      'POST /api/admin/questions/:versionId/publish',
      'POST /api/admin/questions/:bankEntryId/duplicate',
      'POST /api/admin/questions/bulk',
      'GET /api/admin/quizzes/lesson/:lessonId',
      'PUT /api/admin/quizzes/lesson/:lessonId',
      'GET /api/admin/quizzes/:quizId',
      'POST /api/admin/quizzes/:quizId/slots',
      'DELETE /api/admin/quizzes/:quizId/slots/:slotId',
      'PATCH /api/admin/quizzes/:quizId/slots/order',
      'POST /api/admin/quizzes/:quizId/pools',
      'POST /api/admin/quizzes/:quizId/publish',
      'GET /api/admin/attempts',
      'GET /api/admin/quizzes/:quizId/attempts',
      'POST /api/admin/attempts/:id/reopen',
      'POST /api/admin/attempts/:id/extra-time',
      'POST /api/admin/quizzes/:quizId/students/:userId/extra-attempt',
      'GET /api/admin/quizzes/:quizId/analytics',
    ]);

    /**
     * Genuinely not covered by either file, with the reason -- honest gaps,
     * not silently dropped. `POST /api/security/csp-report` is covered by
     * `csp-report.controller.spec.ts` instead (it needs no permission
     * dimension at all: it is `@Public()` and unconditionally 204).
     */
    const KNOWN_GAPS = new Set<string>([
      // Multipart file upload; exercising a real 2xx here needs the same
      // magic-byte-valid PNG fixture `media.service.spec.ts` already uses,
      // which is a unit test, not this matrix's concern. The 401/403 denial
      // rows for `POST /api/media` above ARE covered.
      'POST /api/media',
      // Same multipart problem as `POST /api/media`, for the same reason: a
      // real 2xx needs a magic-byte-valid PNG fixture, and without one every
      // permitted actor hits the same 400 — a row that would say nothing about
      // WHO may call it. `media.service.spec.ts` covers `uploadAvatar`'s gates
      // on a real fixture; the 401 denial row above IS covered here.
      'POST /api/profile/avatar',
      // 400s for anything but a video-kind lesson regardless of actor (a
      // business rule, not an authorization one) -- this fixture's lesson is
      // text-kind, so every actor would hit the same 400 here and the row
      // would test nothing about WHO may call it. `open`/`dwell`/`complete`
      // on the same lesson already cover the enrollment-ownership dimension.
      'POST /api/lessons/:lessonId/heartbeat',
    ]);

    /**
     * Builds a matcher straight from the route's OWN declared shape (real
     * `:param` placeholders, from `enumerateRoutes()` — not a guess at what
     * an interpolated id "looks like"). A MATRIX row's `path()` return value
     * matches a registered route when every STATIC segment is identical and
     * every `:param` position in the registered route lines up with
     * something (anything) in the row's rendered path.
     */
    function matchesRoute(routePath: string, renderedPath: string): boolean {
      const routeSegments = routePath.split('/');
      const renderedSegments = renderedPath.split('/');
      if (routeSegments.length !== renderedSegments.length) return false;
      return routeSegments.every(
        (segment, index) => segment.startsWith(':') || segment === renderedSegments[index],
      );
    }

    it('accounts for every registered route across this file, quiz.authz.spec.ts, or a documented gap', () => {
      const explicitlyHandled = new Set([...COVERED_BY_QUIZ_AUTHZ_SPEC, ...KNOWN_GAPS]);

      const uncovered = routes
        .map((route) => ({ key: `${route.method} ${route.path}`, route }))
        .filter(({ key }) => !explicitlyHandled.has(key))
        .filter(
          ({ route }) =>
            !MATRIX.some(
              (row) =>
                row.method.toUpperCase() === route.method && matchesRoute(route.path, row.path()),
            ),
        )
        .map(({ key }) => key);

      expect(uncovered).toEqual([]);
    });

    it('marks nothing public by accident', () => {
      const publicRoutes = routes
        .filter((route) => route.isPublic)
        .map((route) => `${route.method} ${route.path}`)
        .sort();
      expect(publicRoutes).toEqual(
        [
          'GET /api/health',
          'GET /api/taxonomy',
          'GET /api/catalog/courses',
          'GET /api/catalog/courses/:slug',
          'GET /api/settings/branding',
          'GET /api/settings/public',
          'GET /api/flags',
          'GET /api/navigation',
          'GET /api/home-blocks',
          'GET /api/media/:prefix/:name',
          // المساعد. The only PUBLIC WRITES in the product — every other
          // entry on this list is a read. They are here deliberately, and
          // they are the reason `@RequireCsrf()` exists: `@Public()` had
          // always implied "no CSRF check either", which was safe only while
          // every public route was a GET.
          'GET /api/assistant/conversations/mine',
          'POST /api/assistant/conversations',
          'POST /api/assistant/conversations/:id/messages',
          'POST /api/assistant/conversations/:id/read',
        ].sort(),
      );
    });
  });
});
