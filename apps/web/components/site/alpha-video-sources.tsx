'use client';

import type { DragonVideo } from '@/lib/brand-assets';

/**
 * Apple's engine — Safari on a Mac, and EVERY browser on an iPad or iPhone,
 * since all of them are WebKit underneath. `navigator.vendor` is the one
 * signal that says engine rather than brand: Chrome on a Mac reports
 * «Google Inc.», Chrome on an iPad reports «Apple Computer, Inc.».
 */
function isAppleWebKit(): boolean {
  return typeof navigator !== 'undefined' && navigator.vendor.startsWith('Apple');
}

/**
 * The two `<source>`s of a transparent clip, in the order THIS browser needs.
 *
 * ⚠️ «let the browser pick» stopped working. The clips ship as VP9-with-alpha
 * WebM and HEVC-with-alpha MOV, and the plan was that Safari, unable to play
 * WebM, would skip to the MOV. Safari learned WebM — but not VP9's alpha
 * layer. So it took the first source, played it OPAQUE, and drew the keyed
 * colour plane: the dragon on a tablet stood in a box of screen colour,
 * reported as «الكروما الخضراء باينة». On Apple WebKit the MOV now comes
 * first; everywhere else the WebM does, because Chrome on a Mac can decode
 * HEVC but not its alpha, and would make the opposite mistake.
 *
 * Only ever rendered after mount (both callers gate on a media query that is
 * `false` on the server), so reading `navigator` here cannot split the
 * server's HTML from the client's.
 */
export function AlphaVideoSources({ video }: { video: DragonVideo }) {
  const webm = <source key="webm" src={video.webm} type="video/webm" />;
  const mov = <source key="mov" src={video.mov} type="video/quicktime" />;
  return isAppleWebKit() ? [mov, webm] : [webm, mov];
}
