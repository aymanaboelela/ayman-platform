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
import {
  BETTER_AUTH,
  type BetterAuthLike,
  type BetterAuthSessionResult,
} from '../../auth/better-auth.token';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionDeviceService } from './session-device.service';
import { SessionsController } from './sessions.controller';

/**
 * Full-stack e2e, same shape as `profile.controller.spec.ts`'s (guard → Zod
 * DTO pipe → controller → service, real seeded Postgres, only the Better
 * Auth session lookup faked). The whole point of this file is Task 7's
 * central control: user A must not be able to read OR revoke user B's
 * session/device, and the failure must be a 404 — a 403 would itself
 * confirm the id belongs to someone.
 */
describe('SessionsController (e2e)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService;

  const testUserIds: string[] = [];

  async function createTestUser(): Promise<string> {
    const id = randomUUID();
    await prisma.user.create({
      data: { id, name: 'E2E Student', email: `${id}@example.test`, emailVerified: true, role: 'student' },
    });
    testUserIds.push(id);
    return id;
  }

  /** A real Better Auth `Session` row, so revoke's `session.deleteMany` has something to delete. */
  async function createSessionRow(userId: string): Promise<string> {
    const id = `sess-${randomUUID()}`;
    await prisma.session.create({
      data: {
        id,
        userId,
        token: `token-${id}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        ipAddress: '203.0.113.7',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    return id;
  }

  async function createDevice(
    userId: string,
    sessionId: string,
    overrides: Partial<{ revokedAt: Date | null; deviceName: string; lastSeenAt: Date }> = {},
  ): Promise<string> {
    const now = new Date();
    const device = await prisma.sessionDevice.create({
      data: {
        userId,
        sessionId,
        deviceName: overrides.deviceName ?? 'Chrome على macOS',
        deviceType: 'desktop',
        ip: '203.0.113.7',
        lastSeenAt: overrides.lastSeenAt ?? now,
        loggedInAt: now,
        revokedAt: overrides.revokedAt,
      },
    });
    return device.id;
  }

  function sessionResultFor(userId: string, sessionId: string): BetterAuthSessionResult {
    const now = new Date();
    return {
      session: { id: sessionId },
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
      controllers: [SessionsController],
      providers: [
        Reflector,
        { provide: PrismaService, useValue: prisma },
        {
          provide: SessionDeviceService,
          useFactory: (p: PrismaService) => new SessionDeviceService(p),
          inject: [PrismaService],
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

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as PrismaService;
    await prisma.$connect();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  afterAll(async () => {
    await prisma.sessionDevice.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
    await prisma.$disconnect();
  });

  describe('GET /sessions', () => {
    it('401s an unauthenticated request', async () => {
      app = await buildApp(async () => null);
      await request(app.getHttpServer()).get('/sessions').expect(401);
    });

    it('lists only the caller\'s own devices, marking the current one', async () => {
      const userId = await createTestUser();
      const sessionId1 = await createSessionRow(userId);
      const sessionId2 = await createSessionRow(userId);
      const deviceId1 = await createDevice(userId, sessionId1);
      const deviceId2 = await createDevice(userId, sessionId2);

      app = await buildApp(async () => sessionResultFor(userId, sessionId2));
      const res = await request(app.getHttpServer()).get('/sessions').expect(200);

      expect(res.body).toHaveLength(2);
      const ids = res.body.map((d: { id: string }) => d.id).sort();
      expect(ids).toEqual([deviceId1, deviceId2].sort());
      const current = res.body.find((d: { id: string }) => d.id === deviceId2);
      const other = res.body.find((d: { id: string }) => d.id === deviceId1);
      expect(current.isCurrent).toBe(true);
      expect(other.isCurrent).toBe(false);
    });

    it("IDOR: user A's list never contains user B's device", async () => {
      const userA = await createTestUser();
      const userB = await createTestUser();
      const sessionA = await createSessionRow(userA);
      const sessionB = await createSessionRow(userB);
      const deviceA = await createDevice(userA, sessionA);
      await createDevice(userB, sessionB);

      app = await buildApp(async () => sessionResultFor(userA, sessionA));
      const res = await request(app.getHttpServer()).get('/sessions').expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(deviceA);
    });

    it('omits an already-revoked device from the list', async () => {
      const userId = await createTestUser();
      const sessionId = await createSessionRow(userId);
      await createDevice(userId, sessionId, { revokedAt: new Date() });

      app = await buildApp(async () => sessionResultFor(userId, sessionId));
      const res = await request(app.getHttpServer()).get('/sessions').expect(200);
      expect(res.body).toHaveLength(0);
    });
  });

  describe('DELETE /sessions/:id', () => {
    it('401s an unauthenticated request', async () => {
      app = await buildApp(async () => null);
      await request(app.getHttpServer()).delete(`/sessions/${randomUUID()}`).expect(401);
    });

    it('revokes an own device (204) and deletes the underlying Better Auth session', async () => {
      const userId = await createTestUser();
      const sessionId = await createSessionRow(userId);
      const deviceId = await createDevice(userId, sessionId);

      app = await buildApp(async () => sessionResultFor(userId, sessionId));
      await request(app.getHttpServer()).delete(`/sessions/${deviceId}`).expect(204);

      const device = await prisma.sessionDevice.findUnique({ where: { id: deviceId } });
      expect(device?.revokedAt).not.toBeNull();

      // THE point of Task 7's verification requirement: revoking must not
      // merely hide the row from a list — the actual Better Auth session
      // row is gone, so the next `getSession()` lookup for that session id
      // returns nothing and AuthGuard denies with 401.
      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      expect(session).toBeNull();
    });

    it(
      "IDOR: user A revoking user B's device returns 404, not 403, and leaves B's device untouched",
      async () => {
        const userA = await createTestUser();
        const userB = await createTestUser();
        const sessionA = await createSessionRow(userA);
        const sessionB = await createSessionRow(userB);
        const deviceB = await createDevice(userB, sessionB);

        app = await buildApp(async () => sessionResultFor(userA, sessionA));
        await request(app.getHttpServer()).delete(`/sessions/${deviceB}`).expect(404);

        const device = await prisma.sessionDevice.findUnique({ where: { id: deviceB } });
        expect(device?.revokedAt).toBeNull();
        const session = await prisma.session.findUnique({ where: { id: sessionB } });
        expect(session).not.toBeNull();
      },
    );

    it('404s a nonexistent device id', async () => {
      const userId = await createTestUser();
      const sessionId = await createSessionRow(userId);

      app = await buildApp(async () => sessionResultFor(userId, sessionId));
      await request(app.getHttpServer()).delete(`/sessions/${randomUUID()}`).expect(404);
    });

    it('404s revoking an already-revoked device (no double-revoke)', async () => {
      const userId = await createTestUser();
      const sessionId = await createSessionRow(userId);
      const deviceId = await createDevice(userId, sessionId, { revokedAt: new Date() });

      app = await buildApp(async () => sessionResultFor(userId, sessionId));
      await request(app.getHttpServer()).delete(`/sessions/${deviceId}`).expect(404);
    });
  });
});
