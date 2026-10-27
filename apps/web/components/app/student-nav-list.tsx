'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { MouseEvent } from 'react';
import { isPlainPress } from '@/lib/welcome-motion';
import { useStudentFeatureGate } from './student-features';
import { STUDENT_NAV, STUDENT_NAV_GROUPS, activeStudentNav, type StudentNavItem } from './student-nav-items';

/**
 * اللينك اللي الطالب واقف عليه أصلًا: `<Link>` بيدفع history entry جديدة حتى
 * لو الوجهة نفس الصفحة، فدوسة تانية على نفس الصفحة وهو واقف فيها كانت بتعمل
 * entry متكررة — وزرار الرجوع بيحتاج دوستين عشان يسيب الصفحة فعلًا
 * (`isPlainPress` نفسها اللي `welcome-scene.tsx` بيستخدمها لمنطق مشابه: دوسة
 * عادية بس، فتح تاب جديد أو دوسة طويلة يفضلوا زي ما هم). `onNavigate` لسه
 * بيتنفّذ عشان شيت الموبايل يقفل حتى لو الوجهة نفسها.
 */
function guardActiveLink(isActive: boolean, onNavigate?: () => void) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    onNavigate?.();
    if (isActive && isPlainPress(event)) event.preventDefault();
  };
}

/**
 * The rail's primary links, shared with the mobile sheet — one list, one
 * active-state rule, rendered more than once. The admin surface arrived at the
 * same arrangement (`components/admin/admin-nav-list.tsx`) after the sheet and
 * the sidebar drifted apart.
 *
 * `only` splits the sheet into two groups without splitting the table: see the
 * prop's own note. The rail passes nothing and gets the whole list, exactly as
 * before.
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
  only,
}: {
  onNavigate?: () => void;
  className?: string;
  /**
   * تقسيم الشيت بتاع الفون لمجموعتين، من نفس الجدول.
   *
   * `undefined` = كل اللينكات الأساسية، وده اللي الريل بيطلبه: عمود واحد على
   * الشاشة الكبيرة مفيهوش زحمة.
   *
   * `'rest'` = اللي **مش** في الشريط السفلي («التأسيس»، «كود الكورس»،
   * «الكتب»، «تجربة الكود»). دي الحاجات اللي القائمة هي مكانها الوحيد، فبقت
   * أول اللي الطالب يشوفه لما يفتحها.
   *
   * `'tabs'` = الأربعة اللي في الشريط. مانزلوش من الشيت — نزلوا **تحت** بعنوان
   * بس. شيلهم خالص كان بيوفّر أربع صفوف، والتمن إن طالب دوّر على «نتائجي» في
   * القائمة ومالقاهاش؛ الشريط تحته فيه والاتنين بنفس البريك بوينت، بس «دوّرت
   * ومالقيتش» إحساس مايستاهلش أربع صفوف.
   */
  only?: 'tabs' | 'rest';
}) {
  const pathname = usePathname();
  const active = activeStudentNav(pathname);
  const allowed = useStudentFeatureGate();

  const items = STUDENT_NAV.filter((item) => {
    if (item.footer || !allowed(item.feature)) return false;
    if (only === 'tabs') return item.tab === true;
    if (only === 'rest') return item.tab !== true;
    return true;
  });

  const renderItem = (item: StudentNavItem) => {
    const isActive = active?.href === item.href;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={guardActiveLink(isActive, onNavigate)}
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
  };

  // The sheet's «الوصول السريع» block is four rows under its own eyebrow —
  // section headings inside it would be four headings for four rows.
  if (only === 'tabs') {
    return (
      <ul className={['flex flex-col gap-1', className].filter(Boolean).join(' ')}>
        {items.map(renderItem)}
      </ul>
    );
  }

  /*
   * One block per section. The heading carries `.rail__label`, so the
   * collapsed rail drops it with every other word and the block gap alone
   * keeps the sections apart. A section with nothing allowed in it (every row
   * behind an entitlement the stack has off) renders nothing — not an orphan
   * heading.
   */
  return (
    <div className={['flex flex-col gap-4', className].filter(Boolean).join(' ')}>
      {STUDENT_NAV_GROUPS.map((group) => {
        const rows = items.filter((item) => item.group === group.id);
        if (rows.length === 0) return null;
        return (
          <div key={group.id} className="flex flex-col gap-1">
            {group.labelAr ? <p className="nav-section__head rail__label">{group.labelAr}</p> : null}
            <ul className="flex flex-col gap-1">{rows.map(renderItem)}</ul>
          </div>
        );
      })}
    </div>
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
  const allowed = useStudentFeatureGate();

  return (
    <ul className="flex flex-col gap-1">
      {STUDENT_NAV.filter((item) => item.footer && allowed(item.feature)).map((item) => {
        const isActive = active?.href === item.href;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={guardActiveLink(isActive, onNavigate)}
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
