import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy';
import { guideCopy } from '@ayman/contracts/copy/guide';
import { formatCopy } from '@ayman/contracts/format';
import { readOnboardingDraft } from '@/components/onboarding/use-onboarding-draft';
import { MONTH_NOV, MONTH_OCT, TERM_ONE, course, detail, productionCatalog } from './guide-fixtures';
import { initialGuideState, type GuideState } from './guide-state';
import { createVoicePlayer, type VoiceAudio } from './guide-voice';

const c = guideCopy;

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('next/image', () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <img src={src} alt={alt} className={className} />
  ),
}));

// The dialog's reads and its one write. Everything it shows comes through
// these five functions, so a test says what the API knows and nothing else.
const data = {
  loadViewer: vi.fn(),
  loadCatalog: vi.fn(),
  loadTaxonomy: vi.fn(),
  loadCourse: vi.fn(),
  loadOwned: vi.fn(),
  loadRails: vi.fn(),
  saveYear: vi.fn(),
};
vi.mock('./guide-data', () => ({
  loadViewer: () => data.loadViewer(),
  loadCatalog: () => data.loadCatalog(),
  loadTaxonomy: () => data.loadTaxonomy(),
  loadCourse: (slug: string) => data.loadCourse(slug),
  loadOwned: (courseId: string) => data.loadOwned(courseId),
  loadRails: () => data.loadRails(),
  saveYear: (...args: unknown[]) => data.saveYear(...args),
  wizardHoldsYear: (year: number) => year <= 2,
}));

const { GuideDialog } = await import('./guide-dialog');

const VISITOR = { signedIn: false, saved: { year: null, systemId: null, stream: null } };
const MONTH_DEC = '55555555-5555-4555-8555-555555555555';

/** Year 1 (Arabic only) and year 2 (one course per stream). */
const Y1 = course({ year: 1, forLanguages: false, slug: 'y1', title: 'برمجة أولى' });
const Y2_AR = course({ year: 2, forLanguages: false, slug: 'y2-ar', title: 'بايثون عربي' });
const Y2_EN = course({ year: 2, forGeneral: false, slug: 'y2-en', title: 'بايثون لغات' });

function voice() {
  const player = createVoicePlayer({
    createAudio: () => ({}) as VoiceAudio,
    storage: undefined,
    keys: new Set(),
  });
  return { ...player.snapshot(), player };
}

const changes = vi.fn();
const minimise = vi.fn();
const close = vi.fn();

/** The dialog is controlled; this holds its state the way `GuideRoot` does. */
function Harness({ initial = initialGuideState() }: { initial?: GuideState }) {
  const [state, setState] = useState(initial);
  return (
    <GuideDialog
      state={state}
      face={null}
      voice={voice()}
      onChange={(next) => {
        changes(next);
        setState(next);
      }}
      onMinimise={minimise}
      onClose={close}
    />
  );
}

const option = (name: string | RegExp) => screen.getByRole('button', { name });
const heading = (name: string) => screen.findByRole('heading', { name });
const lastState = (): GuideState => changes.mock.calls.at(-1)![0] as GuideState;

beforeEach(() => {
  for (const mock of Object.values(data)) mock.mockReset();
  data.loadViewer.mockResolvedValue(VISITOR);
  data.loadCatalog.mockResolvedValue([Y1, Y2_AR, Y2_EN]);
  data.loadTaxonomy.mockResolvedValue(null);
  data.loadCourse.mockImplementation((slug: string) =>
    Promise.resolve(
      detail([Y1, Y2_AR, Y2_EN].find((row) => row.slug === slug)!, {
        months: [MONTH_OCT, MONTH_NOV],
        terms: [TERM_ONE],
      }),
    ),
  );
  data.loadOwned.mockResolvedValue(null);
  data.loadRails.mockResolvedValue({ instapay: true, vodafoneCash: true });
  data.saveYear.mockResolvedValue(true);
  router.push.mockReset();
  changes.mockReset();
  minimise.mockReset();
  close.mockReset();
  window.sessionStorage.clear();
});

afterEach(cleanup);

