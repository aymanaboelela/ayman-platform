import { describe, expect, it } from 'vitest';
import { INITIAL_GUIDE_STATE } from './guide-gate';
import { MONTH_NOV, MONTH_OCT, TERM_ONE, course, detail, labelOf, productionCatalog } from './guide-fixtures';
import { checkoutHref } from './guide-options';
import {
  EMPTY_SELECTION,
  furthestStep,
  initialGuideState,
  nextStep,
  normaliseStep,
  parseGuideState,
  pick,
  previousStep,
  readGuideState,
  settleStep,
  viewOf,
  writeGuideState,
  type GuideData,
} from './guide-state';

const visitor = (overrides: Partial<GuideData> = {}): GuideData => ({
  signedIn: false,
  courses: [],
  saved: { yearKey: null, year: null, stream: null },
  details: {},
  ...overrides,
});

const options = { askSection: false, labelOf };

describe('the stored state', () => {
  it('starts on the welcome step, open, with nothing selected', () => {
    expect(initialGuideState()).toEqual({
      v: 1,
      step: 'welcome',
      open: true,
      selection: EMPTY_SELECTION,
      askSection: false,
      done: false,
    });
  });

  it('reads back exactly what the launcher writes when the guide first appears', () => {
    // The launcher cannot import this module, so it writes a constant; this
    // is what keeps the two from disagreeing about the shape.
    expect(parseGuideState(JSON.stringify(INITIAL_GUIDE_STATE))).toEqual(initialGuideState());
  });

  it('round-trips through sessionStorage, and `null` leaves nothing behind', () => {
    const state = { ...initialGuideState(), step: 'plan' as const, open: false };
    writeGuideState(state);
    expect(readGuideState()).toEqual(state);
    writeGuideState(null);
    expect(readGuideState()).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });

  it.each([
    ['nothing', null],
    ['not JSON', '{oops'],
    ['an array', '[]'],
    ['another version', JSON.stringify({ ...INITIAL_GUIDE_STATE, v: 2 })],
    ['an unknown step', JSON.stringify({ ...INITIAL_GUIDE_STATE, step: 'payment' })],
  ])('treats %s as no guide in progress', (_label, raw) => {
    expect(parseGuideState(raw)).toBeNull();
  });

  it('drops fields of the wrong type instead of trusting them', () => {
    const parsed = parseGuideState(
      JSON.stringify({
        v: 1,
        step: 'course',
        open: 'yes',
        selection: { year: 7, stream: 'azhari', course: '', plan: { id: 'x' }, months: ['m', 3, '', 'n'] },
        done: 1,
      }),
    );
    expect(parsed).toEqual({
      v: 1,
      step: 'course',
      open: false,
      selection: { year: null, stream: null, course: null, plan: null, months: ['m', 'n'] },
      askSection: false,
      done: false,
    });
  });
});

describe('a new answer', () => {
  const full = { year: 'bacalorya:2', stream: 'general' as const, course: 'c', plan: 'monthly', months: ['m'] };

  it('drops everything that depended on the old one', () => {
    expect(pick(full, 'year', 'bacalorya:1')).toEqual({
      year: 'bacalorya:1',
      stream: null,
      course: null,
      plan: null,
      months: [],
    });
    expect(pick(full, 'plan', 'yearly')).toEqual({ ...full, plan: 'yearly', months: [] });
    expect(pick(full, 'months', ['m', 'n'])).toEqual({ ...full, months: ['m', 'n'] });
  });
});

