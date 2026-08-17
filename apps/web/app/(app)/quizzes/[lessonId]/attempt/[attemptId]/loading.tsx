import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * The live attempt runner.
 *
 * ## It is built from the runner's own classes
 *
 * `.runner`, `.runner-bar`, `.runner-card`, `.runner-foot`, `.runner-nav` and
 * `.nav-chip` are the exact declarations in `app/study.css` that the real
 * screen renders with, so the padding, the radii, the 12px/16px gaps, the
 * sticky bar and the `lg` two-column split are not approximated here — they
 * cannot drift the next time one of those rules is touched. Only what goes
 * INSIDE them is grey.
 *
 * ## The order is the runner's order, and it was not
 *
 * This used to draw a title block and a ten-chip strip across the top. The live
 * runner opens with the progress meter and the countdown and puts the question
 * map LAST — so a student entering a timed paper was shown a row of chips
 * exactly where the clock was about to appear, and then watched both move. A
 * skeleton that promises the wrong layout is worse than a blank box, because
 * the eye has already committed to the wrong place to look.
 *
 * ## The gutter
 *
 * `<main>`'s classes are `page.tsx`'s, verbatim. They were
 * `max-w-[var(--w-shell)] px-6 py-8` against the page's `px-4 py-8 md:px-6
 * md:py-10`, so every entry into an attempt on a phone started 8px in from each
 * side and 16px short at the bottom, then slid outward when the runner landed.
 * On the one screen whose own comment records that 24px of gutter at 360px was
 * taken straight out of the question's reading width.
 *
 * A Server Component, so it ships inside the SSR'd HTML.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-10">
      <div className="runner">
        <div className="runner__main">
          {/* Where am I, and how long have I got — the two questions the bar
              exists to answer, reserved in the two places it answers them. */}
          <div className="runner-bar">
            <div className="runner-bar__progress">
              <Skeleton width="narrow" className="h-3" />
              {/* The real track, unfilled. Nothing is answered yet, so an empty
                  meter is not a placeholder standing in for a value — it is
                  already the value. */}
              <span className="runner-bar__meter" aria-hidden="true" />
            </div>

            {/*
              `1lh` resolves against `.runner-clock`'s own 17px type and the
              inherited 1.75 leading, so the pill reserves exactly the height
              its digits will occupy without restating either number here — and
              keeps doing so if the clock is ever resized.

              `shrink-0` does by hand what the real clock gets for free: its
              digits give it a min-content floor that `.runner-bar`'s flex
              cannot squeeze past, and a box with no text in it has none.
            */}
            <div className="runner-clock shrink-0">
              <Skeleton className="h-[1lh] w-20" />
            </div>
          </div>

          <div className="runner-card">
            <div className="flex flex-col gap-5">
              <Skeleton width="full" className="h-5" />
              <Skeleton width="wide" className="h-5" />

              <ul className="flex flex-col gap-2">
                {Array.from({ length: 4 }, (_, index) => (
                  // `pointer-events-none` only so the real option's `:hover`
                  // and `cursor: pointer` do not make a grey bar look clickable
                  // on a desktop. The geometry — 12px/16px padding, the
                  // hairline, `--r-md` — is the option's own.
                  <li key={index} className="runner-option pointer-events-none">
                    <Skeleton width={index % 2 === 0 ? 'full' : 'wide'} className="h-[1lh]" />
                  </li>
                ))}
              </ul>

              {/* «مسح إجابتي» and the autosave label close the card. Cheap to
                  reserve, and leaving them out shifts the foot row and the
                  whole navigator up by ~40px at the swap. */}
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          </div>

          {/* Two `h-10` boxes because that is what `Button` is locked to at both
              sizes, and `.runner-foot` supplies its own top rule and 16px of
              lead-in. */}
          <div className="runner-foot">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-28" />
          </div>
        </div>

        {/* LAST, as in the real DOM: below the card on a phone, the second grid
            column from 64rem up. Ten chips is a guess at the paper's length —
            the real count is not knowable before the payload — and the panel
            only ever renders for a `free`-navigation attempt, so this is the
            one region here that is a genuine estimate rather than a copy.
            Below the fold on a phone either way. */}
        <aside className="runner-nav">
          <Skeleton width="narrow" className="mb-3 h-4" />
          <div className="runner-nav__grid">
            {Array.from({ length: 10 }, (_, index) => (
              // 44px below `md`, 36px from `md` up — the two sizes `.nav-chip`
              // itself switches between at 48rem, in the same order (the phone
              // is the base). `shrink-0` is `.nav-chip`'s own `flex: none`:
              // without it the grid squeezes ten squares onto one line instead
              // of wrapping them into the block the real map is.
              <Skeleton key={index} className="h-11 w-11 shrink-0 md:h-9 md:w-9" />
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
