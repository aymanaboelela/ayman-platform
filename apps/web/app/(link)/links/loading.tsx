import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * The bio page's shape: a circle, three centred lines, then three groups of
 * rows.
 *
 * The row heights are the real ones (`3.375rem` — the row's `0.8125rem` padding
 * either side of a `2.5rem` tile), and the group sizes are 5 / 4 / 2, so the
 * skeleton does not resize the page when the content lands. On the one route
 * that is opened cold from another app's browser, a layout shift at hand-off
 * is the first thing a visitor sees the product do.
 *
 * Bar widths vary rather than being uniform — the `(site)` group skeleton
 * records why: uniform bars are the biggest "cheap skeleton" tell.
 *
 * ⚠️ `--loading` is not cosmetic. `<Skeleton>` paints both its bar and its
 * shimmer out of `--n-12`, which is the theme's HIGH-CONTRAST TEXT step — and
 * on a light-theme visitor that is `#1A1714`, i.e. near-black bars on this
 * surface's permanently-ink background. The whole skeleton would be invisible
 * for half the audience, and invisible in the one state nobody screenshots.
 * The modifier re-points that one token for this subtree; see the rule in
 * `styles/linkhub.css`.
 */
export default function Loading() {
  return (
    <main className="linkhub__page linkhub__page--loading">
      <div className="linkhub__head">
        <Skeleton className="h-28 w-28 rounded-full" />
        <Skeleton width="narrow" className="mt-3 h-7" />
        <Skeleton width="wide" className="h-4" />
        <Skeleton className="mt-1 h-6 w-32 rounded-full" />
      </div>

      {[5, 4, 2].map((rows, group) => (
        <div key={group} className="linkhub__group">
          <Skeleton className="mb-1 h-3 w-16" />
          {Array.from({ length: rows }, (_, row) => (
            <Skeleton key={row} className="h-[3.375rem] rounded-lg" />
          ))}
        </div>
      ))}
    </main>
  );
}
