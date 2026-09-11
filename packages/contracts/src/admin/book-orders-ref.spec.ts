import { describe, expect, it } from 'vitest';
import { bookOrderRef } from './book-orders';

/**
 * The reference goes on a box and gets read back down a phone, so the two
 * properties that matter are that it is stable and that it is unambiguous.
 */
describe('bookOrderRef', () => {
  it('is pure ASCII — the Arabic prefix was reordered by bidi on the card', () => {
    const ref = bookOrderRef('01a090f8-0136-7632-8d7b-a47520eb90ea');

    // The first version was `ك-${hex}`, and the label printed «721-كD9A» for
    // `ك-D9A721`: one RTL letter glued to an LTR run is genuinely
    // bidirectional text, and no amount of `dir` or `unicode-bidi` fixes the
    // ORDER of a string that really does run both ways. This assertion is the
    // whole reason the prefix is what it is.
    expect(ref).toMatch(/^[\x20-\x7E]+$/);
    expect(ref).toBe('BK-EB90EA');
  });

  it('takes the LAST six hex characters, not the first', () => {
    // uuid7 opens with the creation millisecond, so two orders placed in the
    // same second share their leading characters — precisely the two parcels
    // most likely to be packed back to back and confused with each other.
    const a = bookOrderRef('01a090f8-0136-7632-8d7b-a47520eb0001');
    const b = bookOrderRef('01a090f8-0136-7632-8d7b-a47520eb0002');

    expect(a).not.toBe(b);
  });

  it('is stable across reprints', () => {
    const id = '01a090f8-0136-7632-8d7b-a47520eb90ea';

    expect(bookOrderRef(id)).toBe(bookOrderRef(id));
  });
});
