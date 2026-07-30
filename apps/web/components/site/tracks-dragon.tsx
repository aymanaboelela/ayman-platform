'use client';

import { type RefObject } from 'react';
import { TRACKS_DRAGON_VIDEO } from '@/lib/brand-assets';
import { useMediaQuery } from '@/lib/use-media-query';

/**
 * The big dragon behind the "choose your year" cards. Pure markup — every
 * tween, the fire-peak listener, and the replay contract live in
 * `year-tracks.tsx`, which owns the whole section's choreography in one
 * `useGsap` scope. This component only forwards a ref to the `<video>` so
 * that scope can drive it.
 *
 * `preload="auto"` fetches regardless of CSS visibility, so hiding this
 * below 64rem with `display: none` alone would still cost a phone visitor
 * the download. Not rendering the `<video>` at all is what actually prevents
 * it — the same reason `DragonSprite` and the retired `FireReveal` both
 * gate their own `<video>` the same way rather than relying on CSS.
 */
export function TracksDragon({
  videoRef,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const wide = useMediaQuery('(min-width: 64rem)', false);
  // Respect prefers-reduced-motion. We don't use useAmbientEffectsAllowed because
  // that hook also suppresses on (pointer: coarse), which is semantically wrong for
  // a scroll-triggered entrance sequence — it should still play for touch users
  // who haven't asked for reduced motion.
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)', true);

  if (!wide || reducedMotion || !TRACKS_DRAGON_VIDEO) return null;

  return (
    <div className="tracks__dragon" aria-hidden="true">
      <video
        ref={videoRef}
        className="tracks__dragon-video"
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        controls={false}
      >
        <source src={TRACKS_DRAGON_VIDEO.webm} type="video/webm" />
        <source src={TRACKS_DRAGON_VIDEO.mov} type="video/quicktime" />
      </video>
    </div>
  );
}
