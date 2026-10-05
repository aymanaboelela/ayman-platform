import { copy } from '@ayman/contracts/copy';

const c = copy.bookOrder;

/**
 * «إنت طلبت الكتاب ده قبل كده» — reading the 409 that asks it.
 *
 * Pure, and in its own file for the reason every other `line-stream`-shaped
 * module here is: it narrows an `unknown` body that came off the wire and picks
 * a sentence a student reads, and both are worth a test that does not have to
 * mount a checkout to run.
 */
/** What the 409 tells us about the order already on this phone. */
export type DuplicateTwin = { status: string; ref: string | null };

/**
 * Narrow the 409's body, or null.
 *
 * ⚠️ `payload` is `unknown` and stays that way until every field is checked —
 * it is whatever the API sent, and this renders it to a student.
 */
export function duplicateOrderFrom(payload: unknown): DuplicateTwin | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const body = payload as { status?: unknown; ref?: unknown };
  if (typeof body.status !== 'string') return null;
  return { status: body.status, ref: typeof body.ref === 'string' ? body.ref : null };
}

/**
 * Where that order is, in the SAME words «كتبي» uses for the same state.
 *
 * A student reads both on the same day, and two different sentences for one
 * status read as two different orders.
 */
export function whereIs(status: string): string {
  switch (status) {
    case 'paid':
      return c.duplicateWherePaid;
    case 'printing':
      return c.duplicateWherePrinting;
    case 'shipped':
      return c.duplicateWhereShipped;
    case 'delivered':
      return c.duplicateWhereDelivered;
    default:
      return c.duplicateWhereOther;
  }
}
