// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Onboarding } from '@ayman/contracts';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProfileService } from './profile.service';

// Integration test against the real seeded database, same rationale as
// TaxonomyService's own spec: mocking the DB here would only prove a mock of
// the taxonomy matches itself, and the whole point of S10 is that the
// service re-checks REAL rows, not whatever a client (or a mock) claims.
describe('ProfileService', () => {
  let prisma: PrismaService;
  let service: ProfileService;

  let governorateCode: string;
  let otherGovernorateCode: string;
  let bacalorya: { id: string; slug: string };
  let thanaweya: { id: string; slug: string };
  let bacTrack: { id: string; slug: string };
  let bacTrackOtherTrack: { id: string; slug: string };
  let thaTrack: { id: string; slug: string };
  let bacTrackElective: { id: string };
  let otherTrackElective: { id: string };

  const testUserIds: string[] = [];

  async function createTestUser(): Promise<string> {
    const id = randomUUID();
    await prisma.user.create({
      data: {
        id,
        name: 'Test Student',
        email: `${id}@example.test`,
        emailVerified: true,
        role: 'student',
      },
    });
    testUserIds.push(id);
    return id;
  }

  /** A syntactically valid Egyptian mobile number, already in E.164 form. */
  function randomEgyptianPhone(): string {
    const operatorPrefixes = ['10', '11', '12', '15'];
    const prefix = operatorPrefixes[Math.floor(Math.random() * operatorPrefixes.length)];
    const rest = String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0');
    return `+20${prefix}${rest}`;
  }

  function validOnboarding(overrides: Partial<Onboarding> = {}): Onboarding {
    return {
      fullName: 'Test Student',
      gender: 'male',
      phone: randomEgyptianPhone(),
      governorateCode,
      ...overrides,
    } as Onboarding;
  }

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as PrismaService;
    await prisma.$connect();
    service = new ProfileService(prisma);

    const governorates = await prisma.governorate.findMany({
      orderBy: { sortOrder: 'asc' },
      take: 2,
      select: { code: true },
    });
    governorateCode = governorates[0]!.code;
    otherGovernorateCode = governorates[1]!.code;

    const systems = await prisma.educationSystem.findMany({ select: { id: true, slug: true } });
    bacalorya = systems.find((s) => s.slug === 'bacalorya')!;
    thanaweya = systems.find((s) => s.slug === 'thanaweya_amma')!;

    const bacTracks = await prisma.track.findMany({
      where: { systemId: bacalorya.id },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, slug: true },
    });
    bacTrack = bacTracks[0]!;
    bacTrackOtherTrack = bacTracks[1]!;

    thaTrack = (
      await prisma.track.findFirst({ where: { systemId: thanaweya.id }, select: { id: true, slug: true } })
    )!;

    bacTrackElective = (
      await prisma.subjectOffering.findFirst({
        where: { trackId: bacTrack.id, year: 2, electiveGroupId: { not: null } },
        select: { id: true },
      })
    )!;
    otherTrackElective = (
      await prisma.subjectOffering.findFirst({
        where: { trackId: bacTrackOtherTrack.id, year: 2, electiveGroupId: { not: null } },
        select: { id: true },
      })
    )!;
  });

  afterAll(async () => {
    await prisma.studentProfile.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
    await prisma.$disconnect();
  });

  describe('getMe', () => {
    it('returns a null-ish shape before onboarding is completed', async () => {
      const userId = await createTestUser();
      const result = await service.getMe(userId);
      expect(result.onboardingCompleted).toBe(false);
      expect(result.profile).toBeNull();
    });

    it('returns the real profile once onboarding is completed', async () => {
      const userId = await createTestUser();
      await service.completeOnboarding(userId, validOnboarding());
      const result = await service.getMe(userId);
      expect(result.onboardingCompleted).toBe(true);
      expect(result.profile?.userId).toBe(userId);
    });
  });

  describe('completeOnboarding — accepted paths', () => {
    it('accepts a valid grade-1 payload with no track', async () => {
      const userId = await createTestUser();
      const result = await service.completeOnboarding(
        userId,
        validOnboarding({ system: 'bacalorya', year: 1 }),
      );
      expect(result.trackId).toBeNull();
      expect(result.year).toBe(1);
    });

    it('accepts a valid بكالوريا year-2 payload with a track and a matching elective', async () => {
      const userId = await createTestUser();
      const result = await service.completeOnboarding(
        userId,
        validOnboarding({
          system: 'bacalorya',
          year: 2,
          trackId: bacTrack.id,
          electiveSubjectId: bacTrackElective.id,
        }),
      );
      expect(result.trackId).toBe(bacTrack.id);
      expect(result.electiveSubjectId).toBe(bacTrackElective.id);
      expect(result.systemId).toBe(bacalorya.id);
      expect(result.onboardingCompletedAt).not.toBeNull();
    });

    it('is idempotent (upsert): calling it twice updates the same row', async () => {
      const userId = await createTestUser();
      await service.completeOnboarding(userId, validOnboarding({ schoolName: 'School A' }));
      const second = await service.completeOnboarding(
        userId,
        validOnboarding({ schoolName: 'School B' }),
      );
      expect(second.schoolName).toBe('School B');
      const count = await prisma.studentProfile.count({ where: { userId } });
      expect(count).toBe(1);
    });
  });

  describe('completeOnboarding — S10 server-side taxonomy re-validation', () => {
    it('rejects a nonexistent governorate code', async () => {
      const userId = await createTestUser();
      await expect(
        service.completeOnboarding(userId, validOnboarding({ governorateCode: 'ZZ' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a ثانوية عامة track submitted while claiming system: bacalorya', async () => {
      const userId = await createTestUser();
      await expect(
        service.completeOnboarding(
          userId,
          validOnboarding({ system: 'bacalorya', year: 2, trackId: thaTrack.id }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an elective subject belonging to a different track', async () => {
      const userId = await createTestUser();
      await expect(
        service.completeOnboarding(
          userId,
          validOnboarding({
            system: 'bacalorya',
            year: 2,
            trackId: bacTrack.id,
            // Belongs to bacTrackOtherTrack's elective group, not bacTrack's.
            electiveSubjectId: otherTrackElective.id,
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a trackId that does not exist at all', async () => {
      const userId = await createTestUser();
      await expect(
        service.completeOnboarding(
          userId,
          validOnboarding({ system: 'bacalorya', year: 2, trackId: randomUUID() }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an electiveSubjectId that does not exist at all', async () => {
      const userId = await createTestUser();
      await expect(
        service.completeOnboarding(
          userId,
          validOnboarding({
            system: 'bacalorya',
            year: 2,
            trackId: bacTrack.id,
            electiveSubjectId: randomUUID(),
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an elective subject offering that is not actually an elective (wrong year)', async () => {
      const userId = await createTestUser();
      // A year-2 shared (non-elective) offering for the same track, if any exists,
      // must not be accepted as the elective. Use a definitely-invalid pairing:
      // a year-3 offering while claiming year 2.
      const year3Offering = await prisma.subjectOffering.findFirst({
        where: { trackId: bacTrack.id, year: 3 },
        select: { id: true },
      });
      expect(year3Offering).not.toBeNull();
      await expect(
        service.completeOnboarding(
          userId,
          validOnboarding({
            system: 'bacalorya',
            year: 2,
            trackId: bacTrack.id,
            electiveSubjectId: year3Offering!.id,
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('phone uniqueness', () => {
    it('rejects a phone already used by another profile', async () => {
      const userId1 = await createTestUser();
      const userId2 = await createTestUser();
      const phone = '+201234567890';
      await service.completeOnboarding(userId1, validOnboarding({ phone }));
      await expect(
        service.completeOnboarding(userId2, validOnboarding({ phone })),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('database-level CHECK constraint (student_profiles_year1_has_no_track)', () => {
    it('rejects a year-1 row carrying a track at the database level, bypassing the service entirely', async () => {
      const userId = await createTestUser();
      await expect(
        prisma.studentProfile.create({
          data: {
            userId,
            fullName: 'Direct Insert',
            gender: 'male',
            phone: `+201${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`,
            governorateCode: otherGovernorateCode,
            year: 1,
            trackId: bacTrack.id,
          },
        }),
      ).rejects.toThrow(/student_profiles_year1_has_no_track/);
    });
  });
});
