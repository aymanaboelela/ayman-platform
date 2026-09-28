import { Skeleton } from '@ayman/ui/components/skeleton';

/** نفس شكل المسرح الغامق — سكيلتون رمادي مكانه بيعمل «فلاش» أول ما اللعبة تظهر. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-8">
      <div className="mb-4 space-y-2">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-7" />
      </div>
      <div className="min-h-[min(46rem,calc(100svh-9rem))] rounded-lg bg-[var(--ink)]" />
    </main>
  );
}
