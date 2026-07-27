import { Skeleton } from '@ayman/ui';

/**
 * The root skeleton — the fallback for any segment that has no closer
 * `loading.tsx`. Deliberately generic: a heading block and a few content
 * bands, nothing that implies a specific page's shape.
 *
 * A Server Component, so it ships inside the SSR'd HTML. Bar widths vary
 * rather than being uniform, which is the biggest "cheap skeleton" tell.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-[var(--w-shell)] px-6 py-10">
      <div className="mb-8 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-lg border border-line bg-surface-2 p-5">
            <Skeleton width={index === 1 ? 'narrow' : 'wide'} className="h-5" />
            <Skeleton width="full" className="h-3" />
          </div>
        ))}
      </div>
    </main>
  );
}
