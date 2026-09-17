import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * The landing skeleton. A Server Component, so it ships inside the SSR'd HTML.
 *
 * Geometry matches the real page: a full-viewport hero band with the copy
 * column on the inline-end side, then a tinted section and a card row. Bar
 * widths vary rather than being uniform — the biggest "cheap skeleton" tell.
 */
/**
 * ⚠️ The root element is a `<div aria-hidden>`, NOT a `<main>`, and that is not
 * cosmetic.
 *
 * A streamed response carries the Suspense FALLBACK and the real content in the
 * same HTML document — the fallback in the prerendered shell, the content in the
 * tail that an inline script swaps in. A browser ends up with one `<main>`. A
 * crawler that does not run JS — which is most of the AI ones — parses the whole
 * document and sees every `<main>` in it. With this skeleton and the segment
 * skeleton both claiming the landmark, `/` served THREE `<main>` elements, the
 * first two full of shimmer bars, and the page's real `<h1>` arrived after the
 * footer. An AI-readiness scan on 2026-09-13 scored the site 0/20 on heading
 * hierarchy, 0/20 on semantic elements and 0/10 on landmarks because of it.
 *
 * A loading placeholder is not a landmark and has no accessible name worth
 * exposing, so `aria-hidden` is the honest markup here as well as the one that
 * leaves exactly one `<main>` in the document.
 *
 * Do not put an `<h1>`…`<h6>` in a skeleton for the same reason — an empty
 * heading in the shell outranks the real one in source order.
 */
export default function Loading() {
  return (
    <div aria-hidden="true">
      <section className="hero">
        <div className="hero__body">
          <div className="hero__copy" style={{ gridColumn: 2, width: '100%' }}>
            <Skeleton width="narrow" className="mb-4 h-3" />
            <Skeleton width="wide" className="mb-3 h-12" />
            <Skeleton width="narrow" className="mb-6 h-12" />
            <Skeleton width="full" className="mb-2 h-4" />
            <Skeleton width="wide" className="mb-8 h-4" />
            <div className="flex gap-3">
              <Skeleton className="h-11 w-36 rounded-full" />
              <Skeleton className="h-11 w-36 rounded-full" />
            </div>
          </div>
        </div>
      </section>

      <section className="site-section site-section--tint">
        <div className="site-shell">
          <Skeleton width="narrow" className="mb-3 h-8" />
          <Skeleton width="wide" className="mb-10 h-4" />
          <div className="courses__grid">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="site-card p-3">
                <Skeleton className="mb-4 aspect-video w-full rounded-xl" />
                <Skeleton width={i === 1 ? 'narrow' : 'wide'} className="mb-3 h-5" />
                <Skeleton width="full" className="mb-2 h-3" />
                <Skeleton width="narrow" className="h-3" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
