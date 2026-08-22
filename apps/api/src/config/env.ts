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

// An optional credential that treats an empty string exactly like an unset
// variable. Deployment tooling (compose's `${VAR:-}` substitution, Dokploy's
// env editor, a `.env` line left as `VAR=""`) supplies "not configured" as an
// empty string far more often than by omitting the key, and there is no
// meaningful difference between the two for a credential. Without this,
// leaving an optional provider blank crashes the entire API at boot.
const optionalSecret = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

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
    //
    // `optionalSecret`, not a bare `.optional()`: these arrive through
    // `docker-compose.yml`'s `${GOOGLE_CLIENT_ID:-}` substitution, which sets
    // the variable to the EMPTY STRING rather than leaving it unset whenever
    // the operator hasn't filled it in yet. A bare `.min(1).optional()` reads
    // that as "present but invalid" and refuses to boot the whole API over an
    // optional provider — so an empty value is normalised to "absent" first.
    GOOGLE_CLIENT_ID: optionalSecret,
    GOOGLE_CLIENT_SECRET: optionalSecret,
    APPLE_CLIENT_ID: optionalSecret,
    APPLE_TEAM_ID: optionalSecret,
    APPLE_KEY_ID: optionalSecret,
    APPLE_PRIVATE_KEY: optionalSecret,

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

    /* ── المساعد's open chat — `POST /api/assistant/ask` ────────────────
     *
     * ⚠️ ALL THREE ARE OPTIONAL, and the product has to be whole with none of
     * them. Unset — which is the case locally, in CI, and on a fresh
     * deployment — the route still answers, out of the same written paragraphs
     * the guided tree shows; see `AssistantAiService`. A boot that refused to
     * start over a missing support-chat key would take the whole platform down
     * for a widget.
     *
     * `optionalSecret` rather than a bare `.optional()` for the reason the
     * OAuth pair below records: `docker-compose.yml` substitutes an unfilled
     * variable as the EMPTY STRING, and "present but invalid" is the one
     * reading that must not crash the API.
     *
     * Deliberately NOT `.refine()`d into "exactly one of these": two keys is a
     * legitimate state (a migration in progress), and the service resolves it
     * by preferring the free one rather than by refusing to boot.
     */

    /**
     * The free one, and the default. A key from AI Studio — no card, no
     * subscription. Wins over `ANTHROPIC_API_KEY` when both are set.
     */
    GEMINI_API_KEY: optionalSecret,

    /**
     * Which Gemini models answer, in order, comma-separated.
     *
     * ⚠️ A LIST, not one name, and the reason is a measurement: the free daily
     * quota is per project **per model** — Google's own quota id is
     * `GenerateRequestsPerDayPerProjectPerModel`. So a model that has run out
     * for the day says nothing about the next one, and walking down a short
     * list turns one key into several daily allowances at no extra setup cost.
     * See `GeminiProvider`, which only ever moves on from a response that
     * failed before a single byte reached the student.
     *
     * Its own variable because free-tier availability is Google's decision and
     * changes without warning: a model that is free today and gated tomorrow
     * must be swappable by editing `.env` and restarting, not by editing this
     * repo and waiting for a build. `assistant-chat.md` lists the current
     * alternatives.
     *
     * The default puts the best Arabic first and the cheapest last, which is
     * also roughly smallest-quota first — so an ordinary day is answered by the
     * best model available and a heavy one degrades in quality rather than
     * stopping.
     */
    GEMINI_MODEL: z
      .string()
      .min(1)
      .default('gemini-2.5-flash,gemini-2.5-flash-lite,gemini-3.5-flash-lite'),

    /**
     * The VOLUME one. 14,400 requests a day on the free tier, no card.
     *
     * Set it ALONGSIDE `GEMINI_API_KEY` rather than instead of it: the two are
     * chained, so Gemini spends its twenty better-worded answers first and this
     * carries the rest of the day. See `ChainProvider`.
     */
    GROQ_API_KEY: optionalSecret,

    /**
     * Which Groq models answer, in order, comma-separated — same shape and
     * same reason as `GEMINI_MODEL`.
     *
     * ⚠️ These two were CHOSEN BY TESTING THE PROMPT, not from a leaderboard,
     * and two obvious-looking candidates were rejected for concrete reasons:
     *
     *   `qwen/qwen3.6-27b`  — writes its chain of thought into `content`. The
     *                          student would have received «1. Identify Core
     *                          Concept… 4. Check Constraints» above the answer.
     *   `allam-2-7b`        — an Arabic-native model, and returned an empty
     *                          completion on this prompt.
     *
     * `gpt-oss` keeps reasoning in a SEPARATE `delta.reasoning` field that the
     * provider never reads, so nothing leaks — verified against the live
     * streaming endpoint, not assumed.
     */
    GROQ_MODEL: z.string().min(1).default('openai/gpt-oss-120b,openai/gpt-oss-20b'),

    /** The paid upgrade. One variable, no code change — see the runbook. */
    ANTHROPIC_API_KEY: optionalSecret,
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
