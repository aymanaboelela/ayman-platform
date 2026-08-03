import Image from 'next/image';
import { cn } from '@ayman/ui';
import { mediaUrl } from '@ayman/ui/branding';

/**
 * The photo when there is one, initials when there isn't — an email/password
 * account never has an avatar, and neither does a Google account whose owner
 * never set one, so the fallback is the common case, not the edge case.
 *
 * Extracted from `components/onboarding/identity-header.tsx` when the account
 * menu became the second place that needed it. Two copies of "photo or
 * initials, round, bordered" is two places for the fallback to be wrong.
 *
 * `next/image` rather than a bare `<img>` even for a remote Google photo: the
 * host is listed in `next.config.ts`'s `remotePatterns`, so the optimizer
 * fetches it server-side and re-serves it from `/_next/image` on our own
 * origin. A direct `<img src="https://lh3…">` would need `img-src` widened in
 * the CSP, and would also tell Google where a signed-in student is on every
 * page view that renders an avatar.
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
  const shared = 'shrink-0 rounded-full border border-line object-cover';
  const src = image ? resolveAvatarSrc(image) : null;

  if (src) {
    return (
      <Image
        src={src}
        // Empty alt on purpose: every call site renders the name as text
        // beside this, so describing the photo would announce the same person
        // twice.
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={cn(shared, className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className={cn(
        shared,
        'grid place-items-center bg-surface-4 font-semibold text-fg-muted',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
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
 */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('');
}
