import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * أجهزتي — a list of session rows, each with a device label, a last-seen
 * line, and a revoke action. Four placeholder rows: enough to fill the
 * fold without implying a specific session count.
 *
 * A Server Component, so it ships inside the SSR'd HTML.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-[var(--w-prose)] px-6 py-10">
      <div className="mb-8 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-4 rounded-lg border border-line bg-surface-2 p-4"
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton width={index % 2 === 0 ? 'wide' : 'narrow'} className="h-4" />
              <Skeleton width="narrow" className="h-3" />
            </div>
            <Skeleton width="narrow" className="h-8 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </main>
  );
}
