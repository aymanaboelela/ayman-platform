import {
  ATTEMPT_SORTS,
  ATTEMPT_STATES,
  type AdminAttemptSort,
  type AdminAttemptState,
} from '@ayman/contracts/admin/attempts';

/**
 * Every URL `/admin/attempts` reads or writes, in one place — so the overview,
 * the quiz view, their links and the «رجوع» between them cannot drift apart.
 *
 * Two views on one route, picked by the query string: a quiz (`quizId`, or
 * `lessonId` — the id the analytics screens hold) opens the quiz view;
 * anything else is the overview.
 *
 * The quiz view's own search is `q`, the same key the overview uses, and the
 * two mean different things (a student there, a quiz or a student here). So
 * the overview's filters ride along under their OWN names — `courseId` and
 * `oq` — and are only ever read back by the «رجوع» link.
 */

export interface OverviewParams {
  courseId?: string;
  q?: string;
  page?: number;
}

export interface QuizParams {
  quizId?: string;
  lessonId?: string;
  state?: AdminAttemptState;
  /** The student search inside one quiz. */
  q?: string;
  sort?: AdminAttemptSort;
  page?: number;
  /** Where «رجوع» lands: the overview exactly as it was left. */
  back: OverviewParams;
}

export type AttemptsView = { view: 'overview'; params: OverviewParams } | { view: 'quiz'; params: QuizParams };

type SearchParams = Record<string, string | string[] | undefined>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** `AdminAttemptListQuerySchema`'s own bound — a longer box would be a 400
 *  from the API and an error page here. */
const MAX_SEARCH = 120;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function uuid(value: string | undefined): string | undefined {
  return value && UUID_RE.test(value) ? value.toLowerCase() : undefined;
}

function search(value: string | undefined): string | undefined {
  const trimmed = value?.trim().slice(0, MAX_SEARCH).trim();
  return trimmed ? trimmed : undefined;
}

function page(value: string | undefined): number | undefined {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 1 ? n : undefined;
}

function oneOf<T extends string>(list: readonly T[], value: string | undefined): T | undefined {
  return value !== undefined && (list as readonly string[]).includes(value) ? (value as T) : undefined;
}

/**
 * The view a URL asks for, with every value checked.
 *
 * A hand-edited or stale URL lands on something sensible rather than on an
 * error page: a junk id is dropped (a non-uuid would 400 at the API), an
 * unknown tab or sort is the default, and a search is clamped to what the API
 * accepts.
 */
export function readAttemptsView(params: SearchParams): AttemptsView {
  const quizId = uuid(first(params.quizId));
  const lessonId = uuid(first(params.lessonId));
  const back: OverviewParams = clean({ courseId: uuid(first(params.courseId)), q: search(first(params.oq)) });

  if (quizId || lessonId) {
    return {
      view: 'quiz',
      params: clean({
        quizId,
        // The quiz's own id wins; a lesson id beside it would only be a
        // second, possibly contradictory, name for the same paper.
        lessonId: quizId ? undefined : lessonId,
        state: oneOf(ATTEMPT_STATES, first(params.state)),
        q: search(first(params.q)),
        sort: oneOf(ATTEMPT_SORTS, first(params.sort)),
        page: page(first(params.page)),
        back,
      }),
    };
  }

  return {
    view: 'overview',
    params: clean({ courseId: uuid(first(params.courseId)), q: search(first(params.q)), page: page(first(params.page)) }),
  };
}

/** Drops the `undefined` keys, so two equal views compare equal in a test. */
function clean<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

function href(query: URLSearchParams): string {
  const rendered = query.toString();
  return rendered ? `/admin/attempts?${rendered}` : '/admin/attempts';
}

/** The overview — the bare path when nothing is filtered, so the link the
 *  sidebar holds and the link «رجوع» builds are the same URL. */
export function overviewHref(params: OverviewParams = {}): string {
  const query = new URLSearchParams();
  if (params.courseId) query.set('courseId', params.courseId);
  if (params.q) query.set('q', params.q);
  if (params.page && params.page > 1) query.set('page', String(params.page));
  return href(query);
}

/**
 * One quiz, on a tab, carrying the overview it was opened from.
 *
 * The defaults are left OUT of the URL (`newest`, page 1, every state), so a
 * tab link and the same tab reached by changing nothing are one URL.
 */
export function quizHref(params: QuizParams): string {
  const query = new URLSearchParams();
  if (params.quizId) query.set('quizId', params.quizId);
  else if (params.lessonId) query.set('lessonId', params.lessonId);
  if (params.state) query.set('state', params.state);
  if (params.q) query.set('q', params.q);
  if (params.sort && params.sort !== 'newest') query.set('sort', params.sort);
  if (params.page && params.page > 1) query.set('page', String(params.page));
  if (params.back.courseId) query.set('courseId', params.back.courseId);
  if (params.back.q) query.set('oq', params.back.q);
  return href(query);
}
