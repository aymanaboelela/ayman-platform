'use client';

import Image from 'next/image';
import { useState } from 'react';

/**
 * The photo half of `<UserAvatar>`, and the only reason it is a client
 * component: an avatar that fails to LOAD has to fall back to the initials.
 *
 * `<UserAvatar>` already chose initials when `User.image` is null. It had no
 * answer for the other failure — a URL that exists and does not resolve — and
 * that is the common one here, because a Google sign-up stores an absolute
 * `lh3.googleusercontent.com` URL minted by a provider we do not control.
 * Google rotates and expires those. When one dies, `/_next/image` answers the
 * optimiser's fetch failure with an error status, the browser draws its own
 * broken-image glyph, and the student sees a torn-page icon where their face
 * should be — «الصور مش ظاهرة» — on every screen with a header.
 *
 * `onError` is the only signal for that, it exists only in the browser, and it
 * arrives after the server has already rendered. So the boundary is drawn as
 * tightly as possible: this leaf is the ONLY client component involved, the
 * fallback markup is passed in as a prop already rendered by the server, and
 * `<UserAvatar>` itself stays a Server Component on every page that uses it.
 */
export function AvatarImage({
  src,
  size,
  className,
  fallback,
}: {
  src: string;
  size: number;
  className: string;
  /** Rendered instead, once the photo is known not to load. */
  fallback: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;

  return (
    <Image
      src={src}
      // Empty alt on purpose: every call site renders the name as text beside
      // this, so describing the photo would announce the same person twice.
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
