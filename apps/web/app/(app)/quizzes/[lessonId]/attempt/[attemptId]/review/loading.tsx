import { Skeleton } from '@ayman/ui';

export default function Loading() {
  return (
    <main className="mx-auto max-w-[var(--w-prose)] px-6 py-10">
      <Skeleton width="wide" className="mb-6 h-7" />
      <div className="mb-6 space-y-3 rounded-lg border border-line bg-surface-2 p-5">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="full" className="h-10" />
        <Skeleton width="wide" />
      </div>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="mb-4 space-y-3 rounded-lg border border-line bg-surface-2 p-5">
          <Skeleton width="full" />
          <Skeleton width="wide" />
          <Skeleton width="narrow" />
        </div>
      ))}
    </main>
  );
}
