import type { HonorBoardEntry } from '@ayman/contracts/admin/exams';

/**
 * The face on a لوحة الشرف card.
 *
 * ## Why a drawing and not the student's photograph
 *
 * This board is the one surface on the platform that a stranger on the
 * internet reads, and it names a minor. A face beside that name is a
 * different disclosure from a name alone, so the photo is declined here —
 * `avatarKey` stays on the wire only for the instructor surfaces. The owner
 * asked for a drawing that still looks like a prize rather than a grey
 * monogram, and this is it.
 *
 * ## Why boy and girl, and why that is not a guess
 *
 * `StudentProfile.gender` is a REQUIRED column every student sets at
 * onboarding, so nothing here infers anything from a name — see
 * `catalog.service.ts`, which maps it and sends only the variant. That
 * distinction matters: the platform deliberately never GUESSES whether a
 * student is a boy or a girl, and this does not start.
 *
 * ## Why a silhouette with no features
 *
 * A face would either be a specific child's face, which is the thing this
 * component exists to avoid, or a generic one that looks nothing like them.
 * Hair shape carries the whole difference, and the girl's is long rather than
 * a headscarf: covered and uncovered are both ordinary in this cohort, and a
 * hijab on every girl's card would state something about each of them that
 * the platform does not know.
 */
export function HonorAvatar({ variant }: { variant: HonorBoardEntry['avatarVariant'] }) {
  return (
    <span className="honor-board__slot-avatar" aria-hidden="true">
      <svg viewBox="0 0 64 64" className="honor-board__slot-avatar-art" role="presentation">
        {/* Shoulders, cut off by the disc's own `overflow: hidden`, which is
            what makes the figure sit IN the circle rather than float inside
            it. Drawn first so the head overlaps it. */}
        <path d="M13 64c0-11 8-18 19-18s19 7 19 18z" fill="currentColor" opacity="0.92" />
        {variant === 'girl' ? (
          <>
            {/* Hair BEFORE the head, so the shape reads as hair behind a face
                rather than as a second head in front of one. */}
            <path
              d="M20 27a12 12 0 0 1 24 0v13c0 2-1 3-3 3l-1.5-13a7.5 7.5 0 0 0-15 0L23 43c-2 0-3-1-3-3z"
              fill="currentColor"
              opacity="0.5"
            />
            <circle cx="32" cy="28" r="10" fill="currentColor" opacity="0.92" />
          </>
        ) : (
          <>
            <path d="M20 27a12 12 0 0 1 24 0z" fill="currentColor" opacity="0.5" />
            <circle cx="32" cy="27" r="10" fill="currentColor" opacity="0.92" />
          </>
        )}
      </svg>
    </span>
  );
}
