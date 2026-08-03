'use client';

import { useState } from 'react';
import { BookOpenCheck, CircleCheckBig, ClipboardCheck } from 'lucide-react';
import {
  ActivityFeedSchema,
  copy,
  formatCopy,
  type ActivityEntry,
  type CompletedActivity,
} from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { apiGet } from '@/lib/api';

/**
 * Western digits everywhere, matching every other date in the product
 * (`devices-list.tsx` records the same choice) rather than introducing
 * Arabic-Indic numerals in one place.
 */
const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * "How long that sitting was", in words rather than a clock.
 *
 * `formatDuration` from `lib/format` renders `12:34`, which is right for a
 * timer beside a video and wrong in a sentence — "شُفت الدرس لمدة 12:34" reads
 * as a timestamp. Minutes are the useful granularity here, and anything under
 * one minute rounds UP to one rather than displaying "0 دقيقة" for a sitting
 * that demonstrably happened.
 */
function formatSitting(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} د`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} س` : `${hours} س ${rest} د`;
}

const VIA_COPY: Record<NonNullable<CompletedActivity['completedVia']>, string> = {
  auto: copy.profile.activityViaAuto,
  manual: copy.profile.activityViaManual,
  dwell: copy.profile.activityViaDwell,
};

function describe(entry: ActivityEntry): string {
  switch (entry.kind) {
    case 'watched':
      return formatCopy(copy.profile.activityWatched, {
        duration: formatSitting(entry.secondsWatched),
      });
    case 'completed':
      return entry.completedVia
        ? `${copy.profile.activityCompleted} — ${VIA_COPY[entry.completedVia]}`
        : copy.profile.activityCompleted;
    case 'quiz':
      return formatCopy(copy.profile.activityQuiz, { score: entry.scorePercent });
  }
}

function iconFor(entry: ActivityEntry) {
  switch (entry.kind) {
    case 'watched':
      return BookOpenCheck;
    case 'completed':
      return CircleCheckBig;
    case 'quiz':
      return ClipboardCheck;
  }
}

/**
 * The student's timeline: what they watched, finished and sat, newest first.
 *
 * ## Why the first page is a prop and the rest is fetched
 *
 * The page renders page one on the server — it is part of what the profile IS,
 * so it must be in the SSR'd HTML rather than appearing after hydration.
 * "Load more" is genuinely interactive and cursor-driven, so it lives here.
 * Fetching page one here too would leave the profile with a spinner where its
 * main content belongs on every visit.
 *
 * ## Cursor, not offset
 *
 * `nextCursor` is the last row's timestamp and the next request asks for
 * strictly-older rows. This feed grows at the HEAD — a student watching a
 * lesson while paging through their history is the normal case — and an
 * offset paginator repeats rows every time something is inserted above the
 * window.
 */
export function ActivityFeed({
  initialEntries,
  initialCursor,
}: {
  initialEntries: ActivityEntry[];
  initialCursor: string | null;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [cursor, setCursor] = useState(initialCursor);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function loadMore() {
    if (!cursor || pending) return;
    setPending(true);
    setFailed(false);
    try {
      const next = await apiGet(
        `/api/me/activity?cursor=${encodeURIComponent(cursor)}`,
        ActivityFeedSchema,
      );
      setEntries((current) => [...current, ...next.entries]);
      setCursor(next.nextCursor);
    } catch {
      // Leave what is already on screen alone and say so. Replacing a loaded
      // history with an error state because page three failed loses the two
      // pages the student can still read.
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line bg-surface-2 px-5 py-8 text-center text-[length:var(--fs-text-sm)] text-fg-muted">
        {copy.profile.activityEmpty}
      </p>
    );
  }

  return (
    <div>
      <ol className="overflow-hidden rounded-lg border border-line bg-surface-2">
        {entries.map((entry) => {
          const Icon = iconFor(entry);
          return (
            <li
              key={`${entry.kind}:${entry.id}`}
              className="flex items-start gap-3 border-b border-line-subtle p-4 last:border-b-0"
            >
              <span
                className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-3 text-fg-muted"
                aria-hidden="true"
              >
                <Icon className="size-4" />
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[length:var(--fs-text-sm)] font-medium text-fg">
                  {entry.lessonTitle}
                </p>
                <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{describe(entry)}</p>
                <p className="truncate text-[length:var(--fs-mono-label)] text-fg-faint">
                  {entry.courseTitle}
                </p>
              </div>

              {/* `<time>` with a machine-readable dateTime beside the human
                  string — the timeline's whole promise is "when", and that is
                  worth exposing to anything that parses the page. */}
              <time
                dateTime={entry.occurredAt}
                className="mono tabular shrink-0 text-[length:var(--fs-mono-label)] text-fg-muted"
              >
                {dateFormatter.format(new Date(entry.occurredAt))}
              </time>
            </li>
          );
        })}
      </ol>

      {failed ? (
        <p role="alert" className="mt-3 text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
          {copy.profile.activityFailed}
        </p>
      ) : null}

      {cursor ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={pending}
          className={cn(
            'mt-3 inline-flex h-9 items-center rounded-sm border border-line px-4',
            'text-[length:var(--fs-text-sm)] text-fg',
            'transition-colors duration-[160ms] ease-out hover:bg-surface-3',
            'disabled:pointer-events-none disabled:opacity-60',
          )}
        >
          {pending ? copy.profile.activityLoading : copy.profile.activityMore}
        </button>
      ) : null}
    </div>
  );
}
