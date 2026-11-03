import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { passwordResetCopy } from '@ayman/contracts/copy/password-reset';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { PASSWORD_RESET_LIMITS } from '@ayman/contracts/password-reset';
import { tenantName } from '../../common/tenant';

/**
 * The parts of «نسيت كلمة السر» with no I/O in them — the code, its hash and
 * the message that carries it — so each is tested without a database or a
 * phone.
 */

/**
 * Six digits from the CSPRNG. `randomInt` draws uniformly over the range
 * (it rejection-samples internally), so no value is likelier than another —
 * the property `Math.random() * 1e6` and a naive `% 1e6` over random bytes
 * both lack.
 */
export function generateCode(): string {
  const space = 10 ** PASSWORD_RESET_LIMITS.codeLength;
  return String(randomInt(0, space)).padStart(PASSWORD_RESET_LIMITS.codeLength, '0');
}

/**
 * The request's handle: 32 random bytes, base64url (43 characters). Handed to
 * the browser for every accepted request and needed again at confirm, so a
 * code can only be tried by whoever asked for it.
 */
export function generateHandle(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256, hex. Unkeyed on purpose — unlike the code, the handle carries 256
 * bits of its own entropy, so there is nothing for a key to protect, and what
 * is stored is useless without the value only the browser holds.
 */
export function hashHandle(handle: string): string {
  return createHash('sha256').update(handle).digest('hex');
}

/**
 * HMAC-SHA256 over `<row id>:<code>`, keyed with the server secret.
 *
 * Keyed because a million candidates is nothing: an unkeyed hash of a
 * six-digit code is reversed from a database dump in well under a second.
 * Salted with the row id so one code's hash says nothing about the same six
 * digits issued on another row. Hex, 64 characters — the column is CHAR(64).
 */
export function hashCode(secret: string, rowId: string, code: string): string {
  return createHmac('sha256', secret).update(`${rowId}:${code}`).digest('hex');
}

/** Constant-time compare of a typed code against the stored hash. */
export function codeMatches(secret: string, rowId: string, code: string, storedHash: string | null): boolean {
  if (!storedHash || storedHash.length !== 64) return false;
  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(hashCode(secret, rowId, code), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * The WhatsApp message. The platform's name through `tenantName`, read from
 * the copy table — on any other stack that is `TENANT_DISPLAY_NAME`, never his.
 */
export function renderMessage(code: string): string {
  return formatCopy(passwordResetCopy.message, {
    platform: tenantName(copy.site.platformName),
    code,
    minutes: PASSWORD_RESET_LIMITS.codeTtlSeconds / 60,
  });
}
