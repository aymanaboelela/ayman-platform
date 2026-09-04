import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * A Server Component, so this ships inside the SSR'd HTML.
 *
 * Deliberately short: the page itself streams four independent Suspense
 * boundaries with their own skeletons, so this only stands in for the header
 * and the section headings — the part that resolves without any I/O at all.
 * Repeating the identity/totals/activity skeletons here would draw them twice
 * on the first frame of a navigation.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-8 md:px-6 md:py-10">
      <div className="mb-6 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>
      <Skeleton width="full" className="mb-8 h-44 rounded-lg" />
      <Skeleton width="narrow" className="mb-4 h-5" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} width="full" className="h-24 rounded-lg" />
        ))}
      </div>
    </main>
  );
}
