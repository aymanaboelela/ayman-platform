import { describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts/copy';
import { duplicateOrderFrom, whereIs } from './duplicate-order';

const c = copy.bookOrder;

describe('duplicateOrderFrom', () => {
  it('reads the status and the reference the 409 carries', () => {
    expect(
      duplicateOrderFrom({ code: 'DUPLICATE_RECENT_BOOK_ORDER', status: 'printing', ref: 'ك-A3F92C' }),
    ).toEqual({ status: 'printing', ref: 'ك-A3F92C' });
  });

  /**
   * ⚠️ The body is `unknown` — it came off the wire and is about to be printed
   * to a student. An older API, a proxy's HTML error page or a body that would
   * not parse all arrive here, and every one of them has to fall back to the
   * question on its own rather than to a line that says nothing.
   */
  it('is null for anything that is not an object with a status', () => {
    for (const payload of [undefined, null, 'DUPLICATE_RECENT_BOOK_ORDER', 42, [], {}, { ref: 'ك-A3F92C' }]) {
      expect(duplicateOrderFrom(payload)).toBeNull();
    }
  });

  it('keeps the status when the reference is missing rather than dropping both', () => {
    expect(duplicateOrderFrom({ status: 'shipped' })).toEqual({ status: 'shipped', ref: null });
    expect(duplicateOrderFrom({ status: 'shipped', ref: 7 })).toEqual({ status: 'shipped', ref: null });
  });
});

describe('whereIs', () => {
  /** «لو راح للطباعة تقوله راح للطباعة، والشحن وكده». */
  it('names the station the old order is standing at', () => {
    expect(whereIs('paid')).toBe(c.duplicateWherePaid);
    expect(whereIs('printing')).toBe(c.duplicateWherePrinting);
    expect(whereIs('shipped')).toBe(c.duplicateWhereShipped);
    expect(whereIs('delivered')).toBe(c.duplicateWhereDelivered);
  });

  /**
   * A status with no station — and a status this build has never heard of,
   * which is what a deploy in progress looks like from an older tab.
   */
  it('falls back to a sentence that promises nothing', () => {
    expect(whereIs('rejected')).toBe(c.duplicateWhereOther);
    expect(whereIs('something_new')).toBe(c.duplicateWhereOther);
  });
});
