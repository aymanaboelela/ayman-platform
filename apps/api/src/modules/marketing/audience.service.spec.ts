// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { EMPTY_AUDIENCE, type Audience } from '@ayman/contracts/marketing/campaign';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AudienceService } from './audience.service';

/**
 * Integration test against the real database — the same reasoning
 * `EntitlementService`'s own spec gives: a mock `AccessGrant` table would only
 * prove the mock agrees with itself, and "which grant states count as
 * already-subscribed" is exactly the behaviour under test.
 */
describe('AudienceService', () => {
  let prisma: PrismaService;
  let service: AudienceService;

  let instructorId: string;
  let generalStudentId: string;
  let languagesStudentId: string;
  let generalPhone: string;
  let languagesPhone: string;
  let paidCourseId: string;

  function audienceFor(overrides: Partial<Audience>): Audience {
    return { ...EMPTY_AUDIENCE, ...overrides };
  }

  beforeAll(async () => {
    // Prisma 7 requires a driver adapter at construction time — a bare
    // `new PrismaClient()` throws (see PrismaService for the same wiring).
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as unknown as PrismaService;
    await prisma.$connect();
    service = new AudienceService(prisma);

    const stamp = Date.now();
    const suffix = stamp.toString(36);
    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    const governorate = await prisma.governorate.findFirstOrThrow();

    instructorId = (
      await prisma.user.create({
        data: { id: `aud-instr-${suffix}`, name: 'مدرّس', email: `aud-instr-${suffix}@t.test`, role: 'admin' },
      })
    ).id;

    generalPhone = `+2010${String(stamp).slice(-8)}`;
    languagesPhone = `+2011${String(stamp + 1).slice(-8)}`;

    generalStudentId = (
      await prisma.user.create({
        data: {
          id: `aud-gen-${suffix}`,
          name: 'طالب عام',
          email: `aud-gen-${suffix}@t.test`,
          role: 'student',
          phoneNumber: generalPhone,
        },
      })
    ).id;

    languagesStudentId = (
      await prisma.user.create({
        data: {
          id: `aud-lang-${suffix}`,
          name: 'طالب لغات',
          email: `aud-lang-${suffix}@t.test`,
          role: 'student',
          phoneNumber: languagesPhone,
        },
      })
    ).id;

    // `AudienceService.students()` reads the profile's stream/year through
    // `studentProfile`, same as `year` today — every real student row has one.
    await prisma.studentProfile.create({
      data: {
        userId: generalStudentId,
        fullName: 'طالب عام',
        gender: 'male',
        phone: generalPhone,
        governorateCode: governorate.code,
        year: 2,
        schoolStream: 'general',
      },
    });
    await prisma.studentProfile.create({
      data: {
        userId: languagesStudentId,
        fullName: 'طالب لغات',
        gender: 'male',
        phone: languagesPhone,
        governorateCode: governorate.code,
        year: 2,
        schoolStream: 'languages',
      },
    });

    paidCourseId = (
      await prisma.course.create({
        data: {
          slug: `aud-paid-${suffix}`,
          title: 'كورس مدفوع',
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          subjectId: subject.id,
          year: 2,
          instructorId,
          requiresGrant: true,
        },
      })
    ).id;

    // Both fixtures enroll — "not yet subscribed" is about the GRANT, not the
    // enrollment, so both must start from the same enrolled baseline.
    await prisma.enrollment.createMany({
      data: [
        { userId: generalStudentId, courseId: paidCourseId },
        { userId: languagesStudentId, courseId: paidCourseId },
      ],
    });
  });

  afterAll(async () => {
    await prisma.accessGrant.deleteMany({
      where: { userId: { in: [generalStudentId, languagesStudentId] } },
    });
    await prisma.enrollment.deleteMany({
      where: { userId: { in: [generalStudentId, languagesStudentId] } },
    });
    await prisma.course.deleteMany({ where: { id: paidCourseId } });
    await prisma.studentProfile.deleteMany({
      where: { userId: { in: [generalStudentId, languagesStudentId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [generalStudentId, languagesStudentId, instructorId] } },
    });
    await prisma.$disconnect();
  });

  it('narrows by school stream', async () => {
    const resolved = await service.resolve(audienceFor({ schoolStreams: ['languages'] }));
    const phones = resolved.recipients.map((r) => r.phone);
    expect(phones).toContain(languagesPhone);
    expect(phones).not.toContain(generalPhone);
  });

  it('is a no-op on school stream when the filter is empty', async () => {
    const resolved = await service.resolve(audienceFor({}));
    const phones = resolved.recipients.map((r) => r.phone);
    expect(phones).toContain(generalPhone);
    expect(phones).toContain(languagesPhone);
  });

  it('"not yet subscribed" excludes a student with a live grant for the course', async () => {
    const grant = await prisma.accessGrant.create({
      data: { userId: generalStudentId, scope: 'course', courseId: paidCourseId, source: 'admin' },
    });

    try {
      const resolved = await service.resolve(
        audienceFor({ courseIds: [paidCourseId], notSubscribedOnly: true }),
      );
      const phones = resolved.recipients.map((r) => r.phone);
      expect(phones).not.toContain(generalPhone);
      expect(phones).toContain(languagesPhone);
    } finally {
      await prisma.accessGrant.delete({ where: { id: grant.id } });
    }
  });

  it('"not yet subscribed" includes a student whose grant expired', async () => {
    const grant = await prisma.accessGrant.create({
      data: {
        userId: generalStudentId,
        scope: 'course',
        courseId: paidCourseId,
        source: 'admin',
        validFrom: new Date(Date.now() - 20_000),
        validUntil: new Date(Date.now() - 10_000),
      },
    });

    try {
      const resolved = await service.resolve(
        audienceFor({ courseIds: [paidCourseId], notSubscribedOnly: true }),
      );
      const phones = resolved.recipients.map((r) => r.phone);
      expect(phones).toContain(generalPhone);
      expect(phones).toContain(languagesPhone);
    } finally {
      await prisma.accessGrant.delete({ where: { id: grant.id } });
    }
  });

  it('"not yet subscribed" includes a student whose grant was revoked', async () => {
    const grant = await prisma.accessGrant.create({
      data: {
        userId: generalStudentId,
        scope: 'course',
        courseId: paidCourseId,
        source: 'admin',
        revokedAt: new Date(),
      },
    });

    try {
      const resolved = await service.resolve(
        audienceFor({ courseIds: [paidCourseId], notSubscribedOnly: true }),
      );
      const phones = resolved.recipients.map((r) => r.phone);
      expect(phones).toContain(generalPhone);
      expect(phones).toContain(languagesPhone);
    } finally {
      await prisma.accessGrant.delete({ where: { id: grant.id } });
    }
  });

  it('is a no-op when notSubscribedOnly is set but no courseIds are selected', async () => {
    const grant = await prisma.accessGrant.create({
      data: { userId: generalStudentId, scope: 'course', courseId: paidCourseId, source: 'admin' },
    });

    try {
      const resolved = await service.resolve(audienceFor({ courseIds: [], notSubscribedOnly: true }));
      const phones = resolved.recipients.map((r) => r.phone);
      // No course selected — there is nothing to be "subscribed" to, so the
      // filter must not silently drop anyone.
      expect(phones).toContain(generalPhone);
      expect(phones).toContain(languagesPhone);
    } finally {
      await prisma.accessGrant.delete({ where: { id: grant.id } });
    }
  });
});
