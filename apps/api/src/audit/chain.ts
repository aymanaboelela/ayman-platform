import { createHash } from 'node:crypto';

/** The chain's anchor. Row 1 hashes against this rather than against null. */
export const GENESIS_HASH = '0'.repeat(64);

/**
 * Stable serialisation. `JSON.stringify` preserves *insertion* order, so two
 * logically identical payloads built in different code paths would otherwise
 * hash differently and every verification would fail for no reason.
 *
 * Arrays keep their order — in an audit payload, order is meaning (the id list
 * of a reorder operation, for example).
 */
export function canonicalise(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  // A bare `Date` has no OWN enumerable properties, so the generic object
  // branch below would serialise it as `{}` — while Prisma's own JSON
  // encoder, writing the same value to a `Json` column, calls
  // `Date.prototype.toJSON()` and stores the ISO string instead. Hash it the
  // same way Prisma is going to store it, or the hash computed at write time
  // silently stops matching what `verifyChain` recomputes from the row later
  // — caught once already, when `PaymentsService.approve` passed a raw
  // `validUntil` Date into `metadata`.
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalise(entryValue)}`);

  return `{${entries.join(',')}}`;
}

/** The fields that participate in the hash. Anything else is not protected. */
export interface AuditPayload {
  occurredAt: string;
  actorUserId: string | null | undefined;
  action: string;
  resourceType: string;
  resourceId: string | null | undefined;
  outcome: string;
  metadata: unknown;
}

/**
 * SHA-256 over `prevHash` followed by the canonical payload. A fast hash is
 * correct here: this is a tamper-evidence chain over non-secret data, not a
 * password. The length-prefix on prevHash removes any concatenation ambiguity.
 */
export function chainHash(prevHash: string, payload: AuditPayload): string {
  return createHash('sha256')
    .update(`${prevHash.length}:${prevHash}`)
    .update(canonicalise(payload))
    .digest('hex');
}
