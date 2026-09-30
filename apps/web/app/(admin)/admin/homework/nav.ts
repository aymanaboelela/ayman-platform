import { HOMEWORK_FILTERS, type HomeworkFilter } from '@ayman/contracts/homework';

/**
 * The one place that decides where the submission's «رجوع» goes back to.
 *
 * ⚠️ The bug this closes: the back link used to be the bare `/admin/homework`
 * string, which is always the «مستني مراجعة» (pending) tab — the schema's
 * default. Opening a submission from «الكل» and tapping «رجوع» silently threw
 * the admin onto the pending-only queue, which is neither what he was looking
 * at nor a superset of it. See `[id]/page.tsx` and `page.tsx`'s `HomeworkRow`,
 * which now both go through this function so the two cannot drift apart.
 */
export function homeworkBackHref(filter: string | undefined): string {
  if (filter && (HOMEWORK_FILTERS as readonly string[]).includes(filter)) {
    return `/admin/homework?filter=${filter as HomeworkFilter}`;
  }
  return '/admin/homework';
}
