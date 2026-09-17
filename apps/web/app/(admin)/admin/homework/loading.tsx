import { Skeleton } from '@ayman/ui/components/skeleton';
import { copy } from '@ayman/contracts/copy/admin';

/**
 * The queue's footprint while the read is in flight.
 *
 * Same shape and the same reasoning as `/admin/inbox`'s: four rows at the real
 * height so the filter tabs above them do not jump when the data lands, and it
 * ships even though `(admin)` is exempt from `loading-coverage.test.ts` —
 * this is a `no-store` round trip on every single visit.
 */
export default function Loading() {
  return (
    <>
      <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">
        {copy.admin.homework.queueTitle}
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
