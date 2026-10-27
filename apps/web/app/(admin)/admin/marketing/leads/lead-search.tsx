'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Search } from 'lucide-react';
import { copy as bot } from '@ayman/contracts/copy/wa-bot';
import { cn } from '@ayman/ui/lib/cn';

const c = bot.admin;

/** Phone, WhatsApp name or note — submitted on Enter, cleared with one press. */
export function LeadSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();

  function go(next: string) {
    const query = new URLSearchParams(params.toString());
    if (next.trim()) query.set('q', next.trim());
    else query.delete('q');
    query.delete('page');
    startTransition(() => router.push(query.size === 0 ? '?' : `?${query}`, { scroll: false }));
  }

  return (
    <form
      role="search"
      className="flex items-end gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        go(value);
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.search}</span>
        <span className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-faint" aria-hidden="true" />
          <input
            type="search"
            value={value}
            maxLength={60}
            onChange={(event) => setValue(event.target.value)}
            className={cn(
              'h-9 w-56 rounded-lg border border-line bg-surface-2 ps-8 pe-3',
              'text-[length:var(--fs-text-sm)] text-fg',
              'hover:border-accent/40 focus:border-accent focus:outline-none',
              pending && 'opacity-60',
            )}
          />
        </span>
      </label>
      <button
        type="submit"
        className="h-9 rounded-lg border border-line px-3 text-[length:var(--fs-text-sm)] text-fg-muted hover:border-accent/40 hover:text-fg"
      >
        {c.searchGo}
      </button>
    </form>
  );
}
