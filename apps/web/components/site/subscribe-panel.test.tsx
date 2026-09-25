import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { copy, formatCopy } from '@ayman/contracts';
import type { CatalogCourseTerm } from '@ayman/contracts/catalog';
import type { CourseMonth } from '@ayman/contracts/months';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadPaymentScreenshot } from '@/lib/upload-client';
import { SubscribePanel } from './subscribe-panel';

/**
 * The panel is the checkout, and everything asserted here is about ONE
 * property: what it is willing to sell comes from the API at the moment it
 * opens, never from the page it was opened on.
 *
 * That page is `'use cache'` with `cacheLife('hours')`, so its price props, its
 * `terms` and its `instapay` are all as old as a cache entry — and the three
 * dead ends below were all reachable from a stale one on a course that was very
 * much for sale. «هو جاي يدفع بيقولوا الكورس قفل، تواصل على واتساب… وأنا عايزه
 * إن ده لازم يدفع».
 *
 * Every case therefore passes DELIBERATELY WRONG props and asserts the panel
 * ignored them. Props that agreed with the API would prove nothing.
 */

const apiGet = vi.fn();
const apiPost = vi.fn();

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    apiGet: (...args: unknown[]) => apiGet(...args),
    apiPost: (...args: unknown[]) => apiPost(...args),
  };
});

// The panel imports this at module scope and it pulls in browser-only upload
// plumbing that has no business booting here. Only the
// month-purchase case below actually drives it, and it says what it wants
// back at the call site.
vi.mock('@/lib/upload-client', () => ({
  uploadPaymentScreenshot: vi.fn(),
}));

// jsdom implements neither, and `handleFileChange` calls both to build the
// thumbnail the student sees after picking a screenshot.
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:screenshot';
  URL.revokeObjectURL = () => {};
}

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const SLUG = 'programming-y2';
const TERM: CatalogCourseTerm = {
  id: '22222222-2222-4222-8222-222222222222',
  title: 'الترم الأول',
  priceCents: 30000,
};

const OWNED_MONTHS_PATH = `/api/payments/courses/${COURSE_ID}/months/mine`;

/** Two curriculum months of the same course. `priceCents` is the course's own
 *  monthly price on both — one price for any month is the instructor's rule,
 *  and `CatalogService` fills the field from `monthlyPriceCents`. */
const MONTH_ONE: CourseMonth = {
  id: '33333333-3333-4333-8333-333333333333',
  monthIndex: 1,
  title: 'شهر أكتوبر',
  lessonCount: 4,
  priceCents: 20000,
};
const MONTH_TWO: CourseMonth = {
  id: '44444444-4444-4444-8444-444444444444',
  monthIndex: 2,
  title: 'شهر نوفمبر',
  lessonCount: 0,
  priceCents: 20000,
};

/** What `GET /api/catalog/courses/:slug` answers — only the fields the panel
 *  reads off it are given shape here; the schema parse is mocked away with
 *  `apiGet` itself.
 *
 *  `months: []` is the DEFAULT because it is the default in production: a
 *  course whose instructor has not configured curriculum months sells the
 *  rolling thirty days it always did, and every case that does not say
 *  otherwise is testing that path. */
function liveCourse(overrides: Record<string, unknown> = {}) {
  return {
    monthlyPriceCents: 20000,
    yearlyPriceCents: null,
    terms: [],
    months: [],
    ...overrides,
  };
}

function liveSettings(
  instapay: string | null = '+201021196367',
  vodafoneCash: string | null = null,
) {
  return { contact: { instapay, vodafoneCash } };
}

/**
 * Routes the four parallel reads the panel issues by path, so a test only has
 * to say what the API knows. `submissions/me` answers "nothing yet" unless a
 * test overrides it — the panel is otherwise gated on a pending claim and never
 * reaches the plan picker.
 */
