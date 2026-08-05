import { Skeleton } from '@ayman/ui';

/**
 * Required beside every product `page.tsx` by `lib/loading-coverage.test.ts`,
 * and built from `Skeleton` like every other one — the same test checks that
 * too, which is how a hand-rolled `<div>` here got caught.
 *
 * It is the least likely skeleton in the app to be seen: this page is
 * precached and served by the service worker straight off disk, so on the path
 * that matters there is no round trip to wait through. It earns its place on
 * the other path — a direct visit to `/offline` while online, which is how
 * anyone testing the offline screen looks at it.
 *
 * Mirrors the settled page's shape in order: the round mark, a heading, two
 * lines of body, then the two stacked controls. Centred in the same
 * `min-h-[100dvh]` box so nothing shifts when the real page replaces it.
 */
export default function Loading() {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-6 px-6">
      <Skeleton className="size-[72px] rounded-full" />

      <div className="flex w-full flex-col items-center gap-2">
        <Skeleton width="narrow" className="h-6" />
        <Skeleton width="wide" className="h-4" />
        <Skeleton width="wide" className="h-4" />
      </div>

      <div className="flex w-full flex-col gap-2">
        <Skeleton className="h-11 w-full rounded-md" />
        <Skeleton className="h-11 w-full rounded-md" />
      </div>
    </div>
  );
}
