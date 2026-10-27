'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { copy as bot } from '@ayman/contracts/copy/wa-bot';
import { LEAD_STATUSES, type LeadStatus } from '@ayman/contracts/wa-bot/schemas';
import { cn } from '@ayman/ui/lib/cn';
import { patchLeadAction } from '../wa-bot-actions';
import { STATUS_TONE } from './status-tone';

const c = bot.admin;

/** The status, changed in place — one select per row, coloured by what it says. */
export function LeadStatusSelect({ id, status }: { id: string; status: LeadStatus }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [pending, startTransition] = useTransition();

  function choose(next: LeadStatus) {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const result = await patchLeadAction(id, { status: next });
      if (!result.ok) {
        setValue(previous);
        toast.error(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.colStatus}</span>
      <select
        value={value}
        onChange={(event) => choose(event.target.value as LeadStatus)}
        style={{ ['--tone' as string]: `var(--${STATUS_TONE[value]})` }}
        className={cn(
          'h-9 min-w-[9rem] rounded-lg border px-3 text-[length:var(--fs-text-sm)] font-medium',
          'border-[color-mix(in_oklch,var(--tone),transparent_55%)] bg-[color-mix(in_oklch,var(--tone),transparent_88%)] text-[color:var(--tone)]',
          'transition-opacity duration-[160ms] ease-out focus:outline-none',
          pending && 'opacity-60',
        )}
      >
        {LEAD_STATUSES.map((option) => (
          <option key={option} value={option}>
            {c.statuses[option]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A note for the team, saved on blur — the row is where it is read. */
export function LeadNotes({ id, initial }: { id: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();

  function save() {
    if (value.trim() === saved.trim()) return;
    startTransition(async () => {
      const result = await patchLeadAction(id, { notes: value.trim() || null });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setSaved(value);
      toast.success(c.saved, { id: `lead-note-${id}` });
    });
  }

  return (
    <input
      type="text"
      value={value}
      maxLength={2000}
      placeholder={c.notesPlaceholder}
      aria-label={c.colNotes}
      onChange={(event) => setValue(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      className={cn(
        'mt-2 h-8 w-full rounded-md border border-line-subtle bg-surface-1 px-2.5',
        'text-[length:var(--fs-text-sm)] text-fg placeholder:text-fg-faint',
        'transition-[border-color,opacity] duration-[160ms] ease-out focus:border-accent focus:outline-none',
        pending && 'opacity-60',
      )}
    />
  );
}
