'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type MouseEvent } from 'react';
import { ChevronDown } from 'lucide-react';
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
export function guardActiveLink(isActive: boolean, onNavigate?: () => void) {
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
  // Which groups the student opened or shut by hand — see the fold note below.
  const [pressed, setPressed] = useState<Record<string, boolean>>({});

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
  /*
   * The labelled groups FOLD — «المذاكرة» · «درجاتي» · «التحديات» · «المحفظة
   * والكتب» — and only the one holding the current page opens on its own.
   *
   * Twenty-six rows one under the other was the rail a student scrolled to
   * find «شهاداتي» in; the four destinations of a normal evening (the `main`
   * group, no label) stay out in the open and everything else is one press
   * away under a name. A press is remembered for this mount, not stored: the
   * next page's rail opens on that page's group again, which is what makes
   * it read as «where am I».
   *
   * The collapsed rail (icons only) shows every group's icons regardless —
   * the toggle is a `.rail__label` and disappears with the labels, so a
   * folded body there would be icons nobody can reach. `globals.css` keys
   * that on the same three selectors the label rule uses.
   */

  return (
    <div className={['flex flex-col gap-3', className].filter(Boolean).join(' ')}>
      {STUDENT_NAV_GROUPS.map((group) => {
        const rows = items.filter((item) => item.group === group.id);
        if (rows.length === 0) return null;
        if (!group.labelAr) {
          return (
            <ul key={group.id} className="flex flex-col gap-1">
              {rows.map(renderItem)}
            </ul>
          );
        }
        const holdsActive = rows.some((item) => item.href === active?.href);
        const open = pressed[group.id] ?? holdsActive;
        const bodyId = `nav-fold-${group.id}`;
        return (
          <div key={group.id} className="nav-fold" data-open={open ? 'true' : 'false'}>
            <button
              type="button"
              className="nav-fold__head rail__label"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => setPressed((current) => ({ ...current, [group.id]: !open }))}
            >
              <span>{group.labelAr}</span>
              <span className="nav-fold__count">{rows.length}</span>
              <ChevronDown className="nav-fold__chevron size-4" aria-hidden="true" />
            </button>
            <ul id={bodyId} className="nav-fold__body flex flex-col gap-1">
              {rows.map(renderItem)}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

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
