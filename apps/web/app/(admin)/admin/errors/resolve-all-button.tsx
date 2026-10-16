'use client';

import { useTransition } from 'react';
import { CheckCheck } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { cn } from '@ayman/ui/lib/cn';
import { resolveAllAction } from './actions';

const c = copy.admin.errors;

/**
 * «اعتبر الكل اتحل» — mark every open issue as resolved in one press.
 */
export function ResolveAllButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await resolveAllAction();
        })
      }
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3.5 py-1.5',
        'text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-[160ms] ease-out',
        'hover:border-accent/40 hover:text-fg disabled:opacity-50',
      )}
    >
      <CheckCheck className="size-4 text-accent-text" aria-hidden="true" />
      <span>{c.resolveAll}</span>
    </button>
  );
}
