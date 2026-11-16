'use client';

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, LoaderCircle, Minus, X } from 'lucide-react';
import { arabicCount } from '@ayman/contracts/arabic-count';
import type { CatalogCourse, CatalogCourseDetail } from '@ayman/contracts/catalog';
import { copy } from '@ayman/contracts/copy';
import { guideCopy, type GuideVoiceKey } from '@ayman/contracts/copy/guide';
import { formatCopy } from '@ayman/contracts/format';
import type { Taxonomy } from '@ayman/contracts/taxonomy';
import { Dialog, DialogContent, DialogTitle } from '@ayman/ui/components/dialog';
import { monthLessonForms } from '@/lib/month-lesson-count';
import { formatEGP } from '@/lib/price';
import { withNext } from '@/lib/safe-next';
import { gradesOf } from '@/lib/tenant-grades';
import { TEACHES_CODE } from '@/lib/tenant-subject';
import {
  loadCatalog,
  loadCourse,
  loadOwned,
  loadRails,
  loadTaxonomy,
  loadViewer,
  saveYear,
  wizardHoldsYear,
  type Rails,
  type Viewer,
} from './guide-data';
import type { GuideFace } from './guide-launcher';
import { seedOnboardingDraft } from './guide-onboarding-seed';
import {
  checkoutHref,
  yearKeyOf,
  type Owned,
  type PlanOption,
  type Stream,
  type UpcomingTerm,
} from './guide-options';
import { GUIDE_SCOPE, GuideFaceImage, GuideWalker, MuteButton, SpeechLine, TEACHER_NAME } from './guide-parts';
import {
  nextStep,
  pick,
  previousStep,
  settleStep,
  viewOf,
  type GuideData,
  type GuideSelection,
  type GuideState,
  type GuideView,
  type StepId,
} from './guide-state';
import type { GuideVoice } from './guide-voice';

const c = guideCopy;

/** What the two opening reads brought back. */
type Base =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; viewer: Viewer; courses: CatalogCourse[]; taxonomy: Taxonomy | null };

/** A course detail that could not be read — kept, so the step can say so. */
const FAILED = 'failed' as const;
/** One course's live read: what it sells, and what this student already holds. */
type DetailEntry = { course: CatalogCourseDetail; owned: Owned | null } | typeof FAILED;

const YEAR_COPY = [copy.years.year1, copy.years.year2, copy.years.year3] as const;

/**
 * The stack's own wording for a (system, year), most specific first: the
 * grades its admin configured, then the taxonomy's label for that system's
 * year («الصف الأول الثانوي»، «الصف الثاني بكالوريا»), then the copy table —
 * which is what the public year pages print when neither is available.
 */
function yearLabeller(taxonomy: Taxonomy | null) {
  const grades = gradesOf(taxonomy);
  return (course: { systemSlug: string; year: number }): string =>
    grades.find((grade) => grade.system === course.systemSlug && grade.year === course.year)?.labelAr ??
    taxonomy?.systems
      .find((system) => system.slug === course.systemSlug)
      ?.years.find((row) => row.year === course.year)?.labelAr ??
    YEAR_COPY[course.year - 1] ??
    YEAR_COPY[0];
}

/**
 * «البرمجة بندرسها عربي ولا لغات؟» names the subject, so it is only said where
 * the subject is programming (`TEACHES_CODE` — the original stack and any
 * other that teaches code). Everywhere else the neutral wording.
 */
const STREAM_TITLE = TEACHES_CODE ? c.stream.title : c.stream.titleNeutral;

const price = (cents: number) => formatCopy(copy.subscribe.priceLine, { price: formatEGP(cents) });
const streamLabel = (stream: Stream) => (stream === 'general' ? copy.stream.general : copy.stream.languages);

