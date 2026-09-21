import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * A Server Component skeleton, in the SSR'd HTML — same rule as its sibling
 * one level up, and the same `animation-delay: 180ms` that keeps a fast cache
 * hit from flashing it.
 *
 * Shaped like what actually lands: the «رجوع» line, the heading, and the plan
 * cards — a two-column grid, because `.course-subscribe__plans` is two columns
 * at every width (see `globals.css` on why four never fit the modal). NOT the
 * course page's video-and-outline shape; a skeleton that promises the wrong
 * page is worse than a blank one.
 */
export default function Loading() {
  return (
    <div aria-hidden="true" className="mx-auto max-w-[var(--w-shell)] px-6 py-16">
      <Skeleton width="narrow" className="mb-6 h-3" />
      <Skeleton width="wide" className="mb-8 h-9" />
      <Skeleton width="narrow" className="mb-4 h-5" />
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} width="full" className="h-24" />
        ))}
      </div>
    </div>
  );
}
