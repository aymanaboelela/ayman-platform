import { createHash } from 'node:crypto';
import sharp from 'sharp';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * بصمة إيصال التحويل — «الإيصال الواحد ما يتصرفش مرتين».
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Two fingerprints of one image, because they answer two different questions.
 *
 * ## Why this exists at all
 *
 * On 2026-09-17, five students each had two PAID orders for the same book, and
 * in four of them the two orders carried a byte-identical receipt (see the
 * `20260917180000_book_order_receipt_fingerprint` migration for the list). They
 * had not paid twice. `BookOrderPanel` remembers an in-progress order in
 * `localStorage`, so opening the shop on a second phone — or after clearing
 * site data — starts a brand-new order, and nothing server-side asked whether
 * the receipt being uploaded had already been spent.
 *
 * ## `sha256` — the same FILE
 *
 * Exact equality on the STORED bytes. `MediaService.gateAndEncode` re-encodes
 * every upload to webp at a fixed quality, so two uploads of one file produce
 * identical output and this is a true equality rather than a guess. That is the
 * whole reason it is hashed after encoding and not on the way in.
 *
 * It catches the common case completely and is worth nothing at all against a
 * re-screenshot — which is the next function.
 *
 * ## `perceptualHash` — the same PICTURE
 *
 * A 64-bit DCT perceptual hash. Survives re-compression, a small crop, a resize
 * and a screenshot-of-a-screenshot, and is compared by Hamming distance rather
 * than equality.
 *
 * ⚠️ It is a SUSPICION, never a proof. Two different students' Vodafone-Cash
 * SMS screenshots are the same white-on-dark message layout with a handful of
 * digits changed, and at 64 bits those genuinely land close together. So a
 * near-match may only ever be weighed against another order of the SAME phone —
 * see `PHASH_MAX_DISTANCE` and the call site in `BookOrdersService`.
 *
 * ## What neither of them can do
 *
 * The fifth student (`BK-EA9B7C` / `BK-7A3FD3`) uploaded two genuinely
 * different images — a Vodafone-Cash SMS and an InstaPay receipt — of ONE
 * transfer, `023031384189`. No fingerprint of the picture can see that. That is
 * `receipt-ocr.ts`, which reads the money instead of the paper.
 */

/**
 * The stored bytes' SHA-256, lowercase hex.
 *
 * Hashed from what STORAGE holds, never from anything the request carried: a
 * hash the client supplies is a fingerprint the forger picks.
 */
export function receiptSha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * How far apart two perceptual hashes may be and still be called the same
 * picture. 64 bits, so 0 is identical and 32 is a coin toss.
 *
 * ## The number is MEASURED, on the ten real receipts
 *
 * Every distance below was taken from the five production pairs in the
 * `20260917180000_book_order_receipt_fingerprint` migration:
 *
 *   نفس الصورة بعد …          أكبر مسافة
 *     webp q80                    0
 *     webp q40                    2
 *     نصف الحجم                   2
 *     jpeg q50                    4
 *     قص ٥٪                      10
 *     قص ١٥٪                     28
 *
 *   صورتين مختلفتين لطالبين      أقل مسافة  6   ← «Khaled BK-846854 ↔ احمد BK-13F450»
 *
 * ## So four, and cropping is out of scope
 *
 * Ten — the usual library default — is above the floor at which two DIFFERENT
 * students' receipts already sit, and would have refused one of their payments.
 * There is no threshold that admits a 5% crop (10) while staying under that
 * floor (6): the two ranges overlap, and picking anything in between buys the
 * crop by paying with a false accusation of double-paying.
 *
 * Four is the largest value strictly below the observed floor, and it still
 * covers what actually happens to a receipt in the wild — re-saved, re-sent
 * through a messenger, downscaled. A deliberate crop defeats this, and that is
 * accepted: the four real cases were byte-identical re-uploads (`sha256` catches
 * those outright) and the fifth was two different photographs of one transfer
 * (`receipt-ocr.ts` catches that). Cropping is an adversary this layer is not
 * for.
 *
 * ⚠️ And even at four it is only ever weighed within ONE phone's own orders —
 * see the call site. Receipts from one banking app share a layout, which is
 * exactly why that floor is as low as 6 to begin with.
 */
export const PHASH_MAX_DISTANCE = 4;

/** The DCT is computed on this square, and the hash is the top-left 8×8 of it. */
const DCT_SIZE = 32;
const HASH_SIDE = 8;

/**
 * A 64-bit perceptual hash as 16 lowercase hex characters.
 *
 * Returns `null` when the bytes are not a decodable image. A receipt this
 * cannot read is not a payment this may refuse — every failure here is silent
 * and the submission carries on without a perceptual hash.
 */
