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
  | 'logo'
  /**
   * The instructor's face, square, worn as a round avatar beside the wordmark
   * in the nav. Deliberately NOT `logo`: that slot is a 3:1 lockup box, and a
   * face letterboxed into 168×56 is unreadable. This is its own 1:1 slot so the
   * two can sit next to each other — mark, then name.
   */
  | 'mark'
  /**
   * The poster on each of the three track cards in `#years` — the ones the
   * dragon breathes into view.
   *
   * ⚠️ These three are the one kind `<MediaSlot>` does NOT render a fallback
   * for, and that is deliberate. Every other slot here stands in for
   * photography that does not exist yet, so an absent asset gets a designed
   * panel. A track card is not empty without its poster: it already carries a
   * working editor window with real syntax in it (`<TrackCardView>`), which is
   * what the section shipped with. So an unregistered track image means "keep
   * the editor", not "draw a placeholder" — and the cards upgrade one at a time
   * as the posters arrive, with no half-finished state on the page in between.
   */
  | 'trackEssentials'
  | 'trackYear1'
  | 'trackYear2';

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
  /**
   * 3:4, not the 4:5 this used to reserve — the registered portrait is a phone
   * frame, and a 4:5 box would have cropped the top of the dragon and the
   * bottom of the shot to fit. `.about__portrait` carries the same number.
   */
  portrait: 3 / 4,
  logo: 168 / 56,
  mark: 1,
  /**
   * 3:2 — the posters' own shape, uncropped.
   *
   * A 16:9 slot would have matched the editor window it replaces almost
   * exactly, and it is the wrong call here: these are not backdrops, they are
   * designed posters whose title sits in the lower third. Measured on the
   * التأسيس poster, cropping 3:2 to 16:9 eats 16% of the height, and centred
   * that clips «من الصفر للإحتراف خطوة بخطوة» off the bottom edge. The card
   * grows ~60px taller instead, which the stage has room for — see
   * `.tracks__card` in sections.css.
   */
  trackEssentials: 3 / 2,
  trackYear1: 3 / 2,
  trackYear2: 3 / 2,
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
  /**
   * Cut from IMG_2807 — the instructor presenting at a whiteboard — at crop
   * 660×660 from (955,60) in the 1980×1720 source, then down to 128px (2.9KB
   * WebP at q84).
   *
   * 128px for a box that renders at 36: the nav mark is masked to a circle and
   * sits against both the dark hero stage and the light pinned card, and a 2×
   * source visibly softens on a 3× phone. It is under 3KB — there is nothing to
   * save by cutting it finer.
   *
   * The crop is framed for the CIRCLE, not for the square: there is headroom
   * above the head and margin at the sides precisely because `border-radius`
   * throws the corners away. Re-cropping this tighter — as a square preview
   * will tempt you to — clips the top of his head once it is masked.
   *
   * ⚠️ THE `-2` IN THE FILENAME IS LOAD-BEARING. This replaced a cut from
   * IMG_1606 (a 1600×900 frame where the face spanned ~240px, against a dark
   * purple backdrop that swallowed the head at favicon size). Re-cutting it in
   * place did NOT take: `next/image` keys its cache off the URL, so the nav
   * went on serving the old frame from bytes that no longer existed on disk.
   * The rule at the top of `hero` is not theoretical — a re-cut needs a new
   * filename, every time.
   */
  mark: { src: '/brand/ayman-mark-2.webp', width: 128, height: 128 },
  /**
   * The about section's portrait: the instructor at قصر البارون, the same
   * dragon that flies through `#tracks` perched on the palace behind him. It
   * is the one image on the site that puts the person and the brand's animal
   * in the same frame, which is exactly the job the about section needs done.
   *
   * 2.7MB PNG → 171KB WebP at q78, resized 1086→1024 wide. The box renders at
   * 32rem at most, so 1024 IS the 2× source; going wider buys nothing. Below
   * q74 the dragon's scales and the flat sky start to band — the same floor
   * the hero composite has, and for the same reasons.
   *
   * ⚠️ 3:4. `BRAND_ASSET_RATIO.portrait` and `.about__portrait` both say so;
   * a re-crop to another shape has to change all three or `object-fit: cover`
   * will silently start trimming.
   *
   * ⚠️ Re-cutting this needs a NEW FILENAME — see the note on `hero`.
   */
  portrait: { src: '/brand/portrait-baron-dragon.webp', width: 1024, height: 1366 },
  /**
   * The «الكورس التأسيسي» poster, on the first of the three track cards.
   *
   * 1536×1024 PNG (1.9MB) → 900×600 WebP at q82 (55KB). 900 rather than the
   * source width because the box it fills is `min(27vw, 24.375rem)` — 390 CSS
   * px at its widest, so 900 covers a 2× display with room and there is
   * nothing on a 3× phone to spend the extra bytes on: below 64rem the whole
   * dragon stage unstacks and the cards go to a plain column. q82 rather than
   * the hero's q78 because this poster's lower third is TYPE, and set type is
   * where WebP's ringing shows first; the step costs 7KB.
   *
   * ⚠️ Re-cutting this needs a NEW FILENAME — see the note on `hero`.
   */
  trackEssentials: { src: '/brand/track-essentials-1.webp', width: 900, height: 600 },
  // trackYear1: { src: '/brand/track-year-1-1.webp', width: 900, height: 600 },
  // trackYear2: { src: '/brand/track-year-2-1.webp', width: 900, height: 600 },
  // cutout:   { src: '/brand/cutout.webp',   width: 1200, height: 1600 },
  // logo:     { src: '/brand/logo.svg',      width: 168,  height: 56 },
};