describe('the steps that are asked', () => {
  it('asks year, stream, course, plan and account of a visitor with real choices', () => {
    const data = visitor({ courses: [course({ year: 1 }), course({ year: 2 })] });
    expect(viewOf(data, EMPTY_SELECTION, options).steps).toEqual([
      'welcome',
      'year',
      'stream',
      'course',
      'plan',
      'account',
    ]);
  });

  it('selects nothing a visitor did not select', () => {
    const data = visitor({ courses: [course({ year: 1 }), course({ year: 2 })] });
    expect(viewOf(data, EMPTY_SELECTION, options).selection).toEqual(EMPTY_SELECTION);
  });

  it('skips the year when only one is taught', () => {
    const view = viewOf(visitor({ courses: [course(), course()] }), EMPTY_SELECTION, options);
    expect(view.steps).not.toContain('year');
    expect(view.selection.year).toBe('bacalorya:2');
  });

  it('skips the stream when the year serves one', () => {
    const view = viewOf(visitor({ courses: [course({ forLanguages: false })] }), EMPTY_SELECTION, options);
    expect(view.steps).toEqual(['welcome', 'course', 'plan', 'account']);
    expect(view.selection.stream).toBe('general');
  });

  it('always shows the course, even when there is exactly one', () => {
    const only = course({ forLanguages: false });
    const view = viewOf(visitor({ courses: [only] }), EMPTY_SELECTION, options);
    expect(view.steps).toContain('course');
    expect(view.course?.slug).toBe(only.slug);
  });

  it('lists no course until the stream question has an answer', () => {
    const view = viewOf(visitor({ courses: [course()] }), EMPTY_SELECTION, options);
    expect(view.streams).toEqual(['general', 'languages']);
    expect(view.courses).toEqual([]);
    expect(view.course).toBeNull();
  });

  it('skips the plan when the course sells exactly one', () => {
    const only = course({ forLanguages: false });
    const view = viewOf(
      visitor({ courses: [only], details: { [only.slug]: detail(only) } }),
      EMPTY_SELECTION,
      options,
    );
    expect(view.steps).toEqual(['welcome', 'course', 'account']);
    expect(view.plan?.id).toBe('monthly');
    expect(view.totalCents).toBe(20000);
  });

  it('keeps the plan step as a placeholder while the course is still being read', () => {
    const only = course({ forLanguages: false });
    const view = viewOf(visitor({ courses: [only] }), EMPTY_SELECTION, options);
    expect(view.plans).toBeNull();
    expect(view.steps).toContain('plan');
  });

  it('asks «which month?» only for a by-month «شهر» with more than one open month', () => {
    const only = course({ forLanguages: false, yearlyPriceCents: 130000 });
    const data = visitor({
      courses: [only],
      details: { [only.slug]: detail(only, { months: [MONTH_OCT, MONTH_NOV] }) },
    });
    // No plan yet: no month step yet.
    expect(viewOf(data, EMPTY_SELECTION, options).steps).not.toContain('month');
    // «شهر»: the month is asked.
    const monthly = viewOf(data, { ...EMPTY_SELECTION, plan: 'monthly' }, options);
    expect(monthly.steps).toEqual(['welcome', 'course', 'plan', 'month', 'account']);
    expect(monthly.totalCents).toBeNull();
    // «سنة كاملة»: it is not.
    const yearly = viewOf(data, { ...EMPTY_SELECTION, plan: 'yearly' }, options);
    expect(yearly.steps).toEqual(['welcome', 'course', 'plan', 'account']);
    expect(yearly.totalCents).toBe(130000);
  });

  it('settles the month silently when one is open', () => {
    const only = course({ forLanguages: false });
    const data = visitor({
      courses: [only],
      details: { [only.slug]: detail(only, { months: [MONTH_OCT] }) },
    });
    const view = viewOf(data, EMPTY_SELECTION, options);
    expect(view.steps).toEqual(['welcome', 'course', 'account']);
    expect(view.chosenMonths.map((month) => month.id)).toEqual([MONTH_OCT.id]);
    expect(view.totalCents).toBe(20000);
  });

  it('ends at the plan step for a course with nothing on sale', () => {
    const free = course({ forLanguages: false, monthlyPriceCents: null });
    const view = viewOf(
      visitor({ courses: [free], details: { [free.slug]: detail(free) } }),
      EMPTY_SELECTION,
      options,
    );
    expect(view.plans).toEqual([]);
    expect(view.steps).toEqual(['welcome', 'course', 'plan']);
  });

  it('ends on «pay» for a signed-in student and «account» for a visitor', () => {
    const only = course({ forLanguages: false });
    expect(viewOf(visitor({ courses: [only] }), EMPTY_SELECTION, options).steps.at(-1)).toBe('account');
    expect(viewOf(visitor({ courses: [only], signedIn: true }), EMPTY_SELECTION, options).steps.at(-1)).toBe('pay');
  });

  it('drops a stored answer that no longer resolves', () => {
    const only = course({ forLanguages: false });
    const data = visitor({ courses: [only], details: { [only.slug]: detail(only, { terms: [TERM_ONE] }) } });
    const view = viewOf(
      data,
      { year: 'bacalorya:3', stream: 'languages', course: 'gone', plan: 'term:closed', months: ['x'] },
      options,
    );
    expect(view.selection).toEqual({
      year: 'bacalorya:2',
      stream: 'general',
      course: only.slug,
      plan: null,
      months: [],
    });
  });
});

