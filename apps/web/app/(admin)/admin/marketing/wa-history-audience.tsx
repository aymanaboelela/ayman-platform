'use client';

import { AlertTriangle, MessageCircle } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/wa-history';
import { formatCopy } from '@ayman/contracts/format';
import type { WaHistoryFilter, WaHistorySummary } from '@ayman/contracts/marketing/wa-history';
import { cn } from '@ayman/ui/lib/cn';

const c = copy.audience;

/** The radio order: no filter, the safe one, the risky one. */
const OPTIONS = ['any', 'chatted', 'never'] as const;
type Option = (typeof OPTIONS)[number];

/**
 * «كلّموني على واتساب قبل كده؟» — the campaign audience's chat axis.
 *
 * Its own component rather than more lines in `campaign-form.tsx`, which is
 * already the longest form in the admin; the form only renders this when the
 * stack has `whatsapp.history`.
 *
 * ## Why «مكلّمونيش» slows the campaign down by itself
 *
 * Every message to somebody with no chat is a new-chat initiation — the
 * traffic WhatsApp meters separately and bans numbers for in bursts. So
 * picking it does two things the admin can see: a red warning that stays for
 * as long as it is picked, and `onRisky`, which the form uses to pull the
 * pacing back to the conservative defaults (`noFasterThan`). The admin may
 * still speed it up afterwards; the point is that the risky audience never
 * STARTS fast.
 *
 * Radios, not a checkbox pair: «كلّموني AND مكلّمونيش» is nobody and
 * «كلّموني OR مكلّمونيش» is everybody, and neither is a third option worth
 * offering.
 */
export function WaHistoryAudience({
  value,
  onChange,
  onRisky,
  summary,
}: {
  value: WaHistoryFilter | null;
  onChange: (next: WaHistoryFilter | null) => void;
  onRisky: () => void;
  /** `null` when the summary could not be read — the radios still work. */
  summary: WaHistorySummary | null;
}) {
  const current: Option = value ?? 'any';
  const noHistory = summary !== null && summary.syncedAt === null;

  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border border-line-subtle p-3">
      <legend className="flex items-center gap-1.5 px-1 text-[length:var(--fs-text-sm)] font-medium text-fg">
        <MessageCircle aria-hidden="true" className="size-4 text-[color:var(--ok)]" />
        {c.title}
      </legend>

      {summary && summary.syncedAt !== null ? (
        <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
          {formatCopy(c.summary, {
            chats: summary.chats.toLocaleString('ar-EG'),
            students: summary.students.toLocaleString('ar-EG'),
            parents: summary.parents.toLocaleString('ar-EG'),
          })}
        </p>
      ) : null}

      {OPTIONS.map((option) => (
        <label
          key={option}
          className={cn(
            'flex items-start gap-2 rounded-md p-2',
            option === 'chatted' &&
              'border border-[color-mix(in_oklch,var(--ok),transparent_60%)] bg-[color-mix(in_oklch,var(--ok),transparent_92%)]',
            option === 'never' &&
              'border border-[color-mix(in_oklch,var(--err),transparent_60%)] bg-[color-mix(in_oklch,var(--err),transparent_92%)]',
          )}
        >
          <input
            type="radio"
            name="campaign-wa-history"
            value={option}
            checked={current === option}
            onChange={() => {
              onChange(option === 'any' ? null : option);
              if (option === 'never') onRisky();
            }}
            className="mt-1 size-4"
          />
          <span>
            <span className="flex items-center gap-1.5 text-[length:var(--fs-text-sm)] text-fg">
              {option === 'never' ? (
                <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-[color:var(--err)]" />
              ) : null}
              {c.options[option]}
            </span>
            <span className="block text-[length:var(--fs-text-xs)] text-fg-muted">{c.hints[option]}</span>
          </span>
        </label>
      ))}

      {current === 'never' ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-[color-mix(in_oklch,var(--err),transparent_50%)] bg-[color-mix(in_oklch,var(--err),transparent_88%)] p-2.5 text-[length:var(--fs-text-sm)] text-fg"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[color:var(--err)]" />
          <span>
            {c.neverWarning}
            {noHistory ? <span className="mt-1 block font-medium">{c.noHistory}</span> : null}
          </span>
        </p>
      ) : noHistory && current === 'chatted' ? (
        <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.noHistory}</p>
      ) : null}
    </fieldset>
  );
}
