import { Skeleton } from '@ayman/ui/components/skeleton';

/** Header, then the reused instructor section's two-column shape. */
export default function Loading() {
  return (
    <main>
      <div className="page-head site-shell">
        <Skeleton width="wide" className="h-10" />
        <Skeleton width="narrow" className="mt-3 h-5" />
      </div>
      <div className="site-shell" style={{ paddingBlock: '3rem' }}>
        <Skeleton width="narrow" className="mb-4 h-7" />
        <Skeleton className="mb-2 h-4" />
        <Skeleton width="wide" className="mb-6 h-4" />
        <Skeleton className="h-56 rounded-lg" />
      </div>
    </main>
  );
}
