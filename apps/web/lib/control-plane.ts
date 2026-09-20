import { createPrivateKey, sign } from 'node:crypto';
import {
  CONTROL_ISSUER,
  ENTITLEMENTS_VERSION,
  FEATURE_DECLARATIONS,
  type FeatureKey,
} from '@ayman/contracts/admin/entitlements';

/**
 * The signing half of the control plane — Ayman's stack, and nowhere else.
 *
 * ## Why this is in the web and not the API
 *
 * The API's `common/entitlements.ts` is the VERIFIER, and it ships to every
 * instructor's stack: it holds public keys and nothing else, on purpose. This
 * module holds the opposite half, and it has exactly one caller —
 * `app/(admin)/admin/platforms/actions.ts`, a `'use server'` action on a
 * screen that only renders when `IS_AYMAN`. Putting the signer behind a new
 * API route would have meant a `control:sign` permission, and every instructor
 * is `role: 'admin'` = `'*'` on their own stack, so that permission would have
 * been held by the very people it was invented to exclude.
 *
 * ⚠️ `node:crypto` at the top of the file is load-bearing as a guard: a client
 * component that imported anything from here would fail the build rather than
 * ship a module that reads a private key. Keep it that way — do not move the
 * tenant-list parsing below into a file a `'use client'` module could reach.
 *
 * ## Why `node:crypto` and not `jose`
 *
 * `jose` is an `apps/api` dependency and is not one of `apps/web`'s. A compact
 * JWS is `b64url(header).b64url(payload).b64url(signature)`, and for EdDSA the
 * signature is the raw 64-byte Ed25519 one that `crypto.sign(null, …)` already
 * returns — so the whole thing is ten lines and no new package. Verified
 * round-trip against the API's `jwtVerify(… { algorithms: ['EdDSA'] })` before
 * this landed; a `jose` import here would also have meant ESM in a Next server
 * action for no gain.
 */

/**
 * Which key in the API's `CONTROL_PUBLIC_KEYS` ring signed this document.
 *
 * A constant rather than an environment variable, because it CANNOT drift
 * independently: the matching public key is compiled into the API image
 * (`apps/api/src/common/entitlements.ts`), so rotating the pair is a PR that
 * adds the new public key beside the old one and changes this line in the same
 * commit. An env var here would let Ayman paste a new private key into Dokploy
 * and sign documents no stack can verify — a rotation that looks like it
 * worked until every instructor quietly falls back to the defaults.
 */
export const CONTROL_KEY_ID = 'cp-2026-01';

/** Same rule `scripts/check-tenant-env.mjs` enforces on `TENANT_KEY` — the
 *  document's `sub` has to equal that value literally or the stack rejects
 *  it, so a slug this screen accepts and that file rejects would be a token
 *  that verifies nowhere. */
const TENANT_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}$/;

export interface ControlPlaneTenant {
  /** The instructor's `TENANT_KEY`, and the document's `sub`. */
  key: string;
  /** What to call them on screen. Never read by any stack. */
  name: string;
}

/**
 * The instructors this stack knows about, from `CONTROL_PLANE_TENANTS`.
 *
 * ## Configuration, not a query
 *
 * There is no register of instructors anywhere — `deploy/tenants/` is
 * gitignored and the runbook says to delete the env file once the stack is up.
 * Asking each stack who it is would also be the one thing this whole design
 * exists to avoid (CLAUDE.md §٢: no network call joins two stacks), and it
 * would make signing a document depend on the stack being up.
 *
 * ## The format is `key=name` per line, not JSON
 *
 * It is typed into a textarea in a Dokploy panel. JSON there means balancing
 * braces and quotes around Arabic names in a single-line env value, and one
 * missed quote is an empty list with no error — so a line-oriented format that
 * degrades one entry at a time is the safer shape. Commas work as separators
 * too, for the same reason.
 *
 * A malformed entry is SKIPPED rather than thrown: this list renders a picker
 * on a screen whose whole job is to fix configuration, and a screen that
 * refuses to load because one line is wrong cannot be used to correct it.
 */
export function controlPlaneTenants(): ControlPlaneTenant[] {
  const raw = (process.env.CONTROL_PLANE_TENANTS ?? '').trim();
  if (raw === '') return [];

  const seen = new Set<string>();
  const out: ControlPlaneTenant[] = [];

  for (const line of raw.split(/[\n,]/)) {
    const entry = line.trim();
    if (entry === '' || entry.startsWith('#')) continue;

    // `indexOf`, not `split('=')`: a display name is free text and may well
    // contain an `=`, and only the FIRST one separates the two halves.
    const at = entry.indexOf('=');
    if (at <= 0) continue;

    const key = entry.slice(0, at).trim();
    const name = entry.slice(at + 1).trim();
    if (!TENANT_KEY_PATTERN.test(key) || name === '' || seen.has(key)) continue;

    seen.add(key);
    out.push({ key, name });
  }

  return out;
}

/** base64url, the JWS alphabet — no padding, `-`/`_` for `+`/`/`. */
function b64url(input: string | Buffer): string {
  return Buffer.from(input as never).toString('base64url');
}

export interface SignedDocument {
  token: string;
  /** Unix seconds, so the caller can print the date without re-parsing the
   *  token it was just handed. */
  expiresAt: number;
}

/**
 * Signs one entitlements document for one instructor.
 *
 * `features` is built from `FEATURE_DECLARATIONS`, never from the caller's
 * keys: every declared key gets an explicit boolean and an undeclared one is
 * dropped. The verifier filters again on its own side, so this is belt and
 * braces — but it also means the token reads as a complete statement of the
 * nine rather than a diff somebody has to reconstruct.
 *
 * `nbf` is the issuing instant, not a moment in the future. The verifier
 * allows sixty seconds of clock skew in both directions, which is what makes a
 * token usable immediately on a stack whose clock is a few seconds behind.
 *
 * Throws when `CONTROL_PLANE_PRIVATE_KEY` is missing or is not an Ed25519 key.
 * The caller turns that into a sentence on screen — this is the owner's own
 * stack and the fix is one field in his own panel.
 */
export function signEntitlementsDocument(options: {
  tenantKey: string;
  enabled: ReadonlySet<string>;
  days: number;
}): SignedDocument {
  const pem = (process.env.CONTROL_PLANE_PRIVATE_KEY ?? '').trim();
  if (pem === '') throw new Error('CONTROL_PLANE_PRIVATE_KEY is not set');

  // A PEM pasted into a panel arrives with literal `\n` as often as with real
  // newlines, and `createPrivateKey` rejects the first without saying why.
  const key = createPrivateKey(pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem);
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error(`CONTROL_PLANE_PRIVATE_KEY is ${key.asymmetricKeyType ?? 'unknown'}, not ed25519`);
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + Math.round(options.days * 24 * 60 * 60);

  const features: Record<FeatureKey, boolean> = {} as Record<FeatureKey, boolean>;
  for (const declaration of FEATURE_DECLARATIONS) {
    features[declaration.key] = options.enabled.has(declaration.key);
  }

  const header = { alg: 'EdDSA', kid: CONTROL_KEY_ID };
  const payload = {
    iss: CONTROL_ISSUER,
    sub: options.tenantKey,
    ver: ENTITLEMENTS_VERSION,
    iat: now,
    nbf: now,
    exp: expiresAt,
    features,
  };

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  // `null` as the digest: Ed25519 hashes internally and Node rejects any
  // explicit algorithm here.
  const signature = sign(null, Buffer.from(signingInput, 'utf8'), key);

  return { token: `${signingInput}.${b64url(signature)}`, expiresAt };
}
