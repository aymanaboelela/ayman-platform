import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * Mirrors the subscribe page: eyebrow, title, lead, then the seven numbered
 * steps and the rail chips. A Server Component, so it ships in the SSR'd HTML.
 *
 * Seven rows, not a generic three: the page's whole shape is "this is a short,
 * finite procedure", and a skeleton that suggests two steps and then resolves
 * into seven is a worse first impression than one that suggests seven.
 */
export default function Loading() {
  return (
    <div aria-hidden="true">
      <section className="site-section">
        <div className="site-shell">
          <Skeleton className="mb-4 h-5 w-24 rounded-full" />
          <Skeleton width="narrow" className="mb-4 h-10" />
          <Skeleton width="wide" className="mb-8 h-4" />

          <div className="subscribe-steps">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="subscribe-step">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div>
                  <Skeleton width="narrow" className="mb-2 h-5" />
                  <Skeleton width={i % 2 === 0 ? 'wide' : 'full'} className="h-3" />
                </div>
              </div>
            ))}
          </div>

          <Skeleton width="narrow" className="mb-4 mt-8 h-7" />
          <div className="subscribe-rails">
            {Array.from({ length: 2 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-28 rounded-full" />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
