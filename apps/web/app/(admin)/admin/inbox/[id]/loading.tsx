import { Skeleton } from '@ayman/ui/components/skeleton';
import { RouteLoadingWatchdog } from '@/components/route-loading-watchdog';

/**
 * The thread's footprint: the back link, the header card, and the chat panel
 * filling the rest of the screen — bubbles gathered at its BOTTOM, over the
 * composer, because that is where the real thread opens (see `ChatViewport`).
 * A skeleton with its bubbles at the top would promise the very jump the
 * panel exists to prevent.
 *
 * The height is the page's own, so the swap from skeleton to thread moves
 * nothing: the same `100dvh` less the admin header and `main`'s padding that
 * `.chat-page` uses (16px / 24px each side — `(admin)/layout.tsx`).
 */
export default function Loading() {
  return (
    <div
      aria-hidden="true"
      className="flex h-[calc(100dvh_-_var(--admin-header-h)_-_2rem)] flex-col md:h-[calc(100dvh_-_var(--admin-header-h)_-_3rem)]"
    >
      <RouteLoadingWatchdog />
      <Skeleton className="h-4 w-28 shrink-0" />
      <Skeleton className="mt-4 h-32 shrink-0 rounded-xl" />
      <div className="mt-4 flex min-h-[24rem] flex-1 flex-col overflow-hidden rounded-2xl border border-line">
        <div className="flex flex-1 flex-col justify-end gap-2 p-4 md:px-6">
          <Skeleton className="h-14 w-[min(26rem,70%)] rounded-2xl" />
          <Skeleton className="h-10 w-[min(18rem,55%)] rounded-2xl" />
          <Skeleton className="h-16 w-[min(30rem,75%)] self-end rounded-2xl" />
        </div>
        <div className="flex items-end gap-2 border-t border-line p-3 md:px-6">
          <Skeleton className="h-12 flex-1 rounded-3xl" />
          <Skeleton className="size-11 rounded-full" />
        </div>
      </div>
    </div>
  );
}
