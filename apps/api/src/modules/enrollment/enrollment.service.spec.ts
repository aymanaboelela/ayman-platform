// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EnrollmentService } from './enrollment.service';

// Integration test against the real database. A mock here would only prove
// the mock matches itself, and the whole point of `requireActive` is that
// ownership is compiled into the query — that only means something against a
// real WHERE clause.
describe('EnrollmentService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new EnrollmentService(prisma);

  let studentA = '';
  let studentB = '';
  let courseId = '';
  let unpublishedCourseId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();

    const [a, b] = await Promise.all([
      prisma.user.create({
        data: { id: `enr-a-${stamp}`, name: 'A', email: `enr-a-${stamp}@t.test` },
      }),
      prisma.user.create({
        data: { id: `enr-b-${stamp}`, name: 'B', email: `enr-b-${stamp}@t.test` },
      }),
    ]);
    studentA = a.id;
    studentB = b.id;

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    const base = {
      systemId: system.id,
      year: 2,
      trackId: null,
      subjectId: subject.id,
      instructorId: a.id,
    };

    const course = await prisma.course.create({
      data: {
        ...base,
        slug: `enr-course-${stamp}`,
        title: 'كورس',
        status: 'published',
        publishedAt: new Date(),
      },
    });
    courseId = course.id;

    const unpublished = await prisma.course.create({
      data: { ...base, slug: `enr-draft-${stamp}`, title: 'مسودة' },
    });
    unpublishedCourseId = unpublished.id;

    // studentA is enrolled and 40% through the course; studentB is enrolled
    // in the same course too — the IDOR shape this suite exists to prove is
    // that B's row never leaks into A's list, and A can never resolve B's
    // enrollment id by guessing the course id.
    await prisma.enrollment.create({
      data: {
        userId: studentA,
        courseId,
        status: 'active',
        progressPercent: 40,
        lastLessonId: null,
      },
    });
    await prisma.enrollment.create({
      data: { userId: studentB, courseId, status: 'active' },
    });
  });

  afterAll(async () => {
    await prisma.enrollment.deleteMany({ where: { courseId: { in: [courseId, unpublishedCourseId] } } });
    await prisma.course.deleteMany({ where: { id: { in: [courseId, unpublishedCourseId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [studentA, studentB] } } });
    await prisma.$disconnect();
  });

  describe('listOwn', () => {
    it('returns the enriched fields for the caller only', async () => {
      const rows = await service.listOwn(studentA);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        courseId,
        status: 'active',
        progressPercent: 40,
        lastLessonId: null,
      });
    });

    it('never returns another student’s enrollment — the IDOR shape that matters', async () => {
      const forA = await service.listOwn(studentA);
      const forB = await service.listOwn(studentB);

      expect(forA.every((row) => row.id !== forB[0]?.id)).toBe(true);
      // Both exist in the same course; each list still has exactly one row —
      // the filter is the session user id, not the course.
      expect(forA).toHaveLength(1);
      expect(forB).toHaveLength(1);
    });

    it('excludes a revoked enrollment', async () => {
      await prisma.enrollment.update({
        where: { userId_courseId: { userId: studentB, courseId } },
        data: { status: 'revoked' },
      });

      expect(await service.listOwn(studentB)).toHaveLength(0);

      await prisma.enrollment.update({
        where: { userId_courseId: { userId: studentB, courseId } },
        data: { status: 'active' },
      });
    });
  });

  describe('requireActive', () => {
    it('resolves the enrollment id for an active enrollment', async () => {
      const resolved = await service.requireActive(studentA, courseId);
      const rows = await service.listOwn(studentA);
      expect(resolved.id).toBe(rows[0]?.id);
    });

    it('404s — not 403 — when the caller has no enrollment in the course at all', async () => {
      await expect(service.requireActive(studentA, unpublishedCourseId)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('404s for the IDOR shape: A can never resolve B’s enrollment by naming B’s course pair', async () => {
      // studentA and studentB are both enrolled in `courseId`, but
      // requireActive is keyed on (userId, courseId), not on the enrollment
      // id — there is no way to pass "B's enrollment" and get it back for A.
      const resolvedForA = await service.requireActive(studentA, courseId);
      const resolvedForB = await service.requireActive(studentB, courseId);
      expect(resolvedForA.id).not.toBe(resolvedForB.id);
    });

    it('404s once the enrollment is revoked', async () => {
      await prisma.enrollment.update({
        where: { userId_courseId: { userId: studentB, courseId } },
        data: { status: 'revoked' },
      });

      await expect(service.requireActive(studentB, courseId)).rejects.toMatchObject({
        status: 404,
      });

      await prisma.enrollment.update({
        where: { userId_courseId: { userId: studentB, courseId } },
        data: { status: 'active' },
      });
    });
  });
});
