import { z } from 'zod';

// Both DB URLs are Postgres connections (one runtime, one migration-only with DDL
// rights) — reject anything else (e.g. a stray mysql:// or sqlite: string) before
// Prisma gets a chance to fail with a much less obvious error.
const postgresUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), {
    message: 'must be a postgresql:// connection string',
  });

// Same trap as APP_URL below: WHATWG URL parsing treats an unrecognized
// scheme as opaque, so a bare `.url()` happily accepts `localhost:3300` or
// `ftp://...`. Better Auth uses this as its own baseURL for callback/cookie
// construction, so a scheme typo here must crash at boot too.
const httpUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith('http://') || value.startsWith('https://'), {
    message: 'must be an http:// or https:// URL',
  });

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number({ message: 'must be a number' }).int().min(1).max(65535),
    // WHATWG URL parsing treats an unrecognized scheme as opaque, so a bare
    // `.url()` happily accepts `localhost:3200` (parsed as scheme "localhost")
    // or `ftp://...`. Better Auth reads this for trusted-origin/cookie config in
    // Plan 2, so a scheme typo here must crash at boot, not silently misconfigure
    // auth — require http(s) explicitly.
    APP_URL: httpUrl,
    DATABASE_URL: postgresUrl,
    DIRECT_DATABASE_URL: postgresUrl,
    REDIS_URL: z
      .string()
      .url()
      .refine((value) => value.startsWith('redis://') || value.startsWith('rediss://'), {
        message: 'must be a redis:// connection string',
      }),

    // ── Better Auth ────────────────────────────────────────────────────
    // Signs session tokens and CSRF-related state — Better Auth itself
    // requires at least 32 characters.
    BETTER_AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
    // Better Auth's own baseURL: drives callback URLs and cookie domain
    // inference. Same scheme trap as APP_URL, so the same explicit check.
    BETTER_AUTH_URL: httpUrl,

    // OAuth providers are optional so local development can boot before the
    // provider apps exist in Google/Apple's consoles — but a client id
    // without its matching secret (or vice versa) is a half-configured
    // provider that would fail at request time instead of at boot, so the
    // pairing is enforced below with `.refine()`.
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    APPLE_CLIENT_ID: z.string().min(1).optional(),
    APPLE_TEAM_ID: z.string().min(1).optional(),
    APPLE_KEY_ID: z.string().min(1).optional(),
    APPLE_PRIVATE_KEY: z.string().min(1).optional(),

    /**
     * Origin that serves uploaded media. Deliberately not the app origin —
     * spec §7 P6: a same-origin HTML upload is same-origin XSS regardless of
     * CSP. Plan 6 Task 13 owns the actual upload pipeline; this plan only
     * resolves storage keys already in the database into URLs.
     *
     * In this deployment media is served by THIS SAME NestJS process
     * (`GET /media/:prefix/:name`, excluded from the `/api` prefix) on
     * `API_PORT` — so the default here must point at that port, not a
     * separate one nothing listens on.
     */
    MEDIA_BASE_URL: httpUrl.default('http://localhost:3300/media'),

    /** Where uploaded, re-encoded bytes live on disk (Task 13). */
    MEDIA_ROOT: z.string().min(1).default('./.media'),

    /** Mirrors `MAX_UPLOAD_BYTES` in `@ayman/contracts/admin/media` — kept as
     *  its own env var so an operator can lower it without a code change. */
    MEDIA_MAX_BYTES: z.coerce.number().int().positive().default(8 * 1024 * 1024),
  })
  .refine((data) => !(data.GOOGLE_CLIENT_ID && !data.GOOGLE_CLIENT_SECRET), {
    message: 'GOOGLE_CLIENT_SECRET is required when GOOGLE_CLIENT_ID is set',
    path: ['GOOGLE_CLIENT_SECRET'],
  })
  .refine((data) => !(data.GOOGLE_CLIENT_SECRET && !data.GOOGLE_CLIENT_ID), {
    message: 'GOOGLE_CLIENT_ID is required when GOOGLE_CLIENT_SECRET is set',
    path: ['GOOGLE_CLIENT_ID'],
  })
  .refine(
    (data) => {
      const present = [
        data.APPLE_CLIENT_ID,
        data.APPLE_TEAM_ID,
        data.APPLE_KEY_ID,
        data.APPLE_PRIVATE_KEY,
      ].filter((value) => value !== undefined).length;
      return present === 0 || present === 4;
    },
    {
      message:
        'APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY must all be set together, or all omitted',
      path: ['APPLE_CLIENT_ID'],
    },
  )
  /**
   * A10 / Global Constraint 16, enforced at boot rather than only in a code
   * comment: media MUST be a different origin than the app. A same-origin
   * HTML upload is same-origin XSS regardless of CSP, so a silent same-origin
   * misconfiguration is exactly the failure this exists to catch before the
   * server ever accepts a request.
   *
   * This process cannot see `apps/web`'s `NEXT_PUBLIC_MEDIA_ORIGIN` directly —
   * they are two independently deployed Node processes (this API and the
   * Next.js app), so a literal cross-process equality check would either be
   * fragile (reading the other app's .env file by relative path) or simply
   * wrong once they deploy to different hosts. What IS both checkable from
   * inside this one process and load-bearing is that `MEDIA_BASE_URL` never
   * collapses onto `APP_URL`'s origin — the operator is still responsible for
   * pointing `NEXT_PUBLIC_MEDIA_ORIGIN` (web) at this same `MEDIA_BASE_URL`
   * origin, which `.env.example` documents on both sides.
   */
  .refine((data) => new URL(data.MEDIA_BASE_URL).origin !== new URL(data.APP_URL).origin, {
    message:
      'MEDIA_BASE_URL must be a DIFFERENT origin than APP_URL (spec §7 P6) — ' +
      'a same-origin upload is same-origin XSS regardless of CSP',
    path: ['MEDIA_BASE_URL'],
  });

export type Env = z.infer<typeof schema>;

/**
 * Validates and coerces `process.env` (or any env-shaped record) into a typed
 * `Env`. Every invalid/missing key is reported in a single thrown error —
 * fixing one at a time via repeated crash-restart cycles is not the point.
 */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }

  return result.data;
}
