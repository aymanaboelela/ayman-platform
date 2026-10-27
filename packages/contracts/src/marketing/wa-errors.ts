import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';

/**
 * WhatsApp's refusal code → the Egyptian-Arabic sentence an operator reads.
 *
 * One function, used by the API (onto the campaign recipient row) and by the
 * device page and the test send, so the three never disagree. See
 * `copy.marketing.waErrors` for the sentences and why `463` is the one that
 * matters on a new number.
 */
export function waErrorFor(code: string | null | undefined): string | null {
  if (!code) return null;
  const known = (copy.marketing.waErrors as Record<string, string>)[code];
  return known ?? formatCopy(copy.marketing.waErrorUnknown, { code });
}

/** The close code inside a sidecar `detail` like `closed: 401 (logged out …)`. */
export function closeCodeOf(detail: string | null | undefined): string | null {
  const match = /closed: (\d{3})/u.exec(detail ?? '');
  return match ? match[1]! : null;
}

/** The Arabic explanation for a sidecar close `detail`, if there is one. */
export function closeReasonFor(detail: string | null | undefined): string | null {
  const code = closeCodeOf(detail);
  if (!code) return null;
  return (copy.marketing.closeReasons as Record<string, string>)[code] ?? null;
}
