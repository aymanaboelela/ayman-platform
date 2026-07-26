import * as argon2 from 'argon2';

/**
 * S1 + S2: given an email and a password, decide whether they're a valid
 * login — always paying the cost of exactly one Argon2 verify, whether or
 * not the account exists. This is what makes the "unknown email" and "wrong
 * password" failure paths indistinguishable both in *outcome shape*
 * (`{ success: false }`, nothing else) and in *timing* (one Argon2id verify
 * at the production cost, either way).
 *
 * Deliberately has zero `better-auth` import — see `./login-security.hook`
 * for why that boundary matters (Jest can't load an ESM-only package). This
 * file only needs `argon2`, which is a native CJS-compatible dependency
 * Jest already loads fine elsewhere in this codebase (`./auth.config.ts`).
 */

export interface StoredCredential {
  userId: string;
  passwordHash: string;
}

/** Looks up the stored credential hash for an already-normalised email. */
export interface CredentialLookup {
  findCredential(normalizedEmail: string): Promise<StoredCredential | null>;
}

export interface CredentialCheckResult {
  success: boolean;
  userId?: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * A real Argon2id hash — same m/t/p as production (see `./argon2-options`)
 * — of a fixed random value nothing will ever legitimately submit as a
 * password. Precomputed once, offline, rather than hashed at request time:
 * hashing it fresh on every "unknown email" request would work functionally,
 * but computing it once means one less variable in the timing comparison,
 * and there's no reason to pay that cost repeatedly for a constant.
 *
 * Regenerated with:
 *   node -e "const a=require('argon2');a.hash(require('crypto').randomBytes(32).toString('hex'),
 *   {type:a.argon2id,memoryCost:19456,timeCost:2,parallelism:1}).then(console.log)"
 * (mirrors `./argon2-options`'s `ARGON2_OPTIONS` — must always match those
 * parameters exactly, or the timing profile it's meant to imitate drifts).
 */
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$duQc/ZOcuPmNa1K0zkB72A$qXWijwylet7jYFE11+SSkBaV7uyjOMhv2P7ig2EAth0';

/**
 * Runs the same Argon2 verify cost as a real credential check, against the
 * dummy hash, discarding the result. Used for paths (locked account) that
 * must not touch the database or reveal anything, but still must not be
 * measurably faster than a real failed login attempt.
 */
export async function simulateCredentialCheck(password: string): Promise<void> {
  await argon2.verify(DUMMY_PASSWORD_HASH, password).catch(() => false);
}

/**
 * Looks up `email`, then verifies `password` against either the real stored
 * hash (account exists) or `DUMMY_PASSWORD_HASH` (it doesn't) — always
 * exactly one Argon2 verify. Returns `{ success: false }` for every failure
 * case, with no other field, so callers can't accidentally leak which one
 * happened.
 */
export async function verifyLoginCredential(
  email: string,
  password: string,
  lookup: CredentialLookup,
): Promise<CredentialCheckResult> {
  const credential = await lookup.findCredential(normalizeEmail(email));
  const hashToVerify = credential?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const valid = await argon2.verify(hashToVerify, password).catch(() => false);
  if (credential && valid) {
    return { success: true, userId: credential.userId };
  }
  return { success: false };
}
