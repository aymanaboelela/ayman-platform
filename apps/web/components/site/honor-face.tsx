import Image from 'next/image';
import { mediaUrl } from '@ayman/ui/branding';
import { initials } from '@/components/app/user-avatar';

/**
 * The face of a place on لوحة الشرف — the winner's photograph, or their
 * initials when there isn't one.
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
 * ## Initials are the normal case, not the failure case
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
export function HonorFace({ name, photoKey }: { name: string; photoKey: string | null }) {
  if (!photoKey) {
    return (
      <span className="honor-board__slot-avatar" aria-hidden="true">
        {initials(name)}
      </span>
    );
  }

  return (
    <Image
      src={mediaUrl(photoKey)}
      alt=""
      /* The disc is at most 7rem drawn, so 256 is a 2× source on a retina
         phone and nothing is downloaded twice over. `sizes` is what makes the
         optimizer pick that rather than the full upload. */
      width={256}
      height={256}
      sizes="7rem"
      className="honor-board__slot-avatar honor-board__slot-avatar--photo"
    />
  );
}
