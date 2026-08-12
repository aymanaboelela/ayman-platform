import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * Mirrors the real form's proportions — heading, two fields, submit, divider,
 * two provider buttons — so nothing resizes when it hydrates. It renders inside
 * `auth-pane__inner`, which already supplies the column width and the 32px
 * rhythm, so this is a plain stack rather than a card.
 *
 * A Server Component, so it ships inside the SSR'd HTML.
 */
export default function Loading() {
  return (
    <>
      <div className="space-y-2">
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="narrow" className="h-4" />
      </div>
      <div className="space-y-5">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="space-y-1.5">
            <Skeleton width="narrow" className="h-3" />
            <Skeleton width="full" className="h-10" />
          </div>
        ))}
        <Skeleton width="full" className="h-10" />
        <Skeleton width="narrow" className="mx-auto h-3" />
        <Skeleton width="full" className="h-10" />
      </div>
    </>
  );
}
