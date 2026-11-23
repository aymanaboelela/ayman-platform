'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Award, ChevronDown, Globe, GraduationCap, MonitorPlay, Wallet, Zap, type LucideIcon } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { BrandLockup } from '@/components/brand-lockup';
import { SignOutButton } from '@/components/sign-out-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { useStudentFeatureGate } from './student-features';
import { guardActiveLink } from './student-nav-list';
import {
  STUDENT_NAV,
  STUDENT_NAV_GROUPS,
  STUDENT_TABS,
  activeStudentNav,
  type StudentNavGroup,
  type StudentNavItem,
} from './student-nav-items';
import './drawer-cinema.css';

/** The lead glyph on each folded group's head. The rows inside keep their own. */
const GROUP_ICONS: Record<Exclude<StudentNavGroup, 'main'>, LucideIcon> = {
  study: GraduationCap,
  grades: Award,
  play: Zap,
  money: Wallet,
};

/** The pseudo-group the streamed course list folds under. */
const COURSES_FOLD = 'courses';

/**
 * The phone menu's contents — the sheet itself (open/close, focus trap,
 * scroll lock, back-to-close) stays `SheetContent`'s, in `student-topbar.tsx`.
 *
 * «مش بحب الزحمة للطالب». The old sheet was one long column — every row the
 * same weight, the four bottom-bar destinations repeated under their own
 * heading, the courses, the footer — and a student scrolled a screen and a half
 * to find «شهاداتي». It is three layers now, each saying less than the last:
 *
 *   1. who and where — the brand, then the account (`DrawerAccount`, a server
 *      node: name, phone/email, overall progress), on a dark band;
 *   2. the four places a normal evening goes — the same `STUDENT_TABS` the
 *      bottom bar reads — as a 2×2 of big tiles, the current one solid;
 *   3. everything else FOLDED under the rail's own section names, with a
 *      count, one open at a time and its rows in two columns.
 *
 * Then the set-once things at the foot. Every link the old sheet carried is
 * still here; nothing became unreachable to make it quiet.
 *
 * Generic on purpose: structure reads the `--e-*` ramp and action the `--a-*`
 * one, which every stack has (his re-cut to blue/orange by «Cinema», a
 * teacher's re-cut to their own hue by their branding row). The brand comes
 * from `BrandLockup`, which already gates the portrait and the name.
 */
