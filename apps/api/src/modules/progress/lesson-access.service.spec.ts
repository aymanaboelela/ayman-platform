// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { TermService } from '../content/term.service';
import { FinanceService } from '../payments/finance.service';
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
  const audit = new AuditService(prisma);
  const notifications = new NotificationsService(prisma);
  // `/admin/finance`'s "edit dates" super-admin override — see the test
  // below on why THIS is the load-bearing check for that whole feature.
  const finance = new FinanceService(prisma, audit, notifications);

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

  /**
   * THE load-bearing check for `/admin/finance`'s "edit start/end dates"
   * super-admin override (see the PR description). `FinanceService
   * .editDates` writing `AccessGrant.validUntil` is only a real feature if
   * this exact enforcement path — `resolveCourseAccess`'s date comparison,
   * surfaced by `require()`'s live re-check above — actually reads the new
   * value straight back, with no cache or derived column in between. A test
   * that only asserted `editDates` returns the row it was given (a display
   * value) would have missed a version of this feature that changes nothing
   * a student ever runs into.
   */
  it('editDates moving validUntil into the past cuts a student off immediately, and back into the future restores them', async () => {
    const { userId, courseId, lessonId } = await makeFixture();
    const grant = await prisma.accessGrant.create({
      data: {
        userId,
        scope: 'course',
        courseId,
        source: 'purchase',
        validFrom: new Date(Date.now() - 60_000),
        validUntil: new Date(Date.now() + 60 * 60_000),
      },
    });

    // Still live — the fixture's own future `validUntil`.
    await expect(service.require(userId, lessonId)).resolves.toMatchObject({ lessonId });

    await finance.editDates('admin-does-not-matter-here', grant.id, {
      validFrom: new Date(Date.now() - 60_000).toISOString(),
      validUntil: new Date(Date.now() - 1_000).toISOString(),
    });

    await expect(service.require(userId, lessonId)).rejects.toMatchObject({
      constructor: ForbiddenException,
      message: 'expired',
    });

    await finance.editDates('admin-does-not-matter-here', grant.id, {
      validFrom: new Date(Date.now() - 60_000).toISOString(),
      validUntil: new Date(Date.now() + 60 * 60_000).toISOString(),
    });

    await expect(service.require(userId, lessonId)).resolves.toMatchObject({ lessonId });
  });
});

/**
 * الترم الأول / الترم الثاني — the per-lesson term gate, on top of the
 * course-level re-check above. Every fixture course has TWO terms, one
 * section (and one lesson) each, so every test can name "this student's own
 * term" and "the other one" without ambiguity.
 */
