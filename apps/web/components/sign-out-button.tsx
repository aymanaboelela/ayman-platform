'use client';

import { useState, type ComponentProps } from 'react';
import { LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy';
import { cn } from '@ayman/ui/lib/cn';
import { signOut } from '@/lib/auth-client';

/**
 * The product's only way out. Before this existed a signed-in student had no
 * sign-out control anywhere — the session simply lived until its cookie
 * expired, which on a shared machine is the whole problem.
 *
 * `window.location.assign`, deliberately, not `router.push`/`router.replace`:
 * Next's client router cache holds the rendered output of every authenticated
 * Server Component from before the sign-out, so a soft navigation would keep
 * painting the previous session's dashboard from memory even though the cookie
 * is already gone. A full document load is the only thing that discards it.
 *
 * ## Why it spreads the rest of its props
 *
 * It used to accept `className` and nothing else. That was fine while it was
 * only ever rendered on its own, and silently wrong the moment the account
 * menu rendered it through Radix's `<DropdownMenuItem asChild>`: `asChild`
 * hands the child everything the item would have rendered — `role="menuitem"`,
 * the `ref` Radix needs for roving focus, its keyboard and pointer handlers,
 * `data-highlighted` — and every one of them was dropped on the floor. The row
 * looked right and was not a menu item: arrow keys skipped it, it never
 * highlighted, and assistive tech announced a stray button inside a menu.
 *
 * `onClick` is composed rather than overwritten for the same reason — the
 * incoming handler is how Radix learns the item was activated.
 */
export function SignOutButton({ className, onClick, ...rest }: ComponentProps<'button'>) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (pending) return;
    setPending(true);
    try {
      await signOut();
    } catch {
      // The session may or may not have survived; either way the honest move is
      // to say so and leave the user where they are rather than pretending.
      toast.error(copy.nav.logoutFailed);
      setPending(false);
      return;
    }
    window.location.assign('/');
  }

  return (
    <button
      type="button"
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        void handleClick();
      }}
      // After the spread on purpose: `pending` is this component's own state
      // and must not be overridable by a caller that happened to pass
      // `disabled`.
      disabled={pending}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-start',
        'text-[length:var(--fs-text-sm)] text-fg-muted',
        'transition-colors duration-[160ms] ease-out hover:bg-surface-3 hover:text-fg',
        'disabled:pointer-events-none disabled:opacity-60',
        className,
      )}
    >
      <LogOut className="size-4 shrink-0" aria-hidden="true" />
      {pending ? copy.nav.loggingOut : copy.nav.logout}
    </button>
  );
}
