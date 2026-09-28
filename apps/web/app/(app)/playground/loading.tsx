import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * Mirrors the page: the hero band, then the two panes, so nothing jumps when
 * it hydrates.
 *
 * ⚠️ Deliberately NONE of the page's own `pg-*` classes. An e2e gate that
 * waits on a block class would pass on this skeleton if it wore the same one
 * (`e2e-gates-must-not-name-skeleton-classes`), and the page's stylesheet is
 * not loaded here anyway.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-8 md:px-6 md:py-10">
      <Skeleton className="h-56 rounded-lg md:h-64" />
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div className="panel overflow-hidden" key={index}>
            <Skeleton className="h-12 rounded-none" />
            <div className="p-4">
              <Skeleton className="h-[19rem]" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
