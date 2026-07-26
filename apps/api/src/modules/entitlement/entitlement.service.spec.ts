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
});
