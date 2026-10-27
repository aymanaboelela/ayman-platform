/**
 * «لوحته» — the owner opening an instructor's admin without a password.
 *
 * Ayman's stack signs a token with the SAME control-plane key that signs
 * entitlements documents (`apps/web/lib/control-plane.ts`), and the
 * instructor's API verifies it against the public key compiled into its image
 * (`apps/api/src/common/entitlements.ts`). No network call joins the two
 * stacks (CLAUDE.md §2): the browser carries the token across.
 *
 * ## Why a typ AND an audience
 *
 * An entitlements document sits in the instructor's own Dokploy environment,
 * readable by them, signed by the same key, with the same `iss` and `sub`. If
 * the sign-in endpoint accepted any valid signature for its `sub`, that
 * document would be a permanent key to the owner's door — on a stack whose
 * owner is the instructor. Requiring a header `typ` and an `aud` that a
 * document never carries is what makes the two token kinds disjoint; the
 * entitlements side is already disjoint the other way (its schema needs `ver`
 * and `features`).
 */
export const OWNER_SIGN_IN_TYP = 'owner-sign-in+jwt';
export const OWNER_SIGN_IN_AUDIENCE = 'owner-sign-in';

/**
 * Long enough for a click and a redirect on a slow phone, short enough that a
 * token surviving in a proxy log is dead before anyone reads it. The `jti` is
 * burnt on first use as well, so this only bounds an UNUSED token.
 */
export const OWNER_SIGN_IN_TTL_SECONDS = 60;

/** Better Auth mounts plugin endpoints under `basePath` (`/api/auth`). */
export const OWNER_SIGN_IN_PATH = '/api/auth/owner-sign-in';
