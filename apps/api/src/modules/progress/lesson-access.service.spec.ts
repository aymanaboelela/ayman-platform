// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { LessonAccessService } from './lesson-access.service';
import { LessonGateService } from './lesson-gate.service';

/**
 * Integration test against the real database, matching
 * `entitlement.service.spec.ts` and `lesson-progress.service.spec.ts` — a mock
 * here would only prove the mock matches itself, and the point of this suite
 * is that `require()` and `EntitlementService.resolveCourseAccess` cannot
 * disagree about a real `AccessGrant` row.
 *
 * This is the enforcement mechanism for the platform's subscription model —
 * see `require()`'s own comment for the bug this closes. Every test states
 * the boundary it proves, not the code path.
 */
describe('LessonAccessService — live grant re-check', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const entitlement = new EntitlementService(prisma);
  const service = new LessonAccessService(prisma, new LessonGateService(prisma), entitlement);

  let instructorId = '';
  let systemId = '';
  let subjectId = '';

  beforeAll(async () => {
    await prisma.$connect();

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    systemId = system.id;
    const subject = await prisma.subject.findFirstOrThrow();
    subjectId = subject.id;

    const stamp = Date.now();
    const instructor = await prisma.user.create({
      data: { id: `la-instr-${stamp}`, name: 'مدرس', email: `la-instr-${stamp}@t.test` },
    });
    instructorId = instructor.id;
  });

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { instructorId } });
    await prisma.user.delete({ where: { id: instructorId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  /**
   * Every test gets its own student, course (closed by default —
   * `requiresGrant: true`, since that is the case a purchase grant matters
   * for), section and single published lesson, plus an active enrollment. The
   * grant itself is each test's own concern.
   */
  async function makeFixture(opts: { requiresGrant?: boolean } = {}) {
    const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const student = await prisma.user.create({
      data: { id: `la-stu-${stamp}`, name: 'طالب', email: `la-stu-${stamp}@t.test` },
    });

    const course = await prisma.course.create({
      data: {
        slug: `la-course-${stamp}`,
        title: 'كورس',
        status: 'published',
        publishedAt: new Date(),
        systemId,
        year: 2,
        subjectId,
        instructorId,
        requiresGrant: opts.requiresGrant ?? true,
      },
    });

    const section = await prisma.courseSection.create({
      data: { courseId: course.id, title: 'الوحدة', position: 1, isPublished: true },
    });

    const lesson = await prisma.lesson.create({
      data: {
        courseId: course.id,
        sectionId: section.id,
        title: 'الدرس',
        kind: 'text',
        position: 1,
        isPublished: true,
        text: { create: { bodyHtml: '<p>محتوى</p>' } },
      },
    });

    await prisma.enrollment.create({
      data: { userId: student.id, courseId: course.id, source: 'free', status: 'active' },
    });

    return { userId: student.id, courseId: course.id, lessonId: lesson.id };
  }

  it('keeps access for a student with a live, non-expired course grant', async () => {
    const { userId, courseId, lessonId } = await makeFixture();
    await prisma.accessGrant.create({
      data: { userId, scope: 'course', courseId, source: 'purchase' },
    });

    const context = await service.require(userId, lessonId);
    expect(context.lessonId).toBe(lessonId);
  });

  it('blocks require() once the grant behind the enrollment has expired, but not requireOwnership()', async () => {
    const { userId, courseId, lessonId } = await makeFixture();
    await prisma.accessGrant.create({
      data: {
        userId,
        scope: 'course',
        courseId,
        source: 'purchase',
        validFrom: new Date(Date.now() - 20_000),
        validUntil: new Date(Date.now() - 10_000),
      },
    });

    // The bug this fix closes: without the live re-check, `require()` used to
    // ignore `validUntil` entirely once the enrollment row existed.
    await expect(service.require(userId, lessonId)).rejects.toMatchObject({
      constructor: ForbiddenException,
      message: 'expired',
    });

    // `requireOwnership()` — used only to finish something already in
    // flight — is deliberately NOT gated on this. Matches the same reasoning
    // this class already applies to a mid-attempt unpublish.
    const context = await service.requireOwnership(userId, lessonId);
    expect(context.lessonId).toBe(lessonId);
  });

  it('blocks on a revoked grant the same way as an expired one', async () => {
    const { userId, courseId, lessonId } = await makeFixture();
    await prisma.accessGrant.create({
      data: {
        userId,
        scope: 'course',
        courseId,
        // A non-purchase (admin-issued) grant behaves identically —
        // `resolveCourseAccess` never branches on `source`.
        source: 'admin',
        revokedAt: new Date(),
      },
    });

    await expect(service.require(userId, lessonId)).rejects.toMatchObject({
      constructor: ForbiddenException,
      message: 'revoked',
    });
  });

  it('leaves a free course untouched: the open-ended platform grant is enough', async () => {
    const { userId, lessonId } = await makeFixture({ requiresGrant: false });
    await entitlement.ensurePlatformGrant(userId);

    const context = await service.require(userId, lessonId);
    expect(context.lessonId).toBe(lessonId);
  });

  it('does not newly block a student who enrolled before the course was closed', async () => {
    // The grandfather case `EntitlementService.enroll` already documents:
    // "does not shut out a student who enrolled BEFORE it was closed". Only
    // the platform grant here — no course-scoped grant at all — because the
    // point is that `requiresGrant` flipping to true after enrollment must
    // not re-litigate whether this student ever qualified for the course's
    // OWN grant; `resolveCourseAccess` alone would say `needs_course_grant`
    // and `require()` must not turn that into a new 403.
    const { userId, courseId, lessonId } = await makeFixture({ requiresGrant: false });
    await entitlement.ensurePlatformGrant(userId);

    await prisma.course.update({ where: { id: courseId }, data: { requiresGrant: true } });

    const context = await service.require(userId, lessonId);
    expect(context.lessonId).toBe(lessonId);
  });

  it('still 404s a lesson locked by progression, never a 403 — the enumeration guard is additive, not replaced', async () => {
    const { userId, courseId, lessonId: lectureId } = await makeFixture();
    await prisma.accessGrant.create({
      data: { userId, scope: 'course', courseId, source: 'purchase' },
    });

    // A second, unpublished-until-now exam lesson: available only once every
    // other lecture is cleared (see `gate-rule.ts`), which the lone lecture
    // above never is.
    const examLesson = await prisma.lesson.create({
      data: {
        courseId,
        sectionId: (await prisma.courseSection.findFirstOrThrow({ where: { courseId } })).id,
        title: 'الامتحان',
        kind: 'quiz',
        position: 2,
        isPublished: true,
      },
    });
    await prisma.course.update({ where: { id: courseId }, data: { examLessonId: examLesson.id } });

    await expect(service.require(userId, examLesson.id)).rejects.toMatchObject({
      constructor: NotFoundException,
      message: 'lesson not found',
    });

    // Sanity check: the SAME live grant leaves the already-available lecture
    // reachable, so the 404 above is really the progression gate and not a
    // side effect of the new access check.
    const context = await service.require(userId, lectureId);
    expect(context.lessonId).toBe(lectureId);
  });

  it('still 404s an unenrolled caller (ownership check), same as before this change', async () => {
    const { lessonId } = await makeFixture();
    const stranger = await prisma.user.create({
      data: {
        id: `la-stranger-${Date.now().toString(36)}`,
        name: 'غريب',
        email: `la-stranger-${Date.now().toString(36)}@t.test`,
      },
    });

    await expect(service.require(stranger.id, lessonId)).rejects.toMatchObject({
      constructor: NotFoundException,
    });

    await prisma.user.delete({ where: { id: stranger.id } });
  });
});