describe('LessonAccessService — term gate', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const entitlement = new EntitlementService(prisma);
  const service = new LessonAccessService(prisma, new LessonGateService(prisma), entitlement);
  const terms = new TermService(prisma, new AuditService(prisma));

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
      data: { id: `lat-instr-${stamp}`, name: 'مدرس', email: `lat-instr-${stamp}@t.test` },
    });
    instructorId = instructor.id;
  });

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { instructorId } });
    await prisma.user.delete({ where: { id: instructorId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  /**
   * One `requiresGrant` course, two terms, one published section+lesson
   * each, and a single enrolled student. Every test creates its own grant(s)
   * on top of this.
   */
  async function makeTermFixture() {
    const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const student = await prisma.user.create({
      data: { id: `lat-stu-${stamp}`, name: 'طالب', email: `lat-stu-${stamp}@t.test` },
    });

    const course = await prisma.course.create({
      data: {
        slug: `lat-course-${stamp}`,
        title: 'كورس بترمين',
        status: 'published',
        publishedAt: new Date(),
        systemId,
        year: 2,
        subjectId,
        instructorId,
        requiresGrant: true,
      },
    });

    const termA = await prisma.courseTerm.create({
      data: { courseId: course.id, title: 'الترم الأول', position: 0 },
    });
    const termB = await prisma.courseTerm.create({
      data: { courseId: course.id, title: 'الترم الثاني', position: 1 },
    });

    const sectionA = await prisma.courseSection.create({
      data: { courseId: course.id, termId: termA.id, title: 'وحدة أولى', position: 0, isPublished: true },
    });
    const sectionB = await prisma.courseSection.create({
      data: { courseId: course.id, termId: termB.id, title: 'وحدة تانية', position: 1, isPublished: true },
    });

    const lessonA = await prisma.lesson.create({
      data: {
        courseId: course.id,
        sectionId: sectionA.id,
        title: 'درس الترم الأول',
        kind: 'text',
        position: 0,
        isPublished: true,
        text: { create: { bodyHtml: '<p>محتوى</p>' } },
      },
    });
    const lessonB = await prisma.lesson.create({
      data: {
        courseId: course.id,
        sectionId: sectionB.id,
        title: 'درس الترم الثاني',
        kind: 'text',
        position: 0,
        isPublished: true,
        text: { create: { bodyHtml: '<p>محتوى</p>' } },
      },
    });

    await prisma.enrollment.create({
      data: { userId: student.id, courseId: course.id, source: 'free', status: 'active' },
    });

    return {
      userId: student.id,
      courseId: course.id,
      termAId: termA.id,
      termBId: termB.id,
      lessonAId: lessonA.id,
      lessonBId: lessonB.id,
    };
  }

  it("a term-only grant opens its own term's lesson but blocks the other term's", async () => {
    const { userId, courseId, termAId, lessonAId, lessonBId } = await makeTermFixture();
    await prisma.accessGrant.create({
      data: { userId, scope: 'term', courseId, termId: termAId, source: 'purchase' },
    });

    const context = await service.require(userId, lessonAId);
    expect(context.lessonId).toBe(lessonAId);

    await expect(service.require(userId, lessonBId)).rejects.toMatchObject({
      constructor: ForbiddenException,
      message: 'needs_term_grant',
    });
  });

  it('a course-wide grant overrides term-closed state entirely — both terms open regardless', async () => {
    const { userId, courseId, termAId, termBId, lessonAId, lessonBId } = await makeTermFixture();
    await prisma.accessGrant.create({
      data: { userId, scope: 'course', courseId, source: 'purchase' },
    });

    // Close BOTH terms — nobody holds a term-scoped grant here, so this
    // revokes nothing, and the assertion below is really testing that a
    // whole-course grant never even consults `isOpen`.
    await terms.setOpen(termAId, false);
    await terms.setOpen(termBId, false);

    await expect(service.require(userId, lessonAId)).resolves.toMatchObject({ lessonId: lessonAId });
    await expect(service.require(userId, lessonBId)).resolves.toMatchObject({ lessonId: lessonBId });
  });

  it('closing a term immediately revokes every live term grant for it, and require() then refuses those lessons', async () => {
    const { userId, courseId, termAId, lessonAId } = await makeTermFixture();
    const grant = await prisma.accessGrant.create({
      data: { userId, scope: 'term', courseId, termId: termAId, source: 'purchase' },
    });

    // Proves access before the close, so the refusal below is really the
    // close's doing and not a fixture mistake.
    await expect(service.require(userId, lessonAId)).resolves.toMatchObject({ lessonId: lessonAId });

    const result = await terms.setOpen(termAId, false);
    expect(result.revokedGrantCount).toBe(1);
    expect(result.term.isOpen).toBe(false);

    const revoked = await prisma.accessGrant.findUniqueOrThrow({ where: { id: grant.id } });
    expect(revoked.revokedAt).not.toBeNull();

    await expect(service.require(userId, lessonAId)).rejects.toMatchObject({
      constructor: ForbiddenException,
      message: 'revoked',
    });
  });

  it('a fresh grant to a re-opened term works independently of the previously-closed one', async () => {
    const { userId, courseId, termAId, lessonAId } = await makeTermFixture();
    await prisma.accessGrant.create({
      data: { userId, scope: 'term', courseId, termId: termAId, source: 'purchase' },
    });
    await terms.setOpen(termAId, false);

    await expect(service.require(userId, lessonAId)).rejects.toMatchObject({
      constructor: ForbiddenException,
      message: 'revoked',
    });

    // Reopening does not resurrect the revoked grant — see `TermService
    // .setOpen`'s own note — so access stays refused until a FRESH grant is
    // issued.
    await terms.setOpen(termAId, true);
    await expect(service.require(userId, lessonAId)).rejects.toMatchObject({
      constructor: ForbiddenException,
      message: 'revoked',
    });

    await prisma.accessGrant.create({
      data: { userId, scope: 'term', courseId, termId: termAId, source: 'purchase' },
    });
    await expect(service.require(userId, lessonAId)).resolves.toMatchObject({ lessonId: lessonAId });
  });

  it('closing one term never affects a DIFFERENT term this student separately holds', async () => {
    const { userId, courseId, termAId, termBId, lessonAId, lessonBId } = await makeTermFixture();
    await prisma.accessGrant.create({
      data: { userId, scope: 'term', courseId, termId: termAId, source: 'purchase' },
    });
    await prisma.accessGrant.create({
      data: { userId, scope: 'term', courseId, termId: termBId, source: 'purchase' },
    });

    await terms.setOpen(termAId, false);

    await expect(service.require(userId, lessonAId)).rejects.toMatchObject({
      constructor: ForbiddenException,
      message: 'revoked',
    });
    // Term B was never closed — its grant is untouched.
    await expect(service.require(userId, lessonBId)).resolves.toMatchObject({ lessonId: lessonBId });
  });
});
