import * as argon2 from 'argon2';

/**
 * Argon2id parameters, shared by every path that hashes or verifies a
 * password (Plan 2 Global Constraint #7: m=19456 KiB / 19 MiB, t=2, p=1 —
 * not bcrypt, not the library default). Extracted into its own file so
 * `./auth.config.ts` (real hashing, via Better Auth's
 * `emailAndPassword.password.{hash,verify}`) and `./credential-check.service`
 * (the S2 dummy-hash timing control) can never drift apart — a dummy hash
 * hashed at different cost has a different timing profile and defeats S2.
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB, in KiB
  timeCost: 2,
  parallelism: 1,
} as const satisfies argon2.HashOptions;