function respondWith({
  course,
  settings,
  submissions = [],
  ownedMonthIds,
  coversAll = false,
}: {
  course?: unknown;
  settings?: unknown;
  submissions?: unknown[];
  /** `undefined` makes the months read REJECT — a signed-out visitor, or a
   *  429. The picker has to draw anyway. */
  ownedMonthIds?: string[];
  /** A term / year / «٣ شهور» subscription — every month already open. */
  coversAll?: boolean;
}) {
  apiGet.mockImplementation((path: string) => {
    if (path === OWNED_MONTHS_PATH) {
      return ownedMonthIds === undefined
        ? Promise.reject(new Error('unauthorized'))
        : Promise.resolve({ ownedMonthIds, coversAll });
    }
    if (path === '/api/payments/submissions/me') return Promise.resolve(submissions);
    if (path.startsWith('/api/catalog/courses/')) {
      return course === undefined
        ? Promise.reject(new Error('unreachable'))
        : Promise.resolve(course);
    }
    if (path === '/api/settings/public') {
      return settings === undefined
        ? Promise.reject(new Error('unreachable'))
        : Promise.resolve(settings);
    }
    return Promise.reject(new Error(`unexpected path ${path}`));
  });
}

/** The stale cache entry every case starts from: a course that looks free, on a
 *  platform that looks like it has no transfer number. */
function Panel(props: Partial<React.ComponentProps<typeof SubscribePanel>> = {}) {
  return (
    <SubscribePanel
      courseId={COURSE_ID}
      slug={SLUG}
      monthlyPriceCents={null}
      yearlyPriceCents={null}
      terms={[]}
      instapay={null}
      onCancel={() => {}}
      {...props}
    />
  );
}

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('SubscribePanel', () => {
  it('sells the plan the API knows about, not the one the cached page did', async () => {
    // The whole bug in one case: props say free, the live read says 200 EGP a
    // month. A course priced within the last hour is exactly this shape.
    respondWith({ course: liveCourse(), settings: liveSettings() });

    render(<Panel />);

    expect(await screen.findByText(copy.subscribe.planMonthlyLabel)).toBeTruthy();
    expect(screen.queryByText(copy.subscribe.noPlans)).toBeNull();
  });

  it('offers no «شهر» when every month of the course is closed, and still sells the year', async () => {
    // Priced, sold by month, no month open: the card could only fail at
    // checkout — there was no month to put in the claim.
    respondWith({
      course: liveCourse({ monthlyOnSale: false, yearlyPriceCents: 90000 }),
      settings: liveSettings(),
    });

    render(<Panel />);

    expect(await screen.findByText(copy.subscribe.planYearlyLabel)).toBeTruthy();
    expect(screen.queryByText(copy.subscribe.planMonthlyLabel)).toBeNull();
  });

  it('says the sale is not open on a course sold by month alone with no month open', async () => {
    respondWith({ course: liveCourse({ monthlyOnSale: false }), settings: liveSettings() });

    render(<Panel />);

    expect(await screen.findByText(copy.subscribe.noPlans)).toBeTruthy();
    expect(screen.queryByText(copy.subscribe.planMonthlyLabel)).toBeNull();
  });

  it('offers a term the cached page had not heard of', async () => {
    // `terms` on the public payload is filtered to OPEN, PRICED terms, so a
    // term opened this morning is absent from an entry written last night.
    respondWith({
      course: liveCourse({ monthlyPriceCents: null, terms: [TERM] }),
      settings: liveSettings(),
    });

    render(<Panel />);

    expect(await screen.findByText(copy.subscribe.planTermLabel)).toBeTruthy();
  });

  it('reads the transfer number live rather than sending anyone to WhatsApp', async () => {
    // The old panel returned `noNumber` on the FIRST render, from the cached
    // prop, before the live read had even been issued — and that string used to
    // read «الاشتراك مش متاح دلوقتي. تواصل معانا على واتساب.»
    respondWith({ course: liveCourse(), settings: liveSettings('+201021196367') });

    render(<Panel />);

    expect(await screen.findByText(copy.subscribe.planMonthlyLabel)).toBeTruthy();
    expect(screen.queryByText(copy.subscribe.noNumber)).toBeNull();
  });

  it('still shows the plan picker when the submissions check fails', async () => {
    // `allSettled`, not `all`. A 429 on the student's own throttle, or no
    // session at all, makes that one call throw — and losing the live PRICE to
    // it would put the panel straight back on the props it exists to distrust.
    apiGet.mockImplementation((path: string) => {
      if (path === '/api/payments/submissions/me') return Promise.reject(new Error('429'));
      if (path.startsWith('/api/catalog/courses/')) return Promise.resolve(liveCourse());
      if (path === OWNED_MONTHS_PATH) return Promise.resolve({ ownedMonthIds: [] });
      return Promise.resolve(liveSettings());
    });

    render(<Panel />);

    expect(await screen.findByText(copy.subscribe.planMonthlyLabel)).toBeTruthy();
  });

  it('falls back to the cached props when the live read is unreachable', async () => {
    // Stale numbers beat no numbers: an API that cannot be reached must not
    // turn a course that was on sale a minute ago into a dead end.
    respondWith({ course: undefined, settings: undefined });

    render(
      <Panel monthlyPriceCents={20000} instapay="+201021196367" />,
    );

    expect(await screen.findByText(copy.subscribe.planMonthlyLabel)).toBeTruthy();
  });

  it('says the sale is not open — and offers a retry — when nothing really is for sale', async () => {
    // The one honest dead end left, and it now costs a live read to reach.
    // `noPlans`, not the old `course.lockedError` («رسالة للمهندس أيمن»), and
    // never `noNumber`: a course with no price is not a payment problem.
    respondWith({
      course: liveCourse({ monthlyPriceCents: null }),
      settings: liveSettings(null),
    });

    render(<Panel />);

    expect(await screen.findByText(copy.subscribe.noPlans)).toBeTruthy();
    expect(screen.queryByText(copy.subscribe.noNumber)).toBeNull();
    expect(screen.getByRole('button', { name: copy.subscribe.retry })).toBeTruthy();
  });

  it('re-reads on «جرّب تاني» and opens checkout when the price has landed', async () => {
    // A student who opened the panel thirty seconds before the admin finished.
    // The press must not reload the page: they keep the dialog, the course and
    // their place, and the price arrives under them.
    respondWith({ course: liveCourse({ monthlyPriceCents: null }), settings: liveSettings() });

    render(<Panel />);
    const retry = await screen.findByRole('button', { name: copy.subscribe.retry });

    respondWith({ course: liveCourse(), settings: liveSettings() });
    retry.click();

    await waitFor(() => {
      expect(screen.getByText(copy.subscribe.planMonthlyLabel)).toBeTruthy();
    });
  });
});

