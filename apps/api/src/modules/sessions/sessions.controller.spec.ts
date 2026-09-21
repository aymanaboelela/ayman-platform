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
      // Distinct names on purpose: the list is one entry per DEVICE now, so
      // two rows sharing a name are one phone signed in twice, not two
      // devices. The test below pins that half.
      const deviceId1 = await createDevice(userId, sessionId1, { deviceName: 'Chrome على macOS' });
      const deviceId2 = await createDevice(userId, sessionId2, { deviceName: 'Safari على iOS' });

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

    /**
     * The correction that makes «أجهزتي» readable again, and the one the
     * two-device limit is built on.
     *
     * A row is written per SIGN-IN, sessions last 90 days and nothing signs a
     * student out, so one phone accumulates a row per login — measured on the
     * dev cohort, one student has 459 of them, every card saying «Chrome على
     * Android». Grouping by device name turns that back into one card, and
     * `auth/device-limit.ts` counts exactly this same group: what a student
     * can see and remove has to be what the gate counts, or removing a device
     * would not free a slot and the limit would be a permanent lock.
     */
    it('collapses repeated sign-ins from one device into a single entry', async () => {
      const userId = await createTestUser();
      const first = await createSessionRow(userId);
      const second = await createSessionRow(userId);
      const third = await createSessionRow(userId);
      await createDevice(userId, first, { deviceName: 'Chrome على Android' });
      await createDevice(userId, second, { deviceName: 'Chrome على Android' });
      await createDevice(userId, third, { deviceName: 'Chrome على Android' });

      app = await buildApp(async () => sessionResultFor(userId, third));
      const res = await request(app.getHttpServer()).get('/sessions').expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].deviceName).toBe('Chrome على Android');
      // The group holds the current session, so the card is marked — even
      // though it also stands for two older sign-ins that are not current.
      expect(res.body[0].isCurrent).toBe(true);
    });

    /**
     * The 38 orphans measured in the dev database: rows still marked active
     * whose session no longer exists. They are excluded by the JOIN rather
     * than erased — a mass `UPDATE ... SET revoked_at` over thousands of rows
     * on three live databases is a write that cannot be tested first and
     * cannot be undone, and a WHERE clause is both.
     */
    it('omits a device whose session is gone', async () => {
      const userId = await createTestUser();
      const live = await createSessionRow(userId);
      await createDevice(userId, live, { deviceName: 'Chrome على macOS' });
      // No `sessions` row for this one at all — exactly the orphan shape.
      await createDevice(userId, `sess-${randomUUID()}`, { deviceName: 'Edge على Windows' });

      app = await buildApp(async () => sessionResultFor(userId, live));
      const res = await request(app.getHttpServer()).get('/sessions').expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].deviceName).toBe('Chrome على macOS');
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

    /**
     * «شيل جهاز عشان تضيف جديد» has to actually free the slot.
     *
     * The card a student presses stands for every un-revoked sign-in from that
     * device, and with 90-day sessions there are routinely dozens. Revoking
     * only the representative row would tick the card off the screen while the
     * other sessions stayed valid — and, since `device-limit.ts` counts the
     * same group, would leave the device still occupying its place. The
     * two-device limit would then be a permanent lock whose only exit is a
     * WhatsApp message.
     */
    it('revoking a device ends every session that device is holding', async () => {
      const userId = await createTestUser();
      const first = await createSessionRow(userId);
      const second = await createSessionRow(userId);
      const other = await createSessionRow(userId);
      const deviceId = await createDevice(userId, first, { deviceName: 'Chrome على Android' });
      const sameDeviceAgain = await createDevice(userId, second, {
        deviceName: 'Chrome على Android',
      });
      const untouched = await createDevice(userId, other, { deviceName: 'Safari على iOS' });

      app = await buildApp(async () => sessionResultFor(userId, other));
      await request(app.getHttpServer()).delete(`/sessions/${deviceId}`).expect(204);

      // Both rows of the group revoked, and both sessions actually gone.
      for (const id of [deviceId, sameDeviceAgain]) {
        expect((await prisma.sessionDevice.findUnique({ where: { id } }))?.revokedAt).not.toBeNull();
      }
      expect(await prisma.session.findUnique({ where: { id: first } })).toBeNull();
      expect(await prisma.session.findUnique({ where: { id: second } })).toBeNull();

      // The OTHER device is untouched — a group revoke is scoped to its name,
      // not to the account.
      expect(
        (await prisma.sessionDevice.findUnique({ where: { id: untouched } }))?.revokedAt,
      ).toBeNull();
      expect(await prisma.session.findUnique({ where: { id: other } })).not.toBeNull();
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
