'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { STUDENT_NAV, activeStudentNav } from './student-nav-items';

/**
 * The rail's primary links, shared verbatim with the mobile sheet — one list,
 * one active-state rule, rendered twice. The admin surface arrived at the same
 * arrangement (`components/admin/admin-nav-list.tsx`) after the sheet and the
 * sidebar drifted apart.
 *
 * `activeStudentNav` decides what is current, rather than each item testing
 * the pathname itself: with per-item `startsWith` both `/courses` and
 * `/settings/devices` can match at once, and two links end up carrying
 * `aria-current="page"` — which is not merely untidy, it tells a screen reader
 * the user is in two places.
 *
 * `.rail__label` is what CSS removes in the collapsed rail. The icon is
 * `aria-hidden` and the label is the accessible name, so hiding the label with
 * `display: none` would leave the link nameless — hence `title` on the anchor,
 * which also gives sighted users a hover tooltip in the icon-only state.
 */
export function StudentNavList({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const active = activeStudentNav(pathname);

  return (
    <ul className={['flex flex-col gap-1', className].filter(Boolean).join(' ')}>
      {STUDENT_NAV.filter((item) => !item.footer).map((item) => {
        const isActive = active?.href === item.href;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              title={item.labelAr}
              aria-current={isActive ? 'page' : undefined}
              // `.rail__item` stays alongside `.nav-pill`: the collapsed-rail
              // rules in globals.css are keyed on it, and they are guarded by
              // a breakpoint this component must not second-guess.
              className="nav-pill rail__item"
            >
              <span className="nav-pill__well" aria-hidden="true">
                <item.icon className="size-4" />
              </span>
              <span className="nav-pill__label rail__label">{item.labelAr}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The rail's footer links — `أجهزتي` today. Split from the list above rather
 * than filtered inline at the call site so the two consumers cannot disagree
 * about which group an item belongs to; `footer` on the table is the single
 * answer.
 */
export function StudentNavFooterList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = activeStudentNav(pathname);

  return (
    <ul className="flex flex-col gap-1">
      {STUDENT_NAV.filter((item) => item.footer).map((item) => {
        const isActive = active?.href === item.href;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              title={item.labelAr}
              aria-current={isActive ? 'page' : undefined}
              // `.rail__item` stays alongside `.nav-pill`: the collapsed-rail
              // rules in globals.css are keyed on it, and they are guarded by
              // a breakpoint this component must not second-guess.
              className="nav-pill rail__item"
            >
              <span className="nav-pill__well" aria-hidden="true">
                <item.icon className="size-4" />
              </span>
              <span className="nav-pill__label rail__label">{item.labelAr}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
