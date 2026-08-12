import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * The live attempt runner. This skeleton reserves the timer and the
 * question-navigator strip at their real sizes on purpose: a student
 * opening a timed paper must not see the question area jump once the
 * runner hydrates, and the timer is the element they look at first.
 *
 * A Server Component, so it ships inside the SSR'd HTML.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-[var(--w-shell)] px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <Skeleton width="narrow" className="h-3" />
          <Skeleton width="wide" className="h-6" />
        </div>
        <Skeleton width="narrow" className="h-10 w-24 shrink-0" />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {Array.from({ length: 10 }, (_, index) => (
          <Skeleton key={index} width="narrow" className="h-9 w-9" />
        ))}
      </div>

      <div className="space-y-5 rounded-lg border border-line bg-surface-2 p-6">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="full" className="h-5" />
        <Skeleton width="wide" className="h-5" />
        <div className="space-y-3 pt-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} width={index % 2 === 0 ? 'full' : 'wide'} className="h-12" />
          ))}
        </div>
      </div>
    </main>
  );
}