describe('several months in one go', () => {
  const only = course({ forLanguages: false, yearlyPriceCents: 130000 });
  const data = visitor({
    courses: [only],
    details: { [only.slug]: detail(only, { months: [MONTH_OCT, MONTH_NOV] }) },
  });

  it('selects no month until the student ticks one', () => {
    const view = viewOf(data, { ...EMPTY_SELECTION, plan: 'monthly' }, options);
    expect(view.chosenMonths).toEqual([]);
    expect(view.selection.months).toEqual([]);
    expect(view.totalCents).toBeNull();
    // «التالي» cannot be reached past: the month step is as far as it goes.
    expect(furthestStep(view)).toBe('month');
    expect(settleStep('account', view)).toBe('month');
  });

  it('adds the chosen months up, in curriculum order whatever order they were ticked in', () => {
    const view = viewOf(
      data,
      { ...EMPTY_SELECTION, plan: 'monthly', months: [MONTH_NOV.id, MONTH_OCT.id] },
      options,
    );
    expect(view.chosenMonths.map((month) => month.title)).toEqual([MONTH_OCT.title, MONTH_NOV.title]);
    expect(view.totalCents).toBe(40000);
    expect(settleStep('account', view)).toBe('account');
  });

  it('drops a ticked month that can no longer be bought', () => {
    const closedSince = visitor({
      courses: [only],
      details: { [only.slug]: detail(only, { months: [MONTH_OCT, MONTH_NOV] }) },
      owned: { [only.slug]: { ownedMonthIds: [MONTH_OCT.id], coversAll: false, pending: false } },
    });
    const view = viewOf(
      { ...closedSince, signedIn: true },
      { ...EMPTY_SELECTION, plan: 'monthly', months: [MONTH_OCT.id, MONTH_NOV.id] },
      options,
    );
    // The one left is the only month on offer, so it is settled silently.
    expect(view.months.map((month) => month.id)).toEqual([MONTH_NOV.id]);
    expect(view.selection.months).toEqual([MONTH_NOV.id]);
  });

  it('forgets the months when the plan changes', () => {
    const picked = { ...EMPTY_SELECTION, plan: 'monthly', months: [MONTH_OCT.id] };
    expect(pick(picked, 'plan', 'yearly').months).toEqual([]);
  });
});

describe('a claim already in review', () => {
  it('offers nothing more to choose, and says so on the plan step', () => {
    const only = course({ forLanguages: false, yearlyPriceCents: 130000 });
    const view = viewOf(
      visitor({
        signedIn: true,
        courses: [only],
        details: { [only.slug]: detail(only, { terms: [TERM_ONE] }) },
        owned: { [only.slug]: { ownedMonthIds: [], coversAll: false, pending: true } },
      }),
      EMPTY_SELECTION,
      options,
    );
    expect(view.pending).toBe(true);
    expect(view.plans).toEqual([]);
    expect(view.steps).toEqual(['welcome', 'course', 'plan']);
  });
});

/**
 * The catalogue as it really is (`productionCatalog`): four courses, one per
 * year and stream; «شهر», one open term and the year on each; a second term
 * that is not open yet on the year-2 Arabic course; three open months of ten.
 */
