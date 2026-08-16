import Image from 'next/image';
import { mediaUrl } from '@ayman/ui/branding';

/**
 * A course's cover, WHOLE and FULL WIDTH — the box takes its height from the
 * picture rather than the other way round.
 *
 * ## Why not `object-fit: cover`
 *
 * A cover is a designed poster with the course's own name written across it,
 * so cropping it is not a neutral reframing — it takes words off the artwork.
 * Measured on production: the one uploaded cover is 1536×1024 (3:2), and the
 * catalogue card's 16/9 thumb was cutting 18% of its height, taking the top
 * off «التأسيسي» in the course's own title. Reported as «الصورة متقصّة من فوق».
 *
 * ## Why not `contain` either
 *
 * That was the first answer here, and it trades a crop for BARS: the same 3:2
 * cover in a 16/9 box leaves an eighth of the card's width as filler down each
 * side, which reads as a picture that failed to load rather than as a frame.
 * «عايز تاخد العرض كله يعني يطول وعرض الصورة».
 *
 * ## So the box is the picture
 *
 * `w-full`, `h-auto`, no aspect box: the element's height is derived from the
 * file's own ratio. Nothing is cropped, nothing is padded, and a cover of any
 * shape lands correctly without this component ever being told what shape it
 * is — which matters, because the catalog contract does not carry the image's
 * dimensions and `AdminCoverCropper`'s 16/9 is applied at UPLOAD time, so a
 * cover from before it existed (this one) keeps its own ratio forever.
 *
 * `width`/`height` below are that 16/9 as a PLACEHOLDER only: the browser
 * reserves the box from them before the bytes land, then the real intrinsic
 * ratio takes over because the height is `auto`. An on-spec cover reserves
 * exactly right and never shifts; an off-spec one settles once on first paint.
 *
 * The call sites drop their own `aspect-ratio` when a cover exists and keep it
 * when one does not — the cover-less fallback is a gradient panel with no
 * intrinsic height, so it still needs the box.
 */
export function CourseCover({
  coverKey,
  sizes,
  priority = false,
}: {
  coverKey: string;
  sizes: string;
  /** Preload instead of lazy-loading. The first card in a grid only. */
  priority?: boolean;
}) {
  return (
    <Image
      src={mediaUrl(coverKey)}
      alt=""
      width={1600}
      height={900}
      priority={priority}
      sizes={sizes}
      className="cover-fit__bleed"
    />
  );
}
