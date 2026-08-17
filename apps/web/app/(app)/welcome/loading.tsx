import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * A Server Component, so this skeleton ships inside the SSR'd HTML. Also
 * required by `cacheComponents` (`next.config.ts`): the page beside it awaits
 * `getWhatsappChannelFresh()`, and Next 16 requires that kind of uncached
 * access to sit under a `<Suspense>` boundary — a sibling `loading.tsx` is
 * what provides one automatically for the whole route segment.
 *
 * Shaped like the real screen rather than a generic block: the ember band with
 * its eyebrow, title, sub-line and step rail; then the channel card; then the
 * button. This page is on the path of every single registration, so a skeleton
 * that resolves into a differently-sized layout would produce a visible jump at
 * the one moment the student is deciding whether to press the green button.
 *
 * ⚠️ It has to be re-measured whenever `page.tsx` changes shape. It was not,
 * once: the page kept a bare `<h1>` skeleton after the greeting moved onto
 * `.stage`, so the file whose entire job is "do not jump" was itself the jump.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10 sm:py-14">
      {/* The band is a real, opaque surface, so it is drawn rather than
          skeletoned — a grey rectangle here would flash a different COLOUR
          into place, which is more noticeable than a different size. Only the
          text inside it is unknown. */}
      <section className="stage">
        <div className="stage__body">
          <Skeleton width="narrow" className="h-3" />
          <Skeleton width="wide" className="mt-2 h-8" />
          <Skeleton width="full" className="mt-2 h-4" />
          {/* The step rail: three chips of roughly the widths its three
              labels set — «الحساب اتعمل», «بياناتك اتحفظت», «نبدأ الدراسة». */}
          <div className="mt-5 flex flex-wrap gap-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </section>

      {/* `h-[68px]`: the channel card's own height — border, 3.5 padding and a
          44px icon row. Matching it is the whole point of this file. */}
      <Skeleton width="full" className="mt-6 h-[68px] rounded-[var(--r-lg)]" />
      {/* `h-11` and `mt-4`, the exact box `.welcome-cta` paints. */}
      <Skeleton width="full" className="mt-4 h-11" />
    </main>
  );
}
