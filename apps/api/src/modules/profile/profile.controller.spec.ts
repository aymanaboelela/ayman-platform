// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication, Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { BETTER_AUTH, type BetterAuthLike, type BetterAuthSessionResult } from '../../auth/better-auth.token';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

// Full-stack e2e: real Nest HTTP pipeline (guard → Zod DTO pipe → controller
// → service), real seeded Postgres, only the Better Auth session lookup is
// faked (matching auth.guard.spec.ts's own pattern — better-auth is
// ESM-only and confined to auth.config.ts, so no spec file may import it).
describe('ProfileController (e2e)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService;

  let governorateCode: string;
  const testUserIds: string[] = [];

  async function createTestUser(): Promise<string> {
    const id = randomUUID();
    await prisma.user.create({
      data: {
        id,
        name: 'E2E Student',
        email: `${id}@example.test`,
        emailVerified: true,
        role: 'student',
      },
    });
    testUserIds.push(id);
    return id;
  }

  function sessionFor(userId: string): BetterAuthSessionResult {
    const now = new Date();
    return {
      session: { id: `sess-${userId}` },
      user: {
        id: userId,
        email: `${userId}@example.test`,
        name: 'E2E Student',
        emailVerified: true,
        role: 'student',
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
      controllers: [ProfileController],
      providers: [
        Reflector,
        ProfileService,
        { provide: PrismaService, useValue: prisma },
        // `ProfileService` gained a `MediaService` dependency with the avatar
        // route. This fixture exercises the ONBOARDING routes, so the double
        // is deliberately inert: if a test here ever reaches it, that is a
        // signal the onboarding path has grown an upload, not a missing mock.
        {
          provide: MediaService,
          useValue: {
            uploadAvatar: () => {
              throw new Error('unexpected avatar upload from an onboarding test');
            },
          },
        },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: BETTER_AUTH, useValue: fakeAuth },
      ],
    })
    class FixtureModule {}

    const moduleRef = await Test.createTestingModule({ imports: [FixtureModule] }).compile();
    const nestApp = moduleRef.createNestApplication();
    await nestApp.init();
    return nestApp;
  }

  /** A syntactically valid Egyptian mobile number, in local (0-prefixed) form. */
  function randomEgyptianPhoneLocal(): string {
    const operatorPrefixes = ['10', '11', '12', '15'];
    const prefix = operatorPrefixes[Math.floor(Math.random() * operatorPrefixes.length)];
    const rest = String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0');
    return `0${prefix}${rest}`;
  }

  function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      fullName: 'طالب تجريبي',
      gender: 'male',
      phone: randomEgyptianPhoneLocal(),
      governorateCode,
      // Required by `OnboardingSchema` since the wizard swapped four academic
      // dropdowns for these two. Left out, every case here 400s at the DTO
      // pipe before the controller is reached.
      schoolStream: 'general',
      fatherPhone: randomEgyptianPhoneLocal(),
      ...overrides,
    };
  }

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as PrismaService;
    await prisma.$connect();

    const governorate = await prisma.governorate.findFirst({ select: { code: true } });
    governorateCode = governorate!.code;
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  afterAll(async () => {
    await prisma.studentProfile.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
    await prisma.$disconnect();
  });

  describe('GET /profile/me', () => {
    it('401s an unauthenticated request', async () => {
      app = await buildApp(async () => null);
      await request(app.getHttpServer()).get('/profile/me').expect(401);
    });

    it('returns a null-ish shape before onboarding', async () => {
      const userId = await createTestUser();
      app = await buildApp(async () => sessionFor(userId));
      const res = await request(app.getHttpServer()).get('/profile/me').expect(200);
      expect(res.body).toMatchObject({ userId, onboardingCompleted: false, profile: null });
    });
  });

  describe('PATCH /profile/onboarding', () => {
    it('401s an unauthenticated request', async () => {
      app = await buildApp(async () => null);
      await request(app.getHttpServer())
        .patch('/profile/onboarding')
        .send(validPayload())
        .expect(401);
    });

    it('accepts a valid grade-1 payload and completes onboarding', async () => {
      const userId = await createTestUser();
      app = await buildApp(async () => sessionFor(userId));
      const res = await request(app.getHttpServer())
        .patch('/profile/onboarding')
        .send(validPayload({ system: 'bacalorya', year: 1 }))
        .expect(200);
      expect(res.body.userId).toBe(userId);
      expect(res.body.trackId).toBeNull();
      expect(res.body.onboardingCompletedAt).not.toBeNull();
    });

    it('rejects a grade-1 payload carrying a track (400)', async () => {
      const userId = await createTestUser();
      app = await buildApp(async () => sessionFor(userId));
      await request(app.getHttpServer())
        .patch('/profile/onboarding')
        .send(validPayload({ system: 'bacalorya', year: 1, trackId: randomUUID() }))
        .expect(400);
    });

    it('rejects بكالوريا year 2 without an elective subject (400)', async () => {
      const userId = await createTestUser();
      app = await buildApp(async () => sessionFor(userId));
      await request(app.getHttpServer())
        .patch('/profile/onboarding')
        .send(validPayload({ system: 'bacalorya', year: 2, trackId: randomUUID() }))
        .expect(400);
    });

    it('rejects an invalid Egyptian phone (400)', async () => {
      const userId = await createTestUser();
      app = await buildApp(async () => sessionFor(userId));
      await request(app.getHttpServer())
        .patch('/profile/onboarding')
        .send(validPayload({ phone: '123' }))
        .expect(400);
    });

    // S11 — mass assignment. Each of these MUST be rejected outright (400),
    // never silently stripped down to an otherwise-valid write.
    it('rejects a payload carrying role: admin', async () => {
      const userId = await createTestUser();
      app = await buildApp(async () => sessionFor(userId));
      await request(app.getHttpServer())
        .patch('/profile/onboarding')
        .send(validPayload({ role: 'admin' }))
        .expect(400);
    });

    it('rejects a payload carrying another user\'s userId', async () => {
      const userId = await createTestUser();
      const otherUserId = await createTestUser();
      app = await buildApp(async () => sessionFor(userId));
      await request(app.getHttpServer())
        .patch('/profile/onboarding')
        .send(validPayload({ userId: otherUserId }))
        .expect(400);

      // And, just as important: prove the OTHER user's profile was never
      // touched at all — not written, not created.
      const otherProfile = await prisma.studentProfile.findUnique({ where: { userId: otherUserId } });
      expect(otherProfile).toBeNull();
    });

    it('rejects a payload carrying onboardingCompletedAt', async () => {
      const userId = await createTestUser();
      app = await buildApp(async () => sessionFor(userId));
      await request(app.getHttpServer())
        .patch('/profile/onboarding')
        .send(validPayload({ onboardingCompletedAt: new Date().toISOString() }))
        .expect(400);
    });
  });
});
