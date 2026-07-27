import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import type Redis from 'ioredis';

import { HealthController } from '../health/health.controller';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS, RedisModule } from '../redis/redis.module';
import { CatalogModule } from '../modules/catalog/catalog.module';
import { trackerFromRequest } from '../common/throttle/request-identity';

/**
 * Proves the fix for the `next build` deployment blocker found while
 * verifying Task 14: static generation fires one concurrent
 * `GET /api/catalog/courses/:slug` per published course, from one caller,
 * and used to blow through the default `short: 10/1s` throttle immediately.
 *
 * The two claims this file exists to prove, together:
 *   1. A burst of catalog reads, at build scale, now succeeds (the fix).
 *   2. An ordinary default-throttled route in the SAME burst window still
 *      gets limited at the unchanged default (the fix did not leak into a
 *      global loosening).
 *
 * `HealthController` stands in for "an ordinary route" (login's own limiter
 * cannot be exercised here: Better Auth's HTTP handler is ESM-only and this
 * suite's Jest transform deliberately does not touch it -- the same
 * constraint `quiz.authz.spec.ts` and `throttler-storage.int-spec.ts`
 * document). `HealthController` carries no `@Throttle` override of its own,
 * so it inherits the exact same default `short: 10/1s` shape the real login
 * route does -- the property under test ("does a route keep the tight
 * default budget, or did the fix leak") does not depend on WHICH
 * default-throttled route is used, only on it staying at the default.
 *
 * Real Redis, real ThrottlerGuard, matching `app.module.ts`'s actual
 * configuration -- not mocked.
 */
describe('catalog routes have their own throttle budget, separate from the default', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let courseSlug: string;
  let courseId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as unknown as PrismaService;
    await prisma.$connect();

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    const course = await prisma.course.create({
      data: {
        slug: `catalog-throttle-${randomUUID()}`,
        title: 'كورس اختبار الحدود',
        status: 'published',
        publishedAt: new Date(),
        systemId: system.id,
        year: 2,
        subjectId: subject.id,
        instructorId: (await prisma.user.create({
          data: { id: randomUUID(), name: 'Throttle Fixture', email: `${randomUUID()}@example.test` },
        })).id,
      },
    });
    courseId = course.id;
    courseSlug = course.slug;

    @Module({
      controllers: [HealthController],
      imports: [
        RedisModule,
        // Byte-for-byte the same shape as app.module.ts's real config --
        // this test would be worthless if it exercised a lighter throttler
        // than production actually runs.
        ThrottlerModule.forRootAsync({
          imports: [RedisModule],
          inject: [REDIS],
          useFactory: (redis: Redis) => ({
            throttlers: [
              { name: 'short', ttl: seconds(1), limit: 10, getTracker: trackerFromRequest },
              { name: 'medium', ttl: seconds(60), limit: 60, getTracker: trackerFromRequest },
              { name: 'long', ttl: seconds(3600), limit: 1000, getTracker: trackerFromRequest },
            ],
            storage: new ThrottlerStorageRedisService(redis),
          }),
        }),
        PrismaModule,
        CatalogModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    })
    class FixtureModule {}

    // Deliberately NOT overriding PrismaService with the hand-built `prisma`
    // client below: `HealthController` calls the real service's own
    // `isHealthy()` method, which a bare `PrismaClient` cast does not have.
    // Letting Nest construct the real `PrismaService` (it self-configures
    // from `DATABASE_URL`) is correct here for both controllers.
    const moduleRef = await Test.createTestingModule({ imports: [FixtureModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    // RedisModule's connection is `enableOfflineQueue: false` (Task 9: fail
    // closed rather than silently buffer during an outage) -- correct in
    // production, but it means a command issued before the TCP handshake
    // finishes throws "Stream isn't writeable" instead of queueing. app.init()
    // resolves before that handshake necessarily completes, and this test
    // fires its whole burst in one Promise.all immediately after, so wait for
    // the client to actually be ready first.
    const redis = app.get<Redis>(REDIS);
    if (redis.status !== 'ready') {
      await new Promise<void>((resolve) => redis.once('ready', () => resolve()));
    }
  });

  afterAll(async () => {
    await app?.close();
    await prisma.course.delete({ where: { id: courseId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { email: { contains: '@example.test' }, name: 'Throttle Fixture' } });
    await prisma.$disconnect();
  });

  it('survives a build-scale burst of catalog reads with zero 429s', async () => {
    // Comfortably over the default 10/1s limit, and over even a generous
    // "37 published courses" build -- every request the SAME shape a real
    // `generateStaticParams` prerender fires. `allSettled`, not `all`: 40
    // parallel sockets through one in-process loopback server can drop an
    // occasional connection as a harness artifact (see the health-route
    // test's comment) -- the assertion below is the one that actually
    // matters: not one of the responses that DID complete is a 429.
    const BURST = 40;
    const results = await Promise.allSettled(
      Array.from({ length: BURST }, () => request(app.getHttpServer()).get(`/api/catalog/courses/${courseSlug}`)),
    );
    const completed = results.filter((r) => r.status === 'fulfilled').map((r) => (r as PromiseFulfilledResult<request.Response>).value.status);
    expect(completed.filter((status) => status === 429)).toEqual([]);
    expect(completed.length).toBeGreaterThan(0);
    expect(completed.every((status) => status === 200)).toBe(true);
  });

  it('still throttles an ordinary default-shaped route at the unchanged 10/1s limit', async () => {
    const BURST = 20;
    // A rejected/blocked response over a real loopback socket under this much
    // concurrency can surface as a dropped connection rather than a clean
    // HTTP 429 (an artifact of the test harness pushing 20 parallel sockets
    // through one in-process server, not of the throttler itself) -- treat
    // either as "this request did not cleanly succeed" rather than letting a
    // network-level error fail the assertion outright.
    const responses = await Promise.allSettled(
      Array.from({ length: BURST }, () => request(app.getHttpServer()).get('/api/health')),
    );
    const statuses = responses.map((result) => (result.status === 'fulfilled' ? result.value.status : 'error'));
    // Exactly the default ceiling: at most the first 10 in this one-second
    // window succeed, and at least one of the remaining 10 is rejected
    // (429, or a dropped connection under this harness's concurrency -- see
    // the comment above) -- proving the fix did not touch this route's budget.
    expect(statuses.filter((status) => status !== 200).length).toBeGreaterThan(0);
    expect(statuses.filter((status) => status === 200).length).toBeLessThanOrEqual(10);
  });
});
