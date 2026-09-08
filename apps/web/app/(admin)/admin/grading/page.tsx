// `/copy/admin`, never the root barrel: these screens only ever render inside
// the admin layout, and `copy.admin.*` lives in that module.
import { copy } from '@ayman/contracts/copy/admin';
import { AdminGradingQueueSchema } from '@ayman/contracts/admin/exams';
import { adminGet } from '@/lib/admin-api';
import { GradingQueueRow } from '@/components/admin/grading/queue-row';

const c = copy.admin.grading;

export const metadata = { title: c.title };

/**
 * «ورقات محتاجة تصحيح» — the screen that did not exist.
 *
 * ## What was broken, and why a LIST is the fix
 *
 * `gradeQuestion` returns `needs_grading` for an essay and never scores it;
 * `needs_grading` sits inside `GRADED_STATES`, so the paper counts as graded
 * in `/api/me/quizzes`, in mastery, in the cohort roster and in item analysis —
 * with that question contributing zero. And there was no route to fix it:
 * `AttemptService.recomputeScore` existed with zero callers. Every essay anyone
 * ever answered was a permanent, silent zero.
 *
 * Marking them is only half of that. The other half is FINDING them, and
 * nothing on the platform could: `/admin/attempts` is every sitting there has
 * ever been, filtered by state, and «مستني مراجعة» is not one of its filters.
 * This page is the missing half.
 *
 * ## Oldest first, and the screen does not re-sort
 *
 * `ManualGradingService.queue` orders `submittedAt asc, id asc` — a paper that
 * has been waiting three days is more urgent than one that landed a minute ago,
 * and a student cannot see their real grade until someone gets to it. The order
 * is a property of the queue, not a preference, so there is no sort control
 * here and the rows are rendered in the order they arrived in. `<ol>` rather
 * than `<ul>` for the same reason: the position IS information.
 *
 * `adminGet` (uncached) like every other admin list — a cached admin read is
 * indistinguishable from a lost write, and here a student is on the other end
 * of it holding a wrong mark.
 */
export default async function AdminGradingPage() {
  const { rows } = await adminGet('/api/admin/grading-queue', AdminGradingQueueSchema);

  return (
    <>
      <div>
        <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
        <p className="mt-1 max-w-[44rem] text-[length:var(--fs-text-sm)] text-fg-muted">{c.lead}</p>
      </div>

      {rows.length === 0 ? (
        /* An empty queue is the GOOD state here, not a missing-data state — no
           «اعمل واحد» prompt, because there is nothing for him to create. */
        <div className="mt-5 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
          <p className="text-[length:var(--fs-title-4)] font-medium text-fg">{c.empty}</p>
        </div>
      ) : (
        <ol className="mt-5 flex flex-col gap-2.5">
          {rows.map((row) => (
            <li key={row.attemptId}>
              <GradingQueueRow row={row} />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
