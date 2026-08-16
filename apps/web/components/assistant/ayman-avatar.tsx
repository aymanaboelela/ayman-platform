import Image from 'next/image';
import { copy } from '@ayman/contracts/copy';
import { cn } from '@ayman/ui/lib/cn';
import { getBrandAsset } from '@/lib/brand-assets';

/**
 * The instructor's face, beside the messages he sent.
 *
 * ## Why a photograph and not an initial
 *
 * «رسايل م. أيمن» only works if the student believes a person wrote it, and
 * the message text alone cannot carry that: «شفت نتيجتك» over a grey circle
 * with «أ» in it reads as a system notice wearing a name. The face is the part
 * that makes the claim, and it is the same face on the landing page, the nav
 * and the about section — so it is read as HIM rather than as an avatar.
 *
 * ## Why it falls back to a monogram rather than to nothing
 *
 * `brandAssets.mark` is a registry entry that can legitimately be absent (see
 * `brand-assets.ts` — every slot ships able to render without a photograph).
 * A missing image must not leave a ragged gap where every other bubble has an
 * avatar, so the fallback is a designed tile at the identical size — the same
 * discipline `<MediaSlot>` follows.
 *
 * ## The accessible name
 *
 * Named, not `aria-hidden`. `BrandLockup` hides its copy of this image because
 * the wordmark states the name right beside it; here the name is NOT always
 * beside it (the dashboard card shows the face above the body), and a student
 * using a screen reader has to be told whose message this is — that is the
 * entire content of the design.
 */
export function AymanAvatar({
  size = 'md',
  className,
}: {
  /** `sm` sits in a chat bubble row; `md` heads the dashboard card. */
  size?: 'sm' | 'md';
  className?: string;
}) {
  const mark = getBrandAsset('mark');
  const px = size === 'sm' ? 28 : 44;

  return (
    <span
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden rounded-full',
        'border border-accent/30 bg-accent/12 text-accent-text',
        size === 'sm' ? 'size-7' : 'size-11',
        className,
      )}
    >
      {mark ? (
        <Image
          src={mark.src}
          width={mark.width}
          height={mark.height}
          alt={copy.assistant.thread.aymanAvatarAlt}
          // The rendered box, not the intrinsic size: the registered mark is
          // 128px square and this draws it at 28–44, so without `sizes` the
          // browser is told to reserve bandwidth for four times the pixels it
          // will use — on a widget that loads on every route.
          sizes={`${px}px`}
          className="size-full object-cover"
        />
      ) : (
        <span
          className="text-[length:var(--fs-text-xs)] font-semibold"
          aria-label={copy.assistant.thread.aymanAvatarAlt}
          role="img"
        >
          {/* Not a letter picked at render time from the name: this is a fixed
              monogram, so it cannot come out as a stray glyph if the copy
              changes. */}
          أ
        </span>
      )}
    </span>
  );
}