/**
 * «هتحوّل بإيه؟» — the rail question, and the one property that matters about
 * it: THE NUMBER FOLLOWS THE ANSWER.
 *
 * ⚠️ Every case below asserts a NUMBER on screen, never which card carries a
 * class. A test that checked the lit state would pass on an implementation that
 * lights the right card and prints the other rail's number — which is the exact
 * bug worth having tests for, because it ends with a student's money on a rail
 * nothing reconciles.
 */
describe('the payment rail', () => {
  const INSTAPAY = '+201021196367';
  const WALLET = '+201555555555';

  /**
   * Plan picker → payment screen. The rail question is the first thing on the
   * payment screen, so every case here has to get past the plan first — the
   * panel opens on «اختار الخطة», not on the transfer details.
   */
  async function openCheckout(settings: unknown) {
    respondWith({ course: liveCourse(), settings });
    render(<Panel />);

    const monthly = await screen.findByText(copy.subscribe.planMonthlyLabel);
    fireEvent.click(monthly.closest('button') as HTMLButtonElement);

    await screen.findByText(copy.subscribe.railQuestion);
  }

  it('asks before it shows any number, and preselects nothing', async () => {
    await openCheckout(liveSettings(INSTAPAY, WALLET));

    // Neither number is on screen while the question is unanswered — the whole
    // point of making this a step instead of a dropdown over a live number.
    expect(screen.queryAllByText(/1021196367/)).toHaveLength(0);
    expect(screen.queryAllByText(/1555555555/)).toHaveLength(0);
    // ⚠️ And nothing is preselected. With the confirm button gone there is no
    // default to drift through — nothing happens until a finger lands on one of
    // the two, which is what makes a one-tap choice safe here.
    expect(screen.getAllByRole('button', { name: /إنستاباي|فودافون كاش/ })).toHaveLength(2);
  });

  it('shows the number of the rail the student picked', async () => {
    await openCheckout(liveSettings(INSTAPAY, WALLET));

    // One tap — the choice and the move are the same press.
    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.subscribe.railVodafoneCash) }));

    // `getAllBy`, because the number is deliberately on screen TWICE — in the
    // instructions sentence and in the copyable row — and both have to be the
    // rail that was picked.
    await waitFor(() => expect(screen.getAllByText(/1555555555/).length).toBeGreaterThan(0));
    // ⚠️ And NOT the other one, anywhere. There is no fallback between rails.
    expect(screen.queryAllByText(/1021196367/)).toHaveLength(0);

    /*
     * ⚠️ And every SENTENCE names the chosen rail too, not just the number.
     * The screenshot hint under the uploader was missed by the first pass and
     * still said «من تطبيق إنستاباي» to a student paying by wallet — caught by
     * opening the real checkout on production, not by any test, which is why
     * there is one now.
     */
    expect(screen.queryAllByText(new RegExp(copy.subscribe.railInstapay))).toHaveLength(0);
    expect(
      screen.getAllByText(new RegExp(copy.subscribe.railVodafoneCash)).length,
    ).toBeGreaterThan(1);
  });

  it('offers an unconfigured rail as unavailable rather than hiding it', async () => {
    // A student staring at a single option with no explanation cannot tell
    // whether the site is broken or the choice simply is not offered — and a
    // hidden gap is one the admin never sees either.
    await openCheckout(liveSettings(INSTAPAY, null));

    const wallet = screen.getByRole('button', { name: new RegExp(copy.subscribe.railVodafoneCash) });
    expect(wallet).toBeDisabled();
    expect(screen.getByText(copy.subscribe.railUnavailable)).toBeTruthy();
  });

  it('sells on the wallet alone when that is the only number set', async () => {
    // The guard used to be `if (!instapay)`, which would have closed checkout
    // entirely on a platform that takes Vodafone Cash and nothing else.
    await openCheckout(liveSettings(null, WALLET));

    expect(screen.queryByText(copy.subscribe.noNumber)).toBeNull();
    // One tap — the choice and the move are the same press.
    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.subscribe.railVodafoneCash) }));
    await waitFor(() => expect(screen.getAllByText(/1555555555/).length).toBeGreaterThan(0));
  });
});

