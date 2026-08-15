import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { THROTTLER_NAMES } from '../common/throttle/request-identity';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

const TTL_MS = 60_000;
const LIMIT = 10;
const BLOCK_MS = 60_000;
const NAME = 'medium';

describe('throttler storage', () => {
  it('demonstrates why the in-memory store is unusable with more than one replica', async () => {
    // Two independent stores = two replicas of the API behind a load balancer.
    const replicaA = new ThrottlerStorageService();
    const replicaB = new ThrottlerStorageService();
    const key = `demo:${randomUUID()}`;

    for (let i = 0; i < LIMIT; i += 1) {
      await replicaA.increment(key, TTL_MS, LIMIT, BLOCK_MS, NAME);
      await replicaB.increment(key, TTL_MS, LIMIT, BLOCK_MS, NAME);
    }

    // 20 requests have been served against a limit of 10, and neither replica
    // considers the caller blocked. The effective limit is limit × replicas.
    const a = await replicaA.increment(key, TTL_MS, LIMIT, BLOCK_MS, NAME);
    expect(a.totalHits).toBe(LIMIT + 1);

    replicaA.onApplicationShutdown();
    replicaB.onApplicationShutdown();
  });

  it('shares one counter across replicas when backed by Redis', async () => {
    const clientA = new Redis(REDIS_URL);
    const clientB = new Redis(REDIS_URL);
    const replicaA = new ThrottlerStorageRedisService(clientA);
    const replicaB = new ThrottlerStorageRedisService(clientB);
    const key = `shared:${randomUUID()}`;

    let last!: Awaited<ReturnType<typeof replicaA.increment>>;
    for (let i = 0; i < LIMIT / 2; i += 1) {
      last = await replicaA.increment(key, TTL_MS, LIMIT, BLOCK_MS, NAME);
      last = await replicaB.increment(key, TTL_MS, LIMIT, BLOCK_MS, NAME);
    }

    // Exactly LIMIT hits have been served in total across both replicas.
    expect(last.totalHits).toBe(LIMIT);
    expect(last.isBlocked).toBe(false);

    // The next one — from either replica — is over the shared limit.
    const overflow = await replicaB.increment(key, TTL_MS, LIMIT, BLOCK_MS, NAME);
    expect(overflow.isBlocked).toBe(true);
    expect(overflow.timeToBlockExpire).toBeGreaterThan(0);

    await clientA.del(key);
    await clientA.quit();
    await clientB.quit();
  });

  it('rejects rather than buffers when Redis is unreachable', async () => {
    // Fail closed. With ioredis's default offline queue, a Redis outage silently
    // buffers every increment and each limit becomes effectively unlimited for
    // the duration of the outage — an availability incident turning into an
    // authentication brute-force window.
    const dead = new Redis('redis://127.0.0.1:6399', {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    dead.on('error', () => {
      /* expected: the connection cannot be established */
    });
    const storage = new ThrottlerStorageRedisService(dead);

    await expect(storage.increment(`dead:${randomUUID()}`, TTL_MS, LIMIT, BLOCK_MS, NAME)).rejects.toBeDefined();

    dead.disconnect();
  });

  /**
   * `app.module.ts` cannot be `import`ed directly in a Jest spec:
   * `@thallesp/nestjs-better-auth` ships ESM-only (no CJS entry) and Jest's
   * `transformIgnorePatterns` deliberately does not include it — the same
   * reason `quiz.authz.spec.ts` and `auth.guard.ts`'s own doc comment give
   * for keeping the real Better Auth import confined to `auth.module.ts`,
   * which no spec loads. So this checks the SOURCE rather than the compiled
   * module: Plan 1 Task 11 created `ThrottlerModule.forRoot` with
   * `getTracker: trackerFromRequest` on all three named throttlers (Plan 4
   * Task 4's fix for the "IP-only locks out a whole school's NAT" bug); this
   * task's only sanctioned change was `forRoot` → `forRootAsync` plus
   * `storage: new ThrottlerStorageRedisService(redis)`. A re-authored
   * `throttlers` array that dropped `getTracker` would still compile and
   * would still pass every other test in this file — this is the one
   * assertion that would catch that regression.
   */
  it('keeps every named throttler session-keyed after the storage swap to Redis', () => {
    const source = readFileSync(join(__dirname, '../app.module.ts'), 'utf8');

    const forRootAsyncIndex = source.indexOf('ThrottlerModule.forRootAsync');
    expect(forRootAsyncIndex).toBeGreaterThan(-1);
    expect(source).not.toContain('ThrottlerModule.forRoot(');

    const throttlersBlock = source.slice(
      source.indexOf('throttlers:', forRootAsyncIndex),
      source.indexOf('storage:', forRootAsyncIndex),
    );
    for (const name of ['short', 'medium', 'long']) {
      expect(throttlersBlock).toContain(`name: '${name}'`);
    }
    // All three named throttlers, not just one, still carry the tracker —
    // a partial revert (e.g. only 'short' keeping it) is exactly the kind of
    // change a naive re-authoring of the array could introduce.
    expect(throttlersBlock.match(/getTracker: trackerFromRequest/g)).toHaveLength(3);
    expect(source).toContain('new ThrottlerStorageRedisService(redis)');
  });
});

/**
 * `THROTTLER_NAMES` and the actual `throttlers` array must agree, or
 * `@SkipThrottle(SKIP_ALL_THROTTLERS)` silently stops exempting a route.
 *
 * The names stay LITERAL in `app.module.ts` — the assertions above read that
 * file as source and an indirection would blind them — so the two lists are
 * kept in step by this test instead of by a shared constant. That is the right
 * trade here: a drift is caught in CI, whereas the source-reading guards above
 * cannot be replaced by anything cheaper.
 */
describe('THROTTLER_NAMES matches the configured throttlers', () => {
  const source = readFileSync(join(__dirname, '..', 'app.module.ts'), 'utf8');

  it('names every throttler that app.module.ts actually configures', () => {
    for (const name of THROTTLER_NAMES) {
      expect(source).toContain(`name: '${name}'`);
    }
  });

  it('does not name one that does not exist', () => {
    // A stale entry is the dangerous direction: `SKIP_ALL_THROTTLERS` would
    // still look complete while a real throttler went un-skipped.
    const configured = [...source.matchAll(/name: '([a-z]+)'/g)].map((m) => m[1]);
    expect([...THROTTLER_NAMES].sort()).toEqual(configured.sort());
  });
});
