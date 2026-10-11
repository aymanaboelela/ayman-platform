'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ArrowUpLeft } from 'lucide-react';
// The `/copy` subpath, not the root barrel: the rail is on every `(app)` route,
// and through the barrel four nav labels dragged 539 KB raw / 128 KB gzip of
// zod schemas, libphonenumber's 245-country table and the admin copy table onto
// every signed-in page's client manifest.
import { copy } from '@ayman/contracts/copy';
import { BrandLockup } from '@/components/brand-lockup';
import { isPlainPress } from '@/lib/welcome-motion';
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
  const pathname = usePathname();
  const onDashboard = pathname === '/dashboard';

  return (
    /* `rail` هو جذر البلوك اللي `rail__head` و`rail__label` و`rail__brand` و
       `rail__item` كلهم فروعه — كان ناقص، والستايل شيت كان بيوصل للفروع من غير
       ما يبقى فيه كلاس على الأب. مفيش قاعدة CSS عليه دلوقتي؛ موجود عشان التسمية
       تبقى كاملة وعشان يبقى فيه ممسك مستقر لقياس العرض. */
    <aside className="rail hidden border-e border-line bg-surface-2 md:block">
      {/*
        بيعمل سكرول لما **مايبقاش فيه مكان**، ومش بيعمل قبل كده.

        ## اللي كان مكتوب هنا، وليه كان ناقص نص

        كان `overflow-hidden` بحجّة: «السكرول بتاع ليستة الكورسات لوحدها؛
        البراند والتنقّل والفوتر أثاث ثابت لازم يفضل على الشاشة». والحجة دي
        حلّت باج حقيقي — طالب عنده اتناشر كورس كانت ليستته بتتطبع **فوق**
        «أجهزتي» و«الموقع الرئيسي».

        بس «لازم يفضل على الشاشة» مش قرار — ده **افتراض** إن فيه مكان. وعلى
        شباك قصير مفيش: البراند + ٧ لينكات + الفوتر لوحدهم بيعدّوا الارتفاع،
        فالمتصفح كان بيقص — والمقصوص كان آخر التنقّل والفوتر كله. اللي في
        الصورة: الليستة بتقف عند «التأسيس» ومفيش طريقة توصل لاللي بعدها.
        `overflow-hidden` معناه «مش هتوصلها»، مش «هتفضل على الشاشة».

        ## وليه الباج القديم مش بيرجع

        سببه إن الليستة **ماكانش عندها سكرول بتاعها**. دلوقتي عندها
        (`min-h-0 flex-1 overflow-y-auto` تحت)، فهي بتمتص فيضانها بنفسها —
        والحالة الطبيعية مابيبقاش فيه حاجة للأب يعملها سكرول أصلًا، والسلوك
        زي ما هو بالحرف. الأب بيتحرّك في حالة واحدة بس: لما الأثاث الثابت
        لوحده مش دخل، وساعتها السكرول هو **الطريقة الوحيدة** توصل للفوتر.
      */}
      <div className="sticky top-0 flex h-dvh flex-col gap-4 overflow-y-auto overscroll-contain p-3">
        {/* `rail__head` — CSS stacks this into a column once the rail is
            collapsed, because the brand and the toggle do not both fit across
            a 76px track. See `globals.css`. */}
        <div className="rail__head flex items-center justify-between gap-2">
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
            // واقف على /dashboard أصلًا: دوسة على الشعار كانت بتدفع history
            // entry تانية لنفس الصفحة، وزرار الرجوع بيحتاج دوستين عشان يسيبها
            // فعلًا — نفس الباج اللي `student-nav-list.tsx` بيحارس منه.
            onClick={(event) => {
              if (onDashboard && isPlainPress(event)) event.preventDefault();
            }}
          >
            <BrandLockup showTagline={false} />
          </Link>
          <RailToggle hidden={forcedCollapsed} />
        </div>

        <nav aria-label={copy.nav.mainNav}>
          <StudentNavList />
        </nav>

        {/*
          `min-h-0` with `flex-1` lets this region shrink below its content
          height — without it a long list refuses to compress inside a flex
          column and pushes the footer off the bottom of the viewport. The
          overflow then has to be absorbed HERE rather than by the container,
          or it simply spills over whatever is drawn after it.

          The heading stays put and only the list under it scrolls, so the
          student never loses the label telling them what they are looking at.
        */}
        {/*
          ⚠️ `min-h-32` (٨rem) مش `min-h-0`، وده النص التاني من التصليح.

          `min-h-0` معناه «اتكمشي لأي حاجة» — وعلى شباك قصير اللي بيحصل إنها
          بتتكمش لـ**صفر**: عنوان «كورساتي» ظاهر وتحته ولا كورس. الطالب بيقرا
          دي كإنه مش مشترك في حاجة.

          الأرضية دي بتخلّي الليستة تفضل بتوري صف أو اتنين، والزيادة بتروح
          للأب يعملها سكرول — وده بالظبط اللي الأب بقى قادر عليه فوق.
        */}
        <div className="flex min-h-32 flex-1 flex-col">
          {/* `.nav-group__head`, not `.eyebrow`. The eyebrow is `--fs-mono-label`
              — 13px — and it was labelling the tallest, most-read list in the
              rail from underneath the size of a footnote. This is the same
              object the admin sidebar's group headings use, so the two rails
              caption their groups identically. */}
          <p className="rail__label nav-group__head shrink-0">{copy.nav.railCourses}</p>
          {/* `rail__courses` ممسك، مش ستايل: الأب بقى بيعمل سكرول هو كمان،
              فـ«الحاوية اللي بتعمل سكرول جوّه الريل» بقت اتنين — والتست محتاج
              يشاور على دي بالذات. */}
          <div className="rail__courses min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {courses}
          </div>
        </div>

        <div className="flex flex-col gap-1 border-t border-line pt-2">
          <StudentNavFooterList />
          <Link
            href="/"
            title={copy.nav.backToSite}
            className="nav-pill rail__item"
          >
            <span className="nav-pill__well" aria-hidden="true">
              <ArrowUpLeft className="size-4" />
            </span>
            <span className="nav-pill__label rail__label">{copy.nav.backToSite}</span>
          </Link>
        </div>
      </div>
    </aside>
  );
}