export function getBrandAsset(kind: BrandAssetKind): BrandAsset | undefined {
  return brandAssets[kind];
}

/* -------------------------------------------------------------------------- */

/**
 * Logos for the organisations named in the about section's résumé rail. Keyed
 * by the `id` on each entry in `copy.landing.aboutCredits`; an id with no
 * entry falls back to a monogram tile of the same height.
 *
 * ## What these say, and what they must not
 *
 * They identify real organisations the instructor has a real relationship
 * with — the university he graduated from, the companies that employed him,
 * and the student communities his university students came from. That last
 * group is the one to be careful about: **he was never employed by Google,
 * Microsoft or IEEE**, and their marks sit under a heading that says «درّس
 * لمين؟» beside copy that says so explicitly. Move them under «اشتغل فين؟»
 * and the page starts claiming something untrue. Do not.
 *
 * ## The files
 *
 * All six are 96px tall — 3x the 2rem the plate draws them at — trimmed to
 * their own ink so the plate's padding is the only margin, on transparency so
 * one plate colour serves both themes. `scripts/` has no encoder for these;
 * they were cut from each organisation's own published logo with `sharp`.
 *
 * ⚠️ IEEE and MTI are CROPPED to their primary lockups. Both publish a
 * stacked mark-over-tagline, and at 2rem the tagline is a grey smear rather
 * than words — «Advancing Technology for Humanity» is 3px tall there. The cut
 * rows were measured off row-wise ink coverage, not chosen by eye, and both
 * results are lockups the owner publishes standalone.
 *
 * ⚠️ Every logo here is for a LIGHT background — MTI's, CCR's and Avnology's
 * wordmarks are all dark ink. That is what `.about__mark-tile` being a pale
 * plate in both themes is for; drop a white-ink logo in and it vanishes.
 */
export const credentialLogos: Record<string, BrandAsset | undefined> = {
  mti: { src: '/brand/logos/mti.webp', width: 263, height: 96 },
  google: { src: '/brand/logos/google.webp', width: 94, height: 96 },
  microsoft: { src: '/brand/logos/microsoft.webp', width: 96, height: 96 },
  ieee: { src: '/brand/logos/ieee.webp', width: 285, height: 96 },
  ccr: { src: '/brand/logos/ccr.webp', width: 222, height: 96 },
  avnology: { src: '/brand/logos/avnology.webp', width: 395, height: 96 },
};

export function getCredentialLogo(id: string): BrandAsset | undefined {
  return credentialLogos[id];
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
  /**
   * Encoded frame rate. Not decoration: `<TracksDragon>` rewinds the entrance
   * by stepping DOWN this grid, and a seek that lands between two frames is a
   * seek that shows an arbitrary one of them.
   */
  fps: number;
};

/**
 * THE ENTRANCE, and also the flight that precedes it. The dragon — with the
 * instructor riding it, laptop open — flies in profile, banks to face the
 * reader, and opens fire.
 *
 * 844KB WebM / 590KB MOV, 15fps, keyed off a BLUE screen by
 * `scripts/encode-dragon-ride.sh`, which records the measured chroma distances
 * (background 0.013, the nearest part of the creature 0.124), why the rider's
 * jeans get a gentler key than the rest of the frame, and why the bottom of the
 * frame is cropped away.
 *
 * ⚠️ An earlier build keyed a GREEN cut of the same animation and shipped a
 * dragon with its belly, legs and wing membranes eaten out of the fire frames.
 * That is what the header of the encode script is mostly about; do not
 * reintroduce the zoned/time-gated key it describes.
 *
 * ## ONE file does both halves of the approach, and that is the point
 *
 * While the reader is still coming down the page the dragon has to be flying,
 * and when they arrive it has to turn — with no seam between the two. It would
 * be natural to cut two clips for that, and it would be wrong: a separate
 * flight loop sits at an arbitrary phase when the reader arrives, so handing
 * over to a turn that starts at a fixed frame jumps the wingbeat.
 *
 * Instead this one file LOOPS ITS OWN OPENING (see `DRAGON_FLIGHT_LOOP`) until
 * the section is reached, and is then simply left alone. The turn is not cut to;
 * it is played into. There is no transition to hide because there is no
 * transition.
 *
 * ## Why this replaced a frame sequence
 *
 * The stage used to paint loose WebP frames to a canvas, because the scene was
 * scrubbed by the scroll wheel and a `<video>` cannot be dragged backwards. It
 * is not scrubbed any more — it plays itself — and once nothing scrubs, frames
 * are simply a worse video codec: the same six seconds cost 2.5MB as WebP and
 * 724KB as VP9, because a codec stores what CHANGED between frames and a folder
 * of images stores every frame in full. Decoding moves off the main thread as
 * well, which is what the canvas repaints were costing.
 *
 * ## It DOES run backwards, and that is why it carries keyframes
 *
 * An earlier note here said reversing was the one thing a video could not do.
 * That was wrong in a specific and fixable way: a `<video>` cannot be given a
 * negative `playbackRate`, but it can be stepped down its own frame grid by
 * assigning `currentTime`, and the only thing that makes that unaffordable is
 * having to decode from a distant keyframe on every step.
 *
 * So this file is encoded at GOP 8 (`scripts/encode-dragon-ride.sh`), and no
 * backward seek decodes more than seven frames. Measured in Chrome: as one GOP
 * — libvpx's default on a clip this short — a rewind managed 21.1 fps against
 * a 22.5 fps target and stalled for 116ms; at GOP 8 it runs at 113 fps with a
 * 16ms worst gap. The keyframes cost 98KB and buy five times the headroom.
 *
 * `<TracksDragon>` uses this to run the entrance in reverse when the reader
 * scrolls back up out of the section — the fire is drawn back into the jaws
 * and the dragon un-turns, rather than the scene being cut back to the start.
 */
