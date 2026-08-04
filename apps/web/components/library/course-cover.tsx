import { BookOpen } from 'lucide-react';
import { mediaUrl } from '@ayman/ui/branding';

/**
 * The course's art, at the size it deserves.
 *
 * The signed-in course page shipped without it entirely — the public page
 * showed the cover and the page a student actually studies from showed a
 * heading and a grey list. That absence is most of why the screen read as
 * black and white: on a catalog card the art is the only colour in the tile,
 * and here there was no tile.
 *
 * ## Why a raw `<img>` and not `next/image`
 *
 * Covers are arbitrary admin uploads served from the MEDIA origin, which is
 * deliberately not the app origin and therefore not in `next.config`'s
 * `remotePatterns` — the optimizer would refuse them at request time. Both
 * `library-course-card.tsx` and the public course page take the same position
 * for the same reason. The fixed aspect box below is what makes that safe:
 * the space is reserved before the bytes arrive, so there is no CLS to pay.
 *
 * ## Why the coverless case is not a blank rectangle
 *
 * Most courses will have no art for a while, and an empty box on a coloured
 * band reads as an image that failed to load rather than as a design.
 * `.course-thumb` is the same two-layer treatment the library card already
 * falls back to (hatch + warm wash, see `globals.css`), so a course without a
 * cover looks intentional and looks the SAME in both places.
 */
export function CourseCover({
  coverKey,
  subjectNameAr,
}: {
  coverKey: string | null;
  subjectNameAr: string;
}) {
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[var(--r-md)] ring-1 ring-white/15">
      {coverKey ? (
        <img
          src={mediaUrl(coverKey)}
          // Decorative: the course title sits beside it as an <h1>, so naming
          // the image would make a screen reader say the course twice.
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="course-thumb flex h-full w-full flex-col items-center justify-center gap-2"
        >
          <span className="relative z-10 flex size-11 items-center justify-center rounded-full border border-line-strong bg-surface-1 text-accent-text">
            <BookOpen size={20} />
          </span>
          <span className="mono relative z-10 text-[length:var(--fs-mono-label)] text-fg-muted">
            {subjectNameAr}
          </span>
        </span>
      )}
    </div>
  );
}
