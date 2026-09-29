'use client';

import { copy } from '@ayman/contracts/copy/admin';
import { cn } from '@ayman/ui/lib/cn';
import { useTabIsStale } from '@/lib/stale-tab';
import { useAutosaveSummary } from './autosave';

const c = copy.admin.autosave;

/**
 * The whole page's save state, in one line, in the header.
 *
 * It replaces roughly twenty «حفظ» buttons. That trade only works if this is
 * as trustworthy as they were, so it states the resting rule («بتتحفظ لوحدها
 * كمسودة») rather than going blank when nothing is happening — a blank space
 * where a save button used to be reads as a page that forgot to save.
 *
 * `aria-live="polite"` and not `assertive`: an editor typing a description does
 * not want «بيحفظ…» interrupting them every seven hundred milliseconds.
 */
export function SaveIndicator({ className }: { className?: string }) {
  const { status, error, retry } = useAutosaveSummary();
  const stale = useTabIsStale();

  if (status === 'error') {
    return (
      <p
        role="alert"
        aria-label={c.region}
        className={cn('flex items-center gap-2 text-[length:var(--fs-text-sm)]', className)}
      >
        <span aria-hidden="true" className="size-1.5 rounded-full bg-err" />
        <span className="text-err">{error ?? c.error}</span>
        {/* On a tab older than the server, «نجرّب تاني» re-sends the same
            dead Server Action id and fails identically — a document load is
            the only retry that can work. `lib/stale-tab.ts`. */}
        <button
          type="button"
          onClick={stale ? () => window.location.reload() : retry}
          className="underline"
        >
          {stale ? copy.common.staleBuildReload : c.retry}
        </button>
      </p>
    );
  }

  const busy = status === 'pending' || status === 'saving';
  const label = busy ? c.saving : status === 'saved' ? c.saved : c.idle;

  return (
    <p
      aria-live="polite"
      aria-label={c.region}
      className={cn(
        'flex items-center gap-2 text-[length:var(--fs-text-sm)] text-fg-muted',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 rounded-full transition-colors duration-200',
          busy ? 'bg-accent' : status === 'saved' ? 'bg-ok' : 'bg-line-strong',
        )}
      />
      {label}
    </p>
  );
}
