import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * A Server Component, so this skeleton ships inside the SSR'd HTML. It mirrors
 * the real page's regions IN ORDER — band, hero slot, mastery card, courses —
 * so the layout does not jump when the authenticated fetches resolve. Bar
 * widths are varied (full/wide/narrow) rather than uniform, the biggest "cheap
 * skeleton" tell.
 *
 * ⚠️ A skeleton whose order no longer matches the page it stands in for is
 * worse than none at all: it promises a layout and then rearranges it. Three
 * things about the current page therefore have to be kept true here.
 *
 * 1. The BAND is a real ember block, not three grey bars. `.dash-hero` is a
 *    filled surface roughly 150px tall with a portrait and a dial on it; three
 *    hairline skeleton lines in its place meant the page visibly grew a
 *    coloured header when the fetch landed. This draws the band itself and
 *    leaves the contents blank, which is what a skeleton is for. It now stands
 *    a line taller, because the band gained the three figures the stat tiles
 *    used to carry.
 * 2. The four-tile grid is GONE, and so is the achievements strip from this
 *    position. What sits under the hero slot is the mastery card: a heading
 *    and three rows.
 * 3. The achievements strip is now the LAST block on the page, below the
 *    courses — and it is six equal cells, the one region whose shape a generic
 *    bar cannot suggest.
 * 4. «امتحان الشهر» sits between the band and the hero slot, and it is drawn
 *    here as a second ember block for the reason point 1 gives: it is a filled
 *    surface, and three grey lines standing in for it grow a coloured slab into
 *    the page when the fetch lands.
 *
 * ## The one region this file knowingly guesses wrong
 *
 * `<ExamCountdownBand>` is CONDITIONAL, and most students on most days have no
 * monthly exam in flight — so the block at point 4 is reserved for a band that
 * usually never arrives, and the page shrinks by its height instead of growing
 * by it. That is the deliberate direction: this file's own mastery-card note
 * already states the rule, "a skeleton that guesses low grows the page, and one
 * that guesses high only shrinks it", and a page that grows under a reader's
 * thumb is what moves the thing they were about to press. It is kept SHORT for
 * the same reason — a compact strip, not the band's full open-phase height — so
 * the shrink everyone else pays is a small one.
 *
 * The right-hand rail this file used to reserve is gone: the courses grid took
 * the full width when the cards gained their artwork.
 *
 * One hero-slot block covers both possible occupants — the resume card and the
 * first-run card. They are close enough in height that guessing wrong costs a
 * few pixels, and there is no way to know which will win before the payload
 * that decides it has landed.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-8 md:px-6 md:py-10">
      {/* `.dash-hero` without `__art`: the band's own gradient and hairline,
          with placeholder bars where the greeting and the dial will be.

          ⚠️ THIS CLASS IS SHARED WITH THE REAL COMPONENT ON PURPOSE, and that
          makes it useless as an end-to-end gate. `cacheComponents` sends this
          page as a prerendered shell, so `.dash-hero` is in the document
          before any of the real text is — a Playwright
          `expect(page.locator('.dash-hero')).toBeVisible()` passes here and
          then measures nothing. That flaked `study-surface-a11y.e2e.ts` on
          main roughly every other run for days before anybody read the base
          rate. A test that wants the real band must name a child THIS file
          does not render: `__eyebrow` or `__aside-label`.

          `.exam-band` below carries the identical hazard and is currently
          unarmed — no test gates on it. Keep it that way. */}
      <div className="dash-hero mb-6">
        <div className="dash-hero__id">
          <span
            aria-hidden="true"
            className="size-16 shrink-0 rounded-full bg-[rgb(255_255_255/0.14)]"
          />
          <div className="min-w-0 flex-1 space-y-3">
            <span aria-hidden="true" className="block h-3 w-24 rounded bg-[rgb(255_255_255/0.14)]" />
            <span aria-hidden="true" className="block h-7 w-48 rounded bg-[rgb(255_255_255/0.18)]" />
            {/* The identity chips… */}
            <span aria-hidden="true" className="block h-6 w-64 rounded-full bg-[rgb(255_255_255/0.10)]" />
          </div>
        </div>
        {/* …and `.dash-hero__stats`, a SIBLING of `__id` exactly as it is in
            `dashboard-hero.tsx` — the band places its children by column, so a
            skeleton that nests this bar inside the greeting is a skeleton that
            lands in a different place from the thing it stands in for once the
            band goes three-column at 90rem. Plain text, not pills, so it is a
            shorter unrounded bar — matching what replaces it. */}
        <div className="dash-hero__stats">
          <span aria-hidden="true" className="block h-4 w-56 rounded bg-[rgb(255_255_255/0.10)]" />
        </div>
        <div className="dash-hero__aside">
          <span aria-hidden="true" className="size-26 rounded-full bg-[rgb(255_255_255/0.12)]" />
        </div>
      </div>

      {/* «امتحان الشهر» — the real `.exam-band`, so its padding, radius and
          ember ground are exactly the ones that arrive, with white-alpha bars
          where the eyebrow, the title and the covered-lesson chips will be and
          the clock's own well at the inline end. `__main` and `__aside` are
          direct children because the band is a grid and places them by column;
          nesting either one deeper is a skeleton that lands somewhere the thing
          it stands in for does not. */}
      <div className="exam-band mb-6">
        <div className="exam-band__main">
          <span aria-hidden="true" className="block h-3 w-20 rounded bg-[rgb(255_255_255/0.16)]" />
          <span aria-hidden="true" className="block h-7 w-56 rounded bg-[rgb(255_255_255/0.18)]" />
          <span aria-hidden="true" className="block h-6 w-72 rounded-full bg-[rgb(255_255_255/0.10)]" />
        </div>
        <div className="exam-band__aside">
          <span aria-hidden="true" className="block h-8 w-40 rounded bg-[rgb(255_255_255/0.16)]" />
        </div>
      </div>

      <div className="mb-6 space-y-4 rounded-lg border border-line bg-surface-2 p-4 sm:p-5">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-6" />
        <Skeleton width="full" className="h-1" />
      </div>

      {/* The mastery card: a heading and three `.topic-row`s. Three, always —
          the card renders fewer when a student has fewer weak topics, but a
          skeleton that guesses low grows the page, and one that guesses high
          only shrinks it. */}
      <div className="mb-8 space-y-4">
        <Skeleton width="narrow" className="h-5" />
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="topic-row">
              <span className="topic-row__text">
                <Skeleton width={index % 2 === 0 ? 'wide' : 'narrow'} className="h-4" />
                <Skeleton width="full" className="h-[6px]" />
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <Skeleton width="narrow" className="h-5" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="overflow-hidden rounded-lg border border-line bg-surface-2">
              {/* The artwork's own box, at the card's real 16/7, so the grid
                  does not shift when four covers arrive. */}
              <div className="aspect-[16/7] w-full bg-surface-3" />
              <div className="space-y-4 p-5">
                <Skeleton width={index % 2 === 0 ? 'wide' : 'narrow'} className="h-5" />
                <Skeleton width="full" className="h-1" />
                <Skeleton width="narrow" className="h-3" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* The achievements strip, last — mirroring the page, where it moved
          below the exams so the run from "fix this" to "your courses" is not
          interrupted by a rewards block. */}
      <div className="mt-8 space-y-4">
        <Skeleton width="narrow" className="h-5" />
        <div className="badge-strip">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="badge">
              <span aria-hidden="true" className="badge__disc" />
              <Skeleton width="wide" className="h-3" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
