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

/**
 * What a student typed into the one «رقم الموبايل أو الإيميل» field, once the
 * platform has worked out which of the two it is.
 *
 * A discriminated pair rather than a bare string because the two are looked up
 * against different columns and normalise by different rules — lowercasing an
 * email is right and lowercasing a phone is meaningless, while an E.164
 * rewrite is essential for one and nonsense for the other. Collapsing them
 * into "the identifier string" is exactly how a phone ends up being matched
 * case-insensitively against a column Better Auth compares byte-for-byte.
 */
export type LoginIdentifier =
  | { kind: 'email'; value: string }
  | { kind: 'phone'; value: string };

/** Looks up the stored credential hash for an already-normalised identifier. */
export interface CredentialLookup {
  findCredential(identifier: LoginIdentifier): Promise<StoredCredential | null>;
}

export interface CredentialCheckResult {
  success: boolean;
  userId?: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Normalises at the boundary, so nothing downstream has to remember to. */
export function emailIdentifier(email: string): LoginIdentifier {
  return { kind: 'email', value: normalizeEmail(email) };
}

/**
 * The value is expected to ALREADY be E.164 — `planPhoneNormalization` rewrote
 * the request body before this point. Trimmed but deliberately not
 * lower-cased: `users.phone_number` is plain text precisely so that Better
 * Auth's byte comparison and this lookup agree, and a case fold here would
 * reintroduce the mismatch that column type exists to prevent.
 */
export function phoneIdentifier(phone: string): LoginIdentifier {
  return { kind: 'phone', value: phone.trim() };
}

/**
 * The FIRST of the two buckets an attempt counts against: the identifier
 * exactly as it was submitted.
 *
 * Namespaced by kind, and deliberately consulted before any database lookup —
 * that ordering is what keeps a locked account from being probed, and it is
 * also what makes this bucket safe to describe out loud (see
 * `LOCKED_LOGIN_ERROR` in `login-security.service.ts`): it exists for an
 * identifier that has no account exactly as it exists for one that does, so
 * "this string is locked" answers no question about who is registered.
 *
 * On its own it left an account reachable two ways with twice the guess budget
 * of an email-only one — lock the phone, walk in through the email. That was
 * documented and accepted here for one reason: refusing account-wide needs a
 * user id, and resolving one before refusing would undo the ordering above.
 * `accountThrottleKey` closes it without touching that ordering.
 */
export function throttleKeyFor(identifier: LoginIdentifier): string {
  return `${identifier.kind}:${identifier.value}`;
}

/**
 * The SECOND bucket: the account, whichever identifier reached it.
 *
 * Six failures against one student now lock that student, not merely the box
 * they were typed into — «واحد يتقفل بالموبايل ويعدّي بالإيميل» is the hole
 * the lock exists to close, and a per-identifier lock never closed it.
 *
 * It is filled and consulted only AFTER `verifyLoginCredential` has done its
 * one lookup and its one Argon2 verify, so it costs no extra round trip and
 * shifts no timing. And unlike the identifier bucket, this one exists ONLY for
 * accounts that are real — which is why `LoginSecurityService` refuses on it
 * silently, with the generic error, unless the submitted password has already
 * verified. Announcing it to anyone else would answer the question the
 * identifier bucket carefully does not: it would say that two different
 * identifiers are the same person.
 *
 * The `user:` prefix cannot collide with `email:`/`phone:` — one ledger, three
 * disjoint namespaces.
 */
export function accountThrottleKey(userId: string): string {
  return `user:${userId}`;
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
 * Looks up `identifier`, then verifies `password` against either the real
 * stored hash (account exists) or `DUMMY_PASSWORD_HASH` (it doesn't) — always
 * exactly one Argon2 verify. Returns `{ success: false }` for every failure
 * case, with no other field, so callers can't accidentally leak which one
 * happened.
 *
 * The identifier arrives already normalised (see `emailIdentifier` /
 * `phoneIdentifier`), so a phone and an email cost the same one lookup and the
 * same one verify — an attacker cannot tell from timing which KIND of
 * identifier was recognised, any more than they can tell whether it existed.
 */
export async function verifyLoginCredential(
  identifier: LoginIdentifier,
  password: string,
  lookup: CredentialLookup,
): Promise<CredentialCheckResult> {
  const credential = await lookup.findCredential(identifier);
  const valid = await verifyPassword(credential, password);
  if (credential && valid) {
    return { success: true, userId: credential.userId };
  }
  return { success: false };
}

/**
 * The verify half of `verifyLoginCredential`, split out so a caller that
 * already holds the credential row does not have to look it up twice.
 *
 * `LoginSecurityService` is that caller, and the reason it needs the row
 * rather than the verdict is `accountThrottleKey`: the account-wide lock has
 * to count failures against an account, and a function that only names the
 * account on SUCCESS can never tell it which one just failed. Doing the
 * lookup there and the verify here keeps that knowledge inside the one class
 * that already decides what a failure is allowed to say — rather than putting
 * a user id on a shared result type, where the next caller would serialise it
 * and undo S1 in a line nobody reviewed.
 *
 * The cost guarantee lives HERE, not at the call site: a null credential
 * still pays exactly one Argon2 verify, against `DUMMY_PASSWORD_HASH`. There
 * is no path through this function that skips it.
 */
export async function verifyPassword(
  credential: StoredCredential | null,
  password: string,
): Promise<boolean> {
  const hashToVerify = credential?.passwordHash ?? DUMMY_PASSWORD_HASH;
  return argon2.verify(hashToVerify, password).catch(() => false);
}
