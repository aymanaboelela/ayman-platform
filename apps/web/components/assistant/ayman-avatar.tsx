import Image from 'next/image';
import { copy } from '@ayman/contracts/copy';
import { cn } from '@ayman/ui/lib/cn';
import { getBrandAsset } from '@/lib/brand-assets';
import { tenantName } from '@/lib/tenant';

/**
 * The initial for the monogram tile, taken from the name being displayed.
 *
 * ⚠️ The letter used to be a hardcoded «أ», with a comment arguing that a
 * fixed glyph cannot come out wrong if the copy changes. That was true while
 * there was one instructor and it is the worse option now: the monogram is the
 * branch every non-`ayman` reader lands in (see `<AymanAvatar>` below), so the
 * one thing the fixed glyph guaranteed was the wrong initial for everybody
 * except him.
 *
 * Derived from `tenantName(copy.site.name)` rather than re-hardcoded, and
 * derived rather than given its own `TENANT_MONOGRAM` variable, so there is
 * exactly one answer on this stack to "whose name is this" and no second
 * setting to leave unset. On his stack `copy.site.name` is «أيمن أبو العلا»
 * and this returns U+0623 — the identical code point the literal was, so his
 * tile does not move a pixel.
 *
 * The first LETTER OR DIGIT, not `[0]`: `TENANT_DISPLAY_NAME` is free text an
 * operator types into a compose file, and a stray leading space, quote or
 * bracket would otherwise be rendered as the monogram — a circle containing
 * `"` reads as a broken component, not as an initial. An empty result cannot
 * happen from `tenantName()`, which never returns an empty string, but the
 * `?? ''` keeps the type honest rather than asserting it.
 */
function monogramOf(name: string): string {
  return name.match(/[\p{L}\p{N}]/u)?.[0] ?? '';
}

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
 * ## ⚠️ On a tenant stack the fallback is not the rare branch — it is the ONLY
 * branch
 *
 * `getBrandAsset('mark')` is gated: it hands a stack whose `TENANT_KEY` is not
 * `ayman` `undefined`, because `/brand/ayman-mark-2.webp` is his face and no
 * other deployment may serve it. That gate works. What it does is move every
 * non-`ayman` reader into the `else` below — so the monogram and its
 * accessible name stopped being the graceful degradation for a missing file
 * and became the avatar a second instructor's students see on every message
 * she sends them. Both were still his: a hardcoded «أ» in the circle, and
 * «م. أيمن أبو العلا» read aloud by every screen reader. The photograph was
 * the leak everybody looked for; the fallback was the leak that actually
 * shipped.
 *
 * ## The component is still called `AymanAvatar`, deliberately
 *
 * Considered and rejected. `tenant-identity-leak.spec.ts` writes out the
 * reason in its `NAME_LITERALS` docblock: the Latin needles are the FULL name
 * precisely so that identifiers like `AymanAvatar`, `latestFromAyman` and this
 * file's own path do not fail it — "identifiers no student ever sees". The
 * rename would touch `instructor-message-card.tsx`, `brand-assets.ts` and that
 * spec's prose, all to change a symbol that never reaches a rendered byte,
 * while the two things that DO reach one are fixed below. Recorded here so the
 * next reader does not re-open it.
 *
 * ## The accessible name
 *
 * Named, not `aria-hidden`. `BrandLockup` hides its copy of this image because
 * the wordmark states the name right beside it; here the name is NOT always
 * beside it (the dashboard card shows the face above the body), and a student
 * using a screen reader has to be told whose message this is — that is the
 * entire content of the design. Which is exactly why it has to be the name of
 * whoever actually runs the stack.
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

  /*
    Two reads of the same identity, and they are deliberately different keys.

    `aymanAvatarAlt` is «م. أيمن أبو العلا» — the honorific spelling, which is
    what a screen reader should say beside a message. The monogram cannot come
    from that string: its first letter is the «م» of «م.», and this tile has
    always drawn «أ». So the letter comes from the bare `copy.site.name`.

    On a non-`ayman` stack both `tenantName()` calls collapse to the same
    `TENANT_DISPLAY_NAME`, which is the point — the circle and the spoken name
    can never disagree about whose avatar this is.
  */
  const label = tenantName(copy.assistant.thread.aymanAvatarAlt);
  const monogram = monogramOf(tenantName(copy.site.name));

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
          alt={label}
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
          aria-label={label}
          role="img"
        >
          {monogram}
        </span>
      )}
    </span>
  );
}