export const DRAGON_RIDE: DragonVideo | undefined = {
  webm: '/brand/dragon-ride.webm',
  mov: '/brand/dragon-ride.mov',
  width: 960,
  height: 506,
  seconds: 6.134,
  fps: 15,
};

/**
 * The stretch of `DRAGON_RIDE` that repeats while the reader is still on their
 * way down to the section: the dragon in profile, holding station, wings beating.
 *
 * ⚠️ Both ends are MEASURED, and moving either by a frame is visible.
 *
 * Every (start, end) pair in the clip's opening was scored by the mean
 * per-pixel change across the wrap — colour and alpha — and this one is the
 * cheapest. Its cost is 0.82 of what two ORDINARY consecutive frames differ by,
 * which is to say the loop point changes the picture less than simply playing
 * does, and cannot be seen. Looping from the first frame instead scores 3.0x,
 * a plainly visible hitch, because the wingbeat does not start at a phase it
 * ever returns to.
 *
 * Re-derive with the search in `scripts/` history if the clip is ever recut;
 * do not adjust these by eye.
 */
export const DRAGON_FLIGHT_LOOP = { from: 0.533, to: 2.133 } as const;

/**
 * THE FIRE, held. Picks up on the exact frame the entrance ends on and burns
 * for as long as the reader stays in the section.
 *
 * 925KB WebM / 825KB MOV. It is a PALINDROME — the segment, then the same
 * segment backwards — so the element's own `loop` is seamless by construction
 * rather than by cross-fade.
 *
 * ⚠️ THE FIRE MUST NEVER APPEAR TO STOP OR CUT. Measured on the encoded file,
 * the wrap changes the picture by 0.80 of what two ORDINARY consecutive frames
 * change it by — the loop point is a smaller step than simply playing, so there
 * is nothing to see. The hand-over from `DRAGON_RIDE` measures 1.18 on the same
 * scale, also within one frame's worth of churn. For scale, two frames a second
 * apart measure 1.68.
 *
 * Fire is the one subject a palindrome works on unconditionally — churning
 * flame has no direction, so the reversed half cannot be told from the forward
 * one. Do NOT reach for this on the entrance: a dragon flying backwards is
 * extremely obvious.
 *
 * The footer pair replays this same file, which is already in cache.
 */
export const DRAGON_BLAZE: DragonVideo | undefined = {
  webm: '/brand/dragon-blaze.webm',
  mov: '/brand/dragon-blaze.mov',
  width: 960,
  height: 506,
  seconds: 4.933,
  fps: 15,
};

/**
 * The moment the first flame leaves the jaws, in seconds into `DRAGON_RIDE` —
 * what the card burst, the glow flare and the floor spot are all cued to.
 *
 * Measured off the source, not eyeballed: the mean luma of the frame's bottom
 * third sits flat at ~103 for the flight and the turn, climbs from source frame
 * 117, and settles onto a ~133 plateau by frame 140. 117/24fps = 4.87s.
 *
 *   ffmpeg -i in.mp4 -vf "crop=1920:340:0:700,signalstats,\
 *     metadata=print:key=lavfi.signalstats.YAVG:file=-" -f null -
 *
 * ⚠️ Cue off the element's own `currentTime`, never off a timeline offset. The
 * clip loops its opening for an unknown length of time before it is released
 * (see `DRAGON_FLIGHT_LOOP`), so how long the entrance has been ON SCREEN and
 * how far INTO it the dragon is are different numbers.
 */
export const DRAGON_IGNITES_AT = 4.87;
