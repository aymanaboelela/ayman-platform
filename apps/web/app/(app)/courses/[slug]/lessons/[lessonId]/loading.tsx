import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * The lesson player.
 *
 * ## Two things this got wrong, both since the page moved under it
 *
 * The shell. This was `max-w-[var(--w-shell)] px-6 py-10` with a 320px rail
 * against a page that is `max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8` with a
 * 380px one — `--w-shell` is a READING measure and this page deliberately left
 * it, because its main object is a 16/9 video and a video is the one thing on
 * the platform that is better bigger. On a phone the visible half of that was
 * 8px of gutter on each side appearing and disappearing at the swap, on the
 * navigation a student repeats once per lesson for a whole course.
 *
 * The order. The title used to be drawn ABOVE the video here. `page.tsx` moved
 * it below on purpose — «الفيديو أول بكسل من المحتوى», with the title reading
 * as its caption — so the skeleton was promising ~120px of chrome before the
 * thing the student came for, and then the video arrived where the title had
 * been.
 *
 * ## The outline is bounded now
 *
 * `course-outline.tsx` caps the panel at `60dvh` below `lg`, so the placeholder
 * can finally be a definite height instead of however many grey bars looked
 * about right: it reserves the same bound and clips, rather than drawing a
 * short box that a 40-lesson course then fills to six times the size.
 *
 * A Server Component, so the skeleton is in the SSR'd HTML. Bar widths are
 * varied (full/wide/narrow) rather than uniform — the biggest "cheap" skeleton
 * tell.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
        <div className="min-w-0">
          {/* `space-y-6` is `<LessonPlayerView>`'s own wrapper: the player, the
              completion hint and the prev/next row, in that order. */}
          <div className="space-y-6">
            <div className="aspect-video w-full rounded-lg border border-line bg-surface-2" />
            <Skeleton width="narrow" className="h-4" />
            {/* `<LessonNav>`'s rule and 24px lead-in, with the two ghost links
                at the inline start and «أنهيت الدرس» opposite — all three are
                `h-10` boxes there. */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-6">
              <Skeleton className="h-10 w-40" />
              <Skeleton className="h-10 w-32" />
            </div>
          </div>

          {/* UNDER the player, as the page renders it. `h-7` is the
              `--fs-title-3` line box; the mono line below it is the course and
              section pair. */}
          <Skeleton width="wide" className="mt-5 h-7" />
          <Skeleton width="narrow" className="mt-1 h-3" />
        </div>

        {/* The outline panel's own shell — the same border, radius, surface and
            `60dvh` bound — with its head block and a run of 44px rows inside.
            `overflow-hidden` rather than `overflow-y-auto`: there is nothing to
            scroll to yet, and a scrollbar that appears for half a second and
            then belongs to a different element is its own small flicker. */}
        <div className="max-h-[60dvh] overflow-hidden rounded-lg border border-line bg-surface-2 lg:max-h-[calc(100dvh-3rem)]">
          <div className="border-b border-line-subtle px-5 py-5">
            <Skeleton width="narrow" className="mb-3 h-5" />
            {/* `h-1`, matching `<LessonProgressBar>` exactly — it is a 4px
                track, not a bar of text. */}
            <Skeleton className="h-1 rounded-full" />
            <Skeleton width="narrow" className="mt-2.5 h-3" />
          </div>

          <div className="py-2">
            {Array.from({ length: 8 }, (_, index) => (
              // The row's own `px-5 py-3` around a single line of title, which
              // is what makes it the 44px tap target the real list is built
              // from. Eight of them overflow `60dvh` on a phone and get
              // clipped, which is the point: the bound is the height, not the
              // row count.
              <div key={index} className="px-5 py-3">
                <Skeleton width={index % 3 === 0 ? 'full' : index % 3 === 1 ? 'wide' : 'narrow'} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