export async function perceptualHash(bytes: Buffer): Promise<string | null> {
  let pixels: Buffer;
  try {
    /* Greyscale first, then a fixed square. `fit: 'fill'` on purpose: the hash
       must describe the same thing for a tall phone screenshot and its cropped
       copy, and preserving the aspect ratio would make the two describe
       differently-shaped canvases. */
    pixels = await sharp(bytes)
      .greyscale()
      .resize(DCT_SIZE, DCT_SIZE, { fit: 'fill' })
      .raw()
      .toBuffer();
  } catch {
    return null;
  }
  if (pixels.length < DCT_SIZE * DCT_SIZE) return null;

  /* Flat `Float64Array`s rather than `number[][]`: one allocation instead of
     33 per transform, and contiguous memory for a loop that touches every cell
     64 times.

     ⚠️ The `?? 0`s below are noise this file cannot remove. `noUncheckedIndexedAccess`
     applies to typed arrays too under this tsconfig, so every read is
     `number | undefined` even where the index is provably in range. They are a
     tax on the checker, not a real branch — nothing here can be out of range,
     the lengths are fixed by `DCT_SIZE` and `HASH_SIDE`. */
  const grid = new Float64Array(DCT_SIZE * DCT_SIZE);
  for (let i = 0; i < grid.length; i += 1) grid[i] = pixels[i] ?? 0;

  const coefficients = dct2d(grid, DCT_SIZE);

  /* The top-left 8×8 is the low-frequency corner — the broad light and dark
     shapes of the image, which is exactly what survives a re-compression. */
  const block = new Float64Array(HASH_SIDE * HASH_SIDE);
  for (let y = 0; y < HASH_SIDE; y += 1) {
    for (let x = 0; x < HASH_SIDE; x += 1) {
      block[y * HASH_SIDE + x] = coefficients[y * DCT_SIZE + x] ?? 0;
    }
  }

  /* ⚠️ The median EXCLUDES the DC term at [0][0]. It is the image's average
     brightness and is an order of magnitude larger than everything around it,
     so leaving it in drags the median up and flips most of the bits to 0 —
     which is how every dark screenshot ends up with the same hash. */
  const median = medianOf(block.subarray(1));

  let hex = '';
  for (let nibble = 0; nibble < 16; nibble += 1) {
    let value = 0;
    for (let bit = 0; bit < 4; bit += 1) {
      value = (value << 1) | ((block[nibble * 4 + bit] ?? 0) > median ? 1 : 0);
    }
    hex += value.toString(16);
  }
  return hex;
}

/**
 * Bits that differ between two hashes, or `null` when either is missing or
 * malformed.
 *
 * `null` rather than a large number: "we cannot tell" and "these are very
 * different" must not be the same answer to a caller deciding whether to refuse
 * somebody's payment.
 */
export function hammingDistance(a: string | null, b: string | null): number | null {
  if (!a || !b || a.length !== 16 || b.length !== 16) return null;
  let distance = 0;
  for (let i = 0; i < 16; i += 1) {
    const left = Number.parseInt(a[i] ?? '', 16);
    const right = Number.parseInt(b[i] ?? '', 16);
    if (Number.isNaN(left) || Number.isNaN(right)) return null;
    let diff = left ^ right;
    while (diff) {
      distance += diff & 1;
      diff >>= 1;
    }
  }
  return distance;
}

/**
 * Separable 2-D DCT-II — every row, then every column of the result.
 *
 * `grid` is row-major `size × size` and the return is the same shape. Separable
 * because the 2-D transform factorises: `size` one-dimensional passes each way
 * is O(size³) against O(size⁴) for the direct form, which at 32×32 is the
 * difference between a millisecond and a noticeable one.
 */
function dct2d(grid: Float64Array, size: number): Float64Array {
  const cosines = cosineTable(size);

  const byRow = new Float64Array(size * size);
  const line = new Float64Array(size);
  const transformed = new Float64Array(size);

  for (let y = 0; y < size; y += 1) {
    dct1d(grid.subarray(y * size, y * size + size), cosines, size, transformed);
    byRow.set(transformed, y * size);
  }

  const out = new Float64Array(size * size);
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) line[y] = byRow[y * size + x] ?? 0;
    dct1d(line, cosines, size, transformed);
    for (let y = 0; y < size; y += 1) out[y * size + x] = transformed[y] ?? 0;
  }
  return out;
}

/** One pass, written into `out` so the two loops above allocate nothing. */
function dct1d(
  input: Float64Array,
  cosines: Float64Array,
  size: number,
  out: Float64Array,
): void {
  for (let k = 0; k < size; k += 1) {
    let sum = 0;
    const offset = k * size;
    for (let n = 0; n < size; n += 1) sum += (input[n] ?? 0) * (cosines[offset + n] ?? 0);
    out[k] = sum;
  }
}

/* Built once per call and shared by both passes — recomputing 1024 cosines per
   row is most of the cost of the transform. */
function cosineTable(size: number): Float64Array {
  const table = new Float64Array(size * size);
  for (let k = 0; k < size; k += 1) {
    for (let n = 0; n < size; n += 1) {
      table[k * size + n] = Math.cos(((2 * n + 1) * k * Math.PI) / (2 * size));
    }
  }
  return table;
}

function medianOf(values: Float64Array): number {
  const sorted = Float64Array.from(values).sort();
  const middle = sorted.length >> 1;
  const hi = sorted[middle] ?? 0;
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + hi) / 2 : hi;
}
