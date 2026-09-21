import { checkMonthSelection, monthPurchaseAmountCents, pendingClaimsBlocking } from './month-grants';

/**
 * The pure half of buying «شهر من المنهج».
 *
 * `payments.service.spec.ts` already drives every one of these through real
 * Postgres, which is where they earn their keep — but it can only reach the
 * combinations a fixture course happens to produce. The ORDER of the refusals
 * is the thing that needs choosing on purpose: a month that is both closed and
 * already held has to be reported as closed, because "you already own this"
 * would send the student to the wrong screen for a month they cannot buy at
 * all.
 */
describe('checkMonthSelection', () => {
  const onSale = new Set(['m1', 'm2', 'm3']);

  it('passes a selection of open, unowned months', () => {
    expect(checkMonthSelection({ requested: ['m1', 'm3'], onSale, owned: new Set() })).toBeNull();
  });

  it('refuses an empty selection before looking at anything else', () => {
    expect(checkMonthSelection({ requested: [], onSale, owned: new Set() })).toEqual({
      kind: 'none_chosen',
    });
  });

  it('names the months that are not on sale, not just that something failed', () => {
    expect(
      checkMonthSelection({ requested: ['m1', 'closed', 'other-course'], onSale, owned: new Set() }),
    ).toEqual({ kind: 'not_on_sale', monthIds: ['closed', 'other-course'] });
  });

  it('reports a closed month as closed even when the student already holds it', () => {
    // The stricter fact wins. A month the instructor took off the shelf cannot
    // be bought by anyone, so «معاه اشتراك خلاص» would be the wrong sentence.
    expect(
      checkMonthSelection({ requested: ['closed'], onSale, owned: new Set(['closed']) }),
    ).toEqual({ kind: 'not_on_sale', monthIds: ['closed'] });
  });

  it('refuses a month the student can already open', () => {
    expect(
      checkMonthSelection({ requested: ['m1', 'm2'], onSale, owned: new Set(['m2']) }),
    ).toEqual({ kind: 'already_owned', monthIds: ['m2'] });
  });
});

describe('monthPurchaseAmountCents', () => {
  it('is the course price once per month bought', () => {
    // One price for any month — the instructor's own decision, and the reason
    // `CourseMonth.priceCents` is read by nothing.
    expect(monthPurchaseAmountCents(15000, 3)).toBe(45000);
  });
});

describe('pendingClaimsBlocking', () => {
  it('lets a claim for a different month through', () => {
    // «نسيت أشترك شهر ٢» while a claim for شهر ٣ is under review is a real
    // student with a real second transfer, not a second claim for one seat.
    expect(pendingClaimsBlocking([{ id: 'p1', monthIds: ['m3'] }], ['m2'])).toEqual([]);
  });

  it('blocks on the overlap, and names which claim', () => {
    expect(
      pendingClaimsBlocking(
        [
          { id: 'p1', monthIds: ['m3'] },
          { id: 'p2', monthIds: ['m1', 'm2'] },
        ],
        ['m2'],
      ),
    ).toEqual(['p2']);
  });

  it('blocks on a pending claim that names NO months at all', () => {
    // A term or yearly claim — or an old-model monthly one on a course that
    // has since gained months — covers everything this one would buy, so the
    // original "wait for the first review" rule still applies.
    expect(pendingClaimsBlocking([{ id: 'p1', monthIds: [] }], ['m2'])).toEqual(['p1']);
  });
});
