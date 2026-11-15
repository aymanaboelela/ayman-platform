'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Search, X } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';

const c = copy.assistant.inbox;

/**
 * «بحث» — names, phones and every message. Types into the URL (`?q=`) after a
 * short pause, so the result is a link he can reload or share, and the server
 * page does the searching.
 */
export function InboxSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');
  const [pending, startTransition] = useTransition();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const query = new URLSearchParams(params.toString());
      const q = value.trim();
      if (q) query.set('q', q);
      else query.delete('q');
      query.delete('page');
      startTransition(() => {
        router.replace(query.size === 0 ? pathname : `${pathname}?${query}`, { scroll: false });
      });
    }, 400);
    return () => clearTimeout(timer);
    // `params` deliberately not a dependency: it changes BECAUSE of this
    // effect, and re-running on it would re-push the same URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <label className="relative flex min-w-[min(100%,18rem)] flex-1 flex-col gap-1">
      <span className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.searchLabel}</span>
      <span className="relative">
        <span className="pointer-events-none absolute inset-y-0 start-3 grid place-items-center text-fg-muted">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
        </span>
        <input
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={c.searchPlaceholder}
          maxLength={100}
          className="h-10 w-full rounded-lg border border-line bg-surface-2 ps-9 pe-9 text-[length:var(--fs-text-sm)] text-fg placeholder:text-fg-faint focus:border-accent/60 focus:outline-none"
        />
        {value ? (
          <button
            type="button"
            onClick={() => setValue('')}
            aria-label={c.noteCancel}
            className="absolute inset-y-0 end-2 grid place-items-center text-fg-muted hover:text-fg"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </span>
    </label>
  );
}
