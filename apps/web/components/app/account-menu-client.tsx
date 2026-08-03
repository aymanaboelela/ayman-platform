'use client';

import Link from 'next/link';
import { ChevronDown, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import { copy } from '@ayman/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ayman/ui';
import { SignOutButton } from '@/components/sign-out-button';
import { UserAvatar } from './user-avatar';

/**
 * The account dropdown. Purely presentational — every value is a prop from
 * `<AccountMenu>`, the Server Component that read the session, so this file
 * never touches auth and can be rendered in a test with plain strings.
 *
 * `align="end"` on the content, not `"start"`: the trigger sits at the
 * topbar's inline END, and Radix resolves `end` against the RTL direction the
 * `DropdownMenu` wrapper already defaults to — so the panel hangs under the
 * avatar instead of running off the viewport.
 *
 * The sign-out row reuses `<SignOutButton>` rather than a `DropdownMenuItem`
 * with an `onSelect`. That component owns something subtle and load-bearing:
 * it navigates with `window.location.assign`, because Next's client router
 * cache still holds every authenticated Server Component rendered before the
 * sign-out, and a soft navigation keeps painting the previous session's
 * dashboard from memory even though the cookie is gone.
 */
export function AccountMenuClient({
  name,
  email,
  image,
  isAdmin,
}: {
  name: string;
  email: string;
  image: string | null;
  isAdmin: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={copy.nav.accountMenu}
        className="flex h-9 items-center gap-2 rounded-md px-1.5 text-fg-muted transition-colors duration-[160ms] ease-out hover:bg-surface-3 hover:text-fg"
      >
        <UserAvatar name={name} image={image} size={28} />
        <span className="hidden max-w-[10rem] truncate text-[length:var(--fs-text-sm)] sm:block">
          {name}
        </span>
        <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[15rem]">
        <div className="flex items-center gap-3 px-2 py-2">
          <UserAvatar name={name} image={image} size={36} />
          <div className="min-w-0">
            <p className="truncate text-[length:var(--fs-text-sm)] font-medium text-fg">{name}</p>
            {/* `dir="ltr"` with logical alignment: an email is a Latin string
                whose dots and @ must not be reordered by the RTL paragraph
                direction, but it still sits against the inline-start edge. */}
            <p dir="ltr" className="truncate text-start text-[length:var(--fs-mono-label)] text-fg-muted">
              {email}
            </p>
          </div>
        </div>

        <DropdownMenuSeparator className="my-1 h-px bg-line-subtle" />

        <DropdownMenuItem asChild>
          <Link href="/settings/devices">
            <MonitorSmartphone className="size-4 shrink-0" aria-hidden="true" />
            {copy.nav.devices}
          </Link>
        </DropdownMenuItem>

        {isAdmin ? (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
              {copy.nav.adminPanel}
            </Link>
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator className="my-1 h-px bg-line-subtle" />

        {/*
          `onSelect` is prevented so Radix does not close the menu the instant
          the button is pressed: sign-out is async and shows a pending label,
          and unmounting it mid-flight would swallow the failure toast that
          `SignOutButton` raises when the request does not land.
        */}
        <DropdownMenuItem asChild onSelect={(event) => event.preventDefault()}>
          <SignOutButton className="px-2" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
