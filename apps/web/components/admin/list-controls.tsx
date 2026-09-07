'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { cn } from '@ayman/ui';

/**
 * A filter or sort as a DROPDOWN, writing straight into the URL.
 *
 * ## Why a dropdown and not the chip row this replaces
 *
 * Asked for by name: «بدل اللي هو الكل فعال هيخلص قريب، لأ، كله بقى يبقى زي
 * دروب، بضغط عليها ينزللي منها تحت كده حاجة، زي أي ويب سايت». A chip row spends
 * a whole line of the screen restating options nobody is choosing right now,
 * and it grows a line every time a filter is added — which is exactly what was
 * about to happen here, with a stream filter and a year filter and a sort all
 * landing at once. A closed `<select>` shows the CHOSEN value and hides the
 * rest until asked.
 *
 * A NATIVE `<select>`, not a styled listbox: it gets the platform's own
 * dropdown, its own keyboard handling and its own screen-reader semantics for
 * free, and on a phone it opens the OS picker — which is the interaction he
 * described. The visual weight comes from the shell around it.
 *
 * ## The count belongs in the label
 *
 * «عشان أعرف إن أنا الأعداد اللي عندي كام» — the size of a bucket is the thing
 * that decides whether it is worth opening, so it is rendered INSIDE the option
 * rather than as a badge beside a chip. `count: null` renders no number at all,
 * which is honest for a facet the API does not compute; a `0` would claim the
 * bucket is empty.
 *
 * ## The URL is the state
 *
 * No local state and nothing lifted: the value shown is whatever the query
 * string says, so the back button walks filters, a filtered list can be pasted
 * to someone else, and a server component re-renders with real data instead of
 * the page filtering an array it already fetched. Changing any control resets
 * `page` — staying on page 7 of a list that now has two pages shows nothing and
 * reads as a broken filter.
 */
export interface ListControlOption {
  value: string;
  label: string;
  count?: number | null;
}

export function ListControl({
  name,
  label,
  value,
  options,
  className,
}: {
  /** The query-string key this control owns. */
  name: string;
  /** Shown above the control — always rendered, never a placeholder inside it:
   *  a select whose only label is its own first option loses that label the
   *  moment anything else is chosen. */
  label: string;
  value: string;
  options: ListControlOption[];
  className?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function choose(next: string) {
    const query = new URLSearchParams(params.toString());
    // An empty value means «الكل» — the parameter is REMOVED rather than set to
    // "", so a default filter never appears in the URL and the shareable link
    // for an unfiltered list is the bare path.
    if (next === '') query.delete(name);
    else query.set(name, next);
    query.delete('page');

    startTransition(() => {
      router.push(query.size === 0 ? '?' : `?${query}`, { scroll: false });
    });
  }

  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-[length:var(--fs-text-xs)] text-fg-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => choose(event.target.value)}
        // Never `disabled` while pending: a control that goes dead on every
        // change steals focus and cannot be corrected mid-navigation. It dims,
        // and stays usable.
        className={cn(
          'h-9 min-w-[9rem] rounded-lg border border-line bg-surface-2 px-3',
          'text-[length:var(--fs-text-sm)] text-fg',
          'transition-[opacity,border-color] duration-[160ms] ease-out',
          'hover:border-accent/40 focus:border-accent focus:outline-none',
          pending && 'opacity-60',
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.count == null ? option.label : `${option.label} (${option.count})`}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Page N of M, as two links and a count.
 *
 * `/admin/books` had NO pagination at all and sent no `page` — so on a tab
 * holding more rows than one page, the newest orders were simply unreachable,
 * on the screen whose job is shipping today's parcels. That is the bug this
 * exists to close, so it renders whenever there is more than one page and never
 * silently truncates.
 */
export function ListPager({
  page,
  perPage,
  rowCount,
  labels,
}: {
  page: number;
  perPage: number;
  rowCount: number;
  labels: { previous: string; next: string; of: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pageCount = Math.max(1, Math.ceil(rowCount / perPage));
  if (pageCount <= 1) return null;

  function go(next: number) {
    const query = new URLSearchParams(params.toString());
    if (next <= 1) query.delete('page');
    else query.set('page', String(next));
    router.push(query.size === 0 ? '?' : `?${query}`, { scroll: false });
  }

  const button =
    'h-9 rounded-lg border border-line px-4 text-[length:var(--fs-text-sm)] text-fg-muted ' +
    'transition-colors duration-[160ms] ease-out hover:border-accent/40 hover:text-fg ' +
    'disabled:opacity-40 disabled:hover:border-line disabled:hover:text-fg-muted';

  return (
    <nav className="mt-5 flex items-center justify-center gap-3">
      <button type="button" className={button} disabled={page <= 1} onClick={() => go(page - 1)}>
        {labels.previous}
      </button>
      <span className="text-[length:var(--fs-text-sm)] tabular-nums text-fg-muted">
        {page} {labels.of} {pageCount}
      </span>
      <button
        type="button"
        className={button}
        disabled={page >= pageCount}
        onClick={() => go(page + 1)}
      >
        {labels.next}
      </button>
    </nav>
  );
}
