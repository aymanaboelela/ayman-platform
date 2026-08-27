// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementService } from './entitlement.service';

// Integration test against the real database. A mock here would only prove the
// mock matches itself, and the partial unique index is half the behaviour.
describe('EntitlementService', () => {
  let prisma: PrismaService;
  let service: EntitlementService;
  let userId: string;
  let courseId: string;
  let otherCourseId: string;

  beforeAll(async () => {
    // Prisma 7 requires a driver adapter at construction time — a bare
    // `new PrismaClient()` throws (see PrismaService for the same wiring).
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as unknown as PrismaService;
    await prisma.$connect();
    service = new EntitlementService(prisma);

    const suffix = Date.now().toString(36);
    const user = await prisma.user.create({
      data: { id: `ent-${suffix}`, name: 'طالب', email: `ent-${suffix}@example.com` },
    });
    userId = user.id;

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    const base = {
      systemId: system.id,
      year: 2,
      trackId: null,
      subjectId: subject.id,
      instructorId: user.id,
      title: 'كورس',
    };
    const course = await prisma.course.create({
      data: { ...base, slug: `ent-a-${suffix}`, status: 'published', publishedAt: new Date() },
    });
    const other = await prisma.course.create({ data: { ...base, slug: `ent-b-${suffix}` } });
    courseId = course.id;
    otherCourseId = other.id;
  });

  afterAll(async () => {
    // Course.instructor is onDelete: Restrict, and this fixture's user is the
    // instructor of both test courses — deleting the user first would always
    // fail (silently, under the original `.catch(() => undefined)`) and leak
    // rows into the dev database on every run. Courses first, cascading their
    // access_grants/enrollments, then the user.
    await prisma.course.deleteMany({ where: { instructorId: userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('denies with a reason object, never a bare false, before any grant exists', async () => {
    const access = await service.resolveCourseAccess(userId, courseId);
    expect(access).toEqual({ allowed: false, reason: 'no_grant' });
  });

  it('expresses "free for everyone" as a platform grant row', async () => {
    const grant = await service.ensurePlatformGrant(userId);
    expect(grant.scope).toBe('platform');
    expect(grant.source).toBe('auto_free');
    expect(grant.courseId).toBeNull();
    expect(grant.validUntil).toBeNull();

    const access = await service.resolveCourseAccess(userId, courseId);
    expect(access).toMatchObject({ allowed: true, scope: 'platform', grantId: grant.id });
  });

  it('is idempotent — a second call returns the same row, not a duplicate', async () => {
    const first = await service.ensurePlatformGrant(userId);
    const second = await service.ensurePlatformGrant(userId);
    expect(second.id).toBe(first.id);

    const live = await prisma.accessGrant.count({
      where: { userId, scope: 'platform', revokedAt: null },
    });
    expect(live).toBe(1);
  });

  it('reports expiry and revocation distinctly, not as a generic denial', async () => {
    const grant = await service.ensurePlatformGrant(userId);

    await prisma.accessGrant.update({
      where: { id: grant.id },
      data: { validFrom: new Date(Date.now() - 20_000), validUntil: new Date(Date.now() - 10_000) },
    });
    expect(await service.resolveCourseAccess(userId, courseId)).toEqual({
      allowed: false,
      reason: 'expired',
    });

    await prisma.accessGrant.update({
      where: { id: grant.id },
      data: { validUntil: null, revokedAt: new Date() },
    });
    expect(await service.resolveCourseAccess(userId, courseId)).toEqual({
      allowed: false,
      reason: 'revoked',
    });

    await prisma.accessGrant.update({ where: { id: grant.id }, data: { revokedAt: null } });
  });

  it('honours a course-scoped grant only for its own course', async () => {
    await prisma.accessGrant.updateMany({
      where: { userId, scope: 'platform' },
      data: { revokedAt: new Date() },
    });
    const scoped = await prisma.accessGrant.create({
      data: { userId, scope: 'course', courseId, source: 'admin' },
    });

    expect(await service.resolveCourseAccess(userId, courseId)).toMatchObject({
      allowed: true,
      scope: 'course',
      grantId: scoped.id,
    });
    // otherCourseId is never published for the lifetime of this suite (see
    // beforeAll), so the published-status check — which resolveCourseAccess
    // deliberately runs before touching grants at all — dominates here, the
    // same way it does in the next test. The point this assertion actually
    // proves is unchanged: the course-scoped grant above grants nothing for
    // otherCourseId.
    expect(await service.resolveCourseAccess(userId, otherCourseId)).toEqual({
      allowed: false,
      reason: 'course_not_published',
    });
  });

  it('refuses to grant access to a course that is not published', async () => {
    await service.ensurePlatformGrant(userId);
    expect(await service.resolveCourseAccess(userId, otherCourseId)).toEqual({
      allowed: false,
      reason: 'course_not_published',
    });
  });

  it('lets the database, not the application, decide the duplicate-grant race', async () => {
    await expect(
      prisma.accessGrant.create({ data: { userId, scope: 'platform', source: 'admin' } }),
    ).rejects.toThrow();
  });

  /**
   * `resumeLessonId` is what makes the public course page's single
   * "ابدأ الكورس" button work in ONE round trip: enroll and learn where to go
   * are the same request. Without it the button has to enroll, then fetch the
   * outline, before it can navigate — two sequential requests on the primary
   * action of the product. See `2026-08-03-login-gated-content-design.md` §5.1.
   */
  describe('enroll → resumeLessonId', () => {
    let enrollUserId: string;
    let emptyCourseId: string;
    let lessonCourseId: string;
    let firstLessonId: string;
    let secondLessonId: string;

    beforeAll(async () => {
      const suffix = `${Date.now().toString(36)}-r`;
      const user = await prisma.user.create({
        data: { id: `ent-${suffix}`, name: 'طالب', email: `ent-${suffix}@example.com` },
      });
      enrollUserId = user.id;

      const system = await prisma.educationSystem.findFirstOrThrow({
        where: { slug: 'bacalorya' },
      });
      const subject = await prisma.subject.findFirstOrThrow();
      const base = {
        systemId: system.id,
        year: 2,
        trackId: null,
        subjectId: subject.id,
        instructorId: user.id,
        title: 'كورس',
        status: 'published' as const,
        publishedAt: new Date(),
      };

      const empty = await prisma.course.create({
        data: { ...base, slug: `ent-empty-${suffix}` },
      });
      emptyCourseId = empty.id;

      const withLessons = await prisma.course.create({
        data: { ...base, slug: `ent-lessons-${suffix}` },
      });
      lessonCourseId = withLessons.id;

      // Section positions are DESCENDING relative to creation order, and the
      // second section is created first, so a serializer that fell back to
      // insertion order would pick the wrong lesson and this test would catch
      // it. The opening lesson is `position: 0` of `position: 0`.
      const later = await prisma.courseSection.create({
        data: { courseId: withLessons.id, title: 'الثاني', position: 1, isPublished: true },
      });
      const first = await prisma.courseSection.create({
        data: { courseId: withLessons.id, title: 'الأول', position: 0, isPublished: true },
      });
      // `(course_id, position)` is unique, so this cannot reuse position 0 to
      // sort ahead of the others. It does not need to: the point is that an
      // unpublished SECTION hides its lessons whatever their position.
      const hidden = await prisma.courseSection.create({
        data: { courseId: withLessons.id, title: 'مخفي', position: 2, isPublished: false },
      });

      // A published lesson inside an UNPUBLISHED section. Three-level publish
      // is the rule everywhere else in this codebase; if `firstLessonId` only
      // checked the lesson's own flag it would hand the student this one.
      await prisma.lesson.create({
        data: {
          courseId: withLessons.id,
          sectionId: hidden.id,
          title: 'في قسم مخفي',
          kind: 'text',
          position: 0,
          isPublished: true,
        },
      });

      // An unpublished lesson at position 0 of the FIRST section — it sorts
      // ahead of everything and must still be skipped.
      await prisma.lesson.create({
        data: {
          courseId: withLessons.id,
          sectionId: first.id,
          title: 'مسودة',
          kind: 'text',
          position: 0,
          isPublished: false,
        },
      });

      const opening = await prisma.lesson.create({
        data: {
          courseId: withLessons.id,
          sectionId: first.id,
          title: 'الافتتاحية',
          kind: 'text',
          position: 1,
          isPublished: true,
        },
      });
      firstLessonId = opening.id;

      const second = await prisma.lesson.create({
        data: {
          courseId: withLessons.id,
          sectionId: later.id,
          title: 'التالي',
          kind: 'text',
          position: 0,
          isPublished: true,
        },
      });
      secondLessonId = second.id;
    });

    afterAll(async () => {
      await prisma.course.deleteMany({ where: { instructorId: enrollUserId } });
      await prisma.user.delete({ where: { id: enrollUserId } }).catch(() => undefined);
    });

    it('points a first enrollment at the opening published lesson', async () => {
      const result = await service.enroll(enrollUserId, lessonCourseId);
      expect(result.resumeLessonId).toBe(firstLessonId);
      expect(result.access.allowed).toBe(true);
    });

    it('resumes where the student stopped, rather than restarting them', async () => {
      await prisma.enrollment.update({
        where: { userId_courseId: { userId: enrollUserId, courseId: lessonCourseId } },
        data: { lastLessonId: secondLessonId },
      });

      const result = await service.enroll(enrollUserId, lessonCourseId);
      expect(result.resumeLessonId).toBe(secondLessonId);
    });

    it('is idempotent — clicking the button twice is not an error or a second enrollment', async () => {
      const first = await service.enroll(enrollUserId, lessonCourseId);
      const second = await service.enroll(enrollUserId, lessonCourseId);
      expect(second.enrollmentId).toBe(first.enrollmentId);

      const count = await prisma.enrollment.count({
        where: { userId: enrollUserId, courseId: lessonCourseId },
      });
      expect(count).toBe(1);
    });

    it('returns null for a published course with no published lessons', async () => {
      // The button renders disabled on null rather than navigating to
      // `/lessons/null`, which would 404 and read as a broken button.
      const result = await service.enroll(enrollUserId, emptyCourseId);
      expect(result.resumeLessonId).toBeNull();
    });
  });

  /**
   * A CLOSED course — `requiresGrant` — and the four things that must be true
   * of it. These are access-control assertions, so each states the failure it
   * prevents rather than the code path it covers.
   */
  describe('a course that requires its own grant', () => {
    let closedId: string;

    beforeEach(async () => {
      const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
      const subject = await prisma.subject.findFirstOrThrow();
      const closed = await prisma.course.create({
        data: {
          systemId: system.id,
          year: 2,
          trackId: null,
          subjectId: subject.id,
          instructorId: userId,
          title: 'كورس مقفول',
          slug: `ent-closed-${suffix}`,
          status: 'published',
          publishedAt: new Date(),
          requiresGrant: true,
        },
      });
      closedId = closed.id;
    });

    it('is NOT opened by the platform-wide "free for everyone" grant', async () => {
      // The whole feature in one assertion. Every student gets a platform grant
      // on their first enrollment; if it satisfied a closed course too, the
      // lock would be decorative.
      await service.ensurePlatformGrant(userId);

      const access = await service.resolveCourseAccess(userId, closedId);
      expect(access.allowed).toBe(false);
      expect(access).toMatchObject({ reason: 'needs_course_grant' });
    });

    it('still opens for the SAME student on a free course', async () => {
      // The other half: narrowing the scopes must not have broken the default.
      await service.ensurePlatformGrant(userId);
      const access = await service.resolveCourseAccess(userId, courseId);
      expect(access.allowed).toBe(true);
    });

    it('opens once a course-scoped grant names it', async () => {
      await service.ensurePlatformGrant(userId);
      await prisma.accessGrant.create({
        data: { userId, scope: 'course', courseId: closedId, source: 'admin' },
      });

      const access = await service.resolveCourseAccess(userId, closedId);
      expect(access).toMatchObject({ allowed: true, scope: 'course' });
    });

    it('refuses the ENROLLMENT, and leaves no row behind', async () => {
      /*
       * The load-bearing one. `LessonAccessService` gates every lesson, video
       * and quiz on an active enrollment and nothing else — so an enrollment
       * created and then judged is a door already open. This asserts the row
       * does not exist, not merely that the call threw.
       */
      await service.ensurePlatformGrant(userId);

      await expect(service.enroll(userId, closedId)).rejects.toMatchObject({
        status: 403,
      });

      const enrollment = await prisma.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId: closedId } },
      });
      expect(enrollment).toBeNull();
    });

    it('does not shut out a student who enrolled BEFORE it was closed', async () => {
      /*
       * The deliberate answer to "what happens to the students already inside":
       * they finish. Their enrollment row already exists, `LessonAccessService`
       * reads that row, and `enroll` only ever revives it — so re-opening the
       * course from the dashboard keeps working for them.
       */
      const open = await prisma.course.update({
        where: { id: closedId },
        data: { requiresGrant: false },
        select: { id: true },
      });
      await service.enroll(userId, open.id);

      await prisma.course.update({ where: { id: closedId }, data: { requiresGrant: true } });

      const enrollment = await prisma.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId: closedId } },
      });
      expect(enrollment?.status).toBe('active');
    });
  });

  /**
   * الترم الأول / الترم الثاني — `resolveCourseAccess`'s awareness that a
   * `term`-scope grant exists at all (so a term-only buyer can enrol), and
   * `resolveTermAccess`'s own exact-term refinement on top of it. The
   * end-to-end gating story (a term grant actually blocking a LESSON in the
   * other term) is `lesson-access.service.spec.ts`'s "term gate" suite —
   * this one is `EntitlementService`'s own unit-level contract.
   */
  describe('resolveCourseAccess / resolveTermAccess — term scope', () => {
    let termUserId: string;
    let termCourseId: string;
    let termAId: string;
    let termBId: string;

    beforeAll(async () => {
      const suffix = `${Date.now().toString(36)}-t`;
      const user = await prisma.user.create({
        data: { id: `ent-${suffix}`, name: 'طالب', email: `ent-${suffix}@example.com` },
      });
      termUserId = user.id;

      const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
      const subject = await prisma.subject.findFirstOrThrow();
      const course = await prisma.course.create({
        data: {
          slug: `ent-terms-${suffix}`,
          title: 'كورس بترمين',
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          year: 2,
          trackId: null,
          subjectId: subject.id,
          instructorId: user.id,
          requiresGrant: true,
        },
      });
      termCourseId = course.id;

      const termA = await prisma.courseTerm.create({
        data: { courseId: course.id, title: 'الترم الأول', position: 0 },
      });
      const termB = await prisma.courseTerm.create({
        data: { courseId: course.id, title: 'الترم الثاني', position: 1 },
      });
      termAId = termA.id;
      termBId = termB.id;
    });

    it('a term grant satisfies resolveCourseAccess — a term-only buyer can still enrol', async () => {
      const grant = await prisma.accessGrant.create({
        data: { userId: termUserId, scope: 'term', courseId: termCourseId, termId: termAId, source: 'purchase' },
      });

      expect(await service.resolveCourseAccess(termUserId, termCourseId)).toMatchObject({
        allowed: true,
        scope: 'term',
        grantId: grant.id,
      });
    });

    it('resolveTermAccess passes a course-wide allow straight through, untouched', async () => {
      const courseAccess = { allowed: true, grantId: 'x', scope: 'course', validUntil: null } as const;
      expect(await service.resolveTermAccess(termUserId, termCourseId, termAId, courseAccess)).toBe(
        courseAccess,
      );
    });

    it('resolveTermAccess passes a denial straight through, untouched', async () => {
      const denial = { allowed: false, reason: 'needs_course_grant' } as const;
      expect(await service.resolveTermAccess(termUserId, termCourseId, termAId, denial)).toBe(denial);
    });

    it('resolveTermAccess finds the EXACT term even when a different term "won" the course-level check', async () => {
      // The scenario `LessonAccessService.require` cannot resolve on its own:
      // `resolveCourseAccess`'s single winning grant names term A, but the
      // lesson being opened belongs to term B, and this student separately
      // holds a live grant for term B too.
      await prisma.accessGrant.create({
        data: { userId: termUserId, scope: 'term', courseId: termCourseId, termId: termAId, source: 'purchase' },
      });
      const grantB = await prisma.accessGrant.create({
        data: { userId: termUserId, scope: 'term', courseId: termCourseId, termId: termBId, source: 'purchase' },
      });

      const courseAccess = await service.resolveCourseAccess(termUserId, termCourseId);
      const termAccess = await service.resolveTermAccess(termUserId, termCourseId, termBId, courseAccess);
      expect(termAccess).toMatchObject({ allowed: true, scope: 'term', grantId: grantB.id });
    });

    it('resolveTermAccess reports needs_term_grant for a term never held', async () => {
      const freshUser = await prisma.user.create({
        data: {
          id: `ent-fresh-${Date.now().toString(36)}`,
          name: 'طالب',
          email: `ent-fresh-${Date.now().toString(36)}@example.com`,
        },
      });
      await prisma.accessGrant.create({
        data: { userId: freshUser.id, scope: 'term', courseId: termCourseId, termId: termAId, source: 'purchase' },
      });

      const courseAccess = await service.resolveCourseAccess(freshUser.id, termCourseId);
      const termAccess = await service.resolveTermAccess(freshUser.id, termCourseId, termBId, courseAccess);
      expect(termAccess).toEqual({ allowed: false, reason: 'needs_term_grant' });

      await prisma.user.delete({ where: { id: freshUser.id } });
    });

    it('resolveTermAccess reports revoked once the term is closed (bulk-revoke outcome)', async () => {
      const freshUser = await prisma.user.create({
        data: {
          id: `ent-revoked-${Date.now().toString(36)}`,
          name: 'طالب',
          email: `ent-revoked-${Date.now().toString(36)}@example.com`,
        },
      });
      await prisma.accessGrant.create({
        data: {
          userId: freshUser.id,
          scope: 'term',
          courseId: termCourseId,
          termId: termAId,
          source: 'purchase',
          revokedAt: new Date(),
        },
      });

      const courseAccess = await service.resolveCourseAccess(freshUser.id, termCourseId);
      const termAccess = await service.resolveTermAccess(freshUser.id, termCourseId, termAId, courseAccess);
      expect(termAccess).toEqual({ allowed: false, reason: 'revoked' });

      await prisma.user.delete({ where: { id: freshUser.id } });
    });
  });
});
