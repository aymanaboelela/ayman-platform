import { LoginThrottleService } from './login-throttle.service';

/**
 * The ONE attempt/lock ledger for this process.
 *
 * It used to be a `const` inside `auth.config.ts`, which was fine while
 * `/sign-in/{email,phone-number}` were the only two things that ever touched
 * it. They are not any more: an admin setting a new password
 * (`StudentsService.setPassword`) has to be able to clear the student's soft
 * lock, and it cannot reach into `auth.config.ts` to do it —
 * that module imports `better-auth`, which is ESM-only and takes down every
 * Jest spec of whatever file imports it (see `login-security.hook.ts`'s
 * header for the same constraint applied to the hook).
 *
 * So the singleton moves here, to a leaf module with no dependency beyond its
 * own pure service. `auth.config.ts` imports it instead of constructing one,
 * and the admin path imports it too — same object, same Map, one process.
 *
 * ⚠️ Deliberately module scope and not a Nest provider. Better Auth is
 * configured at import time, outside the Nest container (`auth.config.ts` has
 * no injector to ask), so a provider could not be shared with it — and two
 * instances of this ledger is exactly the bug this file exists to prevent:
 * the lock would be recorded in one and cleared in the other.
 *
 * In-memory, so it is per-INSTANCE. That is a pre-existing property of
 * `InMemoryAttemptStore` (see its docblock on swapping in Redis), not
 * something this module introduces; with one API container it is the whole
 * truth.
 */
export const loginThrottle = new LoginThrottleService();
