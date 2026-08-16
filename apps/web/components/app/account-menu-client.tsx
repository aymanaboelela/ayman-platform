'use client';

import Link from 'next/link';
import { ChevronDown, MonitorSmartphone, ShieldCheck, UserRound } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ayman/ui/components/dropdown-menu';
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
  identity,
  image,
  isAdmin,
}: {
  name: string;
  /** Email if there is one, else the phone — see `accountIdentityLabel`. */
  identity: string | null;
  image: string | null;
  isAdmin: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={copy.nav.accountMenu}
        /*
          The photo is the WHOLE control on a phone — the name beside it is
          `sm:block`, so below that width a 28px circle and a 14px chevron were
          the entire account menu. «الصورة بتاعت اليوزر دي كبرها شوية… هي كده مش
          مبينة له أي حاجة.» 36px reads as a face rather than a dot, and the
          44px row is the touch target that circle never filled.
        */
        className="flex h-11 items-center gap-2 rounded-md px-1.5 text-fg-muted transition-colors duration-[160ms] ease-out hover:bg-surface-3 hover:text-fg sm:h-9"
      >
        <UserAvatar name={name} image={image} size={36} />
        <span className="hidden max-w-[10rem] truncate text-[length:var(--fs-text-sm)] sm:block">
          {name}
        </span>
        <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[15rem]">
        <div className="flex items-center gap-3 px-2 py-2">
          <UserAvatar name={name} image={image} size={44} />
          <div className="min-w-0">
            <p className="truncate text-[length:var(--fs-text-sm)] font-medium text-fg">{name}</p>
            {/* `dir="ltr"` with logical alignment: an email is a Latin string
                whose dots and @ must not be reordered by the RTL paragraph
                direction, but it still sits against the inline-start edge. */}
            <p dir="ltr" className="truncate text-start text-[length:var(--fs-mono-label)] text-fg-muted">
              {identity}
            </p>
          </div>
        </div>

        <DropdownMenuSeparator className="my-1 h-px bg-line-subtle" />

        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserRound className="size-4 shrink-0" aria-hidden="true" />
            {copy.nav.profile}
          </Link>
        </DropdownMenuItem>

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
