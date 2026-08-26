'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
// `/copy/admin`, not the plain `/copy` this used to import — needed for
// `copy.admin.payments.pendingBadgeLabel` below. Safe here specifically
// because this component only ever renders inside the admin layout
// (`AppSidebar`, the mobile sheet); see the header note on `copy/admin.ts`
// for why the same import would be wrong on a student route.
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { useInboxCount } from './inbox-alerts';
import { usePaymentsPendingCount } from './payments-alerts';
import { ADMIN_NAV, ADMIN_NAV_GROUPS, activeNavItem } from './nav-items';

/** `href` → the live count to badge it with, or `null` for every other link.
 *  One lookup, so a third badge is one more entry here rather than a second
 *  ternary chain next to this one. */
function badgeCountFor(href: string, inboxCount: number | null, paymentsCount: number | null): number | null {
  if (href === '/admin/inbox') return inboxCount;
  if (href === '/admin/payments') return paymentsCount;
  return null;
}

/** The `sr-only` sentence beside a badge — worded per screen, same as the
 *  count itself. */
function badgeLabelFor(href: string, n: number): string {
  return href === '/admin/payments'
    ? formatCopy(copy.admin.payments.pendingBadgeLabel, { n })
    : formatCopy(copy.assistant.inbox.badgeLabel, { n });
}

/**
 * The grouped link list, shared by the desktop sidebar and the mobile sheet.
 *
 * It existed as two near-identical inline `<ul>`s before — one in
 * `app-sidebar.tsx` and one in `admin-header.tsx`'s sheet — which is why only
 * the desktop one ever had an active state. One component, one active rule
 * (`activeNavItem`), both surfaces.
 */
export function AdminNavList({
  permissions,
  onNavigate,
}: {
  permissions: readonly string[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = activeNavItem(pathname);
  const visible = ADMIN_NAV.filter((item) => permissions.includes(item.permission));
  // `null` until the first poll answers, and on any session without an inbox.
  const inboxCount = useInboxCount();
  // Same shape, for the payments review queue — `null` on any session
  // without `payment:read`.
  const paymentsCount = usePaymentsPendingCount();

  return (
    <div className="flex flex-col gap-5">
      {ADMIN_NAV_GROUPS.map((group) => {
        const items = visible.filter((item) => item.group === group.id);
        if (items.length === 0) return null;

        return (
          <div key={group.id} className="flex flex-col gap-1">
            {group.labelAr ? (
              <p className="px-3 pb-1 text-[length:var(--fs-text-xs)] font-medium text-fg-muted">
                {group.labelAr}
              </p>
            ) : null}

            <ul className="flex flex-col gap-0.5">
              {items.map((item) => {
                const isActive = active?.href === item.href;
                const Icon = item.icon;
                /*
                 * The two screens where somebody is waiting on the other
                 * end — a reply, or a decision. `> 0` rather than `!==
                 * null`: a زيرو badge is a permanent «٠» that trains the eye
                 * to stop reading the number.
                 */
                const rawCount = badgeCountFor(item.href, inboxCount, paymentsCount);
                const badge = rawCount !== null && rawCount > 0 ? rawCount : null;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'relative flex items-center gap-2.5 rounded-md px-3 py-2',
                        'text-[length:var(--fs-text-sm)]',
                        'transition-colors duration-[160ms] ease-out',
                        isActive
                          ? 'bg-[color-mix(in_oklch,var(--a-9),transparent_88%)] font-medium text-accent-text'
                          : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
                      )}
                    >
                      {/* The active marker is on the inline START — the right
                          edge in this RTL document — so it reads as a tab
                          pulled out of the sidebar's own border. */}
                      {isActive ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-accent"
                        />
                      ) : null}
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.labelAr}</span>

                      {badge !== null ? (
                        <span
                          // The number is decorative to a screen reader — the
                          // sentence beside it is what gets announced, so «الوارد
                          // ٣» does not read as one word.
                          className="ms-auto grid min-w-5 shrink-0 place-items-center rounded-[var(--r-full)] bg-accent px-1.5 py-0.5 text-[length:var(--fs-text-xs)] font-medium tabular-nums text-[#1A1206]"
                        >
                          <span aria-hidden="true">{badge}</span>
                          <span className="sr-only">{badgeLabelFor(item.href, badge)}</span>
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