/**
 * «مرشد الاشتراك» — the dialog.
 *
 * ## It collects; it does not sell
 *
 * Every number on these screens is read live from the catalogue
 * (`guide-data.ts`) and every option is one the course really offers
 * (`guide-options.ts`). The last step does not take money: it opens the
 * platform's own checkout (`/courses/:slug/subscribe`) on what was picked, and
 * that panel re-reads the prices, validates the selection and makes the claim.
 * A visitor with no account is taken to the ordinary register page first, with
 * the checkout as its `next`. There is no form and no payment step in here to
 * drift from the real ones.
 *
 * ## One dialog, mounted once
 *
 * A tap on an option moves to the next step by changing what the BODY shows;
 * the frame, the journey band and the road stay mounted, so nothing closes and
 * reopens between questions. Nothing is selected until the student selects
 * it — the one exception is an answer there was no question for (a single
 * year, a saved profile), which is settled silently and never drawn as a
 * choice.
 *
 * ## The primitive
 *
 * `@ayman/ui`'s `Dialog` (Radix): the focus trap, Escape, the scroll lock,
 * `aria-modal`, the portal to `<body>` and the Android back gesture are its
 * job, not this file's. Its `onOpenChange(false)` — Escape, a tap on the
 * overlay, back — is «minimise» here, never «close»: none of those is somebody
 * saying they do not want the guide. Its built-in × is hidden by `guide.css`
 * (the band draws its own minimise and close) but stays in the DOM, because
 * the back-gesture stop closes the dialog by clicking it.
 */
