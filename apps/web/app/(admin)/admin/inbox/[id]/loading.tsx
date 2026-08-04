import { Skeleton } from '@ayman/ui';

/** The thread's footprint: a header card, a few messages, and the reply box. */
export default function Loading() {
  return (
    <div aria-hidden="true">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-4 h-32 rounded-xl" />
      <div className="mt-5 flex flex-col gap-3">
        <Skeleton className="h-20 w-[min(38rem,85%)] rounded-2xl" />
        <Skeleton className="h-16 w-[min(38rem,85%)] self-end rounded-2xl" />
      </div>
      <Skeleton className="mt-6 h-48 rounded-xl" />
    </div>
  );
}
