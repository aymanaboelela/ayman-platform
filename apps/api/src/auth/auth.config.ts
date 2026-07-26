// Better Auth is wired here as a plain module-level singleton rather than a
// Nest provider — `@thallesp/nestjs-better-auth`'s `AuthModule.forRoot({ auth })`
// (mounted in Task 2) needs the fully-configured instance synchronously at
// import time, before Nest's DI container exists. Everything below was
// checked against the better-auth docs/source via context7
// (`/better-auth/better-auth`, matched against v1.6.23 — the closest indexed
// version to the pinned 1.6.25) rather than written from memory; see the
// inline notes for what was verified and what differed from the plan's
// assumptions.
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { importPKCS8, SignJWT } from 'jose';
import { loadEnv } from '../config/env';
import { PrismaClient } from '../generated/prisma/client';

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
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB, in KiB
  timeCost: 2,
  parallelism: 1,
} as const satisfies argon2.HashOptions;

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

// ── Cookies: httpOnly + Secure + SameSite=Strict + __Host- (S8) ───────────
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
// still-httpOnly/SameSite=Strict cookie without a scheme requirement.
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',

  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  emailAndPassword: {
    enabled: true,
    password: {
      hash: (password) => argon2.hash(password, ARGON2_OPTIONS),
      verify: ({ hash, password }) => argon2.verify(hash, password),
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

  advanced: {
    useSecureCookies: false, // see comment above: prevents the automatic __Secure- prefix
    cookies: {
      session_token: {
        name: isProduction ? '__Host-session_token' : 'session_token',
        attributes: {
          httpOnly: true,
          secure: isProduction,
          sameSite: 'strict',
          path: '/',
        },
      },
    },
  },
});
