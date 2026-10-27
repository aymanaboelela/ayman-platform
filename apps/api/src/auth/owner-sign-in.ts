import { importSPKI, jwtVerify } from 'jose';
import { CONTROL_ISSUER } from '@ayman/contracts/admin/entitlements';
import {
  OWNER_SIGN_IN_AUDIENCE,
  OWNER_SIGN_IN_TTL_SECONDS,
  OWNER_SIGN_IN_TYP,
} from '@ayman/contracts/admin/owner-sign-in';

/**
 * The pure half of «لوحته» — `owner-sign-in.plugin.ts` imports
 * `better-auth/api`, which is ESM-only and unreachable from Jest (the reason
 * `phone-identity.ts` gives), so every decision about the token lives here.
 *
 * Same key ring and the same algorithm lock as `verifyEntitlementsDocument`
 * (`common/entitlements.ts`), and for the same reasons: `algorithms: ['EdDSA']`
 * refuses `alg: none` and an HMAC token keyed with the public key, and
 * `subject` refuses a token signed for another instructor.
 *
 * What is added on top is what separates this from an entitlements document
 * (see `@ayman/contracts/admin/owner-sign-in`): the header `typ`, the `aud`,
 * a `jti` to burn, and a lifetime nobody can stretch by signing a long `exp`.
 */

/** Smaller than the entitlements verifier's sixty: this token only lives sixty. */
const CLOCK_TOLERANCE_SECONDS = 30;

export interface OwnerSignInClaims {
  jti: string;
  /** Unix seconds — how long the burnt `jti` has to be remembered. */
  exp: number;
}

export async function verifyOwnerSignInToken(
  token: string,
  options: { keys: Readonly<Record<string, string>>; tenantKey: string; currentDate?: Date },
): Promise<OwnerSignInClaims> {
  // Never on the owner's own stack: there is nothing to sign into from a
  // control plane that IS this stack, and a token for `ayman` would otherwise
  // be a password-less door into the one platform with real money on it.
  if (options.tenantKey === 'ayman') throw new Error('owner sign-in is not accepted on the owner stack');

  const { payload } = await jwtVerify(
    token,
    async (header) => {
      const kid = header.kid;
      if (kid === undefined) throw new Error('owner sign-in token has no kid');
      const pem = options.keys[kid];
      if (pem === undefined) throw new Error(`unknown signing key: ${kid}`);
      return importSPKI(pem, 'EdDSA');
    },
    {
      algorithms: ['EdDSA'],
      typ: OWNER_SIGN_IN_TYP,
      issuer: CONTROL_ISSUER,
      subject: options.tenantKey,
      audience: OWNER_SIGN_IN_AUDIENCE,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      // Requires `iat` and refuses one older than this, whatever `exp` says.
      maxTokenAge: OWNER_SIGN_IN_TTL_SECONDS + CLOCK_TOLERANCE_SECONDS,
      ...(options.currentDate ? { currentDate: options.currentDate } : {}),
    },
  );

  const { jti, exp, iat } = payload;
  if (typeof jti !== 'string' || jti.length < 16 || jti.length > 128) throw new Error('owner sign-in token has no usable jti');
  if (typeof exp !== 'number' || typeof iat !== 'number') throw new Error('owner sign-in token has no exp/iat');
  if (exp - iat > OWNER_SIGN_IN_TTL_SECONDS) throw new Error('owner sign-in token lives longer than allowed');

  return { jti, exp };
}
