import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * A Server Component skeleton, in the SSR'd HTML. `animation-delay: 180ms`
 * (built into `Skeleton`) means a fast cache hit never flashes it.
 *
 * ⚠️ `loading.tsx` wraps `page.js` and nested layouts, but NOT the
 * same-segment `layout.js`. `app/(site)/` has no layout of its own, so this
 * boundary covers the whole page render.
 *
 * ⚠️ Its presence is NOT what causes the known 404-status-code limitation
 * documented on `generateStaticParams` in `page.tsx` — verified empirically
 * by removing this file entirely and re-testing; the status code did not
 * change either way. Cache Components streams this route regardless.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-[var(--w-shell)] px-6 py-16">
      <Skeleton width="narrow" className="mb-6 h-3" />
      <Skeleton width="narrow" className="mb-2 h-3" />
      <Skeleton width="wide" className="mb-2 h-9" />
      <Skeleton width="narrow" className="mb-10 h-4" />
      <Skeleton width="full" className="mb-10 aspect-video h-auto" />
      <Skeleton width="narrow" className="mb-4 h-6" />
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} width={i % 2 === 0 ? 'full' : 'wide'} className="h-10" />
        ))}
      </div>
    </main>
  );
}
