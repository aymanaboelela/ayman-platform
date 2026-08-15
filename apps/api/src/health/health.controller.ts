import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { SKIP_ALL_THROTTLERS } from '../common/throttle/request-identity';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Captured once, when the module is first imported — so it marks when THIS
 * process booted, and a redeploy necessarily moves it.
 *
 * It exists for the deploy job in .github/workflows/ci.yml. That job used to
 * verify a deploy purely by watching the served asset hashes change, which
 * cannot work for a push that alters no client-side output: an API-only or
 * CI-only change rebuilds and restarts everything while the browser payload
 * stays byte-identical. This is the signal that says "the container you are
 * talking to is not the one you were talking to before" regardless of what
 * changed. Second precision is deliberate — it is a restart marker, not a
 * clock, and nothing should read it as one.
 */
const STARTED_AT = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public: load balancers / uptime checks have no session.
   *
   * ⚠️ `@SkipThrottle()` is not a convenience — without it a REDIS outage
   * takes the whole container down, and takes it down repeatedly.
   *
   * The global `ThrottlerGuard` stores its counters in Redis
   * (`ThrottlerStorageRedisService`), and that store REJECTS when Redis is
   * unreachable — `throttler-storage.int-spec.ts` asserts exactly that against
   * a dead client. A rejecting guard is a 500, and the guard runs on every
   * route including this one. So:
   *
   *   Redis blips → /api/health 500s → the healthcheck marks the container
   *   unhealthy → it is restarted → Redis is still down → repeat.
   *
   * The API itself is perfectly capable of serving during a Redis outage: the
   * database is the dependency this endpoint actually reports on, and losing
   * the cache and the rate limiter is a degradation, not an outage. Answering
   * honestly about the database is precisely what this route is FOR, and it
   * cannot do that job while a second, unrelated dependency can silence it.
   *
   * Rate-limiting a health endpoint has no upside either: it is unauthenticated
   * by necessity, it does one indexed query, and the callers are the load
   * balancer and the uptime monitor — the two clients that must never be told
   * to come back later.
   */
  @Public()
  @SkipThrottle(SKIP_ALL_THROTTLERS)
  @Get()
  async check(): Promise<{
    status: 'ok' | 'degraded';
    service: string;
    database: 'up' | 'down';
    startedAt: string;
  }> {
    const dbUp = await this.prisma.isHealthy();
    return {
      status: dbUp ? 'ok' : 'degraded',
      service: 'ayman-api',
      database: dbUp ? 'up' : 'down',
      startedAt: STARTED_AT,
    };
  }
}
