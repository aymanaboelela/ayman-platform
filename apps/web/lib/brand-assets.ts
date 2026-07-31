/**
 * The marketing surface's image registry — the ONE place a photographic asset
 * path may appear.
 *
 * At time of writing the platform has no studio photography, so every entry is
 * absent and `<MediaSlot>` renders a designed fallback sized to the exact box
 * the real asset will occupy. Shipping the layouts at their true dimensions now
 * means dropping the photos in later is an edit to this file and nothing else —
 * no component, no stylesheet, no measurement changes.
 *
 * To go live with a real asset: put the file in `public/brand/`, add the entry,
 * done. `width`/`height` are the intrinsic pixel size and must match the file,
 * because `next/image` uses them to reserve space and prevent layout shift.
 *
 * Course thumbnails are NOT here — those are per-row data and come from
 * `CatalogCourse.coverKey` through `mediaUrl()`.
 */
export type BrandAssetKind =
  /** Hero composite: instructor + set. Occupies the hero's inline-start half. */
  | 'hero'
  /** Instructor cut-out standing behind the track cards in `#years`. */
  | 'cutout'
  /** Tall studio portrait in the about section. */
  | 'portrait'
  /** Wordmark used in the nav and footer. */
  | 'logo';

export type BrandAsset = {
  src: string;
  width: number;
  height: number;
};

/**
 * Intrinsic aspect ratios the fallbacks reserve, so a later photo swap does not
 * move anything on the page. Chosen from the reference layout's real boxes.
 */
export const BRAND_ASSET_RATIO: Record<BrandAssetKind, number> = {
  hero: 4 / 5,
  cutout: 3 / 4,
  portrait: 4 / 5,
  logo: 168 / 56,
};

export const brandAssets: Partial<Record<BrandAssetKind, BrandAsset>> = {
  /**
   * The 1536×1024 hero composite, used FULL BLEED behind the hero copy
   * (2.2MB PNG → 202KB WebP at q78; the fine dragon scales and glow gradients
   * are what cost the bytes, and they visibly break up below q74).
   *
   * Not documentary any more: a built composite — the instructor cut out over
   * an orange circuit/AI set, dragon behind him. It already sits in the brand's
   * own hue, so `.hero__media` grades it far more lightly than the old
   * conference photo needed.
   *
   * ⚠️ This one is 3:2, not the 16:9 the earlier sources were, so `object-fit:
   * cover` trims top and bottom on wide viewports rather than the sides. The
   * `object-position` on `.hero__media > *` is set for that.
   *
   * ⚠️ 1536px is thin for an edge-to-edge hero — it upscales past ~1530 CSS px
   * and on every 2× display. A 2560px-wide render is the upgrade.
   *
   * The filename carries the composite's name rather than the generic `hero`
   * the old photo used. Re-cutting this image later should rename the file too:
   * `next/image` keys its cache off the URL, so overwriting bytes at a path a
   * browser has already seen leaves the stale frame on screen.
   */
  hero: { src: '/brand/hero-ai-dragon-2.webp', width: 1536, height: 1024 },
  // cutout:   { src: '/brand/cutout.webp',   width: 1200, height: 1600 },
  // portrait: { src: '/brand/portrait.webp', width: 1200, height: 1500 },
  // logo:     { src: '/brand/logo.svg',      width: 168,  height: 56 },
};

export function getBrandAsset(kind: BrandAssetKind): BrandAsset | undefined {
  return brandAssets[kind];
}

/* -------------------------------------------------------------------------- */

/**
 * A transparent clip, in the two formats it takes to play one everywhere.
 *
 * No single alpha video format is universal: VP9-in-WebM covers every browser
 * except Safari, HEVC-in-MOV covers Safari and almost nothing else. Components
 * emit both as `<source>` elements and let the browser pick, so a reader
 * downloads exactly one of them.
 *
 * `width`/`height` are the WebM's intrinsic size and describe the FRAME, not
 * the subject — every position inside the clip is expressed as a fraction of
 * these, so a re-encode at a different resolution changes nothing else.
 */
export type DragonVideo = {
  webm: string;
  mov: string;
  width: number;
  height: number;
  /** Playing length in seconds, as encoded. */
  seconds: number;
};

/**
 * THE ENTRANCE. The dragon — with the instructor riding it, laptop open — flies
 * in from the left, banks to face the reader, and opens fire. Plays once, top to
 * bottom, and is never looped, scrubbed or reversed.
 *
 * 748KB WebM / 652KB MOV, 15fps, keyed off a blue screen by
 * `scripts/encode-dragon-ride.sh` — which documents why blue and `chromakey`
 * rather than green and `colorkey`, and how the cut point was measured.
 *
 * ## Why this replaced a frame sequence
 *
 * The stage used to paint loose WebP frames to a canvas, because the scene was
 * scrubbed by the scroll wheel and a `<video>` cannot be dragged backwards. It
 * is not scrubbed any more — it plays itself on arrival — and once nothing seeks,
 * frames are simply a worse video codec: the same 6 seconds cost 2.5MB as WebP
 * and 748KB as VP9, because a codec stores what CHANGED between frames and a
 * folder of images stores every frame in full. Decoding moves off the main
 * thread as well, which is what the canvas repaints were costing.
 *
 * ⚠️ If this ever needs to run backwards again, it has to go back to frames.
 * That is the one thing this cannot do.
 */
export const DRAGON_RIDE: DragonVideo | undefined = {
  webm: '/brand/dragon-ride.webm',
  mov: '/brand/dragon-ride.mov',
  width: 960,
  height: 540,
  seconds: 6.134,
};

/**
 * THE FIRE, held. Picks up on the exact frame the entrance ends on and burns
 * for as long as the reader stays in the section.
 *
 * 1.1MB WebM / 952KB MOV. It is a PALINDROME — the segment, then the same
 * segment backwards — so `loop` on the element is seamless by construction
 * rather than by cross-fade. Measured across the wrap, the mean per-pixel
 * change is 9.2/255 against 10.4 for two ordinary consecutive frames: the join
 * is smaller than a normal step, which is to say invisible. The swap from
 * `DRAGON_RIDE` measures 11.4 on the same scale, also within one frame's worth
 * of churn.
 *
 * Fire is the one subject a palindrome works on unconditionally — churning
 * flame has no direction, so the reversed half cannot be told from the forward
 * one. The footer pair replays this same file, which is already in cache.
 */
export const DRAGON_BLAZE: DragonVideo | undefined = {
  webm: '/brand/dragon-blaze.webm',
  mov: '/brand/dragon-blaze.mov',
  width: 960,
  height: 540,
  seconds: 4.933,
};

/**
 * The moment the first flame leaves the jaws, in seconds into `DRAGON_RIDE` —
 * what the card burst, the glow flare and the floor spot are all cued to.
 *
 * Measured off the source, not eyeballed: the mean luma of the frame's bottom
 * third sits flat at ~100 for the fly-in and the turn, climbs from source frame
 * 116, and settles onto a ~134 plateau by frame 140. 116/24fps = 4.83s.
 *
 *   ffmpeg -i in.mp4 -vf "crop=1920:360:0:720,signalstats,\
 *     metadata=print:key=lavfi.signalstats.YAVG:file=-" -f null -
 */
export const DRAGON_IGNITES_AT = 4.83;
