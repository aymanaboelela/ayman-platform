import { Skeleton } from '@ayman/ui/components/skeleton';
import { copy } from '@ayman/contracts';

/**
 * The inbox list's footprint while the read is in flight.
 *
 * Four rows at the real height, so the filter tabs above them do not jump when
 * the data lands. `(admin)` is exempt from `loading-coverage.test.ts` — this
 * ships anyway, because it is the screen he opens most often and the one whose
 * read is a `no-store` round trip every single time.
 */
export default function Loading() {
  return (
    <>
      <div className="h-4 w-16" />
      <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">
        {copy.assistant.inbox.title}
      </h1>
      <div className="mt-5 flex gap-1.5" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <div className="mt-5 flex flex-col gap-2.5" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    </>
  );
}
