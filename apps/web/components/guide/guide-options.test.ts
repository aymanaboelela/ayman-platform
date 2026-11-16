import { describe, expect, it } from 'vitest';
import { MONTH_NOV, MONTH_OCT, TERM_ONE, TERM_TWO, course, detail, labelOf } from './guide-fixtures';
import {
  MAX_COURSES,
  checkoutHref,
  coursesFor,
  monthOptions,
  planOptions,
  streamOptions,
  totalCents,
  upcomingTerms,
  yearKeyOf,
  yearOptions,
  type Owned,
} from './guide-options';

/**
 * What the guide offers is read off what the API published — nothing here is
 * a year, a price or a month of the guide's own.
 */

describe('the years on offer', () => {
  it('is one row per (system, year) that has a course, in year order', () => {
    const courses = [
      course({ year: 2 }),
      course({ year: 1, systemSlug: 'thanaweya_amma' }),
      course({ year: 2 }),
    ];
    expect(yearOptions(courses, labelOf).map((option) => option.key)).toEqual([
      'thanaweya_amma:1',
      'bacalorya:2',
    ]);
  });

  it('labels each with the stack’s own wording', () => {
    const [only] = yearOptions([course({ year: 1 })], () => 'الصف الأول الثانوي');
    expect(only!.label).toBe('الصف الأول الثانوي');
  });

  it('is empty for an empty catalogue', () => {
    expect(yearOptions([], labelOf)).toEqual([]);
  });
});

describe('the streams in a year', () => {
  const y1 = yearKeyOf({ systemSlug: 'bacalorya', year: 1 });

  it('lists both when the year serves both — by one course or by two', () => {
    expect(streamOptions([course({ year: 1 })], y1)).toEqual(['general', 'languages']);
    expect(
      streamOptions(
        [course({ year: 1, forLanguages: false }), course({ year: 1, forGeneral: false })],
        y1,
      ),
    ).toEqual(['general', 'languages']);
  });

  it('lists one when the year only serves one', () => {
    expect(streamOptions([course({ year: 1, forLanguages: false })], y1)).toEqual(['general']);
  });

  it('ignores other years, and answers nothing before a year is chosen', () => {
    expect(streamOptions([course({ year: 2, forGeneral: false })], y1)).toEqual([]);
    expect(streamOptions([course({ year: 1 })], null)).toEqual([]);
  });
});

describe('the courses for a year and a stream', () => {
  const y2 = 'bacalorya:2';

  it('keeps only that year and that stream', () => {
    const arabic = course({ forLanguages: false });
    const languages = course({ forGeneral: false });
    const otherYear = course({ year: 1 });
    const all = [arabic, languages, otherYear];
    expect(coursesFor(all, y2, 'general').map((row) => row.slug)).toEqual([arabic.slug]);
    expect(coursesFor(all, y2, 'languages').map((row) => row.slug)).toEqual([languages.slug]);
  });

  it('puts a course that can be paid for ahead of one with no listed price', () => {
    const free = course({ monthlyPriceCents: null, publishedAt: '2026-10-01T00:00:00.000Z' });
    const paid = course({ publishedAt: '2026-01-01T00:00:00.000Z' });
    expect(coursesFor([free, paid], y2, 'general')[0]!.slug).toBe(paid.slug);
  });

  it('does NOT drop a course with no listed price — it may be sold by term alone', () => {
    const termOnly = course({ monthlyPriceCents: null, yearlyPriceCents: null });
    expect(coursesFor([termOnly], y2, 'general')).toHaveLength(1);
  });

  it('treats a monthly price with every month closed as not for sale yet', () => {
    const closed = course({ monthlyOnSale: false });
    const open = course({ publishedAt: '2025-01-01T00:00:00.000Z' });
    expect(coursesFor([closed, open], y2, 'general')[0]!.slug).toBe(open.slug);
  });

  it('never lists more than a handful', () => {
    const many = Array.from({ length: 40 }, () => course());
    expect(coursesFor(many, y2, 'general')).toHaveLength(MAX_COURSES);
  });
});

