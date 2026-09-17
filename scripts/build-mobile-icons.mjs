/**
 * Builds the Flutter app's launcher-icon and splash sources.
 *
 * ## Why generated rather than dropped in by hand
 *
 * The existing PWA icons (`apps/web/public/icons/icon-512.png`) are an upscale
 * of a small crop: legible on a 192px home-screen tile, visibly soft at the
 * 1024px App Store size and cropped through the chin on the maskable variant.
 * Shipping those would put a blurry face on the store listing.
 *
 * So the icon is rebuilt from the sharpest portrait in the repo
 * (`apps/web/public/team/ayman.jpg`, 900×1200) at full resolution, in the
 * brand's own colours, and this script is what makes that reproducible when
 * the photo is replaced.
 *
 * ## What it emits
 *
 *   assets/icons/app_icon.png             1024² — iOS, and the Play listing
 *   assets/icons/app_icon_foreground.png  1024² — Android adaptive foreground
 *   assets/icons/app_icon_monochrome.png  1024² — Android 13+ themed icon
 *   assets/images/brand_mark.png           512² — the in-app avatar/lockup
 *   assets/images/splash_logo.png          640² — the launch screen
 *
 * `flutter_launcher_icons` and `flutter_native_splash` then slice these into
 * every density. Run `pnpm mobile:icons` after changing the photo.
 *
 * ## The crop
 *
 * Hand-measured against the source, not detected: the head sits at roughly
 * x 385–555, y 275–500 of 900×1200.
 *
 * ⚠️ TIGHT on purpose. The first attempt framed head-and-shoulders at 440px,
 * which looked correct as a portrait and wrong as an icon: the photo was taken
 * in a restaurant, and at 1024px the store listing showed the ceiling tiles,
 * the counter and two strangers behind him. An app icon has one job at 60px —
 * be recognisably him — and every pixel that is not his face is working
 * against it.
 *
 * 300px centred on the face puts the head at roughly 57% of the circle's
 * diameter, which is about where a portrait stops reading as a mugshot, and
 * leaves only the immediate backdrop — which the circular mask then clips to a
 * thin band.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const SRC = path.join(REPO, 'apps/web/public/team/ayman.jpg');
const ICONS = path.join(REPO, 'apps/mobile/assets/icons');
const IMAGES = path.join(REPO, 'apps/mobile/assets/images');

mkdirSync(ICONS, { recursive: true });
mkdirSync(IMAGES, { recursive: true });

/** Face-centred square in source pixels. See the crop note in the header. */
const CROP = { left: 320, top: 262, width: 300, height: 300 };

/**
 * `--n-2` light (#F9F8F6), the app's subtle-panel neutral.
 *
 * NOT white and NOT the amber. White makes the icon disappear into a light
 * home-screen wallpaper, and a full amber tile behind a face turns the skin
 * tones orange — the accent is «what you press», never a backdrop.
 */
const GROUND = { r: 0xf9, g: 0xf8, b: 0xf6, alpha: 1 };

/** `--a-9` light (#EFA22C) — the ring, and the only brand colour in frame. */
const ACCENT = '#EFA22C';

/**
 * A circular mask, as an SVG.
 *
 * sharp has no circle primitive; compositing a `dest-in` SVG is the standard
 * way and antialiases the edge properly, which a hand-built alpha buffer does
 * not.
 */
const circleMask = (size) =>
  Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );

/** The amber ring drawn around the portrait. */
const ring = (size, inset, width) =>
  Buffer.from(
    `<svg width="${size}" height="${size}">
       <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - inset - width / 2}"
               fill="none" stroke="${ACCENT}" stroke-width="${width}"/>
     </svg>`,
  );

/**
 * A soft radial mask centred on the face.
 *
 * ⚠️ The numbers matter and the first pair were wrong. SVG gradient stop
 * offsets are fractions of `r`, not of the frame — so `r="64%"` with a stop at
 * 62% held the mask fully opaque out to 0.62 × 0.64 ≈ 40% of the frame and
 * only faded across the last 23%, which left the entire background sharp. The
 * blur was in the output and invisible.
 *
 * The head is about 57% of the crop wide, so its half-width is ~28%. `r="40%"`
 * with a stop at 60% holds sharp to 24% — just inside the cheekbones — and is
 * gone by 40%, which is where the ears end. The feather is the whole point: a
 * hard edge reads as a cut-out pasted onto a blur, a gradient reads as depth of
 * field.
 *
 * Centred at 48% vertically rather than 50% because the crop leaves slightly
 * more shoulder than headroom.
 */
const faceMask = (size) =>
  Buffer.from(
    `<svg width="${size}" height="${size}">
       <defs>
         <radialGradient id="f" cx="50%" cy="48%" r="40%">
           <stop offset="0%"   stop-color="#fff" stop-opacity="1"/>
           <stop offset="60%"  stop-color="#fff" stop-opacity="1"/>
           <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
         </radialGradient>
       </defs>
       <rect width="${size}" height="${size}" fill="url(#f)"/>
     </svg>`,
  );

/**
 * The face, cropped and cut to a circle at `size`, with the background thrown
 * out of focus.
 *
 * ⚠️ The blur is not decoration. The source photograph was taken in a
 * restaurant, and the tight crop still leaves two strangers and a service
 * counter inside the circle — visible and distracting at the 1024px the store
 * listing renders. There is no segmentation model here, so instead of masking
 * the subject the image is composited against a blurred copy of ITSELF through
 * a soft radial gradient: sharp where the face is, progressively out of focus
 * towards the edge. It is the same effect a portrait lens gives, it needs no
 * model, and it fails gracefully — a photo where the face is off-centre gets a
 * slightly soft cheek, not a mangled cut-out.
 *
 * The blurred layer is also desaturated and darkened a little, which pushes it
 * further back and stops the warm restaurant lighting competing with the amber
 * ring.
 */