export function GuideDialog({
  state,
  face,
  voice,
  onChange,
  onMinimise,
  onClose,
}: {
  state: GuideState;
  face: GuideFace | null;
  voice: GuideVoice;
  onChange: (next: GuideState) => void;
  onMinimise: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const sayId = useId();
  const [base, setBase] = useState<Base>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [details, setDetails] = useState<Record<string, DetailEntry>>({});
  const [rails, setRails] = useState<Rails | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  /*
   * The opening reads, together: who is looking, what is taught, and the
   * stack's wording for its years. The welcome step does not wait for them —
   * it has nothing of theirs on it — so they land while the first line is
   * being read.
   */
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadViewer(), loadCatalog(), loadTaxonomy()]).then(
      ([viewer, courses, taxonomy]) => {
        if (!cancelled) setBase({ status: 'ready', viewer, courses, taxonomy });
      },
      () => {
        if (!cancelled) setBase({ status: 'failed' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const data = useMemo<GuideData>(() => {
    if (base.status !== 'ready') {
      return { signedIn: false, courses: [], saved: { yearKey: null, year: null, stream: null }, details: {} };
    }
    const { saved, signedIn } = base.viewer;
    const systemSlug = base.taxonomy?.systems.find((system) => system.id === saved.systemId)?.slug ?? null;
    const ready: Record<string, CatalogCourseDetail> = {};
    const owned: Record<string, Owned> = {};
    for (const [slug, entry] of Object.entries(details)) {
      if (entry === FAILED) continue;
      ready[slug] = entry.course;
      if (entry.owned) owned[slug] = entry.owned;
    }
    return {
      signedIn,
      courses: base.courses,
      saved: {
        yearKey: systemSlug !== null && saved.year !== null ? yearKeyOf({ systemSlug, year: saved.year }) : null,
        year: saved.year,
        stream: saved.stream,
      },
      details: ready,
      owned,
    };
  }, [base, details]);

  const labelOf = useMemo(() => yearLabeller(base.status === 'ready' ? base.taxonomy : null), [base]);
  const view = useMemo(
    () => viewOf(data, state.selection, { askSection: state.askSection, labelOf }),
    [data, state.selection, state.askSection, labelOf],
  );

  // Until the reads land there are no real steps to normalise against, and
  // «normalising» would walk a resumed guide back to the start.
  const ready = base.status === 'ready';
  const step = ready ? settleStep(state.step, view) : state.step;
  const stepIndex = Math.max(0, view.steps.indexOf(step));

  /*
   * The chosen course's plans, months and terms — one live read per course,
   * started as soon as the course is known (usually while the course step is
   * still on screen) rather than when the plan step is reached.
   */
  const courseSlug = view.course?.slug ?? null;
  const courseId = view.course?.id ?? null;
  const signedIn = data.signedIn;
  const detailKnown = courseSlug !== null && courseSlug in details;
  useEffect(() => {
    if (courseSlug === null || courseId === null || detailKnown) return;
    let cancelled = false;
    // What the student already holds rides with the same read, so a plan row
    // is never drawn and then taken away. Only asked for somebody signed in:
    // a visitor holds nothing, and the route would only answer 401.
    Promise.all([loadCourse(courseSlug), signedIn ? loadOwned(courseId) : null]).then(
      ([course, owned]) => {
        if (!cancelled) setDetails((current) => ({ ...current, [courseSlug]: { course, owned } }));
      },
      () => {
        if (!cancelled) setDetails((current) => ({ ...current, [courseSlug]: FAILED }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [courseSlug, courseId, signedIn, detailKnown]);

  // The transfer rails, for one line on the last step. Optional: the line is
  // simply not drawn when this cannot be read.
  const wantsRails = step === 'account' || step === 'pay';
  useEffect(() => {
    if (!wantsRails || rails !== null) return;
    let cancelled = false;
    loadRails().then(
      (next) => {
        if (!cancelled) setRails(next);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [wantsRails, rails]);

  const detailFailed = courseSlug !== null && details[courseSlug] === FAILED;
  const line = lineFor(step, view);

  // A new step: its line is spoken (if the student has touched the guide and
  // has not muted it — the player decides), the body starts at the top, and
  // focus moves to the question so a screen reader reads it.
  useEffect(() => {
    voice.player.say(line);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    titleRef.current?.focus({ preventScroll: true });
    // `voice.player` is stable for the life of the guide.
  }, [line, step, voice.player]);

  function go(target: StepId, selection: GuideSelection = view.selection, extra: Partial<GuideState> = {}) {
    onChange({ ...state, ...extra, step: target, selection });
  }

  /** An answer was tapped: store it and move straight on. */
  function choose<K extends keyof GuideSelection>(field: K, value: GuideSelection[K]) {
    const selection = pick(view.selection, field, value);
    const settled = viewOf(data, selection, { askSection: state.askSection, labelOf });
    go(nextStep(step, settled.steps), selection);
  }

  const yearOption = view.years.find((option) => option.key === view.selection.year) ?? null;
  const href = view.course ? checkoutHref(view.course.slug, view.plan, view.chosenMonths) : null;

  /** The walk to the register (or sign-in) page — see the note at the top. */
  function toAccount(path: '/register' | '/login') {
    if (href === null) return;
    seedOnboardingDraft({
      year: yearOption,
      stream: view.selection.stream,
      includeYear: yearOption !== null && wizardHoldsYear(yearOption.year),
    });
    // Closed, not ended: the helper circle picks the guide up on the next page.
    onChange({ ...state, step, selection: view.selection, open: false });
    router.push(withNext(path, href));
  }

  function toCheckout() {
    if (href === null) return;
    // The year this student picked, when it is not the one on file. Fire and
    // forget — see `saveYear`.
    if (
      data.signedIn &&
      yearOption !== null &&
      base.status === 'ready' &&
      (data.saved.yearKey ?? null) !== yearOption.key &&
      data.saved.year !== yearOption.year
    ) {
      void saveYear(yearOption, base.taxonomy);
    }
    onChange({ ...state, step, selection: view.selection, open: false });
    router.push(href);
  }

  function retryBase() {
    setBase({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  function retryDetail() {
    if (courseSlug === null) return;
    // Forgetting the failure is what asks again — see the detail effect.
    setDetails((current) => {
      const next = { ...current };
      delete next[courseSlug];
      return next;
    });
  }

  const back = ready ? previousStep(step, view.steps) : null;
  const total = view.steps.length;

  let title: string;
  let body: ReactNode = null;
  let primary: { label: string; onClick: () => void; busy?: boolean; disabled?: boolean } | null = null;
  let secondary: { label: string; onClick: () => void } | null = null;

  if (step === 'welcome') {
    title = c.welcome.title;
    body = <p className="guide-hint">{c.welcome.hint}</p>;
    primary = { label: c.welcome.start, onClick: () => go(nextStep(step, view.steps)), busy: base.status === 'loading' };
    secondary = { label: c.later, onClick: onMinimise };
  } else if (base.status !== 'ready') {
    title = c.stations[step];
    body = <Waiting failed={base.status === 'failed'} onRetry={() => retryBase()} />;
  } else if (step === 'year') {
    title = c.year.title;
    body = (
      <Options>
        {view.years.map((option) => (
          <Option
            key={option.key}
            pressed={state.selection.year === option.key}
            title={option.label}
            onClick={() => choose('year', option.key)}
          />
        ))}
      </Options>
    );
  } else if (step === 'stream') {
    title = STREAM_TITLE;
    body = (
      <Options two>
        {view.streams.map((stream) => (
          <Option
            key={stream}
            pressed={state.selection.stream === stream}
            title={streamLabel(stream)}
            sub={stream === 'general' ? c.stream.generalSub : c.stream.languagesSub}
            onClick={() => choose('stream', stream)}
          />
        ))}
      </Options>
    );
  } else if (step === 'course') {
    const changeYear = view.fromProfile && view.years.length > 1;
    const otherYear = changeYear ? (
      <button
        type="button"
        className="guide-link"
        onClick={() =>
          // Ask the questions the profile had answered — and keep nothing
          // that depended on the old answers.
          go('year', pick(view.selection, 'year', null), { askSection: true })
        }
      >
        {c.course.otherYear}
      </button>
    ) : null;

    if (view.courses.length === 0) {
      title = c.course.pickTitle;
      body = (
        <>
          <p className="guide-hint">{c.course.none}</p>
          {otherYear}
        </>
      );
    } else if (view.courses.length === 1 && view.course) {
      title = c.course.title;
      body = (
        <>
          <CourseCard course={view.course} yearLabel={yearOption?.label ?? null} stream={view.selection.stream} />
          {otherYear}
        </>
      );
      primary = { label: c.course.next, onClick: () => go(nextStep(step, view.steps)) };
    } else {
      title = c.course.pickTitle;
      body = (
        <>
          <Options>
            {view.courses.map((course) => (
              <Option
                key={course.slug}
                pressed={state.selection.course === course.slug}
                title={course.title}
                sub={course.subtitle ?? lessonsOf(course.lessonCount)}
                onClick={() => choose('course', course.slug)}
              />
            ))}
          </Options>
          {otherYear}
        </>
      );
    }
  } else if (step === 'plan') {
    if (view.plans === null) {
      title = c.plan.title;
      body = <Waiting failed={detailFailed} onRetry={() => retryDetail()} />;
    } else if (view.pending) {
      // A claim for this course is already in the review queue. The checkout
      // refuses a second one, so the guide does not collect one: it says so,
      // and the subscribe page shows where the first stands.
      title = copy.subscribe.pendingTitle;
      body = <p className="guide-hint">{copy.subscribe.pendingStatus}</p>;
      primary = {
        label: c.plan.pendingAction,
        onClick: () => {
          if (view.course) router.push(`/courses/${encodeURIComponent(view.course.slug)}/subscribe`);
          onClose();
        },
      };
    } else if (view.plans.length === 0) {
      title = c.plan.noneTitle;
      body = <UpcomingTerms terms={view.upcomingTerms} />;
      primary = {
        label: c.plan.noneAction,
        onClick: () => {
          // Nothing to buy: the course page is where a free course starts and
          // where a closed one explains itself. The guide has nothing to add.
          if (href !== null) router.push(href);
          onClose();
        },
      };
    } else {
      title = c.plan.title;
      // One list, one order: «شهر», each term on sale, each term that is not
      // open yet (shown, never selectable), then the whole year.
      const yearly = view.plans.filter((plan) => plan.kind === 'yearly');
      const rest = view.plans.filter((plan) => plan.kind !== 'yearly');
      const row = (plan: PlanOption) => (
        <Option
          key={plan.id}
          pressed={state.selection.plan === plan.id}
          title={planTitle(plan)}
          sub={planSub(plan)}
          price={plan.priceCents}
          was={plan.wasCents}
          onClick={() => choose('plan', plan.id)}
        />
      );
      body = (
        <>
          {view.course ? <p className="guide-hint">{formatCopy(c.plan.lead, { course: view.course.title })}</p> : null}
          <Options>
            {rest.map(row)}
            <UpcomingTerms terms={view.upcomingTerms} />
            {yearly.map(row)}
          </Options>
        </>
      );
    }
  } else if (step === 'month') {
    title = c.month.title;
    const chosen = view.selection.months;
    const toggle = (id: string) =>
      // Stays on the step: several months are one answer, given with «التالي».
      go('month', {
        ...view.selection,
        months: chosen.includes(id) ? chosen.filter((other) => other !== id) : [...chosen, id],
      });
    body = (
      <>
        <p className="guide-hint">{c.month.hint}</p>
        <Options>
          {view.months.map((month) => (
            <Option
              key={month.id}
              check
              // Only what the student ticked: with more than one month on
              // offer nothing is settled for them (`viewOf`).
              pressed={chosen.includes(month.id)}
              title={month.title}
              sub={lessonsOf(month.lessonCount)}
              price={month.priceCents}
              onClick={() => toggle(month.id)}
            />
          ))}
        </Options>
        {/* The sum of the ticked rows' own live prices — see `totalCents`. */}
        <p className="guide-total" role="status">
          {view.totalCents !== null
            ? formatCopy(c.month.total, { price: formatEGP(view.totalCents) })
            : c.month.pickOne}
        </p>
      </>
    );
    primary = {
      label: c.month.next,
      disabled: chosen.length === 0,
      onClick: () => go(nextStep(step, view.steps)),
    };
  } else {
    const last = step === 'account' ? c.account : c.pay;
    title = last.title;
    body = (
      <>
        <Summary view={view} rails={rails} />
        <ol className="guide-steps">
          {last.steps.map((row) => (
            <li key={row}>{row}</li>
          ))}
        </ol>
      </>
    );
    if (step === 'account') {
      primary = { label: c.account.create, onClick: () => toAccount('/register') };
      secondary = { label: c.account.haveOne, onClick: () => toAccount('/login') };
    } else {
      primary = { label: c.pay.go, onClick: toCheckout };
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onMinimise();
      }}
    >
      <DialogContent
        closeLabel={c.minimise}
        className="guide-dialog guide-scope"
        aria-describedby={sayId}
        {...GUIDE_SCOPE}
        // Any touch inside the guide is the gesture a browser wants before it
        // lets a page speak; from here a new step's line may start by itself.
        onPointerDownCapture={() => voice.player.unlock()}
        onKeyDownCapture={() => voice.player.unlock()}
        // Focus goes to the question, not to the first button in the band.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus({ preventScroll: true });
        }}
      >
        <header className="guide-band">
          <div className="guide-band__who">
            <GuideFaceImage face={face} size={46} className="guide-band__face" />
            <span className="guide-band__name">
              <b>{TEACHER_NAME}</b>
              <small>{formatCopy(c.stepOf, { n: stepIndex + 1, total })}</small>
            </span>
            {voice.player.canPlay(line) ? <MuteButton voice={voice} className="guide-band__btn" /> : null}
            <button type="button" className="guide-band__btn" aria-label={c.minimise} onClick={onMinimise}>
              <Minus size={18} aria-hidden="true" />
            </button>
            <button type="button" className="guide-band__btn" aria-label={c.close} onClick={onClose}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <ol
            className="guide-road"
            style={{ '--guide-n': total, '--guide-at': stepIndex } as CSSProperties}
          >
            {view.steps.map((id, index) => (
              <li
                key={id}
                className="guide-road__stop"
                data-state={index < stepIndex ? 'done' : index === stepIndex ? 'current' : 'ahead'}
                aria-current={index === stepIndex ? 'step' : undefined}
              >
                <i aria-hidden="true" />
                <span>{c.stations[id]}</span>
              </li>
            ))}
            <li className="guide-walker" aria-hidden="true">
              {/* Re-keyed per step so the hop replays; the slide along the road
                  is a transition on the parent's position. */}
              <span key={stepIndex} className="guide-walker__hop">
                <GuideWalker />
              </span>
            </li>
          </ol>
        </header>

        <div ref={bodyRef} className="guide-body">
          <SpeechLine id={sayId} line={line} voice={voice} />
          {/* Keyed by step: the body swaps (and its entrance replays) while
              everything around it stays mounted. */}
          <div key={step} className="guide-step">
            <DialogTitle ref={titleRef} tabIndex={-1} className="guide-q">
              {title}
            </DialogTitle>
            {body}
          </div>
        </div>

        {back !== null || primary !== null || secondary !== null ? (
          <footer className="guide-foot">
            {back !== null ? (
              <button type="button" className="guide-btn" onClick={() => go(back)}>
                {c.back}
              </button>
            ) : null}
            {primary !== null ? (
              <button
                type="button"
                className="guide-btn guide-btn--primary"
                onClick={primary.onClick}
                // Not disabled while the catalogue loads: a press then lands
                // on a step that shows it is loading, which is an answer. A
                // dead button is not. The one disabled state is «التالي» with
                // no month ticked, and the line above it says why.
                disabled={primary.disabled === true}
              >
                {primary.label}
                {primary.busy ? (
                  <LoaderCircle className="guide-spin" size={16} aria-hidden="true" />
                ) : (
                  <ArrowLeft size={16} aria-hidden="true" />
                )}
              </button>
            ) : null}
            {secondary !== null ? (
              <button type="button" className="guide-btn guide-btn--ghost" onClick={secondary.onClick}>
                {secondary.label}
              </button>
            ) : null}
          </footer>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Which recorded line belongs to the step on screen. */
export function lineFor(step: StepId, view: Pick<GuideView, 'courses' | 'plans'>): GuideVoiceKey {
  if (step === 'course') return view.courses.length > 1 ? 'course-pick' : 'course';
  if (step === 'plan') return view.plans !== null && view.plans.length === 0 ? 'no-plans' : 'plan';
  return step;
}

const lessonsOf = (count: number) => (count > 0 ? arabicCount(count, monthLessonForms()) : undefined);

function planTitle(plan: PlanOption): string {
  if (plan.kind === 'monthly') return copy.subscribe.planMonthlyLabel;
  if (plan.kind === 'yearly') return c.plan.yearlyLabel;
  return plan.title;
}

function planSub(plan: PlanOption): string {
  if (plan.kind === 'monthly') return plan.byMonth ? c.plan.monthlyPickSub : c.plan.monthlySub;
  if (plan.kind === 'yearly') return c.plan.yearlySub;
  return c.plan.termSub;
}

function Options({ two = false, children }: { two?: boolean; children: ReactNode }) {
  return <div className={two ? 'guide-opts guide-opts--two' : 'guide-opts'}>{children}</div>;
}

/**
 * One answer. A button with `aria-pressed`, not a radio: pressing it IS the
 * action — it answers and moves on — and a radio group promises a selection
 * that waits for a separate «next». The dot is drawn to read as a choice
 * among several, and is decoration.
 */
function Option({
  pressed,
  title,
  sub,
  price: cents,
  was,
  check = false,
  onClick,
}: {
  pressed: boolean;
  title: string;
  sub?: string;
  price?: number;
  was?: number | null;
  /** A row of a multi-select: a checkbox that stays, not an answer that moves on. */
  check?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="guide-opt"
      {...(check ? { role: 'checkbox', 'aria-checked': pressed } : { 'aria-pressed': pressed })}
      data-on={pressed ? '' : undefined}
      onClick={onClick}
    >
      <span className={check ? 'guide-opt__box' : 'guide-opt__dot'} aria-hidden="true" />
      <span className="guide-opt__text">
        <b>
          {title}
          {was != null ? <span className="guide-tag">{copy.subscribe.saleTag}</span> : null}
        </b>
        {sub ? <small>{sub}</small> : null}
      </span>
      {cents !== undefined ? (
        <span className="guide-opt__price">
          {was != null ? <s>{formatEGP(was)}</s> : null}
          <strong>{price(cents)}</strong>
        </span>
      ) : null}
    </button>
  );
}

/**
 * Terms that exist and are not on sale yet — «الترم التاني» while the first is
 * running. Drawn in the list so the year does not look like it has one term,
 * and drawn as what they are: not buttons. There is nothing to press, no
 * price to show, and no id that could reach a checkout link.
 */
function UpcomingTerms({ terms }: { terms: readonly UpcomingTerm[] }) {
  return terms.map((term) => (
    <div key={term.id} className="guide-opt guide-opt--closed" aria-disabled="true">
      <span className="guide-opt__dot" aria-hidden="true" />
      <span className="guide-opt__text">
        <b>{term.title}</b>
        <small>{c.plan.notOpenYet}</small>
      </span>
    </div>
  ));
}

function CourseCard({
  course,
  yearLabel,
  stream,
}: {
  course: CatalogCourse;
  yearLabel: string | null;
  stream: Stream | null;
}) {
  const lessons = lessonsOf(course.lessonCount);
  const facts = [yearLabel, stream ? streamLabel(stream) : null, lessons].filter(
    (fact): fact is string => typeof fact === 'string',
  );
  return (
    <div className="guide-course">
      <b>{course.title}</b>
      {course.subtitle ? <small>{course.subtitle}</small> : null}
      {facts.length > 0 ? (
        <ul className="guide-facts">
          {facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Summary({ view, rails }: { view: GuideView; rails: Rails | null }) {
  const names: string[] = [];
  if (rails?.instapay) names.push(copy.subscribe.railInstapay);
  if (rails?.vodafoneCash) names.push(copy.subscribe.railVodafoneCash);
  const planLine = view.plan
    ? [planTitle(view.plan), ...view.chosenMonths.map((month) => month.title)].join(' · ')
    : null;

  return (
    <div className="guide-sum">
      <dl>
        {view.course ? (
          <div>
            <dt>{c.summary.course}</dt>
            <dd>{view.course.title}</dd>
          </div>
        ) : null}
        {planLine ? (
          <div>
            <dt>{c.summary.plan}</dt>
            <dd>{planLine}</dd>
          </div>
        ) : null}
        {view.totalCents !== null ? (
          <div className="guide-sum__total">
            <dt>{c.summary.total}</dt>
            <dd>{price(view.totalCents)}</dd>
          </div>
        ) : null}
      </dl>
      {names.length > 0 ? (
        <p className="guide-sum__rails">
          {formatCopy(c.summary.rails, { rails: names.join(c.summary.railsJoin) })}
        </p>
      ) : null}
    </div>
  );
}

function Waiting({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  if (failed) {
    return (
      <div className="guide-wait" role="alert">
        <p>{c.loadFailed}</p>
        <button type="button" className="guide-btn" onClick={onRetry}>
          {c.retry}
        </button>
      </div>
    );
  }
  return (
    <p className="guide-wait" role="status">
      <LoaderCircle className="guide-spin" size={20} aria-hidden="true" />
      {c.loading}
    </p>
  );
}
