'use client';

import { useTransition } from 'react';
import { Check, Undo2 } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { cn } from '@ayman/ui/lib/cn';
import { setResolvedAction } from './actions';

const c = copy.admin.errors;

/**
 * «اعتبرها اتحلّت» / «رجّعها مفتوحة».
 *
 * A client island around one Server Action, so the page itself stays a Server
 * Component and the list keeps being rendered on the server — the same split
 * every other admin list uses.
 *
 * `useTransition` rather than a local `pending` flag: the action ends in
 * `revalidatePath`, and the transition is what keeps this button disabled
 * until the re-rendered list has actually arrived. A local flag would clear on
 * the action's promise and leave a moment where the row still shows its old
 * state under an enabled button, which is how a second click gets sent.
 *
 * A failure is deliberately silent here beyond re-enabling the button. The row
 * simply does not move, which is the truth; a toast on the ERROR page about
 * failing to dismiss an error is one layer too many.
 */
export function ResolveButton({ id, resolved }: { id: string; resolved: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await setResolvedAction(id, !resolved);
        })
      }
      title={resolved ? c.reopen : c.resolve}
      aria-label={resolved ? c.reopen : c.resolve}
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-lg border',
        'transition-colors duration-[160ms] ease-out disabled:opacity-50',
        resolved
          ? 'border-line text-fg-muted hover:bg-surface-3 hover:text-fg'
          : 'border-accent/40 text-accent-text hover:bg-accent/12',
      )}
    >
      {resolved ? (
        <Undo2 className="size-4" aria-hidden="true" />
      ) : (
        <Check className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}
