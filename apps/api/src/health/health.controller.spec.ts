import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { THROTTLER_NAMES } from '../common/throttle/request-identity';
import { HealthController } from './health.controller';

/**
 * Two decorators, and the endpoint is broken in a different way without each.
 *
 * Asserted on the REFLECTED METADATA rather than through a running app,
 * because that is the thing that would actually go missing: both are one line
 * above the handler, and a refactor that drops either compiles, type-checks,
 * and passes every functional test — the damage only appears in production,
 * during an incident, which is the worst moment to discover it.
 */
/**
 * The metadata prefix `@SkipThrottle()` writes, spelled out rather than
 * imported. `THROTTLER_SKIP` lives in `@nestjs/throttler`'s internal
 * `throttler.constants` and is NOT re-exported from the package root — the
 * import resolves to `undefined`, which silently turns every key below into
 * `"undefinedshort"` and makes the whole suite pass against nothing. Found the
 * hard way while writing it.
 */
const THROTTLER_SKIP = 'THROTTLER:SKIP';

describe('HealthController — decorators that only matter during an outage', () => {
  const handler = HealthController.prototype.check;

  it('is @Public() — a load balancer has no session', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
  });

  it('skips EVERY configured throttler by name, not just "default"', () => {
    /*
     * The assertion that catches the real trap. `ThrottlerGuard` reads
     * `THROTTLER:SKIP<name>` for each configured throttler
     * (`throttler.guard.js:68`), while a bare `@SkipThrottle()` writes only
     * `THROTTLER:SKIPdefault`. This app has no throttler called `default`, so
     * the bare decorator skips NOTHING — it compiles, type-checks, reads as
     * protection, and is completely inert.
     *
     * Driven off `THROTTLER_NAMES`, the same list `app.module.ts` builds its
     * throttlers from, so adding a fifth throttler fails here rather than
     * silently un-exempting this route.
     */
    for (const name of THROTTLER_NAMES) {
      expect(Reflect.getMetadata(`${THROTTLER_SKIP}${name}`, handler)).toBe(true);
    }
  });

  it('is @SkipThrottle() — or a Redis outage restarts the container in a loop', () => {
    /*
     * The global ThrottlerGuard stores counters in Redis, and that store
     * REJECTS when Redis is unreachable (asserted directly in
     * `test/throttler-storage.int-spec.ts` against a dead client). A rejecting
     * guard is a 500 on every route it covers — including this one.
     *
     * So without this decorator: Redis blips → /api/health 500s → the
     * healthcheck marks the container unhealthy → it restarts → Redis is still
     * down → repeat. A cache outage becomes a restart loop of a service that
     * was perfectly able to keep serving.
     */
    expect(Reflect.getMetadata(`${THROTTLER_SKIP}short`, handler)).toBe(true);
  });
});
