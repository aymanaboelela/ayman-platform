import { Skeleton } from '@ayman/ui/components/skeleton';
// `/copy/admin`, never the root barrel — same rule as the page it stands in for.
import { copy } from '@ayman/contracts/copy/admin';

const c = copy.admin.grading;

/**
 * The queue's footprint while the read is in flight.
 *
 * The heading and the lead are REAL — they are static copy, so holding them
 * back behind a shimmer would be pretending not to know something we do know,
 * and it is what makes the swap land without the list jumping down the page.
 * Four rows at the real height for the same reason.
 *
 * `(admin)` is exempt from `loading-coverage.test.ts` (see its header); this
 * ships anyway, because `adminGet` is a `no-store` round trip on every single
 * visit and this is a screen opened between marking one paper and the next.
 */
export default function Loading() {
  return (
    <>
      <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="mt-1 max-w-[44rem] text-[length:var(--fs-text-sm)] text-fg-muted">{c.lead}</p>

      <div className="mt-5 flex flex-col gap-2.5" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </>
  );
}