export function DrawerMenu({
  account,
  courses,
  onNavigate,
}: {
  /** `DrawerAccount`, pre-rendered by the layout. */
  account?: ReactNode;
  /** `RailCourses`, the same node the rail draws. */
  courses: ReactNode;
  /** Closes the sheet. */
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const active = activeStudentNav(pathname);
  const allowed = useStudentFeatureGate();

  const shown = (item: StudentNavItem) => allowed(item.feature);
  const tabs = STUDENT_TABS.filter(shown);

  /*
    The folds hold every row that is neither a tile nor a foot item — which is
    why `/results` is not counted under «درجاتي» here although the rail files
    it there: it is already a tile two inches above, and a row twice in one
    small sheet is exactly the clutter this layout exists to remove.
  */
  const folds = STUDENT_NAV_GROUPS.flatMap((group) => {
    if (group.id === 'main' || !group.labelAr) return [];
    const rows = STUDENT_NAV.filter(
      (item) => item.group === group.id && !item.tab && !item.footer && shown(item),
    );
    return rows.length === 0 ? [] : [{ id: group.id, label: group.labelAr, icon: GROUP_ICONS[group.id], rows }];
  });

  /*
    The foot: «كود الكورس» (the `main` row that is not a tab), the marketing
    site, and the account. `/profile` is named rather than derived because the
    table's `footer` flag also covers «أجهزتي», which goes on the quieter line
    under the tiles with the theme switch and sign-out.
  */
  const footLinks = STUDENT_NAV.filter((item) => item.group === 'main' && !item.tab && !item.footer && shown(item));
  const profile = STUDENT_NAV.find((item) => item.href === '/profile');
  const quietLinks = STUDENT_NAV.filter((item) => item.footer && item.href !== '/profile' && shown(item));

  /*
    One fold open at a time: the one holding the current page, else — in a
    course, where the active entry is the «الكورسات» tile — the course list,
    else the first group, which is the state the approved board shows. A press
    overrides it for as long as the sheet is open; Radix unmounts the content
    on close, so the next opening starts from «where am I» again.
  */
  const holding = folds.find((fold) => fold.rows.some((row) => row.href === active?.href))?.id;
  const fallback = holding ?? (active?.href === '/library' ? COURSES_FOLD : folds[0]?.id ?? null);
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const openId = chosen === undefined ? fallback : chosen;
  const toggle = (id: string) => setChosen(openId === id ? null : id);

  const link = (item: StudentNavItem, className: string, label = item.labelAr) => {
    const isActive = active?.href === item.href;
    return (
      <Link
        href={item.href}
        onClick={guardActiveLink(isActive, onNavigate)}
        aria-current={isActive ? 'page' : undefined}
        title={item.labelAr}
        className={className}
      >
        <item.icon aria-hidden="true" />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <>
      <div className="dmenu__head">
        <div className="dmenu__brand">
          <BrandLockup tone="ink" showTagline={false} />
        </div>
        {account}
      </div>

      <div className="dmenu__body">
        <nav aria-label={copy.nav.mainNav} className="dmenu__nav">
          <ul className="dmenu__tiles" aria-label={copy.nav.menuQuick}>
            {tabs.map((item) => (
              <li key={item.href}>{link(item, 'dmenu__tile')}</li>
            ))}
          </ul>

          <div className="dmenu__folds">
            <Fold
              id={COURSES_FOLD}
              label={copy.nav.railCourses}
              icon={MonitorPlay}
              open={openId === COURSES_FOLD}
              onToggle={toggle}
            >
              <div className="dmenu__courses">{courses}</div>
            </Fold>
            {folds.map((fold) => (
              <Fold
                key={fold.id}
                id={fold.id}
                label={fold.label}
                icon={fold.icon}
                count={fold.rows.length}
                open={openId === fold.id}
                onToggle={toggle}
              >
                <ul className="dmenu__rows">
                  {fold.rows.map((row) => (
                    <li key={row.href}>{link(row, 'dmenu__row')}</li>
                  ))}
                </ul>
              </Fold>
            ))}
          </div>
        </nav>

        <div className="dmenu__foot">
          <ul className="dmenu__foot-tiles">
            {footLinks.map((item) => (
              <li key={item.href}>{link(item, 'dmenu__foot-tile')}</li>
            ))}
            <li>
              <Link href="/" onClick={onNavigate} title={copy.nav.backToSite} className="dmenu__foot-tile">
                <Globe aria-hidden="true" />
                <span>{copy.nav.menuSite}</span>
              </Link>
            </li>
            {profile ? <li>{link(profile, 'dmenu__foot-tile')}</li> : null}
          </ul>

          {/*
            The quiet line: things done once and then never again. The theme
            switch does NOT close the sheet — changing the theme is something you
            do to look at, and shutting the panel would hide what just changed.
          */}
          <div className="dmenu__quiet">
            {quietLinks.map((item) => (
              <span key={item.href}>{link(item, 'dmenu__quiet-link')}</span>
            ))}
            <ThemeToggle className="dmenu__theme" />
            <SignOutButton className="dmenu__signout" />
          </div>
        </div>
      </div>
    </>
  );
}

function Fold({
  id,
  label,
  icon: Icon,
  count,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Omitted for the course list: it streams in as a server node whose length this side never sees. */
  count?: number;
  open: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}) {
  const bodyId = `dmenu-fold-${id}`;
  return (
    <div className="dmenu__fold" data-open={open ? 'true' : undefined}>
      <button
        type="button"
        className="dmenu__fold-head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => onToggle(id)}
      >
        <span className="dmenu__fold-lead" aria-hidden="true">
          <Icon />
        </span>
        <span className="dmenu__fold-label">{label}</span>
        {count === undefined ? null : <span className="dmenu__fold-count">{count}</span>}
        <ChevronDown className="dmenu__fold-chevron" aria-hidden="true" />
      </button>
      <div id={bodyId} className="dmenu__fold-body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
