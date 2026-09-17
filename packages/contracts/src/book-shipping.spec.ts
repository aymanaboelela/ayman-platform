import { describe, expect, it } from 'vitest';
import {
  BOOK_SHIPPING_CENTS,
  DEFAULT_BOOK_SHIPPING_RATES,
  bookOrderTotals,
  bookShippingCentsFor,
  bookShippingZoneOf,
  minBookShippingCents,
} from '@ayman/contracts/books';

/**
 * الشحن على حسب المحافظة — «قاهرة وجيزة ٨٠، وجه بحري ١٠٠، صعيد وسينا وبحر أحمر
 * ١٥٠».
 *
 * This file exists because the mapping is the part that moves money and the
 * part nothing else can catch. A governorate filed in the wrong zone under-bills
 * or over-bills every parcel to it, silently, for as long as nobody adds up a
 * month by hand — there is no error, no log line and no screen that disagrees.
 */
describe('bookShippingZoneOf', () => {
  it('puts القاهرة and الجيزة in the near zone, and nothing else', () => {
    expect(bookShippingZoneOf('01')).toBe('cairo_giza');
    expect(bookShippingZoneOf('21')).toBe('cairo_giza');
  });

  /**
   * ⚠️ THE regression this whole file is written for.
   *
   * `governorates.region` files الجيزة under `upper` and الإسكندرية under
   * `urban` — Egypt's official classification, and useless for a courier. A
   * zone test written on `region` would have quoted الجيزة the 150 EGP rate
   * (it is half of Cairo and the cheapest address the courier has) and put
   * الإسكندرية in a tier with القاهرة. Both are wrong on the rows that occur
   * most, and `deliveryDaysFor` documents the same trap for the same reason.
   */
  it('does NOT follow `governorates.region`: الجيزة is near, الإسكندرية is not', () => {
    expect(bookShippingZoneOf('21')).toBe('cairo_giza'); // region: upper
    expect(bookShippingZoneOf('02')).toBe('delta'); // region: urban
  });

  it('puts the Delta, the canal cities and الإسكندرية in the middle zone', () => {
    for (const code of ['02', '03', '04', '11', '12', '13', '14', '15', '16', '17', '18', '19']) {
      expect(bookShippingZoneOf(code), code).toBe('delta');
    }
  });

  it('puts الصعيد, سيناء, البحر الأحمر, مطروح and الوادي الجديد in the far zone', () => {
    for (const code of ['22', '23', '24', '25', '26', '27', '28', '29', '31', '32', '33', '34', '35']) {
      expect(bookShippingZoneOf(code), code).toBe('far');
    }
  });

  /**
   * An unknown code charges the MOST, and it is unreachable in practice —
   * `book_orders.governorate_code` is NOT NULL behind a foreign key. A default
   * that under-charges is a default that quietly eats the difference on exactly
   * the deliveries that cost the most, and a governorate added to the taxonomy
   * later must not silently join القاهرة.
   */
  it('falls back to the far zone for anything it does not recognise', () => {
    expect(bookShippingZoneOf('99')).toBe('far');
    expect(bookShippingZoneOf('')).toBe('far');
    expect(bookShippingZoneOf(null)).toBe('far');
    expect(bookShippingZoneOf(undefined)).toBe('far');
  });
});

describe('bookShippingCentsFor', () => {
  it('quotes the three numbers he stated', () => {
    const rates = DEFAULT_BOOK_SHIPPING_RATES;
    expect(bookShippingCentsFor('01', rates)).toBe(8_000);
    expect(bookShippingCentsFor('12', rates)).toBe(10_000);
    expect(bookShippingCentsFor('28', rates)).toBe(15_000);
  });

  it('reads the rates it is given, so raising one is a setting and not a deploy', () => {
    const raised = { cairo_giza: 9_000, delta: 12_000, far: 18_000 };
    expect(bookShippingCentsFor('01', raised)).toBe(9_000);
    expect(bookShippingCentsFor('34', raised)).toBe(18_000);
  });
});

describe('minBookShippingCents', () => {
  it('is the floor a page may quote before it knows an address', () => {
    expect(minBookShippingCents(DEFAULT_BOOK_SHIPPING_RATES)).toBe(8_000);
  });

  /* Derived, never a fourth stored number — so a shop that prices the Delta
     below Cairo still quotes the truth rather than a hard-coded zone. */
  it('does not assume the near zone is the cheapest', () => {
    expect(minBookShippingCents({ cairo_giza: 9_000, delta: 5_000, far: 15_000 })).toBe(5_000);
  });
});

/**
 * «لو حد طلب أكتر من كتاب هيبقى نفس الشحن، متزودش شحن.»
 *
 * The rule that survived the change, and the one most likely to be broken by
 * it: making the fee depend on the address changes WHICH number is added, never
 * how many times.
 */
describe('bookOrderTotals with a zoned fee', () => {
  const book = { unitPriceCents: 15_000, quantity: 1 };

  it('charges delivery ONCE for one book', () => {
    const totals = bookOrderTotals([book], bookShippingCentsFor('01', DEFAULT_BOOK_SHIPPING_RATES));
    expect(totals.shippingCents).toBe(8_000);
    expect(totals.totalCents).toBe(23_000);
  });

  it('charges the SAME delivery for three books and for three copies', () => {
    const fee = bookShippingCentsFor('28', DEFAULT_BOOK_SHIPPING_RATES);
    const threeTitles = bookOrderTotals([book, book, book], fee);
    const threeCopies = bookOrderTotals([{ unitPriceCents: 15_000, quantity: 3 }], fee);

    expect(threeTitles.shippingCents).toBe(15_000);
    expect(threeCopies.shippingCents).toBe(15_000);
    expect(threeTitles.totalCents).toBe(threeCopies.totalCents);
    expect(threeTitles.totalCents).toBe(45_000 + 15_000);
  });

  /* An empty cart is 0 and not the zone fee — quoting delivery for nothing is
     how a cart that failed to load starts asking for money. */
  it('charges nothing to deliver nothing', () => {
    expect(bookOrderTotals([], 15_000).shippingCents).toBe(0);
  });
});

/** The legacy flat fee is parsed and ignored; nothing new may read it. */
describe('BOOK_SHIPPING_CENTS', () => {
  it('is no longer any zone’s price', () => {
    const rates = DEFAULT_BOOK_SHIPPING_RATES;
    expect(Object.values(rates)).not.toContain(BOOK_SHIPPING_CENTS);
  });
});
