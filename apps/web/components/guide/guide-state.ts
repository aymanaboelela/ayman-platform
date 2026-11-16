import type { CatalogCourse, CatalogCourseDetail } from '@ayman/contracts/catalog';
import { GUIDE_STATE_KEY, INITIAL_GUIDE_STATE, readStored, writeStored } from './guide-gate';
import {
  coursesFor,
  monthOptions,
  planOptions,
  streamOptions,
  totalCents,
  upcomingTerms,
  yearOptions,
  type MonthOption,
  type Owned,
  type PlanOption,
  type Stream,
  type UpcomingTerm,
  type YearOption,
} from './guide-options';

/**
 * The guide's step machine, and the state it keeps while one is in progress.
 *
 * ## One function decides everything a screen needs: `viewOf`
 *
 * The questions depend on each other in a line — the streams on the year, the
 * courses on both, the plans on the course, the months on the plan — and on
 * data that arrives in two reads. `viewOf` walks that line once, top to
 * bottom, and returns the settled selection, the options at each step and the
 * steps that are actually asked. Nothing else derives any of it, so the road
 * at the top of the dialog, «خطوة n من m» and the body can never disagree.
 *
 * ## A step with one answer is not a step
 *
 * One year on offer, one stream in that year, one plan on the course, one open
 * month: each is settled silently and its station leaves the road. So is a
 * year or stream the student already gave at sign-up (`saved`) — the platform
 * does not ask the same question twice. The course is the exception: it is
 * always shown, because «this is the course» is the thing being bought.
 *
 * ## `sessionStorage`
 *
 * The state has to survive the walk to `/register`, the hard navigation to
 * `/onboarding`, `/welcome` and back to the checkout — and nothing longer. Per
 * tab, gone with it, same reasoning as `use-onboarding-draft.ts`. It holds ids
 * and slugs only: never a price, never a name.
 */

export const STEP_ORDER = ['welcome', 'year', 'stream', 'course', 'plan', 'month', 'account', 'pay'] as const;
export type StepId = (typeof STEP_ORDER)[number];

export interface GuideSelection {
  /** `YearOption.key`. */
  year: string | null;
  stream: Stream | null;
  /** The course's slug. */
  course: string | null;
  /** `PlanOption.id`. */
  plan: string | null;
  /** `MonthOption.id`s — one month or several, bought in one transfer. */
  months: string[];
}

export interface GuideState {
  v: 1;
  step: StepId;
  /** The dialog is on screen; `false` is the minimised pill. */
  open: boolean;
  selection: GuideSelection;
  /** The student asked to change a year the platform had on file. */
  askSection: boolean;
  /** The checkout reported the claim sent — the guide ends on the next page. */
  done: boolean;
}

export const EMPTY_SELECTION: GuideSelection = {
  year: null,
  stream: null,
  course: null,
  plan: null,
  months: [],
};

export function initialGuideState(): GuideState {
  return { ...INITIAL_GUIDE_STATE, selection: { ...INITIAL_GUIDE_STATE.selection, months: [] } };
}

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/**
 * The state as stored, or `null` — hand-narrowed, every field.
 *
 * A value in `sessionStorage` is typed by whoever last wrote it: an older
 * build, a hand in DevTools, or nothing at all. Anything that does not have
 * the shape is treated as no guide in progress, never repaired.
 */
export function parseGuideState(raw: string | null): GuideState | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const source = value as Record<string, unknown>;
    if (source.v !== 1) return null;
    if (!STEP_ORDER.includes(source.step as StepId)) return null;
    const picked = (source.selection ?? {}) as Record<string, unknown>;
    const stream = picked.stream === 'general' || picked.stream === 'languages' ? picked.stream : null;
    return {
      v: 1,
      step: source.step as StepId,
      open: source.open === true,
      selection: {
        year: text(picked.year),
        stream,
        course: text(picked.course),
        plan: text(picked.plan),
        months: Array.isArray(picked.months)
          ? picked.months.filter((id): id is string => typeof id === 'string' && id !== '')
          : [],
      },
      askSection: source.askSection === true,
      done: source.done === true,
    };
  } catch {
    return null;
  }
}

