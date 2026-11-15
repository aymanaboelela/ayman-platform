import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/**
 * The lesson player's skeleton — the same boxes `page.tsx` draws, in the same
 * order, so nothing jumps at the swap on the navigation a student repeats
 * once per lesson for a whole course.
 *
 * The shell is the page's own: `max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8` and
 * a 380px rail at `lg`, not `--w-shell` — a reading measure this page
 * deliberately left for a bigger video.
 *
 * Main column: the video first (`aspect-video`), then the one bar under it
 * (a title line and the finish button at opposite ends), then the tab row and
 * one panel. The rail's placeholder is the outline's own shell — the head
 * with its 4px progress track, then a run of unit cards (a square tile and
 * two lines each). Hidden below `lg` like the real rail; the phone's door is
 * one card under the bar.
 *
 * A Server Component, so the skeleton is in the SSR'd HTML. Widths are varied
 * rather than uniform — the biggest "cheap" skeleton tell.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8">
      <RouteLoadingWatchdog />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
        <div className="min-w-0">
          <div className="aspect-video w-full rounded-lg border border-line bg-surface-2" />

          {/* The bar: title + meta chips at the inline start, two 44px controls opposite. */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0 flex-1 basis-64">
              <Skeleton width="wide" className="h-7" />
              <div className="mt-2 flex gap-2">
                <Skeleton className="h-6 w-36 rounded-sm" />
                <Skeleton className="h-6 w-24 rounded-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-11 w-11 rounded-md" />
              <Skeleton className="h-11 w-36 rounded-md" />
            </div>
          </div>

          {/* The phone's door to the outline. */}
          <Skeleton className="mt-3 h-16 w-full rounded-lg lg:hidden" />

          {/* The tab row, then one panel. */}
          <div className="mt-4 flex gap-1 border-b border-line">
            <Skeleton className="mb-2 h-7 w-20 rounded-sm" />
            <Skeleton className="mb-2 h-7 w-24 rounded-sm" />
            <Skeleton className="mb-2 h-7 w-20 rounded-sm" />
          </div>
          <Skeleton className="mt-4 h-28 w-full rounded-lg" />
        </div>

        <div className="hidden min-w-0 overflow-hidden rounded-lg border border-line bg-surface-1 lg:block lg:max-h-[calc(100dvh-3rem)]">
          <div className="border-b border-line-subtle px-4 py-3">
            <div className="mb-2 flex items-baseline justify-between">
              <Skeleton width="narrow" className="h-4" />
              <Skeleton className="h-3 w-16" />
            </div>
            {/* `h-1`, matching `<LessonProgressBar>` exactly — a 4px track. */}
            <Skeleton className="h-1 rounded-full" />
          </div>

          <div className="flex flex-col gap-2 p-2">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 rounded-lg border border-line p-2">
                <Skeleton className="size-12 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton width={index % 2 === 0 ? 'wide' : 'narrow'} className="mt-1.5 h-4" />
                </div>
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
