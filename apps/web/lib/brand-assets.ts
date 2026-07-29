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
   * The full 1600×900 stage photograph, used FULL BLEED behind the hero copy
   * (241KB JPEG → 90KB WebP).
   *
   * ⚠️ 1600px is thin for an edge-to-edge hero — it upscales on anything wider
   * than ~1600 CSS px and on every 2× display. It holds up here because the
   * grading in `sections.css` desaturates and darkens it heavily, which hides
   * the softness; a sharper or more colourful treatment would show it. A
   * 2560px-wide original is the upgrade.
   *
   * It is documentary, not studio: a purple conference backdrop covered in
   * sponsor logos, which fights an orange brand on both hue and busyness.
   * See the grading note on `.hero__media`.
   */
  hero: { src: '/brand/hero.webp', width: 1600, height: 900 },
  // cutout:   { src: '/brand/cutout.webp',   width: 1200, height: 1600 },
  // portrait: { src: '/brand/portrait.webp', width: 1200, height: 1500 },
  // logo:     { src: '/brand/logo.svg',      width: 168,  height: 56 },
};

export function getBrandAsset(kind: BrandAssetKind): BrandAsset | undefined {
  return brandAssets[kind];
}

/* -------------------------------------------------------------------------- */

/**
 * The dragon mascot, supplied as a SPRITE SHEET rather than a single image: one
 * file holding a grid of poses that `<DragonSprite>` steps through to animate
 * the wingbeat. One request, no frame-by-frame loading pop, and the browser
 * decodes it once.
 *
 * `cols × rows` must match the grid in the file exactly, and `frames` is how
 * many of those cells are real (a 2×2 sheet with 3 drawn poses would be
 * `cols: 2, rows: 2, frames: 3`). Getting these wrong shows as the animation
 * jumping to a blank cell.
 *
 * `hasAlpha` tells the component how to composite. A sheet rendered on a
 * background needs `screen` blending and a feathered mask to sit on the stage;
 * a true transparent PNG needs neither and always looks better. Set it to
 * `true` the moment a cut-out version exists.
 */
export type SpriteSheet = {
  src: string;
  cols: number;
  rows: number;
  frames: number;
  /** Frames per second of the wingbeat. */
  fps: number;
  hasAlpha: boolean;
};

/**
 * 1536×1024, a 2×2 grid of 768×512 cells — the 3:2 the `.dragon` box reserves,
 * so a cell fills it without distortion.
 *
 * A genuine cut-out: sampling the decoded pixels puts 71% of them at alpha 0
 * and 27% at alpha 255, with almost nothing in between. It needs no keying and
 * composites correctly over any surface, which is what lets it fly the whole
 * page rather than being confined to a section of known lightness.
 *
 * (This was briefly registered as `hasAlpha: false` on the strength of a
 * preview that showed a brown gradient — that was the image viewer compositing
 * the transparency, not the file.)
 */
export const DRAGON_SHEET: SpriteSheet | undefined = {
  src: '/brand/dragon-sheet.webp',
  cols: 2,
  rows: 2,
  frames: 4,
  fps: 6,
  hasAlpha: true,
};
