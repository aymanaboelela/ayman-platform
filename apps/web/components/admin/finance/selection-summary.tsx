import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import type { AdminFinanceSelection } from '@ayman/contracts/admin/finance';
import { formatEGP } from '@/lib/price';

const c = copy.admin.finance;

/**
 * «لما أحدد فلتر، عايز أعرف الأرقام» — the strip between the global tiles and
 * the table, describing the rows the reader is actually looking at.
 *
 * ## Why it is not more tiles
 *
 * The three `StatTile`s above are the PLATFORM's totals and are deliberately
 * unaffected by any filter — that was a decision, not an oversight, and the
 * money tile in particular answers «المنصة عاملة إيه». Turning them
 * filter-aware would have destroyed the one place those numbers live. So the
 * selection gets its own strip, in its own visual register (a bordered band,
 * not accent-filled cards), and its own vocabulary in copy — «المحدد دلوقتي»
 * against «صافي الاشتراكات». Two numbers under two labels is only confusing
 * when the labels do not say which is which.
 *
 * ## The stream warning is the point of this component, not a footnote
 *
 * The owner asked for «كام واحد عربي وكام واحد لغات». The «عربي / لغات»
 * dropdown reads `Course.forGeneral` / `Course.forLanguages` — and on real data
 * essentially every course carries BOTH (580 of 582 on the dev database, and
 * every subscribed course without exception). So that dropdown returns the
 * identical set either way, and a naive «عربي: 342 · لغات: 342» would be two
 * confident numbers that answer nothing.
 *
 * What actually distinguishes the streams is the COURSE — production's titles
 * end in «(عربي)» and «(لغات)». So the breakdown below is per course, and when
 * the flags turn out to be useless the strip says so in one sentence and points
 * at the list instead of pretending.
 */
export function SelectionSummary({
  selection,
  filtered,
}: {
  selection: AdminFinanceSelection;
  /** Whether any of plan/year/stream/status is narrowing the list. Only changes
   *  the heading — «المحدد دلوقتي» reads as a narrowing, and saying it over an
   *  unfiltered table would be a small lie every time the page loads. */
  filtered: boolean;
}) {
  // Nothing to describe. An empty table already says "no rows" on its own; a
  // strip of zeros above it is noise.
  if (selection.subscriptionCount === 0) return null;

  // Every course in the selection carries both flags, so the stream dropdown
  // cannot separate them. `both === subscriptionCount` is the exact condition,
  // not an approximation.
  const streamsAreIdentical = selection.streamFlags.both === selection.subscriptionCount;

  return (
    <section className="mt-3 rounded-lg border border-line-subtle bg-surface-2 p-3">
      <p className="text-[length:var(--fs-mono-label)] text-fg-muted">
        {filtered ? c.selectionTitle : c.selectionAll}
      </p>

      {/* The headline row. Subscriptions AND students, never one alone: one
          person can hold a term subscription and a monthly one, so the two
          numbers differ and hiding either invites the wrong one being quoted. */}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-[length:var(--fs-title-3)] font-semibold text-fg tabular">
          {formatCopy(c.selectionSubscriptions, { n: String(selection.subscriptionCount) })}
        </span>
        <span className="text-[length:var(--fs-text-sm)] text-fg-muted tabular">
          {formatCopy(c.selectionStudents, { n: String(selection.studentCount) })}
        </span>
        <span className="text-[length:var(--fs-text-sm)] text-fg-muted tabular">
          {formatCopy(c.selectionRevenue, { amount: formatEGP(selection.revenueCents) })}
        </span>
        <span className="text-[length:var(--fs-text-sm)] text-fg-muted tabular">
          {formatCopy(c.selectionPaid, { n: String(selection.paidCount) })}
        </span>
        <span className="text-[length:var(--fs-text-sm)] text-fg-muted tabular">
          {formatCopy(c.selectionFree, { n: String(selection.freeCount) })}
        </span>
      </div>

      {streamsAreIdentical ? (
        <p className="mt-2 text-[length:var(--fs-text-sm)] text-warn">
          {c.selectionStreamsIdentical}
        </p>
      ) : null}

      {/* The per-course breakdown — «كام عربي وكام لغات», answered by the thing
          that actually carries the distinction. Rendered whenever there is more
          than one course; with a single course it would just restate the line
          above it. */}
      {selection.byCourse.length > 1 ? (
        <div className="mt-3">
          <p className="text-[length:var(--fs-mono-label)] text-fg-muted">{c.selectionByCourse}</p>
          <ul className="mt-1 flex flex-col gap-1">
            {selection.byCourse.map((course) => (
              <li
                key={course.courseId}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line-subtle pb-1 last:border-b-0 last:pb-0"
              >
                <span className="text-[length:var(--fs-text-sm)] text-fg">{course.courseTitle}</span>
                <span className="text-[length:var(--fs-text-sm)] text-fg-muted tabular">
                  {formatCopy(c.selectionCourseLine, {
                    subs: String(course.subscriptionCount),
                    students: String(course.studentCount),
                    free: String(course.freeCount),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
