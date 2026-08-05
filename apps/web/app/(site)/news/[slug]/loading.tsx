import { Skeleton } from '@ayman/ui';

/**
 * The article skeleton.
 *
 * Deliberately NOT a generic block: the real article opens with a back link, a
 * large title, a lead and a meta line, then long prose. A skeleton whose
 * geometry does not match causes a visible jump on hydration, which reads as a
 * page that broke rather than one that loaded.
 */
export default function Loading() {
  return (
    <main>
      <article className="site-shell article">
        <header className="article__head">
          <Skeleton width="narrow" className="mb-6 h-3" />
          <Skeleton width="wide" className="mb-4 h-12" />
          <Skeleton width="full" className="mb-3 h-4" />
          <Skeleton width="narrow" className="h-3" />
        </header>

        <div className="article__body">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton
              key={i}
              width={i % 4 === 3 ? 'narrow' : 'full'}
              className="mb-3 h-4"
            />
          ))}
        </div>
      </article>
    </main>
  );
}
