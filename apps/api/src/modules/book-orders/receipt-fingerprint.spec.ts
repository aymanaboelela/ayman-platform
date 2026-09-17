import sharp from 'sharp';
import {
  PHASH_MAX_DISTANCE,
  hammingDistance,
  perceptualHash,
  receiptSha256,
} from './receipt-fingerprint';

/**
 * Images are GENERATED here rather than committed. The real receipts this was
 * measured on are students' payment details; the properties being asserted —
 * exact equality survives nothing, perceptual equality survives re-encoding —
 * are properties of the algorithm and do not need anybody's transfer to show.
 *
 * The thresholds themselves were tuned on the real ten; see
 * `PHASH_MAX_DISTANCE` for those measurements.
 */

/** A deterministic, receipt-ish page: light background, dark bands of "text". */
async function page(seed: number, lines = 9): Promise<Buffer> {
  const width = 480;
  const height = 800;
  const bars: string[] = [];
  for (let i = 0; i < lines; i += 1) {
    /* Bar widths keyed off the seed — two different seeds are two different
       documents, the same seed is the same document every run. */
    const w = 120 + ((seed * 37 + i * 53) % 260);
    const y = 60 + i * 74;
    bars.push(`<rect x="40" y="${y}" width="${w}" height="30" fill="#1b1b1b"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#f4f1ea"/>
    ${bars.join('')}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe('receiptSha256', () => {
  it('is the same for the same bytes and different for a single changed byte', async () => {
    const bytes = await page(1);
    expect(receiptSha256(bytes)).toBe(receiptSha256(Buffer.from(bytes)));

    const tweaked = Buffer.from(bytes);
    tweaked[tweaked.length - 1] ^= 0xff;
    expect(receiptSha256(tweaked)).not.toBe(receiptSha256(bytes));
  });

  it('is 64 lowercase hex characters, which is what the CHECK constraint pins', async () => {
    expect(receiptSha256(await page(2))).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('perceptualHash', () => {
  it('is 16 lowercase hex characters, which is what the CHECK constraint pins', async () => {
    expect(await perceptualHash(await page(3))).toMatch(/^[0-9a-f]{16}$/);
  });

  /**
   * The case `sha256` cannot see: the same receipt saved again by a messenger.
   * Re-encoding changes every byte and must not change the judgement.
   */
  it('survives re-encoding and downscaling', async () => {
    const original = await page(4);
    const hash = await perceptualHash(original);

    for (const variant of [
      await sharp(original).webp({ quality: 40 }).toBuffer(),
      await sharp(original).jpeg({ quality: 50 }).toBuffer(),
      await sharp(original).resize({ width: 240 }).toBuffer(),
    ]) {
      const distance = hammingDistance(hash, await perceptualHash(variant));
      expect(distance).not.toBeNull();
      expect(distance!).toBeLessThanOrEqual(PHASH_MAX_DISTANCE);
    }
  });

  it('puts two different documents further apart than the threshold', async () => {
    const a = await perceptualHash(await page(5));
    const b = await perceptualHash(await page(6, 12));
    expect(hammingDistance(a, b)!).toBeGreaterThan(PHASH_MAX_DISTANCE);
  });

  /**
   * ⚠️ Not a bug — a documented limit. A crop moves every low-frequency
   * coefficient, and the threshold that would admit one is above the distance
   * at which two different students' receipts already sit. `sha256` and the
   * transfer reference are what cover the ground this gives up.
   */
  it('does NOT survive a heavy crop, which is why it is not the only check', async () => {
    const original = await page(7);
    const cropped = await sharp(original)
      .extract({ left: 40, top: 70, width: 400, height: 660 })
      .toBuffer();
    const distance = hammingDistance(
      await perceptualHash(original),
      await perceptualHash(cropped),
    );
    expect(distance!).toBeGreaterThan(PHASH_MAX_DISTANCE);
  });

  it('returns null for bytes that are not an image, rather than throwing', async () => {
    expect(await perceptualHash(Buffer.from('this is not a picture'))).toBeNull();
    expect(await perceptualHash(Buffer.alloc(0))).toBeNull();
  });
});

describe('hammingDistance', () => {
  it('counts differing bits', () => {
    expect(hammingDistance('0000000000000000', '0000000000000000')).toBe(0);
    expect(hammingDistance('0000000000000000', '0000000000000001')).toBe(1);
    expect(hammingDistance('0000000000000000', '000000000000000f')).toBe(4);
    expect(hammingDistance('ffffffffffffffff', '0000000000000000')).toBe(64);
  });

  /**
   * ⚠️ `null`, never a large number. "We cannot tell" and "these are very
   * different" must not read the same to a caller deciding whether to refuse
   * somebody's payment — a missing hash would otherwise look like proof of
   * innocence.
   */
  it('is null when either side is missing or malformed', () => {
    expect(hammingDistance(null, '0000000000000000')).toBeNull();
    expect(hammingDistance('0000000000000000', null)).toBeNull();
    expect(hammingDistance('short', '0000000000000000')).toBeNull();
    expect(hammingDistance('zzzzzzzzzzzzzzzz', '0000000000000000')).toBeNull();
  });
});