describe('the live catalogue', () => {
  const live = productionCatalog();
  const data = visitor({ courses: live.courses, details: live.details });
  const at = (year: 1 | 2, stream: 'general' | 'languages') =>
    viewOf(data, { ...EMPTY_SELECTION, year: `bacalorya:${year}`, stream }, options);

  it('asks the year and the stream, and each answer names exactly one course', () => {
    const start = viewOf(data, EMPTY_SELECTION, options);
    expect(start.years.map((year) => year.key)).toEqual(['bacalorya:1', 'bacalorya:2']);
    expect(start.steps).toEqual(['welcome', 'year', 'stream', 'course', 'plan', 'account']);

    for (const year of [1, 2] as const) {
      for (const stream of ['general', 'languages'] as const) {
        const view = at(year, stream);
        expect(view.streams).toEqual(['general', 'languages']);
        // One course: shown as «this is the course», never as a list to pick from.
        expect(view.courses.map((row) => row.slug)).toEqual([`y${year}-${stream}`]);
        expect(view.course?.slug).toBe(`y${year}-${stream}`);
      }
    }
  });

  it('lists «شهر», the open term by its own name, then the year — at the live prices', () => {
    expect(at(2, 'languages').plans).toEqual([
      { id: 'monthly', kind: 'monthly', priceCents: 15000, wasCents: null, byMonth: true },
      expect.objectContaining({ kind: 'term', title: 'الترم الاول', priceCents: 45000, wasCents: null }),
      { id: 'yearly', kind: 'yearly', priceCents: 95000, wasCents: null },
    ]);
    expect(at(1, 'general').plans).toEqual([
      { id: 'monthly', kind: 'monthly', priceCents: 10000, wasCents: null, byMonth: true },
      expect.objectContaining({ kind: 'term', title: 'الترم الاول', priceCents: 35000, wasCents: null }),
      { id: 'yearly', kind: 'yearly', priceCents: 65000, wasCents: null },
    ]);
  });

  it('shows «الترم التاني» on the year-2 Arabic course as not open yet — never as a plan', () => {
    const view = at(2, 'general');
    expect(view.upcomingTerms.map((term) => term.title)).toEqual(['الترم التاني']);
    expect(view.plans!.map((plan) => (plan.kind === 'term' ? plan.title : plan.kind))).toEqual([
      'monthly',
      'الترم الاول',
      'yearly',
    ]);
    // Its id is in no plan, so no selection and no checkout link can carry it.
    const closedId = view.upcomingTerms[0]!.id;
    expect(view.plans!.some((plan) => plan.id.includes(closedId))).toBe(false);
    const forced = viewOf(data, { ...view.selection, plan: `term:${closedId}` }, options);
    expect(forced.plan).toBeNull();
    expect(forced.selection.plan).toBeNull();
    expect(checkoutHref(forced.course!.slug, forced.plan, forced.chosenMonths)).not.toContain(closedId);
    // The other three courses have one term and say nothing about a second.
    expect(at(2, 'languages').upcomingTerms).toEqual([]);
    expect(at(1, 'general').upcomingTerms).toEqual([]);
  });

  it('offers the three open months and nothing else', () => {
    const view = viewOf(data, { ...at(2, 'general').selection, plan: 'monthly' }, options);
    expect(view.months.map((month) => month.title)).toEqual(['الشهر الأول', 'الشهر الثاني', 'الشهر الثالث']);
    expect(view.steps).toEqual(['welcome', 'year', 'stream', 'course', 'plan', 'month', 'account']);
  });

  it('totals two months at the live monthly price and hands both to the checkout', () => {
    const base = at(2, 'general');
    const open = viewOf(data, { ...base.selection, plan: 'monthly' }, options).months;
    const view = viewOf(
      data,
      { ...base.selection, plan: 'monthly', months: [open[2]!.id, open[0]!.id] },
      options,
    );
    expect(view.totalCents).toBe(30000);
    expect(checkoutHref(view.course!.slug, view.plan, view.chosenMonths)).toBe(
      `/courses/y2-general/subscribe?month=${open[0]!.id},${open[2]!.id}`,
    );
  });

  it('prices the term and the year from the payload, with no month step', () => {
    const base = at(1, 'languages');
    const term = base.plans!.find((plan) => plan.kind === 'term')!;
    const onTerm = viewOf(data, { ...base.selection, plan: term.id }, options);
    expect(onTerm.totalCents).toBe(35000);
    expect(onTerm.steps).not.toContain('month');
    expect(viewOf(data, { ...base.selection, plan: 'yearly' }, options).totalCents).toBe(65000);
  });
});

