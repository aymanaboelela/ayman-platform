import { HOMEWORK_FILTERS, type HomeworkFilter } from '@ayman/contracts/homework';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A filter from a URL, or `undefined` for anything that is not one. */
function knownFilter(filter: string | undefined): HomeworkFilter | undefined {
  return filter && (HOMEWORK_FILTERS as readonly string[]).includes(filter) ? (filter as HomeworkFilter) : undefined;
}

/**
 * One lecture's list of hand-ins, on a tab. Without a lecture it is the
 * overview, which has no tabs — a filter alone is dropped rather than kept.
 */
export function homeworkListHref(lessonId: string | undefined, filter?: string): string {
  if (!lessonId || !UUID_RE.test(lessonId)) return '/admin/homework';
  const tab = knownFilter(filter);
  return `/admin/homework?lessonId=${lessonId}${tab ? `&filter=${tab}` : ''}`;
}

/**
 * The one place that decides where the submission's «رجوع» goes back to.
 *
 * ⚠️ The bug this closes: the back link used to be the bare `/admin/homework`
 * string, which threw the admin off the tab he opened the submission from.
 * Since the queue is grouped by lecture it also has to carry the LECTURE —
 * «رجوع» from a hand-in on lecture 5 lands on lecture 5's list, on the same
 * tab. See `[id]/page.tsx` and `page.tsx`'s `HomeworkRow`, which both go
 * through here so the two cannot drift apart.
 */
export function homeworkBackHref(filter: string | undefined, lessonId?: string): string {
  return homeworkListHref(lessonId, filter);
}
