import { GradingSortSchema } from '@ayman/contracts/admin/exams';

/**
 * Shared between the list (`page.tsx`) and the detail page
 * (`[attemptId]/page.tsx`) — ONE place that knows what `/admin/grading`'s URL
 * means, so the paper's «رجوع» link can rebuild the exact list it was opened
 * from instead of guessing at a copy of this logic that would drift.
 *
 * ⚠️ The bug this exists for: the detail page used to link back to the bare
 * `/admin/grading`, which is the QUEUE tab. Opening a paper from «اتصحّح
 * خلاص» (marked) or from an exam/day filter and tapping «رجوع» silently threw
 * the admin onto a different, usually much shorter list — read as "the list
 * lost most of what was on it" rather than as a filter reset, because the
 * queue tab is not a superset of the others.
 */
export const GRADING_TABS = ['queue', 'marked', 'top', 'late'] as const;
export type GradingTab = (typeof GRADING_TABS)[number];

export type GradingListState = {
  tab: string;
  sort?: string;
  exam?: string;
  day?: string;
};

/** Every filter lives in the URL, so each control has to rebuild the whole
 *  query rather than append to it — a day link that dropped the exam filter
 *  would silently widen the view it was meant to narrow. */
export function gradingListHref(state: GradingListState): string {
  const params = new URLSearchParams();
  if (state.tab !== 'queue') params.set('tab', state.tab);
  if (state.sort) params.set('sort', state.sort);
  if (state.exam) params.set('exam', state.exam);
  if (state.day) params.set('day', state.day);
  const query = params.toString();
  return query ? `/admin/grading?${query}` : '/admin/grading';
}

/**
 * The same normalisation `page.tsx` applies to its `searchParams`, reused
 * here so a paper's back link reflects a value only when the list itself
 * would have accepted it — never a raw, unvalidated query string.
 */
export function normalizeGradingQuery(query: {
  tab?: string;
  sort?: string;
  exam?: string;
  day?: string;
}): GradingListState {
  const tab: GradingTab = GRADING_TABS.includes(query.tab as GradingTab)
    ? (query.tab as GradingTab)
    : 'queue';
  const sort = GradingSortSchema.safeParse(query.sort).data;
  const exam = query.exam && query.exam.length > 0 ? query.exam : undefined;
  const day = query.day && /^\d{4}-\d{2}-\d{2}$/.test(query.day) ? query.day : undefined;
  return { tab, sort, exam, day };
}
