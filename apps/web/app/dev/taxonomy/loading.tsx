import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * A Server Component, so this skeleton ships inside the SSR'd HTML.
 * Bar widths vary deliberately — uniform bars are the biggest "cheap" tell.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-[var(--w-shell)] px-6 py-16">
      <div className="mb-8 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} width={i % 3 === 0 ? 'full' : i % 3 === 1 ? 'wide' : 'narrow'} />
        ))}
      </div>
    </main>
  );
}
