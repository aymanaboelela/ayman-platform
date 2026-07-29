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
  // hero:     { src: '/brand/hero.webp',     width: 1600, height: 2000 },
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
 * ⚠️ `hasAlpha: false`, and `<DragonSprite>` therefore renders NOTHING for it
 * today. That is not a bug to route around — see the note in that component.
 * The dragon flies the whole page, crossing the dark hero, the tinted bands and
 * the white cards; artwork painted on its own background can only be keyed one
 * way, and no single blend erases both a dark and a light backdrop.
 *
 * `hasAlpha` is false despite the source PNG having had an alpha channel:
 * what matters is whether the SUBJECT is cut out, and this one is painted on an
 * opaque gradient.
 *
 * To bring the mascot back: replace this file with a transparent-background
 * sheet at the same grid and set `hasAlpha: true`. Nothing else changes.
 */
export const DRAGON_SHEET: SpriteSheet | undefined = {
  src: '/brand/dragon-sheet.webp',
  cols: 2,
  rows: 2,
  frames: 4,
  fps: 6,
  hasAlpha: false,
};