/**
 * «شهر» when the course sells curriculum months — the plan that stopped being
 * a length of time and became a list of named slices of the syllabus.
 *
 * ⚠️ Every case here turns on ONE array. `CatalogCourseDetail.months` non-empty
 * means the student picks months that never expire; empty means the rolling
 * thirty days this panel has always sold, on the same code path it always used.
 * There is no second flag, and these tests are what stop one being added: each
 * asserts the BEHAVIOUR the array produces, never a prop or a class.
 */
describe('curriculum months', () => {
  /** Plan grid → month picker, on a course that sells by month. */
  async function openMonthPicker(overrides: Parameters<typeof respondWith>[0] = {}) {
    respondWith({
      course: liveCourse({ months: [MONTH_ONE, MONTH_TWO] }),
      settings: liveSettings(),
      ownedMonthIds: [],
      ...overrides,
    });
    render(<Panel />);

    const monthly = await screen.findByText(copy.subscribe.planMonthlyLabel);
    fireEvent.click(monthly.closest('button') as HTMLButtonElement);
    await screen.findByText(copy.subscribe.chooseMonthsTitle);
  }

  it('never offers «٣ شهور», even on a course still priced for it', async () => {
    // A stack that has not run the retirement migration yet still has the
    // column filled, and THAT is the case worth asserting: the card is gone
    // because the panel refuses to sell the plan, not because the number
    // happened to be null.
    respondWith({
      course: liveCourse({ quarterlyPriceCents: 45000 }),
      settings: liveSettings(),
      ownedMonthIds: [],
    });

    render(<Panel />);

    expect(await screen.findByText(copy.subscribe.planMonthlyLabel)).toBeTruthy();
    expect(screen.queryByText(copy.subscribe.planQuarterlyLabel)).toBeNull();
  });

  it('goes straight to the transfer screen when the course has no months', async () => {
    // The backward-compatibility path, and the one every existing course is
    // on. It must not acquire a step.
    respondWith({ course: liveCourse(), settings: liveSettings(), ownedMonthIds: [] });
    render(<Panel />);

    const monthly = await screen.findByText(copy.subscribe.planMonthlyLabel);
    fireEvent.click(monthly.closest('button') as HTMLButtonElement);

    // The rail question is the top of the transfer screen — reaching it means
    // no picker came between.
    await screen.findByText(copy.subscribe.railQuestion);
    expect(screen.queryByText(copy.subscribe.chooseMonthsTitle)).toBeNull();
  });

  it('draws a card per month, with its lecture count', async () => {
    await openMonthPicker();

    expect(screen.getByText(MONTH_ONE.title)).toBeTruthy();
    expect(
      screen.getByText(formatCopy(copy.subscribe.monthCardLessons, { count: 4 })),
    ).toBeTruthy();
    // A month the instructor opened before writing into it says so, rather
    // than printing «0 محاضرة» — which reads as a number that failed to load.
    expect(screen.getByText(copy.subscribe.monthCardEmpty)).toBeTruthy();
  });

  it('will not continue with nothing chosen, and says why', async () => {
    await openMonthPicker();

    expect(screen.getByRole('button', { name: copy.subscribe.monthsContinue })).toBeDisabled();
    expect(screen.getByText(copy.subscribe.monthsRequired)).toBeTruthy();
  });

  it('adds up several months in one transfer', async () => {
    // The instructor's own rule: «ينفع اختيار أكتر من شهر في تحويل واحد».
    // Two months at 200 EGP each is 400, and the running total is the only
    // place on this screen that says so.
    await openMonthPicker();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(MONTH_ONE.title) }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(MONTH_TWO.title) }));

    expect(
      screen.getByText(formatCopy(copy.subscribe.monthsTotal, { price: '400' })),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.subscribe.monthsContinue })).toBeEnabled();
    expect(screen.queryByText(copy.subscribe.monthsRequired)).toBeNull();
  });

  it('refuses to sell a month the student already holds', async () => {
    // Disabled, not hidden: a card that vanishes leaves the student counting
    // months that do not add up, and the reason is on the card itself.
    await openMonthPicker({ ownedMonthIds: [MONTH_ONE.id] });

    const owned = screen.getByRole('button', { name: new RegExp(MONTH_ONE.title) });
    expect(owned).toBeDisabled();
    expect(screen.getByText(copy.subscribe.monthCardOwned)).toBeTruthy();

    // And it cannot be selected into the total by a click that lands anyway.
    fireEvent.click(owned);
    expect(screen.getByRole('button', { name: copy.subscribe.monthsContinue })).toBeDisabled();
  });

  it('draws the picker even when the «what do I already own» read fails', async () => {
    // `allSettled`. That call needs a session and throws for a signed-out
    // visitor — and a checkout closed by a question about a purchase nobody
    // has made would be the most expensive way to answer it.
    await openMonthPicker({ ownedMonthIds: undefined });

    fireEvent.click(screen.getByRole('button', { name: new RegExp(MONTH_ONE.title) }));
    expect(screen.getByRole('button', { name: copy.subscribe.monthsContinue })).toBeEnabled();
  });

  it('sends the chosen months with the claim, and never an amount', async () => {
    await openMonthPicker();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(MONTH_ONE.title) }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(MONTH_TWO.title) }));
    fireEvent.click(screen.getByRole('button', { name: copy.subscribe.monthsContinue }));

    // The rail question, then the form. One tap picks and moves on.
    await screen.findByText(copy.subscribe.railQuestion);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.subscribe.railInstapay) }));
    await screen.findByLabelText(copy.subscribe.senderPhoneLabel);

    fireEvent.change(screen.getByLabelText(copy.subscribe.senderPhoneLabel), {
      target: { value: '01021196367' },
    });
    fireEvent.change(screen.getByLabelText(copy.subscribe.screenshotLabel), {
      target: { files: [new File(['x'], 'transfer.jpg', { type: 'image/jpeg' })] },
    });

    vi.mocked(uploadPaymentScreenshot).mockResolvedValue({
      ok: true,
      value: { screenshotKey: 'payments/transfer.jpg' },
    });
    apiPost.mockResolvedValue({});

    fireEvent.click(screen.getByRole('button', { name: copy.subscribe.submit }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    const body = apiPost.mock.calls[0]![2] as { monthIds: string[]; plan: string };
    expect(body.plan).toBe('monthly');
    expect(body.monthIds.sort()).toEqual([MONTH_ONE.id, MONTH_TWO.id].sort());
    // ⚠️ And nothing resembling an amount. The server prices the claim from
    // these ids; a checkout that posted a total would be a checkout a student
    // could edit.
    expect(Object.keys(body)).not.toContain('amountCents');
  });
});

