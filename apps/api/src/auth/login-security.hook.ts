// The one file (alongside `./auth.config.ts` and `./auth.module.ts`) that
// imports `better-auth/api` directly. `better-auth` ships ESM-only; Jest's
// CJS loader can't `require()` it. No spec file imports this module —
// `LoginSecurityService`, `LoginThrottleService`, and the credential-check
// functions this wraps are all tested directly, without going through
// Better Auth at all. See Task 2's `guards/auth.guard.ts` for the same
// pattern applied to the session guard.
import { APIError, createAuthMiddleware } from 'better-auth/api';
import {
  emailIdentifier,
  phoneIdentifier,
  type CredentialLookup,
  type LoginIdentifier,
  type StoredCredential,
} from './credential-check.service';
import type { LoginSecurityService } from './login-security.service';
import { planPhoneNormalization } from './phone-identity';
import type { PrismaClient } from '../generated/prisma/client';

/**
 * The one concrete `CredentialLookup` — reads the credential-provider
 * `Account` row (`providerId: 'credential'`, per Better Auth's own
 * `sign-up/email` route) for the `User` the identifier names. Returns `null`
 * for both "no such user" and "user exists but has no password credential
 * (OAuth-only account)" — both must be indistinguishable from the caller's
 * point of view, same principle as S1.
 */
export class PrismaCredentialLookup implements CredentialLookup {
  constructor(private readonly prisma: PrismaClient) {}

  async findCredential(identifier: LoginIdentifier): Promise<StoredCredential | null> {
    /**
     * Both columns are unique, so both are single-index reads — a phone login
     * costs exactly what an email login costs. `phoneNumber` is matched
     * byte-for-byte, which is only correct because the value was rewritten to
     * E.164 by `planPhoneNormalization` before reaching here.
     */
    const user =
      identifier.kind === 'email'
        ? await this.prisma.user.findUnique({ where: { email: identifier.value } })
        : await this.prisma.user.findUnique({ where: { phoneNumber: identifier.value } });
    if (!user) return null;

    const account = await this.prisma.account.findFirst({
      where: { userId: user.id, providerId: 'credential' },
    });
    if (!account?.password) return null;

    return { userId: user.id, passwordHash: account.password };
  }
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Client IP resolution, consistent with `app.set('trust proxy', 1)` in
 * `main.ts`. That setting tells Express to trust exactly one reverse-proxy
 * hop; the same assumption applies here even though this code runs inside
 * Better Auth's own request context rather than an Express handler (Better
 * Auth's hooks see the raw Fetch `Headers`, not Express's pre-computed
 * `req.ip`).
 *
 * Reads the `X-Forwarded-For` header and takes its LAST (right-most) entry.
 * With exactly one trusted hop, that entry is the one thing on the request
 * a spoofing client cannot control: the client's own `X-Forwarded-For`
 * header (if it sends one at all) only ever contributes entries to the
 * LEFT, because the trusted reverse proxy appends the address it actually
 * saw as the last, right-most entry before forwarding — it does not trust
 * or forward anything past that point. A client can put arbitrary junk in
 * the header it sends; it cannot make the proxy lie about who connected to
 * it. This mirrors Express's own algorithm for a numeric `trust proxy`
 * value (`proxy-addr`'s hop-counting from the socket backwards), applied
 * manually here because this file never sees the Express `req`/`res`.
 *
 * No `X-Forwarded-For` header at all (e.g. local dev with no reverse proxy
 * in front, or a direct connection) falls back to a constant rather than
 * throwing — there's no proxy hop to trust-derive from, but a stable
 * placeholder still keys correctly per-process for the throttle's purposes.
 */
export function resolveClientIp(headers: Headers | undefined): string {
  const raw = headers?.get('x-forwarded-for');
  if (raw) {
    const hops = raw
      .split(',')
      .map((hop) => hop.trim())
      .filter(Boolean);
    const clientIp = hops.at(-1);
    if (clientIp) return clientIp;
  }
  return 'direct';
}

/**
 * S1-S4, wired into Better Auth's request lifecycle. Runs before Better
 * Auth's own `/sign-in/email` handler, decides the entire outcome itself,
 * and — on any failure — throws the generic `APIError` directly, so Better
 * Auth's own handler (and whatever field-specific message it would
 * otherwise produce) never runs for a failing attempt. On success, this
 * hook returns normally and lets Better Auth's own handler re-verify the
 * password and establish the session as usual.
 */
/**
 * Reads the ban state for a user id. A port rather than a Prisma call inline,
 * for the same reason `CredentialLookup` is one: the hook is not reachable
 * from a spec (see the file header), so anything with a decision in it has to
 * be injectable or it cannot be tested at all.
 */
export interface BannedAccountLookup {
  findBan(userId: string): Promise<{ reason: string | null } | null>;
}

export class PrismaBannedAccountLookup implements BannedAccountLookup {
  constructor(private readonly prisma: PrismaClient) {}

  async findBan(userId: string): Promise<{ reason: string | null } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { bannedAt: true, bannedReason: true },
    });
    if (!user?.bannedAt) return null;
    return { reason: user.bannedReason };
  }
}

/** The code the web app matches on to render the Arabic «الحساب موقوف» screen. */
export const BANNED_ACCOUNT_ERROR = 'ACCOUNT_BANNED' as const;

