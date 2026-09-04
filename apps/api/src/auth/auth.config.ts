// Better Auth is wired here as a plain module-level singleton rather than a
// Nest provider — `@thallesp/nestjs-better-auth`'s `AuthModule.forRoot({ auth })`
// (mounted in Task 2) needs the fully-configured instance synchronously at
// import time, before Nest's DI container exists. Everything below was
// checked against the better-auth docs/source via context7
// (`/better-auth/better-auth`, matched against v1.6.23 — the closest indexed
// version to the pinned 1.6.25) rather than written from memory; see the
// inline notes for what was verified and what differed from the plan's
// assumptions.
import { isPlaceholderEmail, normalizeEgyptianPhone } from '@ayman/contracts/phone';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
// The NARROW subpath, never the `better-auth/plugins` barrel. Same class of
// hazard as this repo's contracts root barrel: the barrel pulls in every
// plugin's module-evaluation side effects for the one we use.
import { phoneNumber } from 'better-auth/plugins/phone-number';
import { importPKCS8, SignJWT } from 'jose';
import { loadEnv } from '../config/env';
import { PrismaClient } from '../generated/prisma/client';
import { SessionDeviceService } from '../modules/sessions/session-device.service';
import { ARGON2_OPTIONS } from './argon2-options';
import {
  PrismaBannedAccountLookup,
  PrismaCredentialLookup,
  createAuthBeforeHook,
} from './login-security.hook';
import { LoginSecurityService } from './login-security.service';
import { loginThrottle } from './login-throttle.instance';

const env = loadEnv(process.env);
const isProduction = env.NODE_ENV === 'production';

// A second PrismaClient, independent of Nest-managed `PrismaService`, for
// the same reason as above: this file has no DI container to pull one from.
// Same adapter-pg + DATABASE_URL as PrismaService, so this still only ever
// connects as `ayman_runtime` (DML only, never DDL).
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

// ── Argon2id, explicit parameters (Plan 2 Global Constraint #7) ───────────
// Verified via context7: better-auth's own docs
// (docs/content/docs/authentication/email-password.mdx) confirm the
// *default* algorithm is scrypt, not argon2 — "Better Auth uses `scrypt` to
// hash passwords... OWASP recommends `scrypt` if `argon2id` is not
// available." The override point is `emailAndPassword.password.{hash,verify}`
// (packages/core/src/types/init-options.ts), unchanged in shape since at
// least 1.2.9 through the 1.6.x line indexed by context7, so accepting the
// library default was never an option here — it had to be overridden
// explicitly, which is what the plan requires anyway.
//
// The docs' own override example hashes with `@node-rs/argon2`; this repo
// pins the `argon2` (node-argon2) package instead per the plan's tech stack,
// which has a different (Promise-based, no explicit `outputLen`) API —
// verified separately against context7's `/ranisalt/node-argon2` docs rather
// than assumed to match `@node-rs/argon2`'s shape.
//
// `ARGON2_OPTIONS` now lives in `./argon2-options` — shared with
// `./credential-check.service`'s dummy hash (Task 3, S2) so the two can never
// drift to different costs.

// ── Task 3: login hardening (S1-S4, S7) ────────────────────────────────────
// `LoginThrottleService` (email-keyed attempt/lock bookkeeping, S3+S4) and
// `LoginSecurityService` (S1+S2: one Argon2 verify per attempt, against the
// real hash or a precomputed dummy of identical cost) are pure, DB/ESM-free
// classes — see their own files for why. `PrismaCredentialLookup` is the one
// concrete adapter that touches Prisma; `createLoginSecurityHook` is the one
// place that touches `better-auth/api` (`createAuthMiddleware`/`APIError`),
// so this file stays the only import boundary, same as Task 2's guard.
// The ledger itself is NOT constructed here — `./login-throttle.instance`
// owns the one instance, because the admin «تعيين كلمة سر جديدة» path has to
// clear a student's soft lock and cannot import this file to reach it (ESM).
const credentialLookup = new PrismaCredentialLookup(prisma);
const loginSecurityService = new LoginSecurityService(loginThrottle, credentialLookup);
// حظر — read only AFTER a password verifies, so the ban is never an
// account-enumeration oracle. See the block in `createLoginSecurityHook`.
const bannedAccountLookup = new PrismaBannedAccountLookup(prisma);

