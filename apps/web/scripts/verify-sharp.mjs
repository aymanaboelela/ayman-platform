/**
 * Fails the Docker build if the image it is about to produce cannot resize an
 * image — run inside the runtime stage, against the real standalone tree.
 *
 * ## Why this exists
 *
 * When `sharp` cannot be loaded, Next does not crash and does not log. The
 * `/_next/image` route stays alive, still validates `q` against
 * `images.qualities` (an out-of-range value still answers 400), and then hands
 * back the upstream bytes unchanged with the upstream content-type. Nothing
 * looks wrong — the images render correctly. They are just never resized.
 *
 * Measured against production on 2026-08-12, same image, same request:
 *
 *              w=384      w=640     w=1200
 *   local      16,262     38,204    100,318  bytes
 *   prod      206,420    206,420    206,420  bytes   ← the original, every time
 *
 * `/_next/image?url=/icon.png` came back `image/png` at the raw file's 26,101
 * bytes, so it was not even changing format. A phone asking for 384px received
 * 13× the bytes it should — on the LCP element, and on every other image.
 *
 * ## Why it checks by LOADING rather than by looking
 *
 * The first version of this guard only checked that a `@img/sharp-linux*`
 * directory existed in the standalone output. That was too weak, and it passed
 * on a deploy whose images were still broken: the package files can be present
 * while the native binary underneath fails to load (a missing system library, a
 * glibc mismatch, an arch mismatch). Existence is not loadability, so this
 * requires the module and encodes a real image.
 *
 * ## Why it resolves from Next's directory
 *
 * `require('sharp')` from the app root throws MODULE_NOT_FOUND here, and that
 * is NOT the failure this guard is looking for — it is an artefact of pnpm's
 * layout. Next's tracer copies sharp into `node_modules/.pnpm/` and links it
 * where NEXT can see it (`node_modules/.pnpm/next@…/node_modules/sharp`), not
 * where the app root can. Next loads it from its own context, so the guard has
 * to resolve from the same place or it would fail a perfectly good image.
 */
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const PNPM_DIR = path.resolve('node_modules/.pnpm');

function findNextDir() {
  let entries;
  try {
    entries = readdirSync(PNPM_DIR);
  } catch {
    return null;
  }
  const match = entries.find((name) => name.startsWith('next@'));
  return match ? path.join(PNPM_DIR, match, 'node_modules', 'next') : null;
}

function die(headline, detail) {
  console.error('');
  console.error('  ✗ ' + headline);
  console.error('');
  console.error('    /_next/image would still answer 200 and still validate `q`,');
  console.error('    and would serve every image at its ORIGINAL size — silently.');
  console.error('    That is ~13x the bytes on a phone, including the LCP image.');
  console.error('');
  for (const line of detail) console.error('    ' + line);
  console.error('');
  process.exit(1);
}

console.log('');
console.log('  ── sharp preflight ────────────────────────────────────────');

const nextDir = findNextDir();
console.log('    next:  ' + (nextDir ?? 'NOT FOUND'));

if (!nextDir) {
  die('next is not in the standalone output at all.', [
    'Looked in: ' + PNPM_DIR,
    'This is a build-output problem, not a sharp problem.',
  ]);
}

const requireFromNext = createRequire(path.join(nextDir, 'index.js'));

let sharp;
let sharpPath;
try {
  sharpPath = requireFromNext.resolve('sharp');
  sharp = requireFromNext('sharp');
} catch (error) {
  die('sharp cannot be loaded the way Next loads it.', [
    'resolved to: ' + (sharpPath ?? '(resolution itself failed)'),
    (error.code ?? 'Error') + ': ' + String(error.message).split('\n')[0],
    '',
    'Since sharp 0.33 the native binary ships as a per-platform optional',
    'dependency (@img/sharp-linux-x64 here). Present-but-unloadable usually',
    'means the wrong platform variant was installed, or a system library the',
    'binary links against is missing from this base image.',
  ]);
}

console.log('    sharp: ' + sharpPath);
console.log('    versions: ' + JSON.stringify(sharp.versions));

try {
  const out = await sharp({
    create: { width: 64, height: 64, channels: 3, background: '#000000' },
  })
    .resize(8)
    .webp()
    .toBuffer();

  if (out.length === 0) {
    die('sharp encoded an empty buffer.', ['Loaded and ran, but produced no bytes.']);
  }

  console.log('    ✓ resized 64px → 8px and encoded webp (' + out.length + ' bytes)');
  console.log('  ───────────────────────────────────────────────────────────');
  console.log('');
} catch (error) {
  die('sharp loaded but cannot encode an image.', [
    (error.code ?? 'Error') + ': ' + String(error.message).split('\n')[0],
  ]);
}
