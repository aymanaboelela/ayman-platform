'use client';

import Image from 'next/image';
import { useState } from 'react';

/**
 * The photo layer of `<UserAvatar>`, and the only reason any of it is a client
 * component: a photo that fails to LOAD has to get out of the way.
 *
 * It sits absolutely over the drawing `<UserAvatar>` always paints (see the
 * note there for why the drawing is the floor rather than the fallback). So on
 * failure this renders NOTHING — the drawing is already underneath — and the
 * only job left for `onError` is to take the element out, so no browser can
 * draw its broken-image glyph on top of the student's disc.
 *
 * The common failure is real: a Google sign-up stores an absolute
 * `lh3.googleusercontent.com` URL minted by a provider we do not control, and
 * Google rotates and expires those. When one dies, `/_next/image` answers the
 * optimiser's fetch failure with an error status.
 *
 * `onError` exists only in the browser and arrives after the server has
 * rendered, so the boundary is drawn as tightly as possible: this leaf is the
 * ONLY client component involved, and `<UserAvatar>` itself stays a Server
 * Component on every page that uses it.
 */
export function AvatarImage({ src, size }: { src: string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <Image
      src={src}
      // Empty alt on purpose: every call site renders the name as text beside
      // this, so describing the photo would announce the same person twice.
      alt=""
      width={size}
      height={size}
      className="user-avatar__photo"
      onError={() => setFailed(true)}
    />
  );
}
