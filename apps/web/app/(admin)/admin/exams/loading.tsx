import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * A Server Component skeleton — no client JS needed to show it, so it streams
 * before the session lookup and the two `adminGet` reads resolve.
 *
 * Geometry mirrors the real list: heading, lead line, then card-shaped rows
 * with a title bar and a metadata bar inside each. Varied widths read as
 * "loading"; a column of identical blocks reads as "broken".
 */
export default function AdminExamsLoading() {
  return (
    <>
      <Skeleton width="narrow" className="h-8" />
      <Skeleton width="wide" className="mt-3 h-4" />

      <div className="mt-5 flex flex-col gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-line bg-surface-2 p-4">
            <Skeleton width="narrow" className="h-3" />
            <Skeleton width={i % 2 === 0 ? 'wide' : 'full'} className="mt-2 h-5" />
            <Skeleton width={i % 3 === 0 ? 'full' : 'wide'} className="mt-2.5 h-3" />
          </div>
        ))}
      </div>
    </>
  );
}