describe('the guide dialog', () => {
  it('is a real modal dialog, named by the question on screen', async () => {
    render(<Harness />);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName(c.welcome.title);
    // The spoken line is exposed as text and describes the dialog.
    expect(dialog).toHaveAccessibleDescription(expect.stringContaining('أهلًا وسهلًا'));
    expect(within(dialog).getByText(formatCopy(c.stepOf, { n: 1, total: 6 }))).toBeTruthy();
  });

  it('greets in the teacher’s name, taken from the copy table', async () => {
    render(<Harness />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText(new RegExp(copy.site.instructor)).length).toBeGreaterThan(0);
  });

  it('moves to the next step on a tap, with nothing selected beforehand', async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: c.welcome.start }));

    await heading(c.year.title);
    const years = [option(copy.years.year1), option(copy.years.year2)];
    // Nothing is chosen for the student.
    for (const year of years) expect(year).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(years[1]!);

    // No «next» button: the tap is the answer and the step.
    // «البرمجة بندرسها…» — this stack teaches code, so the subject is named.
    expect(c.stream.title).toContain('البرمجة بندرسها');
    await heading(c.stream.title);
    expect(lastState()).toMatchObject({ step: 'stream', selection: { year: 'bacalorya:2' } });
    for (const stream of [option(new RegExp(copy.stream.general)), option(new RegExp(copy.stream.languages))]) {
      expect(stream).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('stays mounted while the steps change — no close and reopen', async () => {
    render(<Harness />);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: c.welcome.start }));
    await heading(c.year.title);
    fireEvent.click(option(copy.years.year2));
    await heading(c.stream.title);
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(dialog.isConnected).toBe(true);
  });

  it('skips a question with one answer — year 1 here has one stream', async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: c.welcome.start }));
    await heading(c.year.title);
    fireEvent.click(option(copy.years.year1));

    // Straight to the course: «عربي ولا لغات؟» is never asked.
    await heading(c.course.title);
    expect(screen.queryByText(c.stream.title)).toBeNull();
    expect(screen.getByText(Y1.title)).toBeTruthy();
  });

  it('shows real plans with their prices, and only the plans the course sells', async () => {
    render(<Harness initial={{ ...initialGuideState(), step: 'plan', selection: pickedUpTo('course') }} />);
    await heading(c.plan.title);

    // The heading is up while the course's plans are still being read; the
    // rows arrive with the live read.
    const monthly = await screen.findByRole('button', { name: new RegExp(copy.subscribe.planMonthlyLabel) });
    expect(monthly).toHaveTextContent('200');
    expect(option(new RegExp(TERM_ONE.title))).toHaveTextContent('700');
    // This course has no yearly price, so there is no yearly row.
    expect(screen.queryByText(c.plan.yearlyLabel)).toBeNull();
    expect(monthly).toHaveAttribute('aria-pressed', 'false');
  });

  it('asks «which months?» after «شهر», and not after a term', async () => {
    render(<Harness initial={{ ...initialGuideState(), step: 'plan', selection: pickedUpTo('course') }} />);
    await heading(c.plan.title);
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(copy.subscribe.planMonthlyLabel) }));
    await heading(c.month.title);
    expect(screen.getByRole('checkbox', { name: new RegExp(MONTH_OCT.title) })).toHaveAttribute(
      'aria-checked',
      'false',
    );

    cleanup();
    render(<Harness initial={{ ...initialGuideState(), step: 'plan', selection: pickedUpTo('course') }} />);
    await heading(c.plan.title);
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(TERM_ONE.title) }));
    await heading(c.account.title);
    expect(screen.queryByText(c.month.title)).toBeNull();
  });

  it('lets several months be ticked, totals them live, and moves on only with «التالي»', async () => {
    render(
      <Harness
        initial={{ ...initialGuideState(), step: 'month', selection: { ...pickedUpTo('course'), plan: 'monthly' } }}
      />,
    );
    await heading(c.month.title);
    const october = () => screen.getByRole('checkbox', { name: new RegExp(MONTH_OCT.title) });
    const november = () => screen.getByRole('checkbox', { name: new RegExp(MONTH_NOV.title) });
    const next = () => screen.getByRole('button', { name: c.month.next });

    // Nothing ticked for the student, no total to show, nowhere to go yet.
    expect(october()).toHaveAttribute('aria-checked', 'false');
    expect(november()).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(c.month.pickOne)).toBeTruthy();
    expect(next()).toBeDisabled();

    fireEvent.click(november());
    // A tick does NOT leave the step — this is the one question with a «next».
    expect(screen.getByRole('heading', { name: c.month.title })).toBeTruthy();
    expect(november()).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(formatCopy(c.month.total, { price: '200' }))).toBeTruthy();
    expect(next()).toBeEnabled();

    fireEvent.click(october());
    expect(screen.getByText(formatCopy(c.month.total, { price: '400' }))).toBeTruthy();

    // Un-ticking takes it back off the total.
    fireEvent.click(november());
    expect(november()).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(formatCopy(c.month.total, { price: '200' }))).toBeTruthy();
    fireEvent.click(november());

    fireEvent.click(next());
    await heading(c.account.title);
    // Both months and their sum on the summary…
    const summary = screen.getByText(c.summary.total).closest('dl')!;
    expect(summary).toHaveTextContent(MONTH_OCT.title);
    expect(summary).toHaveTextContent(MONTH_NOV.title);
    expect(summary).toHaveTextContent('400');

    // …and both handed to the real checkout, as the list it already opens ticked.
    fireEvent.click(screen.getByRole('button', { name: c.account.create }));
    const checkout = `/courses/y2-en/subscribe?month=${MONTH_OCT.id},${MONTH_NOV.id}`;
    expect(router.push).toHaveBeenCalledWith(`/register?next=${encodeURIComponent(checkout)}`);
  });

  it('does not offer a month the student already holds', async () => {
    data.loadViewer.mockResolvedValue({
      signedIn: true,
      saved: { year: 2, systemId: null, stream: 'languages' },
    });
    data.loadCourse.mockResolvedValue(
      detail(Y2_EN, { months: [MONTH_OCT, MONTH_NOV, { ...MONTH_NOV, id: MONTH_DEC, monthIndex: 3, title: 'شهر ديسمبر' }] }),
    );
    data.loadOwned.mockResolvedValue({ ownedMonthIds: [MONTH_OCT.id], coversAll: false, pending: false });
    render(
      <Harness
        initial={{ ...initialGuideState(), step: 'month', selection: { ...pickedUpTo('course'), plan: 'monthly' } }}
      />,
    );
    await heading(c.month.title);
    expect(data.loadOwned).toHaveBeenCalledWith(Y2_EN.id);
    expect(screen.queryByRole('checkbox', { name: new RegExp(MONTH_OCT.title) })).toBeNull();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('does not ask a visitor’s browser what a visitor owns', async () => {
    render(<Harness initial={{ ...initialGuideState(), step: 'plan', selection: pickedUpTo('course') }} />);
    await screen.findByRole('button', { name: new RegExp(copy.subscribe.planMonthlyLabel) });
    expect(data.loadOwned).not.toHaveBeenCalled();
  });

  it('collects nothing when a claim for the course is already in review', async () => {
    data.loadViewer.mockResolvedValue({
      signedIn: true,
      saved: { year: 2, systemId: null, stream: 'languages' },
    });
    data.loadOwned.mockResolvedValue({ ownedMonthIds: [], coversAll: false, pending: true });
    render(<Harness initial={{ ...initialGuideState(), step: 'plan', selection: pickedUpTo('course') }} />);
    await heading(copy.subscribe.pendingTitle);
    expect(screen.getByText(copy.subscribe.pendingStatus)).toBeTruthy();
    expect(screen.queryByRole('button', { name: new RegExp(copy.subscribe.planMonthlyLabel) })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: c.plan.pendingAction }));
    expect(router.push).toHaveBeenCalledWith('/courses/y2-en/subscribe');
  });

  it('walks a visitor to the REGISTER page with the checkout as its destination', async () => {
    render(
      <Harness
        initial={{
          ...initialGuideState(),
          step: 'account',
          selection: { ...pickedUpTo('course'), plan: 'monthly', months: [MONTH_NOV.id] },
        }}
      />,
    );
    await heading(c.account.title);

    // The summary is the real course, plan, month and price.
    const summary = screen.getByText(c.summary.total).closest('dl')!;
    expect(summary).toHaveTextContent(Y2_EN.title);
    expect(summary).toHaveTextContent(MONTH_NOV.title);
    expect(summary).toHaveTextContent('200');
    // …and the transfer methods this stack has switched on.
    expect(await screen.findByText(new RegExp(copy.subscribe.railInstapay))).toBeTruthy();

    // No form in the dialog: no field to type into anywhere.
    expect(screen.queryByRole('textbox')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: c.account.create }));

    const checkout = `/courses/y2-en/subscribe?month=${MONTH_NOV.id}`;
    expect(router.push).toHaveBeenCalledWith(`/register?next=${encodeURIComponent(checkout)}`);
    // The dialog closes (the helper circle takes over); the guide is not over.
    expect(lastState()).toMatchObject({ open: false, step: 'account' });
    // The year and the stream are waiting in the onboarding wizard's draft.
    expect(readOnboardingDraft()).toMatchObject({ year: 2, schoolStream: 'languages' });
  });

  it('sends a visitor who already has an account to sign in, same destination', async () => {
    render(
      <Harness
        initial={{
          ...initialGuideState(),
          step: 'account',
          selection: { ...pickedUpTo('course'), plan: `term:${TERM_ONE.id}` },
        }}
      />,
    );
    await heading(c.account.title);
    fireEvent.click(screen.getByRole('button', { name: c.account.haveOne }));
    const checkout = `/courses/y2-en/subscribe?plan=term&term=${TERM_ONE.id}`;
    expect(router.push).toHaveBeenCalledWith(`/login?next=${encodeURIComponent(checkout)}`);
  });

  it('does not ask a signed-in student the year and stream they gave at sign-up', async () => {
    data.loadViewer.mockResolvedValue({
      signedIn: true,
      saved: { year: 2, systemId: null, stream: 'general' },
    });
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: c.welcome.start }));

    await heading(c.course.title);
    expect(screen.getByText(Y2_AR.title)).toBeTruthy();
    expect(screen.queryByText(c.year.title)).toBeNull();
    // They can still say the year on file is wrong.
    fireEvent.click(screen.getByRole('button', { name: c.course.otherYear }));
    await heading(c.year.title);
    expect(lastState()).toMatchObject({ askSection: true, selection: { year: null, stream: null } });
  });

  it('takes a signed-in student straight to the real checkout', async () => {
    data.loadViewer.mockResolvedValue({
      signedIn: true,
      saved: { year: 2, systemId: null, stream: 'general' },
    });
    render(
      <Harness
        initial={{
          ...initialGuideState(),
          step: 'pay',
          selection: { year: 'bacalorya:2', stream: 'general', course: 'y2-ar', plan: `term:${TERM_ONE.id}`, months: [] },
        }}
      />,
    );
    await heading(c.pay.title);
    fireEvent.click(screen.getByRole('button', { name: c.pay.go }));

    expect(router.push).toHaveBeenCalledWith(`/courses/y2-ar/subscribe?plan=term&term=${TERM_ONE.id}`);
    expect(lastState()).toMatchObject({ open: false });
    // Same year as the profile: nothing to write.
    expect(data.saveYear).not.toHaveBeenCalled();
  });

  it('writes the year to the profile only when the student picked a different one', async () => {
    data.loadViewer.mockResolvedValue({
      signedIn: true,
      saved: { year: 1, systemId: null, stream: 'general' },
    });
    render(
      <Harness
        initial={{
          ...initialGuideState(),
          step: 'pay',
          askSection: true,
          selection: { year: 'bacalorya:2', stream: 'general', course: 'y2-ar', plan: `term:${TERM_ONE.id}`, months: [] },
        }}
      />,
    );
    await heading(c.pay.title);
    fireEvent.click(screen.getByRole('button', { name: c.pay.go }));
    expect(data.saveYear).toHaveBeenCalledTimes(1);
    expect(data.saveYear.mock.calls[0]![0]).toMatchObject({ key: 'bacalorya:2', year: 2 });
  });

  it('ends on the course page when the course has nothing on sale', async () => {
    data.loadCourse.mockResolvedValue(detail({ ...Y1, monthlyPriceCents: null }));
    render(<Harness initial={{ ...initialGuideState(), step: 'plan', selection: { ...pickedUpTo('course'), year: 'bacalorya:1', stream: 'general', course: 'y1' } }} />);
    await heading(c.plan.noneTitle);
    fireEvent.click(screen.getByRole('button', { name: c.plan.noneAction }));
    expect(router.push).toHaveBeenCalledWith('/courses/y1');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('goes back one asked step at a time', async () => {
    render(<Harness initial={{ ...initialGuideState(), step: 'stream', selection: { ...pickedUpTo('year') } }} />);
    await heading(c.stream.title);
    fireEvent.click(screen.getByRole('button', { name: c.back }));
    await heading(c.year.title);
    // The answer they gave is shown as theirs.
    expect(option(copy.years.year2)).toHaveAttribute('aria-pressed', 'true');
  });

  it('never draws a step whose earlier question is unanswered', async () => {
    // «يلا نبدأ» pressed before the catalogue arrived stores a later step.
    render(<Harness initial={{ ...initialGuideState(), step: 'course' }} />);
    await heading(c.year.title);
  });

  it('says so, with a retry, when the catalogue cannot be read', async () => {
    data.loadCatalog.mockRejectedValueOnce(new Error('offline'));
    render(<Harness initial={{ ...initialGuideState(), step: 'year' }} />);
    expect(await screen.findByText(c.loadFailed)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: c.retry }));
    await heading(c.year.title);
  });

  it('minimises from its button, from «بعدين» and from Escape — and closes only from ×', async () => {
    render(<Harness />);
    const dialog = await screen.findByRole('dialog');

    // Two controls carry this name here: the band's own button, and the
    // primitive's built-in one, which `guide.css` hides (`display: none`) and
    // jsdom — which loads no stylesheet — still sees. Both minimise.
    const [inBand, builtIn] = within(dialog).getAllByRole('button', { name: c.minimise });
    fireEvent.click(inBand!);
    expect(minimise).toHaveBeenCalledTimes(1);
    expect(builtIn!.parentElement).toBe(dialog);

    fireEvent.click(screen.getByRole('button', { name: c.later }));
    expect(minimise).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(minimise).toHaveBeenCalledTimes(3));
    expect(close).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: c.close }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('draws no play or mute button on a stack with no recordings', async () => {
    render(<Harness />);
    await screen.findByRole('dialog');
    expect(screen.queryByRole('button', { name: c.listen })).toBeNull();
    expect(screen.queryByRole('button', { name: c.mute })).toBeNull();
  });

  it('marks the current station on the road', async () => {
    render(<Harness initial={{ ...initialGuideState(), step: 'stream', selection: pickedUpTo('year') }} />);
    await heading(c.stream.title);
    const current = document.querySelector('[aria-current="step"]')!;
    expect(current).toHaveTextContent(c.stations.stream);
    expect(document.querySelectorAll('.guide-road__stop[data-state="done"]')).toHaveLength(2);
  });
});

