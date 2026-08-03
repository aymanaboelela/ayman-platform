'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowUpLeft } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { BrandLockup } from '@/components/brand-lockup';
import { RailToggle } from './rail-toggle';
import { StudentNavFooterList, StudentNavList } from './student-nav-list';

/**
 * The signed-in student's navigation rail.
 *
 * RTL-native: it sits at the inline start — which IS the right-hand edge in an
 * RTL document — and its divider is `border-e`. There is no `left`/`right`
 * anywhere in this file, so it would work unchanged if an English locale ever
 * shipped. Same discipline as `components/admin/app-sidebar.tsx`.
 *
 * `hidden … md:block`: below the `md` breakpoint there is no rail at all and
 * the topbar's sheet carries the same links. A 76px permanent strip on a phone
 * costs a fifth of the viewport to save one tap.
 *
 * ## What this component does NOT own
 *
 * The collapsed width. That is CSS keyed on `html[data-rail]` and
 * `.shell[data-rail-forced]` (see `globals.css`), because the preference lives
 * in `localStorage` and the server cannot read it — rendering the width from
 * React state would paint the rail expanded on every load and snap it shut on
 * hydration. This file only marks WHICH parts disappear, with `rail__label`.
 *
 * `courses` arrives as a pre-rendered Server Component node from the layout,
 * so the rail can show live enrolment data without this client component (or
 * the layout above it) awaiting anything.
 */
export function StudentRail({ courses, forcedCollapsed }: { courses: ReactNode; forcedCollapsed: boolean }) {
  return (
    <aside className="hidden border-e border-line bg-surface-2 md:block">
      <div className="sticky top-0 flex h-dvh flex-col gap-4 overflow-y-auto p-3">
        <div className="flex items-center justify-between gap-2">
          {/*
            To /dashboard, not to /. Inside the shell the student's home IS the
            dashboard; the marketing site is a deliberate exit and has its own
            link in the footer below. No tagline — it wraps to three lines in a
            248px column and pushes the nav down.
          */}
          <Link
            href="/dashboard"
            className="rail__brand min-w-0 rounded-md"
            aria-label={copy.nav.dashboard}
          >
            <BrandLockup showTagline={false} />
          </Link>
          <RailToggle hidden={forcedCollapsed} />
        </div>

        <nav aria-label={copy.nav.mainNav}>
          <StudentNavList />
        </nav>

        {/*
          `min-h-0` with `flex-1`: without it a long course list refuses to
          shrink below its content height inside a flex column, and the footer
          links get pushed off the bottom of the viewport instead of the list
          scrolling.
        */}
        <div className="min-h-0 flex-1">
          <p className="rail__label eyebrow px-3 pb-2 text-fg-muted">{copy.nav.railCourses}</p>
          {courses}
        </div>

        <div className="border-t border-line pt-2">
          <StudentNavFooterList />
          <Link
            href="/"
            title={copy.nav.backToSite}
            className="rail__item flex h-10 items-center gap-3 rounded-md px-3 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-[160ms] ease-out hover:bg-surface-3 hover:text-fg"
          >
            <ArrowUpLeft className="size-4 shrink-0" aria-hidden="true" />
            <span className="rail__label truncate">{copy.nav.backToSite}</span>
          </Link>
        </div>
      </div>
    </aside>
  );
}
