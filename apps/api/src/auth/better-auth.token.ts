import type { AuthenticatedUser } from './decorators/current-user.decorator';

/**
 * DI token for the configured Better Auth instance (see `./auth.config`).
 *
 * Deliberately kept in its own file with zero runtime imports: `auth.config`
 * pulls in `better-auth`, `argon2`, and constructs a live Prisma client at
 * module-load time. `better-auth` (and `@thallesp/nestjs-better-auth`, which
 * mounts it) ship ESM-only builds with no CJS entry point — Jest's default
 * CJS-based module loader cannot `require()` them, so any file jest loads
 * (production code under test, not just spec files) must not import them at
 * the top level. `AuthGuard` and this token only need the *shape* of the
 * Better Auth instance, not the real thing, so `BetterAuthLike` below is a
 * hand-written structural type instead of `typeof auth`.
 */
export const BETTER_AUTH = Symbol('BETTER_AUTH');

export interface BetterAuthSessionResult {
  session: { id: string; [key: string]: unknown };
  user: AuthenticatedUser;
}

/** The minimal shape `AuthGuard` needs from the Better Auth instance. */
export interface BetterAuthLike {
  api: {
    getSession(options: { headers: Headers }): Promise<BetterAuthSessionResult | null>;
  };
}
