import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * The Facebook Page token, sealed at rest.
 *
 * A Page token is the ability to post AS the teacher's page. It lives in a
 * database row, which means in every backup on R2 and in every `pg_dump`
 * anyone ever takes for debugging — so the row holds ciphertext, and the key
 * is not in the database at all.
 *
 * ## Why the key is derived from `BETTER_AUTH_SECRET`
 *
 * It is the one secret every stack already has, is required at boot (≥ 32
 * characters, `config/env.ts`), and never sits next to the data. A dedicated
 * env var would be one more required variable for `check-tenant-env.mjs` and
 * the tenant template to drift on (CLAUDE.md §5) for no gain. HKDF with its
 * own `info` string means this key is unrelated to anything else derived from
 * that secret (the HLS keys in `video-key.ts` use a different construction).
 *
 * ⚠️ Rotating `BETTER_AUTH_SECRET` makes the stored token unreadable.
 * `openToken` then answers `null`, the studio reads as «not connected», and
 * the admin pastes the token again — degraded, never crashed.
 */

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * `label` separates one sealed secret from another: the YouTube refresh token
 * (`youtube-refresh-token:v1`) is sealed under a key unrelated to the Page
 * token's, so a ciphertext copied from one column into the other does not
 * open. The default is the Page token's original label, byte for byte.
 */
export function tokenKey(secret: string, label = 'social-page-token:v1'): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'ayman-platform', label, 32));
}

export function sealToken(token: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}.${Buffer.concat([iv, tag, body]).toString('base64url')}`;
}

/** `null` for anything that does not authenticate — wrong key, tampering, a foreign format. */
export function openToken(sealed: string, key: Buffer): string | null {
  const [version, payload] = sealed.split('.', 2);
  if (version !== VERSION || !payload) return null;
  try {
    const raw = Buffer.from(payload, 'base64url');
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** The last four characters — enough to tell two tokens apart on the screen, useless to anyone else. */
export function tokenHint(token: string): string {
  return token.slice(-4);
}
