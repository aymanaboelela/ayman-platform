import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * A Server Component, so this skeleton ships inside the SSR'd HTML. Also
 * required by `cacheComponents` (`next.config.ts`): the page beside it awaits
 * `getPublicSettingsOrDefaults()`, and Next 16 requires that kind of uncached
 * access to sit under a `<Suspense>` boundary — a sibling `loading.tsx` is
 * what provides one automatically for the whole route segment.
 *
 * Shaped like the real screen rather than a generic block: a heading, two
 * lines of prose, the channel card, and the walk-past link. This page is on
 * the path of every single registration, so a skeleton that resolves into a
 * differently-sized layout would produce a visible jump at the one moment the
 * student is deciding whether to press the green button.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-12 sm:py-16">
      <Skeleton width="narrow" className="h-8" />
      <div className="mt-2 space-y-2">
        <Skeleton width="full" className="h-4" />
        <Skeleton width="wide" className="h-4" />
      </div>
      {/* `h-[68px]`: the channel card's own height — border, 3.5 padding and a
          40px icon row. Matching it is the whole point of this file. */}
      <Skeleton width="full" className="mt-8 h-[68px] rounded-[var(--r-lg)]" />
      <Skeleton width="full" className="mt-6 h-10" />
    </main>
  );
}
