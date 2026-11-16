/**
 * Everything the first-visit guide decides BEFORE it has loaded — and
 * therefore everything that rides on every page of three route groups.
 *
 * This module and `guide-launcher.tsx` are the whole cost of the feature for a
 * visitor it never shows to: no copy table, no schema, no stylesheet, no
 * request. Keep it that way — an import added here lands on the landing page,
 * the login form and a running lesson alike (`lib/client-barrel.test.ts`
 * polices the Zod half of that; the rest is on whoever edits this file).
 *
 * Pure functions and one small timer, all injectable, so the rules are tested
 * without a browser (`guide-gate.test.ts`).
 */

/** Which layout mounted the launcher — the surface decides what may show. */
export type GuideSurface = 'site' | 'app' | 'auth';

/** How long a new visitor is on the platform before the guide speaks. */
export const GUIDE_DELAY_MS = 30_000;

/**
 * How long to wait before asking again when the moment was wrong — a dialog
 * already open, or a field being typed in. Visible time, like the delay.
 */
export const GUIDE_RETRY_MS = 5_000;

/*
 * Versioned keys: a later shape change bumps the number and old values simply
 * stop being read, instead of being parsed into something they are not.
 */
/** `localStorage` — «it has appeared on this device», written once, kept. */
export const GUIDE_SEEN_KEY = 'guide:v1:seen';
/** `sessionStorage` — visible milliseconds spent so far on eligible pages. */
export const GUIDE_SPENT_KEY = 'guide:v1:visible-ms';
/** `sessionStorage` — the guide's own state while one is in progress. */
export const GUIDE_STATE_KEY = 'guide:v1:state';

/**
 * The state a guide starts in, as the launcher writes it the moment the guide
 * first appears. Its shape belongs to `guide-state.ts` (`GuideState`), which
 * builds its own initial state FROM this constant — it is declared here only
 * because the launcher may not import that module (it pulls the option
 * derivations in behind it), and a second literal over there would be two
 * shapes waiting to disagree.
 */
export const INITIAL_GUIDE_STATE = {
  v: 1,
  step: 'welcome',
  open: true,
  selection: { year: null, stream: null, course: null, plan: null, months: [] },
  askSection: false,
  done: false,
} as const;

/**
 * A storage that may not exist, may be blocked, and may throw on write
 * (Safari private mode). Every access goes through these two; a guide that
 * cannot remember behaves as a guide that was never started, which is the
 * safe direction — it never re-appears in a loop, because `seen` failing to
 * write also means `spent` fails to write and the timer restarts per page.
 */
