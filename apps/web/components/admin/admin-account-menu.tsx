'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ChevronDown, KeyRound, UserCog } from 'lucide-react';
import { adminAccount } from '@ayman/contracts/copy/admin-account';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ayman/ui/components/dropdown-menu';

const a = adminAccount.menu;

/** The password section's own id, and its first field's — see the form. */
export const PASSWORD_SECTION_ID = 'password';
export const PASSWORD_FIELD_ID = 'admin-current-password';

/**
 * «حسابي» — the admin header's account menu, with the password one tap in.
 *
 * The profile page shipped with a working password form behind a single,
 * unlabelled person-and-cog icon, and the owner went looking for it and
 * reported that it did not exist. So the door is now a labelled menu whose
 * second item IS the password, landing on its section with the first field
 * focused.
 *
 * Focus is handled twice because the destination may or may not already be on
 * screen. Arriving from another page, the form focuses itself on mount when
 * the URL carries `#password`. Already ON the profile page, a hash-only
 * navigation re-renders nothing and fires no `hashchange` (the App Router
 * uses `pushState`), so the menu moves focus itself — from `onCloseAutoFocus`,
 * the moment Radix would otherwise hand focus back to the trigger and undo it.
 *
 * `align="end"` against the trigger at the header's inline end, as the
 * student's own account menu does; `modal={false}` is the wrapper's default,
 * for the scroll-lock reason `dropdown-menu.tsx` documents.
 */
export function AdminAccountMenu({ identity }: { identity: string | null }) {
  const toPasswordRef = useRef(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={a.label}
        className="flex h-9 items-center gap-1.5 rounded-md border border-line px-2 text-fg-muted transition-colors duration-[160ms] hover:bg-surface-3 hover:text-fg"
      >
        <UserCog className="size-4" aria-hidden="true" />
        <span className="hidden text-[length:var(--fs-text-sm)] lg:inline">{a.label}</span>
        <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="min-w-[15rem]"
        onCloseAutoFocus={(event) => {
          if (!toPasswordRef.current) return;
          toPasswordRef.current = false;
          const field = document.getElementById(PASSWORD_FIELD_ID);
          // Not on the page yet (a cross-page navigation): the form focuses
          // itself when it mounts. Either way the trigger must not take it.
          event.preventDefault();
          field?.focus();
        }}
      >
        {identity ? (
          <>
            {/* `dir="ltr"`: an email's dots and @ must not be reordered by the
                RTL paragraph around it. */}
            <p dir="ltr" className="truncate px-2 py-2 text-start text-[length:var(--fs-mono-label)] text-fg-muted">
              {identity}
            </p>
            <DropdownMenuSeparator className="my-1 h-px bg-line-subtle" />
          </>
        ) : null}

        <DropdownMenuItem asChild>
          <Link href="/admin/profile">
            <UserCog className="size-4 shrink-0" aria-hidden="true" />
            {a.profile}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link
            href={`/admin/profile#${PASSWORD_SECTION_ID}`}
            onClick={() => {
              toPasswordRef.current = true;
            }}
          >
            <KeyRound className="size-4 shrink-0" aria-hidden="true" />
            {a.changePassword}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