/**
 * The link names the months, and the panel opens on them.
 *
 * «شهور جديدة اتفتحت» sends `?month=a,b`; a lecture's padlock sends `?month=a`.
 * Either way the student has already answered «أنهي شهر» by pressing the
 * button, so the plan grid is skipped and the months are ticked.
 */
describe('months named in the link', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('opens on the month picker with every named month already chosen', async () => {
    window.history.replaceState({}, '', `/?month=${MONTH_ONE.id},${MONTH_TWO.id}`);
    respondWith({
      course: liveCourse({ months: [MONTH_ONE, MONTH_TWO] }),
      settings: liveSettings(),
      ownedMonthIds: [],
    });

    render(<Panel />);

    await screen.findByText(copy.subscribe.chooseMonthsTitle);
    expect(screen.queryByText(copy.subscribe.planMonthlyLabel)).toBeNull();
    expect(screen.getByRole('button', { name: new RegExp(MONTH_ONE.title) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: new RegExp(MONTH_TWO.title) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(formatCopy(copy.subscribe.monthsTotal, { price: '400' }))).toBeTruthy();
  });

  it('drops a named month the student already holds', async () => {
    window.history.replaceState({}, '', `/?month=${MONTH_ONE.id},${MONTH_TWO.id}`);
    respondWith({
      course: liveCourse({ months: [MONTH_ONE, MONTH_TWO] }),
      settings: liveSettings(),
      ownedMonthIds: [MONTH_ONE.id],
    });

    render(<Panel />);

    await screen.findByText(copy.subscribe.chooseMonthsTitle);
    expect(screen.getByRole('button', { name: new RegExp(MONTH_TWO.title) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(formatCopy(copy.subscribe.monthsTotal, { price: '200' }))).toBeTruthy();
  });

  it('ignores an id that is not on sale here and shows the plan grid', async () => {
    window.history.replaceState({}, '', '/?month=55555555-5555-4555-8555-555555555555');
    respondWith({
      course: liveCourse({ months: [MONTH_ONE, MONTH_TWO] }),
      settings: liveSettings(),
      ownedMonthIds: [],
    });

    render(<Panel />);

    expect(await screen.findByText(copy.subscribe.planMonthlyLabel)).toBeTruthy();
  });
});

/**
 * A term, «٣ شهور» or a year opens every month. The picker used to answer that
 * with a padlock and «اتشترى قبل كده» on every card — «شهر ٢ مقفول عليّا».
 */
describe('a subscription that already opens every month', () => {
  it('says so once, and offers no «شهر» card', async () => {
    respondWith({
      course: liveCourse({ months: [MONTH_ONE, MONTH_TWO], yearlyPriceCents: 150000 }),
      settings: liveSettings(),
      ownedMonthIds: [MONTH_ONE.id, MONTH_TWO.id],
      coversAll: true,
    });

    render(<Panel />);

    expect(await screen.findByText(copy.subscribe.coversAllNote)).toBeTruthy();
    expect(screen.queryByText(copy.subscribe.planMonthlyLabel)).toBeNull();
    expect(screen.getByText(copy.subscribe.planYearlyLabel)).toBeTruthy();
  });

  it('keeps the «شهر» card on a course that does not sell by month', async () => {
    respondWith({
      course: liveCourse(),
      settings: liveSettings(),
      ownedMonthIds: [],
      coversAll: true,
    });

    render(<Panel />);

    expect(await screen.findByText(copy.subscribe.planMonthlyLabel)).toBeTruthy();
    expect(screen.queryByText(copy.subscribe.coversAllNote)).toBeNull();
  });
});