/**
 * Better Auth allows exactly ONE top-level `hooks.before` (see
 * `api/dispatch.mjs`'s `getHooks`: the option is a single function, registered
 * with a match-everything matcher). So the two things that have to happen
 * before a request reaches a handler — normalising the phone in the body, and
 * S1-S4 on the sign-in paths — are composed here rather than registered
 * separately.
 */
export function createAuthBeforeHook(
  loginSecurity: LoginSecurityService,
  bannedAccounts: BannedAccountLookup,
) {
  return createAuthMiddleware(async (ctx) => {
    /**
     * Phone normalisation runs FIRST and on every path, because sign-in reads
     * the value it produces and sign-up stores it. Returning a `context` from
     * a before-hook is how Better Auth lets a hook rewrite the request:
     * `runBeforeHooks` merges the returned `context` into the one the handler
     * receives. The body is spread whole rather than returning the single key,
     * since that merge is a deep merge over the object it is handed.
     */
    const plan = planPhoneNormalization(ctx.path, ctx.body);
    if (plan.action === 'reject') {
      throw new APIError('BAD_REQUEST', {
        code: 'INVALID_PHONE_NUMBER',
        message: plan.message,
      });
    }

    let normalizedPhone: string | null = null;
    let rewrite: { context: { body: Record<string, unknown> } } | undefined;
    if (plan.action === 'rewrite') {
      normalizedPhone = plan.phoneNumber;
      rewrite = {
        context: {
          body: {
            ...(ctx.body as Record<string, unknown>),
            phoneNumber: plan.phoneNumber,
            /**
             * Present only on a sign-up where the student gave no address.
             * `/sign-up/email` refuses a body that fails `z.email()` before
             * any hook or table definition is consulted, so this is what
             * lets an email-less registration reach the handler at all. It
             * carries the reserved `@phone.invalid` domain and
             * `databaseHooks.user.create.before` strips it off the row, so
             * it never reaches the database.
             */
            ...(plan.email ? { email: plan.email } : {}),
          },
        },
      };
    }

    const isEmailSignIn = ctx.path === '/sign-in/email';
    const isPhoneSignIn = ctx.path === '/sign-in/phone-number';
    if (!isEmailSignIn && !isPhoneSignIn) return rewrite;

    const body = ctx.body as { email?: unknown; password?: unknown } | undefined;
    const password = typeof body?.password === 'string' ? body.password : '';
    const ip = resolveClientIp(ctx.headers);

    /**
     * On the phone route, `normalizedPhone` is null only when the submitted
     * number could not be parsed at all. Falling back to the raw string keeps
     * that attempt on the ordinary failure path — it looks up nothing, fails
     * the verify against the dummy hash, and returns the same generic 401 —
     * rather than short-circuiting into a distinguishable "bad format" branch.
     */
    const identifier: LoginIdentifier = isPhoneSignIn
      ? phoneIdentifier(
          normalizedPhone ??
            (typeof (body as { phoneNumber?: unknown })?.phoneNumber === 'string'
              ? ((body as { phoneNumber: string }).phoneNumber as string)
              : ''),
        )
      : emailIdentifier(typeof body?.email === 'string' ? body.email : '');

    const result = await loginSecurity.evaluate(identifier, password, ip);

    if (result.delayMs > 0) {
      await sleep(result.delayMs);
    }

    if (result.outcome === 'failure') {
      throw new APIError('UNAUTHORIZED', result.responseBody);
    }

    /**
     * حظر, checked ONLY after the password has been verified — and that
     * ordering is the entire security argument, not an implementation detail.
     *
     * S1 above spends this whole file making every failure byte-identical so
     * that an attacker cannot learn which emails exist. Announcing «this
     * account is banned» to anyone who merely TYPES the address would hand
     * back exactly that oracle, and would do it for the accounts most worth
     * probing for. Announcing it to someone who has just proved they hold the
     * password reveals nothing they did not already know.
     *
     * So a wrong password on a banned account is still the generic error, and
     * only the account's actual owner is told what happened.
     *
     * Telling them is the point. A banned student who gets «بيانات الدخول غلط»
     * retypes their password, trips the progressive delay in
     * `login-throttle.service`, waits 30 seconds, tries again, and eventually
     * messages the instructor — who then has to work out that the account he
     * banned last week is the one being asked about. One clear sentence here
     * removes all of that.
     *
     * `FORBIDDEN` and not `UNAUTHORIZED`: the credentials were right. The
     * account is what is refused.
     *
     * ⚠️ This is the friendly half, not the enforcing half. It covers the two
     * sign-in routes and nothing else — sign-up and Google never reach it. The
     * control that actually holds is `databaseHooks.session.create.before` in
     * `auth.config.ts`, which refuses the session write on every path.
     * Deleting this block degrades the message; deleting that one removes the
     * ban.
     */
    if (result.userId) {
      const ban = await bannedAccounts.findBan(result.userId);
      if (ban) {
        throw new APIError('FORBIDDEN', {
          code: BANNED_ACCOUNT_ERROR,
          message: 'This account has been suspended',
          reason: ban.reason,
        });
      }
    }

    /**
     * Load-bearing on the phone route. Better Auth's own `/sign-in/phone-number`
     * handler runs AFTER this hook and does its own lookup by exact string; if
     * the rewritten body were dropped here, the handler would re-read the raw
     * `01012345678` the student typed, find nothing, and 401 a student whose
     * password this hook just confirmed was correct.
     */
    return rewrite;
  });
}