// ── Task 7: أجهزتي (sessions/devices) ──────────────────────────────────────
// Same pattern as the three services above: constructed directly against
// this file's own raw `PrismaClient`, since there's no Nest container here.
// `SessionsModule` builds a second instance of the same class via Nest DI
// (its own `PrismaService`) for the controller side — see that module's
// comment for why one class can be constructed both ways.
const sessionDeviceService = new SessionDeviceService(prisma);

/**
 * Generates Apple's `client_secret`: a short-lived ES256 JWT signed with the
 * private key from the Apple Developer portal, per
 * docs/content/docs/authentication/apple.mdx. Apple does not accept a static
 * client secret — max validity is 6 months, so this must be regenerated
 * per-request rather than read from an env var. Only called when all four
 * Apple env vars are present (see `socialProviders` below).
 */
async function generateAppleClientSecret(
  clientId: string,
  teamId: string,
  keyId: string,
  privateKey: string,
): Promise<string> {
  const key = await importPKCS8(privateKey, 'ES256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt(now)
    .setExpirationTime(now + 180 * 24 * 60 * 60) // Apple's own 6-month ceiling
    .sign(key);
}

// ── Cookies: httpOnly + Secure + SameSite=Lax + __Host- (S8, amended) ─────
// S8 as written said `SameSite=Strict`; it is `Lax` here, because `Strict`
// silently breaks the Google OAuth return trip. The reasoning, and why S9's
// CSRF defence does not depend on the difference, is on the `sameSite` line
// itself further down rather than duplicated here.
// Verified via context7 against better-auth's cookie factory
// (packages/better-auth/src/cookies/index.ts): Better Auth only automates
// the `__Secure-` prefix (via `advanced.useSecureCookies`) — the source
// comment there says outright that `__Host-` is *not* wired up by the
// session cookie factory, even though the prefix constant exists in the
// codebase. This is a real gap versus the plan's assumption that
// `advanced.cookiePrefix` + attributes alone would produce a `__Host-`
// cookie.
//
// Worked around by disabling the automatic prefix (`useSecureCookies:
// false`, so the library prepends nothing) and setting the session cookie's
// *name* to the literal `__Host-` string ourselves, while still forcing
// `secure: true` on that cookie's attributes directly (attribute overrides
// are applied after the useSecureCookies-derived default, so this doesn't
// depend on the prefix flag). Path is left at Better Auth's default `/` and
// no `domain` attribute is ever set — both are hard requirements of the
// `__Host-` prefix, and setting a domain would silently break it.
//
// `__Host-` requires the `Secure` attribute, which in turn requires a
// "potentially trustworthy" origin. Chrome and Firefox special-case
// `http://localhost` as trustworthy and will accept the cookie; Safari does
// not reliably do the same. Rather than ship a cookie that silently fails
// to be set in one major dev browser, the prefix (and the `secure`
// attribute) is applied in production only — development gets a plain,
// still-httpOnly/SameSite=Lax cookie without a scheme requirement.
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  // Better Auth's own origin check (separate from CORS — none is configured
  // anywhere, see main.ts) rejects any request whose `Origin` header isn't
  // `baseURL` itself by default. The browser always talks to the WEB origin
  // (`APP_URL`, :3200); Next's rewrite forwards the request to this API
  // server-side but preserves the original `Origin` header, so without this
  // the check fails every real browser sign-up/sign-in with "Invalid
  // origin" even though the request never left same-origin from the
  // browser's point of view. `env.ts`'s own comment on `APP_URL` already
  // named this as the intended use ("Better Auth reads this for
  // trusted-origin/cookie config") — this was the missing wiring.
  trustedOrigins: [env.APP_URL],

  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  emailAndPassword: {
    enabled: true,
    password: {
      hash: (password) => argon2.hash(password, ARGON2_OPTIONS),
      verify: ({ hash, password }) => argon2.verify(hash, password),
    },
  },

  // ── Session lifetime ───────────────────────────────────────────────────
  // Better Auth's default is 7 days, which this file previously accepted by
  // saying nothing — so a student away for a week signed in again, every week.
  // 90 days, rolling: `updateAge` extends a session that gets used, so anyone
  // who opens the platform at least once a term signs in exactly once
  // (`2026-08-03-login-gated-content-design.md` §7). `expiresIn` drives both
  // the session row's expiry and the cookie's Max-Age.
  //
  // `updateAge` bounds the refresh to one WRITE per day per session rather
  // than one per request — without it, rolling expiry means a session-table
  // update on every single authenticated request.
  //
  // ⚠️ `session.cookieCache` is deliberately ABSENT, and enabling it is a
  // security regression, not a performance win. It lets the API trust a signed
  // cookie for its TTL without reading the session row — which is exactly what
  // makes `DELETE /api/sessions/:id` stop being immediate. That route is the
  // "أجهزتي" revoke a student uses when they lose a phone; a device they just
  // cut off would keep working for the length of the cache window. One indexed
  // primary-key read per request is not this platform's bottleneck, and trading
  // a live security control for it is not the trade to make. Decided
  // explicitly — see §3.4 of the design.
  session: {
    expiresIn: 60 * 60 * 24 * 90,
    updateAge: 60 * 60 * 24,
  },

  // ── S6 + S7: account linking ───────────────────────────────────────────
  // S6 (accounts keyed on (providerId, accountId), never email) is enforced
  // by Better Auth's own internal-adapter writes (`providerId: 'credential'`
  // / `providerId: 'google'`, `accountId` = the provider's own user id) plus
  // the DB-level `@@unique([providerId, accountId])` constraint on `Account`
  // in `prisma/schema.prisma` — nothing in this file keys anything on email.
  //
  // S7 (never auto-link an OAuth account to an existing local account when
  // the provider reports `email_verified: false`) — verified via context7
  // against the actual source, not the docs prose, because Task 1 flagged
  // `accountLinking.requireLocalEmailVerified` as `@deprecated` in this
  // version:
  //   - `packages/better-auth/src/api/routes/callback.ts` — the OAuth
  //     callback route itself rejects the link outright when
  //     `!isTrustedProvider && !userInfo.emailVerified`, *before* any
  //     `requireLocalEmailVerified` logic runs. `isTrustedProvider` is
  //     `account.accountLinking.trustedProviders.includes(provider.id)`.
  //   - `packages/better-auth/src/oauth2/link-account.ts` — the deeper
  //     implicit-linking gate repeats the identical
  //     `!isTrustedProvider && !userInfo.emailVerified` check as one of
  //     several OR'd conditions that deny the link.
  //   So the primitive that actually closes S7 is `isTrustedProvider`, not
  //   the deprecated flag — deprecation only affects the *separate*,
  //   stricter, already-`true`-by-default check on the *local* user's own
  //   `emailVerified`. `trustedProviders` is set to `[]` explicitly below
  //   (rather than left at its own default, which also happens to be `[]`)
  //   so this stays true even if a future Better Auth version changes that
  //   default — neither `google` nor `apple` is ever exempted from the
  //   provider-reported `email_verified` check.
  //   Not independently verifiable end-to-end without a real Google OAuth
  //   round-trip (same limitation Task 1 recorded for Apple); this is
  //   confirmed by reading the gate's actual source condition via context7,
  //   not by driving a live provider flow.
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: [],
    },
  },

  // `role` drives Task 2's authorization guard (role -> permission map, never
  // role equality checks). `input: false` is load-bearing: it stops
  // sign-up/update-user payloads from ever setting it, so a client POSTing
  // `{ role: 'admin' }` to `/api/auth/sign-up/email` is silently ignored by
  // Better Auth itself, on top of whatever DTO whitelisting Task 4 adds.
  // Without this block, `role` would be a plain unrecognised column that
  // Better Auth strips from the session's `user` object entirely — the guard
  // needs it to come back from `getSession()`.
  user: {
    additionalFields: {
      role: {
        type: ['admin', 'student'],
        required: false,
        defaultValue: 'student',
        input: false,
      },
      /**
       * Re-declares a CORE field, which is unusual — every other entry here
       * adds a new one. It works because `getAuthTables` builds the user table
       * as `{ ...coreFields, ...user?.fields, ...options.user?.additionalFields }`
       * (`@better-auth/core/dist/db/get-tables.mjs`), so this object replaces
       * the built-in `email` definition outright rather than merging into it.
       *
       * That is the ONLY supported way to make the address optional in 1.6.25:
       * the core block hardcodes `required: true`, and `user.fields.email`
       * only renames the column (its value type is `string`, so it cannot
       * carry attributes).
       *
       * Every property below has to be restated, because this is a
       * replacement. Dropping `unique` would silently remove
       * `users_email_key`'s meaning from Better Auth's point of view; dropping
       * `sortable` would break admin sorting. Only `required` actually
       * changes.
       *
       * What this does NOT do is get past `/sign-up/email`'s own
       * `z.email().safeParse(email)` gate, which runs in the route handler
       * before any table definition is consulted and has no config switch.
       * `createAuthBeforeHook` covers that half — see the pair of hooks there
       * and in `databaseHooks.user.create` below.
       */
      email: {
        type: 'string',
        required: false,
        unique: true,
        sortable: true,
      },
    },
  },

  // Registered conditionally so a missing client id never crashes boot —
  // required per the plan since local development happens before the OAuth
  // apps exist. `env.ts`'s `.refine()` pairing already guarantees these are
  // all-or-nothing, so checking the first var of each pair is sufficient.
  socialProviders: {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
    // Scaffolded per the plan, but genuinely untestable locally: Apple
    // rejects http://localhost redirect URIs outright, independent of
    // anything configured here. Do not treat a clean boot with these vars
    // set as proof this flow works end-to-end.
    //
    // The Apple provider config is an async factory (per
    // docs/content/docs/authentication/apple.mdx) rather than a plain
    // object, since the JWT client secret has to be (re)signed rather than
    // read as a static value — a plain object literal can't `await` this
    // file's top-level scope, which compiles to CJS.
    ...(env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY
      ? {
          apple: async () => ({
            clientId: env.APPLE_CLIENT_ID as string,
            clientSecret: await generateAppleClientSecret(
              env.APPLE_CLIENT_ID as string,
              env.APPLE_TEAM_ID as string,
              env.APPLE_KEY_ID as string,
              env.APPLE_PRIVATE_KEY as string,
            ),
          }),
        }
      : {}),
  },

  // ── Phone as the primary sign-up identifier ──────────────────────────────
  //
  // What this plugin is actually here for, and what it is NOT.
  //
  // It contributes two things today: the `phoneNumber` / `phoneNumberVerified`
  // columns on `user` (it declares them on the USER model and offers only a
  // rename, which is why they cannot live on `student_profiles` next to the
  // existing `phone`), and `POST /sign-in/phone-number`.
  //
  // It does NOT create accounts here. The plugin exposes no
  // `/sign-up/phone-number` at all — its only account-creating path is
  // `/phone-number/verify` with `signUpOnVerification`, which is OTP-gated by
  // construction and mints a user with NO credential account, i.e. no
  // password. Registration therefore still goes through `/sign-up/email`,
  // carrying `phoneNumber` as an extra field (Better Auth's `parseUserInput`
  // merges plugin schema fields, and this one does not set `input: false`, so
  // the column is writable at sign-up). `signUpOnVerification` is deliberately
  // absent below to keep that single path.
  //
  // ⚠️ `phoneNumberValidator` is a GATE, not a transform — its return type is
  // `boolean`, and Better Auth keeps whatever string it was handed, then looks
  // accounts up by exact match. Normalisation therefore CANNOT happen here; it
  // happens in `createAuthBeforeHook` before the value ever reaches the
  // plugin. This validator only rejects what normalisation could not fix.
  plugins: [
    phoneNumber({
      phoneNumberValidator: (value) => normalizeEgyptianPhone(value) !== null,

      /**
       * `requireVerification` is deliberately LEFT OFF (defaults false), and
       * turning it on today would lock every existing student out.
       *
       * With it on, `/sign-in/phone-number` refuses any account whose
       * `phoneNumberVerified` is false and fires an OTP instead — and every
       * row backfilled by `20260816180000_user_phone_number` is false, because
       * nobody has ever been sent a code. It becomes safe to enable only once
       * `sendOTP` below can actually deliver one.
       */

      /**
       * Required by the plugin's own types, and intentionally a refusal.
       *
       * There is no way to send a message to a phone from this codebase: no
       * SMS provider, no WhatsApp Business API credentials, no mail either —
       * the API makes exactly one outbound HTTP call in total, and it is a
       * YouTube duration lookup. Wiring the plugin up with a `sendOTP` that
       * quietly resolved would leave five endpoints that appear to work and
       * silently deliver nothing, which is worse than five that say so.
       *
       * So the OTP surface is closed, loudly, and the schema is already in
       * place behind it. When a WhatsApp Business API number is approved,
       * turning the whole flow on — including `/phone-number/reset-password`,
       * which would be this platform's FIRST account-recovery path, since a
       * student who forgets their password currently has none — is this
       * function body plus `requireVerification`, with no migration.
       */
      sendOTP: async () => {
        throw new APIError('NOT_IMPLEMENTED', {
          code: 'OTP_NOT_CONFIGURED',
          message: 'لسه مفيش طريقة نبعت بيها كود التأكيد — رسالة للدعم.',
        });
      },
    }),
  ],

  advanced: {
    useSecureCookies: false, // see comment above: prevents the automatic __Secure- prefix
    // `useSecureCookies: false` above is a NAMING switch, but Better Auth
    // derives every cookie's `secure` ATTRIBUTE from that same flag
    // (`secure: !!secureCookiePrefix` in packages/better-auth/src/cookies/index.ts).
    // Turning the prefix off to hand-roll `__Host-` therefore also silently
    // dropped `Secure` from every OTHER auth cookie — including the signed
    // `state` cookie that carries the OAuth CSRF nonce — leaving them sendable
    // over plaintext on an HTTPS site. `session_token` was unaffected because
    // it sets `secure` explicitly below; nothing else did.
    //
    // `defaultCookieAttributes` is applied AFTER the flag-derived default and
    // BEFORE per-cookie `attributes`, so this restores `Secure` everywhere in
    // production without disturbing the `__Host-` arrangement.
    defaultCookieAttributes: {
      secure: isProduction,
    },
    cookies: {
      session_token: {
        name: isProduction ? '__Host-session_token' : 'session_token',
        attributes: {
          httpOnly: true,
          secure: isProduction,
          // `lax`, NOT `strict` — and this is load-bearing for Google sign-in.
          //
          // Google's callback is a CROSS-SITE redirect into this origin, and a
          // browser withholds `SameSite=Strict` cookies for the whole redirect
          // chain, not just the first hop. With `strict` the flow breaks in a
          // way that only appears once Google is really configured: the session
          // cookie IS set on the callback response, the callback then 302s to
          // `/onboarding`, and the browser declines to send the cookie it just
          // stored — so the app sees an anonymous request and bounces a
          // successfully-authenticated user back to `/login`. Email/password
          // never hit this because it is a same-site `fetch`.
          //
          // This knowingly departs from the plan's S8 ("SameSite=Strict"). It
          // is safe here because S9 does not lean on SameSite: per
          // `modules/security/csrf.guard.ts`'s own docblock, the load-bearing
          // control is the required `x-csrf-token` header — which a cross-site
          // HTML form cannot set and a cross-origin `fetch` cannot get past a
          // CORS preflight this API never answers — backed by `Origin` and
          // `Sec-Fetch-Site` validation. `lax` also still withholds the cookie
          // from every cross-site POST, which is the vector `strict` was
          // actually buying us over `lax`.
          sameSite: 'lax',
          path: '/',
        },
      },
    },
  },

  // S1-S4 (identical responses, timing equalisation, joint email+IP
  // throttle, progressive delay + auto-clearing soft lock) — see
  // `./login-security.hook` for why this is the one hook that owns the
  // entire `/sign-in/email` failure path, short-circuiting before Better
  // Auth's own handler ever runs so no library-specific message reaches the
  // client.
  hooks: {
    before: createAuthBeforeHook(loginSecurityService, bannedAccountLookup),
  },

  // ── Task 7: أجهزتي — populate SessionDevice on every session creation ────
  // `databaseHooks` (not `hooks`, which is a request-lifecycle hook keyed on
  // a path) fires on the DB write itself, so this runs for email/password
  // sign-in AND sign-up (Better Auth creates a session immediately after
  // registering) AND any future OAuth provider, with no per-path wiring.
  // `session` here is the just-created row, which already carries the
  // `ipAddress`/`userAgent` Better Auth captured from the request — see
  // `docs/content/docs/concepts/database.mdx`'s session table schema (verified
  // via context7) for those two fields living on the base table, not as
  // `additionalFields`. Best-effort and non-blocking: a failure recording the
  // device must never fail the sign-in itself.
  databaseHooks: {
    user: {
      create: {
        /**
         * The second half of "the email is optional", and the half that keeps
         * the placeholder OUT OF THE DATABASE.
         *
         * `/sign-up/email` validates its body with `z.email()` in the route
         * handler itself, before any table definition or hook is consulted,
         * and no option turns that off. So a student who gives no address
         * cannot reach the handler at all unless something puts a
         * syntactically valid string in the body —
         * `createAuthBeforeHook` does exactly that, marking it with the
         * reserved `@phone.invalid` domain.
         *
         * This hook is where that marker is stripped, on the row about to be
         * written. The throwaway address therefore exists only between the two
         * hooks, inside a single request: nothing persists it, nothing renders
         * it, and no consumer needs to know it ever existed.
         *
         * Deliberately matched on the DOMAIN rather than a flag threaded
         * through the request. Better Auth gives a `before` hook the row, not
         * the request context, so there is no shared object to put a flag on —
         * and a value on an RFC 2606 reserved TLD cannot be an address a
         * student actually owns, so matching it can never null out real data.
         */
        before: async (user) => {
          const email = (user as { email?: unknown }).email;
          if (typeof email === 'string' && isPlaceholderEmail(email)) {
            /**
             * `as` because Better Auth's own `User` type still declares
             * `email: string` — the library's TYPES were never widened even
             * though `additionalFields` makes the COLUMN optional and
             * `parseUserOutput` (a plain field filter, no zod) passes a null
             * straight through. Verified by reading
             * `@better-auth/core/dist/db/get-tables.mjs` and
             * `better-auth/dist/db/schema.mjs`, and end-to-end against a
             * running server, rather than assumed from the type.
             */
            return { data: { ...user, email: null } as unknown as typeof user };
          }
          return { data: user };
        },
      },
    },
    session: {
      /**
       * حظر — the single choke point that enforces it.
       *
       * `before` on the session WRITE, deliberately, and not a per-path
       * request hook like `createLoginSecurityHook` above. That hook owns
       * `/sign-in/email` and only that path; a ban has to hold for every way
       * a session can come into existence, and there are already three:
       * email/password sign-in, sign-UP (Better Auth mints a session
       * immediately after registering, so a banned student could otherwise
       * re-register their way back in), and Google. Any provider added later
       * is covered here with no new wiring — the same argument the `after`
       * hook below makes for device recording.
       *
       * Returning `false` aborts the write (`db/with-hooks.mjs:17` —
       * `if (result === false) return null`), and `sign-in.mjs:329` turns that
       * null into `APIError.from("UNAUTHORIZED", FAILED_TO_CREATE_SESSION)`.
       * So the fallback is a 401 rather than a 500, which is why this is safe
       * to rely on as the enforcing layer even though its message is generic.
       *
       * That generic message is also the reason this is not the ONLY layer.
       * `createLoginSecurityHook` checks the ban again on `/sign-in/email`,
       * after the password has verified, and throws a `FORBIDDEN` carrying
       * `ACCOUNT_BANNED` plus the reason — so the student who owns the account
       * is told what happened instead of reading "Failed to create session".
       * Checking it only after a correct password is deliberate: announcing a
       * ban to anyone who merely types an address would reopen the
       * account-enumeration oracle S1 exists to close.
       *
       * ⚠️ This is only half of the control and cannot be the whole of it: it
       * runs on CREATION, so it says nothing about the 90-day session a
       * student is already holding when the ban lands. `StudentsService.ban`
       * deletes those rows in the same transaction that sets the flag. Remove
       * either half and a ban stops meaning anything — see the note on
       * `bannedAt` in `schema.prisma`.
       */
      create: {
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { bannedAt: true },
          });
          if (user?.bannedAt) return false;
          return { data: session };
        },
        after: async (session) => {
          try {
            await sessionDeviceService.recordLogin({
              sessionId: session.id,
              userId: session.userId,
              ipAddress: session.ipAddress ?? null,
              userAgent: session.userAgent ?? null,
            });
          } catch (error) {
            console.error('session-device: failed to record login', error);
          }
        },
      },
    },
  },
});
