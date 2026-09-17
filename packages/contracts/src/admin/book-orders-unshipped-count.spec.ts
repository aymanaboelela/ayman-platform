import { describe, expect, it } from 'vitest';
import { parseAdminBookOrdersUnshippedCount } from './book-orders-unshipped-count';

/**
 * The badge's whole contract with the list endpoint. It is a hand-written
 * reader rather than a Zod parse (see the module header for why), so the
 * validation it does is code somebody has to keep honest — hence this.
 */
describe('parseAdminBookOrdersUnshippedCount', () => {
  it('reads rowCount off the list response and ignores everything else', () => {
    expect(parseAdminBookOrdersUnshippedCount({ rowCount: 3, rows: [], page: 1 })).toBe(3);
  });

  it('accepts zero — an empty desk is a real answer, not a missing one', () => {
    expect(parseAdminBookOrdersUnshippedCount({ rowCount: 0 })).toBe(0);
  });

  it.each([
    ['null', null],
    ['a string body', 'nope'],
    ['a missing rowCount', {}],
    ['a string rowCount', { rowCount: '3' }],
    ['a fractional rowCount', { rowCount: 1.5 }],
    ['a negative rowCount', { rowCount: -1 }],
  ])('throws on %s', (_label, value) => {
    // Every one of these would otherwise reach the sidebar and render as a
    // badge — `NaN`, «3», or a minus sign — instead of being swallowed by the
    // poll's `.catch` and retried on the next tick.
    expect(() => parseAdminBookOrdersUnshippedCount(value)).toThrow(TypeError);
  });
});
