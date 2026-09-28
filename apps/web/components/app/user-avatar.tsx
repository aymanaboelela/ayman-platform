import type { CSSProperties } from 'react';
import { cn } from '@ayman/ui/lib/cn';
import { mediaUrl } from '@ayman/ui/branding';
import { hashString } from '@/lib/subject-art';
import { AvatarImage } from './avatar-image';

/**
 * The student's face — or, until there is one, a drawing that is clearly
 * THEIRS rather than an empty ring.
 *
 * ## ⚠️ The drawing is ALWAYS painted, and the photo is laid on top of it
 *
 * This used to be an either/or: initials when `User.image` was null, a bare
 * `<img>` when it was not, with `<AvatarImage>` swapping the initials back in
 * on `onError`. Reported from production with three screenshots — the topbar,
 * the dashboard band and «كارت الحضور» all showed the same thing: a ring with
 * NOTHING in it, the ember band showing straight through the middle. Not the
 * initials (they would have been letters on a grey disc), so every one of the
 * three was the photo branch, and the photo branch had painted nothing.
 *
 * An `<img alt="">` paints nothing in every state except "loaded and opaque":
 * while its request is in flight, when it failed before anything could listen
 * for the failure, when it decoded to a transparent picture. Only one of those
 * fires an event this component can answer, so the swap covered exactly one
 * way of being empty and left the student looking at a hole in the others.
 *
 * So the order is now structural rather than an event: the drawing is the
 * floor, always in the markup, and the photo is an absolutely-positioned layer
 * over it. A photo that loads covers the drawing completely; a photo that
 * never paints, for ANY reason, leaves the drawing showing. There is no state
 * left in which the circle is empty. `<AvatarImage>` still removes itself on
 * `onError` — not to reveal the drawing, which is already there, but so the
 * browser's broken-image glyph can never sit on top of it.
 *
 * ## The drawing, and why it is not the initials any more
 *
 * A grey disc with two letters in it read, next to a real photo elsewhere on
 * the same screen (the rail's brand mark), as "the picture did not load". A
 * head-and-shoulders figure on a colour of the student's own reads as a
 * deliberate portrait-in-waiting — the owner asked for drawings over letters
 * on the honour board for the same reason.
 *
 * The figure is the same for every student. The platform records a gender at
 * onboarding but never lets the interface branch on it for addressing, and
 * this component is rendered from the session in places (the topbar) that do
 * not have the profile at all; a figure that changed with gender on one screen
 * and not on the one beside it would be worse than a figure that never does.
 * What IS per-student is the colour — `avatarHue` below — so two students in a
 * list (the centre's door scanner) still look different at a glance.
 *
 * ## Why `next/image` for the photo
 *
 * Even for a remote Google photo: the host is listed in `next.config.ts`'s
 * `remotePatterns`, so the optimizer fetches it server-side and re-serves it
 * from `/_next/image` on our own origin. A direct `<img src="https://lh3…">`
 * would need `img-src` widened in the CSP, and would also tell Google where a
 * signed-in student is on every page view that renders an avatar.
 */
export function UserAvatar({
  name,
  image,
  size,
  className,
}: {
  name: string;
  image: string | null;
  /** Rendered px. Passed to `next/image` too, so the optimizer requests the
   *  right source width rather than a full-size photo scaled down in CSS. */
  size: number;
  className?: string;
}) {
  const src = image ? resolveAvatarSrc(image) : null;

  return (
    <span
      // The wrapper owns the SHAPE — size, round, border, clip — so a call
      // site's `className` (the hero's white ring, the card's halo) lands on
      // the circle whichever layer ends up visible inside it.
      className={cn('user-avatar shrink-0 rounded-full border border-line', className)}
      style={{ width: size, height: size, '--avatar-h': avatarHue(name) } as CSSProperties}
      aria-hidden="true"
    >
      <AvatarFigure />
      {src ? <AvatarImage src={src} size={size} /> : null}
    </span>
  );
}

/**
 * Head and shoulders, cut off by the disc's own `overflow: hidden` so the
 * figure sits IN the circle rather than floating inside it — the same
 * construction as a passport photo, which is what «كارت الحضور» is imitating.
 *
 * `currentColor` throughout; `.user-avatar__figure` sets it to a white alpha
 * that reads on every hue the disc can take.
 */
function AvatarFigure() {
  return (
    <svg className="user-avatar__figure" viewBox="0 0 64 64" focusable="false">
      <path d="M10 66c0-13.5 9.8-22 22-22s22 8.5 22 22z" fill="currentColor" />
      <circle cx="32" cy="27" r="11.5" fill="currentColor" />
    </svg>
  );
}

/**
 * The student's colour: one of twelve hues, 30° apart, keyed on the name.
 *
 * Twelve rather than the course art's 24: at avatar size two hues 15° apart
 * are the same colour, and a door-scanner list where two neighbours look
 * identical is exactly what a per-student colour is for avoiding. FNV-1a (from
 * `lib/subject-art`) rather than a character sum, because Arabic names that
 * differ by one letter are the normal case and a sum puts anagrams together.
 *
 * Exported for the test, which pins that it is stable — the same student must
 * not change colour between the topbar and the card.
 */
export function avatarHue(name: string): number {
  return (hashString(name.trim()) % 12) * 30;
}

/**
 * `User.image` holds two different things, and this is the one place that
 * knows it.
 *
 * A Google sign-up arrives with a full `https://lh3.googleusercontent.com/…`
 * URL, minted by a provider we do not control. An avatar uploaded here is
 * stored as a STORAGE KEY (`ab/abcd….webp`), because media URLs are
 * reconstructed at render time from `NEXT_PUBLIC_MEDIA_ORIGIN` and never
 * persisted — see `mediaUrl()` in `@ayman/ui/branding`. Writing today's media
 * origin into a user row would make relocating that host a data migration.
 *
 * The test is `startsWith('http')` rather than a URL parse: the only two
 * shapes this column ever holds are an absolute http(s) URL and a relative
 * storage key, and a key can never begin with `http` because it begins with
 * two hex characters of a UUID.
 */
export function resolveAvatarSrc(image: string): string {
  return image.startsWith('http') ? image : mediaUrl(image);
}

/**
 * First letter of each of the first two words. Uses `Array.from` rather than
 * `[0]` because Arabic names are outside the BMP often enough via emoji and
 * combining marks that indexing a JS string can split a character in half and
 * render a replacement box.
 *
 * No longer drawn by `<UserAvatar>` (see the note on the drawing above), and
 * still exported: the honour board's discs use it.
 */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('');
}