describe('answers the profile already holds', () => {
  const courses = [course({ year: 1 }), course({ year: 2 })];
  const student = (saved: GuideData['saved']) => visitor({ signedIn: true, courses, saved });

  it('are not asked again', () => {
    const view = viewOf(student({ yearKey: null, year: 2, stream: 'languages' }), EMPTY_SELECTION, options);
    expect(view.steps).toEqual(['welcome', 'course', 'plan', 'pay']);
    expect(view.selection).toMatchObject({ year: 'bacalorya:2', stream: 'languages' });
    expect(view.fromProfile).toBe(true);
  });

  it('are ignored for a visitor, whatever the data says', () => {
    const data = visitor({ courses, saved: { yearKey: null, year: 2, stream: 'languages' } });
    expect(viewOf(data, EMPTY_SELECTION, options).steps).toContain('year');
  });

  it('are asked when the student says the year on file is wrong', () => {
    const view = viewOf(student({ yearKey: null, year: 2, stream: 'languages' }), EMPTY_SELECTION, {
      ...options,
      askSection: true,
    });
    expect(view.steps).toEqual(['welcome', 'year', 'stream', 'course', 'plan', 'pay']);
    expect(view.selection.year).toBeNull();
    expect(view.fromProfile).toBe(false);
  });

  it('do not guess between two systems that both teach that year', () => {
    const both = [course({ year: 2 }), course({ year: 2, systemSlug: 'thanaweya_amma' })];
    const data = visitor({ signedIn: true, courses: both, saved: { yearKey: null, year: 2, stream: null } });
    expect(viewOf(data, EMPTY_SELECTION, options).steps).toContain('year');
    // …unless the system could be resolved.
    const exact = visitor({
      signedIn: true,
      courses: both,
      saved: { yearKey: 'thanaweya_amma:2', year: 2, stream: null },
    });
    const view = viewOf(exact, EMPTY_SELECTION, options);
    expect(view.steps).not.toContain('year');
    expect(view.selection.year).toBe('thanaweya_amma:2');
  });

  it('ask the stream when the saved one is not taught in that year', () => {
    const general = [course({ year: 1 }), course({ year: 2, forLanguages: false }), course({ year: 2, forGeneral: false })];
    const data = visitor({ signedIn: true, courses: general, saved: { yearKey: null, year: 1, stream: null } });
    expect(viewOf(data, EMPTY_SELECTION, options).steps).toContain('stream');
  });

  it('ask the year when the saved one has no course here', () => {
    const view = viewOf(student({ yearKey: null, year: 3, stream: 'general' }), EMPTY_SELECTION, options);
    expect(view.steps).toContain('year');
    expect(view.steps).not.toContain('stream');
  });
});

describe('moving between steps', () => {
  const steps = ['welcome', 'year', 'course', 'plan', 'account'] as const;

  it('keeps a step that is asked', () => {
    expect(normaliseStep('course', steps)).toBe('course');
  });

  it('moves a step that is no longer asked on to the next one that is', () => {
    expect(normaliseStep('stream', steps)).toBe('course');
    expect(normaliseStep('month', steps)).toBe('account');
    expect(normaliseStep('pay', steps)).toBe('account');
  });

  it('steps forward and back along the asked steps only', () => {
    expect(nextStep('welcome', steps)).toBe('year');
    expect(nextStep('year', steps)).toBe('course');
    expect(nextStep('account', steps)).toBe('account');
    expect(previousStep('course', steps)).toBe('year');
    expect(previousStep('welcome', steps)).toBeNull();
  });

  it('never draws a step ahead of an unanswered one', () => {
    const data = visitor({ courses: [course({ year: 1 }), course({ year: 2 })] });
    const view = viewOf(data, EMPTY_SELECTION, options);
    // «يلا نبدأ» pressed before the catalogue loaded stored `course`.
    expect(furthestStep(view)).toBe('year');
    expect(settleStep('course', view)).toBe('year');
    expect(settleStep('account', view)).toBe('year');
    // Going back is always allowed.
    expect(settleStep('welcome', view)).toBe('welcome');
  });

  it('holds on the plan step until the course’s plans have loaded', () => {
    const only = course({ forLanguages: false, yearlyPriceCents: 130000 });
    const loading = viewOf(visitor({ courses: [only] }), EMPTY_SELECTION, options);
    expect(settleStep('account', loading)).toBe('plan');
    const loaded = viewOf(
      visitor({ courses: [only], details: { [only.slug]: detail(only) } }),
      { ...EMPTY_SELECTION, plan: 'yearly' },
      options,
    );
    expect(settleStep('account', loaded)).toBe('account');
  });

  it('walks past a plan step that turned out to have one answer', () => {
    const only = course({ forLanguages: false });
    const loaded = viewOf(
      visitor({ courses: [only], details: { [only.slug]: detail(only, { months: [MONTH_OCT, MONTH_NOV] }) } }),
      EMPTY_SELECTION,
      options,
    );
    // One plan («شهر», by month) → the plan step is gone and the month is asked.
    expect(loaded.steps).toEqual(['welcome', 'course', 'month', 'account']);
    expect(settleStep('plan', loaded)).toBe('month');
  });
});
