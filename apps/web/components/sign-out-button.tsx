'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
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
 */
export function SignOutButton({ className }: { className?: string }) {
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
      onClick={() => void handleClick()}
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
