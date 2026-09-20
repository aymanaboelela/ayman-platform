'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
// `/copy/admin`, not the plain `/copy` this used to import — needed for
// `copy.admin.payments.pendingBadgeLabel` below. Safe here specifically
// because this component only ever renders inside the admin layout
// (`AppSidebar`, the mobile sheet); see the header note on `copy/admin.ts`
// for why the same import would be wrong on a student route.
import type { Entitlements } from '@ayman/contracts/admin/entitlements';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { useInboxCount } from './inbox-alerts';
import { usePaymentsPendingCount } from './payments-alerts';
import { useBookOrdersUnshippedCount } from './book-orders-alerts';
import { useHomeworkPendingCount } from './homework-alerts';
import { ADMIN_NAV_GROUPS, activeNavItem, visibleNavItems } from './nav-items';

/** `href` → the live count to badge it with, or `null` for every other link.
 *  One lookup, so a third badge is one more entry here rather than a second
 *  ternary chain next to this one. */
function badgeCountFor(
  href: string,
  inboxCount: number | null,
  paymentsCount: number | null,
  bookOrdersCount: number | null,
  homeworkCount: number | null,
): number | null {
  if (href === '/admin/inbox') return inboxCount;
  if (href === '/admin/payments') return paymentsCount;
  // Parcels that are paid for and not yet shipped — somebody is waiting on the
  // other end of this one too, which is the rule this list's badges follow.
  if (href === '/admin/books') return bookOrdersCount;
  // Answers waiting on a mark — a student is on the other end of this one too.
  if (href === '/admin/homework') return homeworkCount;
  return null;
}

/** The `sr-only` sentence beside a badge — worded per screen, same as the
 *  count itself. */
function badgeLabelFor(href: string, n: number): string {
  if (href === '/admin/payments') {
    return formatCopy(copy.admin.payments.pendingBadgeLabel, { n });
  }
  if (href === '/admin/books') {
    return formatCopy(copy.admin.books.unshippedBadgeLabel, { n });
  }
  if (href === '/admin/homework') {
    return formatCopy(copy.admin.homework.pendingBadgeLabel, { n });
  }
  return formatCopy(copy.assistant.inbox.badgeLabel, { n });
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
  features,
  onNavigate,
}: {
  permissions: readonly string[];
  /**
   * إيه اللي الستاك ده مسموح له يعرضه، محسوبة في السيرفر ومتمرّرة كـprop —
   * زي `permissions` فوقها بالظبط، ولنفس السبب.
   *
   * ⚠️ **مش** `process.env.TENANT_ENTITLEMENTS` مقروءة هنا. ده ملف
   * `'use client'`، والمتغيّر بيبقى `undefined` في المتصفح إلا لو اتحقن في
   * `next.config.ts` — وساعتها يبقى قيمة وقت بناء، والسيرفر والكلاينت
   * يرسموا سايدبارين مختلفين لو اتغيّر. الكومنت في `next.config.ts:19` بيحكي
   * نفس الباج ده لما حصل مع صورة على ستاك تاني.
   */
  features: Entitlements;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = activeNavItem(pathname);
  // `visibleNavItems`, not an inline filter: the same rule has to run on
  // `/admin`'s section grid, and a section hidden from one of the two is a
  // section that still has a door.
  const visible = visibleNavItems(permissions, features);
  // `null` until the first poll answers, and on any session without an inbox.
  const inboxCount = useInboxCount();
  // Same shape, for the payments review queue — `null` on any session
  // without `payment:read`.
  const paymentsCount = usePaymentsPendingCount();
  // And for parcels owed — `null` on any session without `book-order:read`.
  const bookOrdersCount = useBookOrdersUnshippedCount();
  // And for answers awaiting a mark — `null` on any session without
  // `homework:read`.
  const homeworkCount = useHomeworkPendingCount();

  return (
    <div className="flex flex-col gap-5">
      {ADMIN_NAV_GROUPS.map((group) => {
        const items = visible.filter((item) => item.group === group.id);
        if (items.length === 0) return null;

        return (
          <div key={group.id} className="flex flex-col gap-1">
            {group.labelAr ? <p className="nav-group__head">{group.labelAr}</p> : null}

            <ul className="flex flex-col gap-1">
              {items.map((item) => {
                const isActive = active?.href === item.href;
                const Icon = item.icon;
                /*
                 * The two screens where somebody is waiting on the other
                 * end — a reply, or a decision. `> 0` rather than `!==
                 * null`: a زيرو badge is a permanent «٠» that trains the eye
                 * to stop reading the number.
                 */
                const rawCount = badgeCountFor(
                  item.href,
                  inboxCount,
                  paymentsCount,
                  bookOrdersCount,
                  homeworkCount,
                );
                const badge = rawCount !== null && rawCount > 0 ? rawCount : null;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={isActive ? 'page' : undefined}
                      // `.nav-pill` — the same object the student rail wears.
                      // The active state, the start marker and the badge all
                      // live in globals.css now: two lists drawing one state
                      // two ways was how the admin ended up amber-tinted and
                      // the student flat grey for the identical "you are here".
                      className="nav-pill"
                    >
                      <span className="nav-pill__well" aria-hidden="true">
                        <Icon className="size-4" />
                      </span>
                      <span className="nav-pill__label">{item.labelAr}</span>

                      {badge !== null ? (
                        <span
                          // The number is decorative to a screen reader — the
                          // sentence beside it is what gets announced, so «الوارد
                          // ٣» does not read as one word.
                          className="nav-pill__badge"
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
