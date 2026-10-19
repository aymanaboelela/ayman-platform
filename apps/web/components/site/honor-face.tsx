import Image from 'next/image';
import { mediaUrl } from '@ayman/ui/branding';
import { HonorAvatar } from './honor-avatar';

/**
 * The face of a place on لوحة الشرف — the winner's photograph, or a drawn
 * graduate when there isn't one.
 *
 * ## Why a photo is here at all now
 *
 * It used to be refused outright: the board is the one public page that names
 * a minor, and `avatarKey` — the student's OWN avatar, a Google picture they
 * never chose to publish or a selfie meant for a screen only they see — is not
 * something a pin should put on the open internet. That argument still holds,
 * and nothing here reads `avatarKey`.
 *
 * What changed is that there is now a second, narrower fact to read:
 * `student_profiles.honor_photo_key`, set by an instructor for THIS board, one
 * student at a time. A photo appears because somebody decided it should, which
 * is the same rule the board's membership already runs on.
 *
 * ## No photo is the normal case, not the failure case
 *
 * Most winners have no board photo and the owner adds them as he gets them, so
 * a card with a monogram is not a card waiting to finish loading — it is the
 * board exactly as it looked before photos existed. Both branches render the
 * same disc, at the same size, so a board that is half photographs does not
 * read as half broken.
 *
 * `alt=""` and not the student's name: the name is printed directly underneath
 * in the next element, and a screen reader announcing it twice — once as an
 * image, once as text — is noise, not description.
 */
export function HonorFace({
  name,
  photoKey,
  className,
  sizes = '7rem',
}: {
  name: string;
  photoKey: string | null;
  /** Replaces the landing card's disc class — the archive's podium draws the
   *  same face at its own sizes. */
  className?: string;
  /** The drawn size, for the optimizer. */
  sizes?: string;
}) {
  const disc = className ?? 'honor-board__slot-avatar';
  if (!photoKey) {
    /* No photo: the drawn graduate, not the two initials it used to be —
       «لو حد مش حاطط صورة، حط أڤاتار شكله كويس». See `honor-avatar.tsx`. */
    return (
      <span className={`${disc} ${disc}--art`} aria-hidden="true">
        <HonorAvatar name={name} />
      </span>
    );
  }

  return (
    <Image
      src={mediaUrl(photoKey)}
      alt=""
      /* 512 so the podium's 10rem disc is still sharp on a 3× phone
         («صورتهم تبقى واضحة»); `sizes` keeps the 7rem landing card from
         downloading more than it draws. */
      width={512}
      height={512}
      sizes={sizes}
      className={`${disc} ${disc}--photo`}
    />
  );
}