function sessionStore(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function readGuideState(storage: Storage | undefined = sessionStore()): GuideState | null {
  return parseGuideState(readStored(storage, GUIDE_STATE_KEY));
}

/** `null` ends the guide — nothing is left behind in the tab. */
export function writeGuideState(state: GuideState | null, storage: Storage | undefined = sessionStore()): void {
  writeStored(storage, GUIDE_STATE_KEY, state === null ? null : JSON.stringify(state));
}

/**
 * A new answer, with everything that depended on the old one dropped.
 *
 * Changing the year after picking a plan must not leave that plan's id
 * selected against a different course: `viewOf` would drop an id that no
 * longer resolves, but it cannot know a term id happens to exist on both.
 */
export function pick<K extends keyof GuideSelection>(
  selection: GuideSelection,
  field: K,
  value: GuideSelection[K],
): GuideSelection {
  const order: (keyof GuideSelection)[] = ['year', 'stream', 'course', 'plan', 'months'];
  const at = order.indexOf(field);
  const next: GuideSelection = { ...selection, [field]: value };
  for (const later of order.slice(at + 1)) {
    if (later === 'months') next.months = [];
    else next[later] = null;
  }
  return next;
}

/** Everything the two reads brought back that the machine needs. */
export interface GuideData {
  signedIn: boolean;
  courses: readonly CatalogCourse[];
  /**
   * What a signed-in student's profile already says. `yearKey` is the exact
   * option when the profile's system could be resolved; `year` alone is the
   * fallback, and names an option only when it is unambiguous.
   */
  saved: { yearKey: string | null; year: number | null; stream: Stream | null };
  /** Course details read so far, by slug. */
  details: Readonly<Record<string, CatalogCourseDetail>>;
  /**
   * What a signed-in student already holds in each of those courses, by slug.
   * Absent for a visitor and for a read that failed — see `Owned`.
   */
  owned?: Readonly<Record<string, Owned>>;
}

export interface GuideView {
  /** The selection with every forced and saved answer filled in. */
  selection: GuideSelection;
  years: YearOption[];
  streams: Stream[];
  courses: CatalogCourse[];
  course: CatalogCourse | null;
  /** `null` while the chosen course's plans are still being read. */
  plans: PlanOption[] | null;
  plan: PlanOption | null;
  /** Terms that exist and are not on sale yet — shown, never selectable. */
  upcomingTerms: UpcomingTerm[];
  /** A claim for this course is already in review: nothing more to choose. */
  pending: boolean;
  /** The months that can be bought — open, and not already held. */
  months: MonthOption[];
  /** The ones chosen, in curriculum order. */
  chosenMonths: MonthOption[];
  totalCents: number | null;
  /** The year or the stream came from the profile — «صف تاني» is offered. */
  fromProfile: boolean;
  /** The steps that are asked, in order. */
  steps: StepId[];
}

export function viewOf(
  data: GuideData,
  selection: GuideSelection,
  options: {
    askSection: boolean;
    labelOf: (course: { systemSlug: string; year: number }) => string;
    now?: Date;
  },
): GuideView {
  const useSaved = data.signedIn && !options.askSection;

  // ── year ──
  const years = yearOptions(data.courses, options.labelOf);
  // The exact (system, year) when the caller could resolve it. Otherwise the
  // year NUMBER names an option only when exactly one system teaches that year
  // here — two candidates is a question, not a guess.
  const savedExact = years.find((option) => option.key === data.saved.yearKey);
  const savedByNumber = data.saved.year === null ? [] : years.filter((option) => option.year === data.saved.year);
  const savedYear = !useSaved
    ? null
    : (savedExact?.key ?? (savedByNumber.length === 1 ? savedByNumber[0]!.key : null));
  let year = years.some((option) => option.key === selection.year) ? selection.year : null;
  if (year === null) year = years.length === 1 ? years[0]!.key : savedYear;

  // ── stream ──
  const streams = streamOptions(data.courses, year);
  const savedStream = useSaved && data.saved.stream !== null && streams.includes(data.saved.stream) ? data.saved.stream : null;
  let stream = selection.stream !== null && streams.includes(selection.stream) ? selection.stream : null;
  if (stream === null) stream = streams.length === 1 ? streams[0]! : savedStream;

  // ── course ── nothing to list until the stream question has an answer (or
  // there is no stream question to ask).
  const courses = year !== null && (stream !== null || streams.length === 0) ? coursesFor(data.courses, year, stream) : [];
  let course = courses.find((row) => row.slug === selection.course) ?? null;
  if (course === null && courses.length === 1) course = courses[0]!;

  // ── plan ──
  const detail = course !== null ? (data.details[course.slug] ?? null) : null;
  const owned = course !== null ? (data.owned?.[course.slug] ?? null) : null;
  // A claim already in review: the checkout would refuse a second one, so
  // there is nothing here to choose — the plan step says so instead.
  const pending = detail !== null && owned?.pending === true;
  const plans = detail ? (pending ? [] : planOptions(detail, owned, options.now)) : null;
  let plan = plans?.find((row) => row.id === selection.plan) ?? null;
  // A single plan is settled silently — but not while a closed term is listed
  // beside it: «الترم التاني — لسه ما اتفتحش» is information the student is
  // owed, and skipping the step would hide it.
  const later = detail && !pending ? upcomingTerms(detail) : [];
  if (plan === null && plans?.length === 1 && later.length === 0) plan = plans[0]!;

  // ── months ── any number of them. An id that is no longer buyable (closed
  // since, or bought since) simply falls out of the selection.
  const months = detail ? monthOptions(detail, plan, owned) : [];
  let chosenMonths = months.filter((row) => selection.months.includes(row.id));
  if (chosenMonths.length === 0 && months.length === 1) chosenMonths = [months[0]!];

  const askYear = years.length > 1 && !(savedYear !== null && year === savedYear);
  // Before a year is chosen the streams are not known yet. The station is
  // kept on the road if ANY year would ask the question, so «خطوة n من m»
  // does not grow by one the moment the year is answered.
  const askStream =
    year === null
      ? years.some((option) => {
          const offered = streamOptions(data.courses, option.key);
          const answered = useSaved && data.saved.stream !== null && offered.includes(data.saved.stream);
          return offered.length > 1 && !answered;
        })
      : streams.length > 1 && !(savedStream !== null && stream === savedStream);
  const nothingOnSale = plans !== null && plans.length === 0;

  const steps: StepId[] = ['welcome'];
  if (askYear) steps.push('year');
  if (askStream) steps.push('stream');
  steps.push('course');
  // Asked while unknown (it holds the place the answer loads into) and
  // whenever there is a real choice, a closed term to show, or nothing at
  // all, which it explains.
  if (plans === null || plans.length !== 1 || later.length > 0) steps.push('plan');
  if (months.length > 1) steps.push('month');
  // A course with nothing on sale ends at the plan step: there is no account
  // to open and nothing to pay for.
  if (!nothingOnSale) steps.push(data.signedIn ? 'pay' : 'account');

  return {
    selection: {
      year,
      stream,
      course: course?.slug ?? null,
      plan: plan?.id ?? null,
      months: chosenMonths.map((row) => row.id),
    },
    years,
    streams,
    courses,
    course,
    plans,
    plan,
    upcomingTerms: later,
    pending,
    months,
    chosenMonths,
    totalCents: totalCents(plan, chosenMonths),
    fromProfile: (savedYear !== null && year === savedYear) || (savedStream !== null && stream === savedStream),
    steps,
  };
}

/**
 * The step to show when the stored one is not asked any more — the next one
 * that is, in the fixed order; the last one when there is none after it.
 *
 * This is what makes skipping work without a special case per step: «نختار
 * الباقة» moves to `plan`, the course's detail lands with a single plan,
 * `plan` leaves `steps`, and the dialog is on `month` or the last step.
 */
export function normaliseStep(step: StepId, steps: readonly StepId[]): StepId {
  if (steps.includes(step)) return step;
  const at = STEP_ORDER.indexOf(step);
  return steps.find((candidate) => STEP_ORDER.indexOf(candidate) > at) ?? steps[steps.length - 1] ?? 'welcome';
}

/**
 * The first step that still has no answer — the furthest the guide may be.
 *
 * `normaliseStep` handles a step that stopped being asked. This handles the
 * opposite: a step that IS asked but is ahead of an unanswered one. That is
 * reachable three ways, and each showed an empty screen without this — the
 * first button pressed before the catalogue had loaded, a resumed guide whose
 * chosen month has since closed, and a stored step from a tab where the
 * profile had answered the year for a student who has since signed out.
 */
export function furthestStep(view: Pick<GuideView, 'steps' | 'selection' | 'plan' | 'chosenMonths'>): StepId {
  for (const step of view.steps) {
    if (step === 'year' && view.selection.year === null) return step;
    if (step === 'stream' && view.selection.stream === null) return step;
    if (step === 'course' && view.selection.course === null) return step;
    if (step === 'plan' && view.plan === null) return step;
    if (step === 'month' && view.chosenMonths.length === 0) return step;
  }
  return view.steps[view.steps.length - 1] ?? 'welcome';
}

/** The step to draw: the stored one, normalised, and never past `furthestStep`. */
export function settleStep(
  step: StepId,
  view: Pick<GuideView, 'steps' | 'selection' | 'plan' | 'chosenMonths'>,
): StepId {
  const normal = normaliseStep(step, view.steps);
  const limit = furthestStep(view);
  return view.steps.indexOf(normal) > view.steps.indexOf(limit) ? limit : normal;
}

export function nextStep(step: StepId, steps: readonly StepId[]): StepId {
  const at = steps.indexOf(normaliseStep(step, steps));
  return steps[Math.min(at + 1, steps.length - 1)] ?? step;
}

/** `null` on the first step — there is nothing to go back to. */
export function previousStep(step: StepId, steps: readonly StepId[]): StepId | null {
  const at = steps.indexOf(normaliseStep(step, steps));
  return at > 0 ? steps[at - 1]! : null;
}
