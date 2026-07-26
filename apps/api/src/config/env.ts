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

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number({ message: 'must be a number' }).int().min(1).max(65535),
  // WHATWG URL parsing treats an unrecognized scheme as opaque, so a bare
  // `.url()` happily accepts `localhost:3200` (parsed as scheme "localhost")
  // or `ftp://...`. Better Auth reads this for trusted-origin/cookie config in
  // Plan 2, so a scheme typo here must crash at boot, not silently misconfigure
  // auth — require http(s) explicitly.
  APP_URL: z
    .string()
    .url()
    .refine((value) => value.startsWith('http://') || value.startsWith('https://'), {
      message: 'must be an http:// or https:// URL',
    }),
  DATABASE_URL: postgresUrl,
  DIRECT_DATABASE_URL: postgresUrl,
  REDIS_URL: z
    .string()
    .url()
    .refine((value) => value.startsWith('redis://') || value.startsWith('rediss://'), {
      message: 'must be a redis:// connection string',
    }),
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
