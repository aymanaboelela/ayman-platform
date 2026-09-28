/**
 * One key per money-moving form, minted ONCE when the form appears.
 *
 * The wallet's ledger has a UNIQUE on it (`wallet_transactions.idempotency_key`),
 * so a double press, a retry after a dropped response, or the same form open
 * in two tabs all name the same movement — and the server answers every one
 * after the first with the row that won, instead of charging again.
 *
 * `crypto.randomUUID` needs a secure context. Every real page here is HTTPS or
 * localhost, but an old WebView can still lack the method, so the fallback
 * builds the same RFC 4122 v4 shape from `getRandomValues` — the API only
 * checks that it IS a uuid.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
