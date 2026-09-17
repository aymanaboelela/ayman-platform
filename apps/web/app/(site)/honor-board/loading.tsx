import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * The archive skeleton. A Server Component, so it ships inside the SSR'd HTML
 * rather than waiting on hydration — same as every other skeleton here.
 *
 * Geometry matches the real page: a page head, then the rail beside the board.
 * The rail's rows are two bars each because a round is a date over an exam
 * title, and the cards carry a disc because the avatar is the card's face.
 * Widths vary — uniform bars are the classic cheap-skeleton tell.
 */
export default function Loading() {
  return (
    <div aria-hidden="true" className="honor-archive site-shell">
      <header className="honor-archive__head">
        <Skeleton width="narrow" className="mb-4 h-3" />
        <Skeleton width="wide" className="mb-3 h-10" />
        <Skeleton width="full" className="h-4" />
      </header>

      <div className="honor-archive__body">
        <div>
          <Skeleton width="narrow" className="mb-3 h-3" />
          <div className="honor-archive__rail-list">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="honor-archive__rail-item">
                <Skeleton width={i === 0 ? 'wide' : 'narrow'} className="mb-2 h-4" />
                <Skeleton width="full" className="h-3" />
              </div>
            ))}
          </div>
        </div>

        <ul className="honor-board__slots honor-archive__slots">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="honor-board__slot honor-board__slot--filled">
              <Skeleton width="narrow" className="h-5" />
              <Skeleton width="narrow" className="h-4" />
              <Skeleton className="honor-board__slot-avatar" />
              <Skeleton width={i % 2 === 0 ? 'wide' : 'full'} className="h-6" />
              <Skeleton width="wide" className="h-3" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