describe('the plans a course really sells', () => {
  it('shows only the plans that have a price', () => {
    const monthlyOnly = detail(course());
    expect(planOptions(monthlyOnly).map((plan) => plan.id)).toEqual(['monthly']);

    const everything = detail(course({ yearlyPriceCents: 130000 }), { terms: [TERM_ONE, TERM_TWO] });
    expect(planOptions(everything).map((plan) => plan.id)).toEqual([
      'monthly',
      `term:${TERM_ONE.id}`,
      `term:${TERM_TWO.id}`,
      'yearly',
    ]);
  });

  it('shows nothing for a course with nothing on sale', () => {
    expect(planOptions(detail(course({ monthlyPriceCents: null })))).toEqual([]);
  });

  it('drops «شهر» when the course sells by month and every month is closed', () => {
    const closed = detail(course({ monthlyOnSale: false, yearlyPriceCents: 130000 }));
    expect(planOptions(closed).map((plan) => plan.id)).toEqual(['yearly']);
  });

  it('knows whether «شهر» means named months or one plain month', () => {
    const [plain] = planOptions(detail(course()));
    expect(plain).toMatchObject({ kind: 'monthly', byMonth: false });
    const [named] = planOptions(detail(course(), { months: [MONTH_OCT, MONTH_NOV] }));
    expect(named).toMatchObject({ kind: 'monthly', byMonth: true });
  });

  it('charges the offer while it runs, and keeps the regular price beside it', () => {
    const onOffer = detail(
      course({
        monthlyPriceCents: 15000,
        saleMonthlyPriceCents: 9900,
        yearlyPriceCents: 130000,
        saleYearlyPriceCents: 99000,
        saleEndsAt: '2026-12-01T00:00:00.000Z',
      }),
      { terms: [{ ...TERM_ONE, salePriceCents: 60000 }] },
    );
    const plans = planOptions(onOffer, null, new Date('2026-11-16T00:00:00.000Z'));
    expect(plans).toEqual([
      { id: 'monthly', kind: 'monthly', priceCents: 9900, wasCents: 15000, byMonth: false },
      {
        id: `term:${TERM_ONE.id}`,
        kind: 'term',
        termId: TERM_ONE.id,
        title: TERM_ONE.title,
        priceCents: 60000,
        wasCents: 70000,
      },
      { id: 'yearly', kind: 'yearly', priceCents: 99000, wasCents: 130000 },
    ]);
  });

  it('goes back to the regular price the moment the offer has ended', () => {
    const ended = detail(
      course({
        monthlyPriceCents: 15000,
        saleMonthlyPriceCents: 9900,
        saleEndsAt: '2026-11-01T00:00:00.000Z',
      }),
    );
    expect(planOptions(ended, null, new Date('2026-11-16T00:00:00.000Z'))).toEqual([
      { id: 'monthly', kind: 'monthly', priceCents: 15000, wasCents: null, byMonth: false },
    ]);
  });

  it('ignores a «sale» that is not below the price', () => {
    const notASale = detail(course({ monthlyPriceCents: 15000, saleMonthlyPriceCents: 15000 }));
    expect(planOptions(notASale)[0]).toMatchObject({ priceCents: 15000, wasCents: null });
  });
});

describe('the months to choose from', () => {
  const byMonth = detail(course(), { months: [MONTH_NOV, MONTH_OCT] });

  it('lists the open months in curriculum order, for a by-month «شهر» only', () => {
    const [monthly] = planOptions(byMonth);
    expect(monthOptions(byMonth, monthly!).map((month) => month.title)).toEqual([
      MONTH_OCT.title,
      MONTH_NOV.title,
    ]);
  });

  it('is empty for every other plan, and before a plan is chosen', () => {
    const withYear = detail(course({ yearlyPriceCents: 130000 }), { months: [MONTH_OCT] });
    const yearly = planOptions(withYear).find((plan) => plan.kind === 'yearly')!;
    expect(monthOptions(withYear, yearly)).toEqual([]);
    expect(monthOptions(withYear, null)).toEqual([]);
    const [plain] = planOptions(detail(course()));
    expect(monthOptions(detail(course()), plain!)).toEqual([]);
  });

  it('prices every month at the offer while one runs', () => {
    const onOffer = detail(course({ saleMonthlyPriceCents: 9900 }), { months: [MONTH_OCT] });
    const [monthly] = planOptions(onOffer);
    expect(monthOptions(onOffer, monthly!)[0]!.priceCents).toBe(9900);
  });
});

describe('what the student already holds', () => {
  const byMonth = detail(course({ yearlyPriceCents: 130000 }), { months: [MONTH_OCT, MONTH_NOV] });
  const owns = (ids: string[], extra: Partial<Owned> = {}): Owned => ({
    ownedMonthIds: ids,
    coversAll: false,
    pending: false,
    ...extra,
  });

  it('is never offered again as a month', () => {
    const owned = owns([MONTH_OCT.id]);
    const monthly = planOptions(byMonth, owned).find((plan) => plan.kind === 'monthly')!;
    expect(monthOptions(byMonth, monthly, owned).map((month) => month.id)).toEqual([MONTH_NOV.id]);
  });

  it('takes «شهر» off the list when every open month is already held', () => {
    expect(planOptions(byMonth, owns([MONTH_OCT.id, MONTH_NOV.id])).map((plan) => plan.id)).toEqual(['yearly']);
    // …and when a term or a year already opens them all.
    expect(planOptions(byMonth, owns([], { coversAll: true })).map((plan) => plan.id)).toEqual(['yearly']);
  });

  it('changes nothing for a visitor, or when the read failed', () => {
    expect(planOptions(byMonth, null).map((plan) => plan.id)).toEqual(['monthly', 'yearly']);
    const monthly = planOptions(byMonth, null)[0]!;
    expect(monthOptions(byMonth, monthly, null)).toHaveLength(2);
  });

  it('does not touch the plain one-month subscription, which is not a set of months', () => {
    const plain = detail(course());
    expect(planOptions(plain, owns([], { coversAll: true })).map((plan) => plan.id)).toEqual(['monthly']);
  });
});