/**
 * The catalogue as it really is (`productionCatalog` in the fixtures): one
 * course per year and stream, «شهر» / «الترم الاول» / «السنة كلها» on each, and
 * a second term that is not open yet on the year-2 Arabic course.
 */
describe('the plan step, on the live catalogue', () => {
  const live = productionCatalog();

  beforeEach(() => {
    data.loadCatalog.mockResolvedValue(live.courses);
    data.loadCourse.mockImplementation((slug: string) => Promise.resolve(live.details[slug]));
  });

  const onPlan = (stream: 'general' | 'languages') => ({
    ...initialGuideState(),
    step: 'plan' as const,
    selection: { year: 'bacalorya:2', stream, course: `y2-${stream}`, plan: null, months: [] },
  });

  /** The rows of the plan list, top to bottom: a button, or a closed term. */
  const rows = () =>
    [...document.querySelectorAll('.guide-opts > .guide-opt')].map((row) => ({
      text: row.textContent ?? '',
      button: row.tagName === 'BUTTON',
    }));

  it('lists «شهر», every term by its own name, then «السنة كلها» — in that order', async () => {
    render(<Harness initial={onPlan('general')} />);
    await screen.findByRole('button', { name: new RegExp(copy.subscribe.planMonthlyLabel) });

    const list = rows();
    expect(list.map((row) => row.button)).toEqual([true, true, false, true]);
    expect(list[0]!.text).toContain(copy.subscribe.planMonthlyLabel);
    expect(list[0]!.text).toContain('150');
    expect(list[1]!.text).toContain('الترم الاول');
    expect(list[1]!.text).toContain('450');
    expect(list[2]!.text).toContain('الترم التاني');
    expect(list[3]!.text).toContain(c.plan.yearlyLabel);
    expect(list[3]!.text).toContain('950');
  });

  it('shows the term that is not open yet, with the note — and it cannot be chosen', async () => {
    render(<Harness initial={onPlan('general')} />);
    await screen.findByRole('button', { name: new RegExp(copy.subscribe.planMonthlyLabel) });

    const closed = screen.getByText('الترم التاني').closest('.guide-opt')!;
    expect(closed).toHaveTextContent(c.plan.notOpenYet);
    expect(closed).toHaveAttribute('aria-disabled', 'true');
    // Not a control at all: nothing to press, nothing to tab to, no price.
    expect(closed.tagName).toBe('DIV');
    expect(closed.querySelector('.guide-opt__price')).toBeNull();
    expect(screen.queryByRole('button', { name: /الترم التاني/ })).toBeNull();

    changes.mockClear();
    fireEvent.click(closed);
    expect(changes).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: c.plan.title })).toBeTruthy();
  });

  it('shows no second term where the course has none', async () => {
    render(<Harness initial={onPlan('languages')} />);
    await screen.findByRole('button', { name: new RegExp(copy.subscribe.planMonthlyLabel) });
    expect(rows().map((row) => row.button)).toEqual([true, true, true]);
    expect(screen.queryByText(c.plan.notOpenYet)).toBeNull();
  });

  it('makes no savings claim anywhere on the plan step', async () => {
    render(<Harness initial={onPlan('general')} />);
    await screen.findByRole('button', { name: new RegExp(copy.subscribe.planMonthlyLabel) });
    expect(screen.getByRole('dialog').textContent).not.toMatch(/أوفر|بتوفّر|توفير|خصم|أرخص|أحسن سعر/u);
  });

  it('takes the open term straight to the real checkout, by its own id', async () => {
    data.loadViewer.mockResolvedValue({
      signedIn: true,
      saved: { year: 2, systemId: null, stream: 'general' },
    });
    render(<Harness initial={onPlan('general')} />);
    fireEvent.click(await screen.findByRole('button', { name: /الترم الاول/ }));
    await heading(c.pay.title);
    fireEvent.click(screen.getByRole('button', { name: c.pay.go }));

    const term = live.details['y2-general']!.terms[0]!;
    expect(router.push).toHaveBeenCalledWith(`/courses/y2-general/subscribe?plan=term&term=${term.id}`);
    expect(router.push.mock.calls[0]![0]).not.toContain(live.details['y2-general']!.upcomingTerms![0]!.id);
  });

  it('offers the three open months as checkboxes after «شهر»', async () => {
    render(<Harness initial={onPlan('general')} />);
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(copy.subscribe.planMonthlyLabel) }));
    await heading(c.month.title);
    expect(screen.getAllByRole('checkbox').map((box) => box.textContent)).toEqual([
      expect.stringContaining('الشهر الأول'),
      expect.stringContaining('الشهر الثاني'),
      expect.stringContaining('الشهر الثالث'),
    ]);
  });
});

/** A selection answered up to and including `field`, on the languages course. */
function pickedUpTo(field: 'year' | 'course') {
  const year = { year: 'bacalorya:2', stream: null, course: null, plan: null, months: [] as string[] };
  if (field === 'year') return year;
  return { ...year, stream: 'languages' as const, course: 'y2-en' };
}