async function portraitCircle(size) {
  const square = await sharp(SRC)
    .extract(CROP)
    .resize(size, size, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
    .toBuffer();

  // Sigma scales with the output so the effect is identical at 512 and 1024.
  const background = await sharp(square)
    .blur(size * 0.045)
    .modulate({ saturation: 0.55, brightness: 0.94 })
    .toBuffer();

  const foreground = await sharp(square)
    .composite([{ input: faceMask(size), blend: 'dest-in' }])
    .png()
    .toBuffer();

  return sharp(background)
    .composite([
      { input: foreground, blend: 'over' },
      { input: circleMask(size), blend: 'dest-in' },
    ])
    .png()
    .toBuffer();
}

/**
 * The iOS / store icon: a full-bleed rounded tile.
 *
 * iOS applies its own squircle mask, so this must be a SQUARE with no
 * transparency and no pre-rounded corners — a pre-rounded PNG gets rounded
 * twice and shows four grey notches. Apple also rejects any alpha channel in
 * the App Store icon outright, hence `flatten`.
 */
async function buildAppIcon() {
  const SIZE = 1024;
  // 78% leaves the portrait clear of the squircle's corner radius while
  // staying large enough to read at 60px.
  const inner = Math.round(SIZE * 0.78);
  const offset = Math.round((SIZE - inner) / 2);

  const face = await portraitCircle(inner);

  await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: GROUND },
  })
    .composite([
      { input: face, left: offset, top: offset },
      { input: ring(SIZE, offset - 14, 10), left: 0, top: 0 },
    ])
    .flatten({ background: GROUND })
    .png()
    .toFile(path.join(ICONS, 'app_icon.png'));

  console.log('✓ app_icon.png            1024²  (iOS + store listing)');
}

/**
 * The Android adaptive foreground.
 *
 * ⚠️ Android crops an adaptive icon to a shape the OEM chooses and can animate
 * it — only the CENTRE 66% is guaranteed visible. A foreground drawn at the
 * same scale as the iOS icon loses its ring on a Samsung and its chin on a
 * Xiaomi. Everything meaningful therefore sits inside 66%, on transparency,
 * with the ground supplied separately as a flat colour.
 */
async function buildAdaptiveForeground() {
  const SIZE = 1024;
  const safe = Math.round(SIZE * 0.62);
  const offset = Math.round((SIZE - safe) / 2);

  const face = await portraitCircle(safe);

  await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: face, left: offset, top: offset },
      { input: ring(SIZE, offset - 12, 9), left: 0, top: 0 },
    ])
    .png()
    .toFile(path.join(ICONS, 'app_icon_foreground.png'));

  console.log('✓ app_icon_foreground.png 1024²  (Android adaptive, 62% safe zone)');
}

/**
 * The Android 13+ themed ("monochrome") icon.
 *
 * The OS throws the colours away and tints the ALPHA with the wallpaper
 * palette, so a photo becomes a grey blob. This is the `</>` monogram instead —
 * the same mark the web falls back to, and the same one in the status bar.
 *
 * Without a monochrome layer, a phone with themed icons on shows the app as a
 * flat grey circle beside every other themed icon on the home screen.
 */
async function buildMonochrome() {
  const SIZE = 1024;
  // Drawn inside the 66% safe zone, same as the foreground.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
      <g fill="#000000" transform="translate(${SIZE / 2} ${SIZE / 2}) scale(${(SIZE * 0.52) / 24}) translate(-12 -12)">
        <path d="M8.55,5.47 L9.93,6.93 L4.66,12 L9.93,17.07 L8.55,18.53 L1.75,12 Z"/>
        <path d="M13.62,4.5 L15.55,5.02 L11.32,19.5 L9.39,18.98 Z"/>
        <path d="M15.45,5.47 L22.25,12 L15.45,18.53 L14.07,17.07 L19.34,12 L14.07,6.93 Z"/>
      </g>
    </svg>`;

  await sharp(Buffer.from(svg)).png().toFile(path.join(ICONS, 'app_icon_monochrome.png'));
  console.log('✓ app_icon_monochrome.png 1024²  (Android 13+ themed icons)');
}

/** The in-app mark: the portrait circle alone, on transparency. */
async function buildBrandMark() {
  const face = await portraitCircle(512);
  await sharp(face).png().toFile(path.join(IMAGES, 'brand_mark.png'));
  console.log('✓ brand_mark.png           512²  (topbar lockup, assistant avatar)');
}

/**
 * The launch screen.
 *
 * Transparent, because `flutter_native_splash` paints the background itself
 * from a colour that has to differ between light and dark — baking the light
 * ground into the image puts a white square on a dark launch screen.
 */
async function buildSplash() {
  const SIZE = 640;
  const inner = Math.round(SIZE * 0.7);
  const offset = Math.round((SIZE - inner) / 2);
  const face = await portraitCircle(inner);

  await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: face, left: offset, top: offset },
      { input: ring(SIZE, offset - 10, 7), left: 0, top: 0 },
    ])
    .png()
    .toFile(path.join(IMAGES, 'splash_logo.png'));

  console.log('✓ splash_logo.png          640²  (launch screen)');
}

await buildAppIcon();
await buildAdaptiveForeground();
await buildMonochrome();
await buildBrandMark();
await buildSplash();