describe('terms that are not on sale yet', () => {
  it('are listed by name, apart from the plans', () => {
    const second = { id: '99999999-9999-4999-8999-999999999999', title: 'الترم التاني' };
    const withSecond = detail(course(), { terms: [TERM_ONE], upcomingTerms: [second] });
    expect(upcomingTerms(withSecond)).toEqual([second]);
    // Never a plan: nothing with its id can be chosen or sent to a checkout.
    expect(planOptions(withSecond).some((plan) => plan.id.includes(second.id))).toBe(false);
  });

  it('are none when the API predates the field', () => {
    expect(upcomingTerms(detail(course(), { terms: [TERM_ONE] }))).toEqual([]);
  });

  it('never include a term that is ALSO on sale', () => {
    const both = detail(course(), {
      terms: [TERM_ONE],
      upcomingTerms: [{ id: TERM_ONE.id, title: TERM_ONE.title }],
    });
    expect(upcomingTerms(both)).toEqual([]);
  });
});

describe('the total', () => {
  const byMonth = detail(course(), { months: [MONTH_OCT, MONTH_NOV] });
  const [monthly] = planOptions(byMonth);
  const months = monthOptions(byMonth, monthly!);

  it('is the sum of the chosen months’ own prices', () => {
    expect(totalCents(monthly!, [months[0]!])).toBe(20000);
    expect(totalCents(monthly!, months)).toBe(40000);
  });

  it('adds up months that are priced differently, rather than multiplying one price', () => {
    const uneven = detail(course(), {
      months: [MONTH_OCT, { ...MONTH_NOV, priceCents: 25000 }],
    });
    const [plan] = planOptions(uneven);
    expect(totalCents(plan!, monthOptions(uneven, plan!))).toBe(45000);
  });

  it('is the offer’s price per month while an offer runs', () => {
    const onOffer = detail(course({ saleMonthlyPriceCents: 9900 }), { months: [MONTH_OCT, MONTH_NOV] });
    const [plan] = planOptions(onOffer);
    expect(totalCents(plan!, monthOptions(onOffer, plan!))).toBe(19800);
  });

  it('is no number at all until a month is chosen', () => {
    expect(totalCents(monthly!, [])).toBeNull();
    expect(totalCents(null, [])).toBeNull();
  });

  it('is the plan’s own price for everything that is not a set of months', () => {
    const [plain] = planOptions(detail(course({ monthlyPriceCents: 18000 })));
    expect(totalCents(plain!, [])).toBe(18000);
  });
});

describe('the handoff to the real checkout', () => {
  const byMonth = detail(course({ slug: 'python-y2', yearlyPriceCents: 130000 }), {
    months: [MONTH_OCT, MONTH_NOV],
    terms: [TERM_ONE],
  });
  const plans = planOptions(byMonth);
  const monthly = plans.find((plan) => plan.kind === 'monthly')!;
  const term = plans.find((plan) => plan.kind === 'term')!;
  const yearly = plans.find((plan) => plan.kind === 'yearly')!;
  const months = monthOptions(byMonth, monthly);

  it('names one month with the link the lecture padlock already uses', () => {
    expect(checkoutHref('python-y2', monthly, [months[0]!])).toBe(
      `/courses/python-y2/subscribe?month=${MONTH_OCT.id}`,
    );
  });

  it('names several months as the comma list the checkout already opens ticked', () => {
    const href = checkoutHref('python-y2', monthly, months);
    expect(href).toBe(`/courses/python-y2/subscribe?month=${MONTH_OCT.id},${MONTH_NOV.id}`);
    // Read back the way `requestedMonthIds` in the panel reads it.
    const asked = new URL(href, 'https://x.test').searchParams.get('month')!.split(',');
    expect(asked).toEqual([MONTH_OCT.id, MONTH_NOV.id]);
  });

  it('names the plan for the other three purchases', () => {
    expect(checkoutHref('python-y2', yearly, [])).toBe('/courses/python-y2/subscribe?plan=yearly');
    expect(checkoutHref('python-y2', term, [])).toBe(
      `/courses/python-y2/subscribe?plan=term&term=${TERM_ONE.id}`,
    );
    const [plain] = planOptions(detail(course()));
    expect(checkoutHref('python-y2', plain!, [])).toBe('/courses/python-y2/subscribe?plan=monthly');
  });

  it('never puts a price in the link', () => {
    for (const plan of plans) expect(checkoutHref('python-y2', plan, months)).not.toMatch(/price|cents|total/i);
  });

  it('goes to the course page when there is nothing to buy', () => {
    expect(checkoutHref('python-y2', null, [])).toBe('/courses/python-y2');
  });

  it('encodes an Arabic slug', () => {
    expect(checkoutHref('بايثون', yearly, [])).toBe(
      `/courses/${encodeURIComponent('بايثون')}/subscribe?plan=yearly`,
    );
  });
});