export function readStored(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStored(storage: Storage | undefined, key: string, value: string | null): boolean {
  try {
    if (!storage) return false;
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** `/courses/:slug/subscribe` — the checkout, as a page. */
const CHECKOUT = /^\/courses\/([^/]+)\/subscribe$/u;

/** The course whose checkout this path is, or `null` when it is not one. */
export function checkoutSlugOf(pathname: string): string | null {
  const raw = CHECKOUT.exec(pathname)?.[1];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * The public pages a first-time VISITOR may be greeted on: the landing page,
 * the catalogue and the pages that describe what is taught.
 *
 * An allow-list, not a deny-list, because the wrong default here is a dialog
 * over something the visitor is in the middle of. Left out on purpose:
 *
 *   · `/courses/:slug/subscribe` and `/subscribe` — the checkout;
 *   · `/books` — its own order dialog and address form;
 *   · `/practice` — a self-test in progress is still a test;
 *   · `/pdfs`, `/terms`, `/privacy` — somebody reading a document.
 */
const SITE_PREFIXES = ['/courses', '/years', '/about', '/essentials', '/honor-board', '/news'] as const;

function isMarketingPath(pathname: string): boolean {
  if (pathname === '/') return true;
  if (CHECKOUT.test(pathname)) return false;
  // `/courses/:slug/lessons/...` is a lesson, whichever group serves it.
  if (/^\/courses\/[^/]+\/lessons(?:\/|$)/u.test(pathname)) return false;
  return SITE_PREFIXES.some((prefix) => isUnder(pathname, prefix));
}

/**
 * The two screens a signed-in student with nothing bought yet lands on. Exact
 * matches: `/library/:slug` is a course somebody already holds.
 */
const APP_PATHS = ['/dashboard', '/library'] as const;

/**
 * Where the guide's DIALOG (and its minimised pill) may be on screen.
 *
 * Never an auth page, never a lesson, a quiz or an exam attempt, never the
 * checkout: all of those fall out of the two allow-lists above rather than
 * being listed, so a route added tomorrow is silent by default.
 */
export function isDialogPath(surface: GuideSurface, pathname: string): boolean {
  if (surface === 'site') return isMarketingPath(pathname);
  if (surface === 'app') return APP_PATHS.some((path) => pathname === path);
  return false;
}

/** What the helper circle is standing beside, when a guide is in progress. */
export type HelperPlace = 'register' | 'login' | 'onboarding' | 'checkout';

/**
 * Where the helper circle appears — only ever while a guide is in progress,
 * and for the checkout only on the course that guide chose (`courseSlug`): a
 * student who wanders onto another course's checkout is not being guided
 * through it.
 */
export function helperPlaceOf(pathname: string, courseSlug: string | null): HelperPlace | null {
  if (pathname === '/register') return 'register';
  if (pathname === '/login') return 'login';
  if (pathname === '/onboarding') return 'onboarding';
  const slug = checkoutSlugOf(pathname);
  if (slug !== null && courseSlug !== null && slug === courseSlug) return 'checkout';
  return null;
}

/**
 * Whether a guide already in progress has anything to draw on this page — the
 * launcher's one question before it loads the guide for a resume. Deliberately
 * coarse (ANY course's checkout passes): the launcher has not parsed the
 * state and should not have to; the guide itself narrows it.
 */
export function mayResume(surface: GuideSurface, pathname: string): boolean {
  return isDialogPath(surface, pathname) || helperPlaceOf(pathname, checkoutSlugOf(pathname)) !== null;
}

/**
 * A browser driven by automation — Playwright, Selenium, a WebDriver crawler.
 *
 * `navigator.webdriver` is the standard's own flag for it and Chromium sets it
 * under Playwright. It gates the AUTOMATIC appearance only: `apps/web/e2e`
 * keeps anonymous visitors and fresh, unenrolled students on these exact pages
 * for longer than the delay, and a modal arriving mid-spec would fail a test
 * that has nothing to do with it. A guide somebody started (state in
 * `sessionStorage`) is still resumed, so a spec that wants the guide can seed
 * that state and drive it.
 */
export function isAutomated(nav: { webdriver?: boolean } | undefined): boolean {
  return nav?.webdriver === true;
}

/**
 * Whether the visible-time clock should be running on this page view.
 *
 * `inProgress` wins over everything above it in the launcher, so it is an
 * input here only to say: a guide that is already going does not also count
 * down to itself.
 */
export function shouldCountDown(input: {
  surface: GuideSurface;
  pathname: string;
  seen: boolean;
  inProgress: boolean;
  automated: boolean;
}): boolean {
  if (input.automated || input.seen || input.inProgress) return false;
  return isDialogPath(input.surface, input.pathname);
}

/**
 * «30 seconds on the platform» = thirty seconds of the tab being LOOKED at, on
 * pages where the guide may show, added up across the session.
 *
 * `resume()` when the page is visible, `pause()` when it is not or the page is
 * left; the time between the two is what counts. One `setTimeout` for the
 * remainder, never an interval — a hidden tab holds no timer at all.
 *
 * The clock and the timer are injected so the test can move time by hand.
 */
export interface VisibleBudget {
  resume: () => void;
  pause: () => void;
  /** Give `ms` back and keep counting — «not now, ask again shortly». */
  rewind: (ms: number) => void;
  spent: () => number;
}

export function createVisibleBudget(options: {
  budgetMs: number;
  spentMs: number;
  now: () => number;
  setTimer: (run: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  /** Called with the running total whenever it is settled (pause or done). */
  onSpend: (spentMs: number) => void;
  onDone: () => void;
}): VisibleBudget {
  const { budgetMs, now, setTimer, clearTimer, onSpend, onDone } = options;
  let spent = Math.min(Math.max(0, options.spentMs), budgetMs);
  let startedAt: number | null = null;
  let timer: unknown = null;
  let done = false;

  function fire() {
    timer = null;
    startedAt = null;
    spent = budgetMs;
    done = true;
    onSpend(spent);
    onDone();
  }

  function resume() {
    if (done || startedAt !== null) return;
    startedAt = now();
    timer = setTimer(fire, Math.max(0, budgetMs - spent));
  }

  function pause() {
    if (startedAt === null) return;
    spent = Math.min(budgetMs, spent + Math.max(0, now() - startedAt));
    startedAt = null;
    if (timer !== null) clearTimer(timer);
    timer = null;
    onSpend(spent);
  }

  function rewind(ms: number) {
    const running = startedAt !== null;
    if (running) pause();
    done = false;
    spent = Math.max(0, Math.min(spent, budgetMs) - ms);
    onSpend(spent);
    // Called from `onDone`, where nothing is running any more: the caller
    // asked to keep counting, so the clock restarts either way.
    resume();
  }

  return { resume, pause, rewind, spent: () => spent };
}

/**
 * Something else has the visitor's attention right now: a dialog or sheet is
 * open (the phone menu, the assistant, a checkout), or they are typing.
 * Opening a modal over either steals focus from what they were doing.
 */
export function isBusy(doc: Pick<Document, 'querySelector' | 'activeElement'>): boolean {
  if (doc.querySelector('[role="dialog"], [aria-modal="true"]')) return true;
  const active = doc.activeElement;
  if (!active) return false;
  const tag = active.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (active as HTMLElement).isContentEditable === true;
}

/** Who is looking, as far as the guide needs to know. */
export type GuideViewer = 'visitor' | 'new-student';

/**
 * Is this viewer a NEW client? Asked once, at the moment the delay runs out,
 * and never on a page load.
 *
 *   · no session and no guardian cookie   → a visitor (public pages only);
 *   · a student with no enrollment and no payment claim → a new student
 *     (their home and library only);
 *   · anybody else — enrolled, paid and waiting, staff, a guardian, a centre
 *     manager — is not, and `settled` says the answer cannot change back, so
 *     the launcher stops asking on this device.
 *
 * Plain `fetch` reads, hand-narrowed: two or three requests, once per device,
 * and no schema on the universal path. Any failure answers «not now» without
 * settling — a network blip must neither show the guide to an enrolled
 * student nor silence it forever for a new one.
 */
export type ProbeResult = { viewer: GuideViewer | null; settled: boolean };

type Fetcher = (path: string) => Promise<{ status: number; ok: boolean; json: () => Promise<unknown> }>;

export async function probeViewer(surface: GuideSurface, fetcher: Fetcher): Promise<ProbeResult> {
  const notNow: ProbeResult = { viewer: null, settled: false };
  try {
    const session = await fetcher('/api/session');
    if (session.status === 401) {
      if (surface !== 'site') return notNow;
      /*
       * «No student session» is not yet «a visitor»: a guardian signs in with
       * a code and holds a cookie of their own (`/api/guardian/*`), which
       * `/api/session` knows nothing about. A parent reading their child's
       * report is not a new client, and that cookie is `httpOnly`, so asking
       * is the only way to tell. One more request, for the anonymous case
       * only, answered 401 from the cookie alone for everybody who is not one.
       */
      const guardian = await fetcher('/api/guardian/me');
      if (guardian.ok) return { viewer: null, settled: true };
      return guardian.status === 401 ? { viewer: 'visitor', settled: false } : notNow;
    }
    if (!session.ok) return notNow;

    const body = (await session.json()) as { role?: unknown };
    // Staff and every other non-student role: never, on any surface.
    if (body.role !== 'student') return { viewer: null, settled: true };
    // A signed-in student is greeted at home, not on the marketing pages
    // (where the next question would be «create an account»).
    if (surface !== 'app') return notNow;

    const [enrollments, submissions] = await Promise.all([
      fetcher('/api/enrollments'),
      fetcher('/api/payments/submissions/me'),
    ]);
    if (!enrollments.ok || !submissions.ok) return notNow;
    const [rows, claims] = await Promise.all([enrollments.json(), submissions.json()]);
    if (!Array.isArray(rows) || !Array.isArray(claims)) return notNow;
    if (rows.length > 0 || claims.length > 0) return { viewer: null, settled: true };
    return { viewer: 'new-student', settled: false };
  } catch {
    return notNow;
  }
}
