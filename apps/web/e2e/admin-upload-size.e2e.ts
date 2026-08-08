import { randomFillSync } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';
import { loginAsAdmin } from './fixtures';

/**
 * An image LARGER THAN 1 MB uploads.
 *
 * ## The bug this exists to catch, and why nothing caught it before
 *
 * Every upload in the admin went through a Next Server Action, which buffers
 * its payload and caps it at `serverActions.bodySizeLimit` — 1 MB by default,
 * and never raised. So the ceiling was 1 MB everywhere while the screen
 * promised 8 MB for an image and 95 MB for a deck, and the refusal happened in
 * the framework, before any application code: no toast, no console error, no
 * server log. A course cover off a phone silently did not save, and «أضف
 * مادة», which only enables once a document has uploaded, could never enable
 * for a real lecture PDF.
 *
 * Measured on the course cover field before the fix: 515 KB saved, 1,056 KB
 * did nothing at all.
 *
 * It survived a full round of manual verification because a test PNG is a few
 * kilobytes. **That is the whole reason this test generates a file over the
 * limit rather than using a fixture image** — a small file passes on the
 * broken code and proves nothing.
 *
 * ## Why the assertion is on the hidden input
 *
 * `<MediaKeyField>` writes the storage key returned by the API into a hidden
 * input, and that value is what the surrounding form submits. Asserting on the
 * preview `<img>` would pass on a local `blob:` preview that never reached the
 * server; asserting on the key proves the bytes crossed the network, were
 * sniffed, re-encoded and stored.
 */

/** Comfortably over 1 MB, comfortably under `MAX_UPLOAD_BYTES` (8 MB). */
const OVER_THE_OLD_LIMIT = 2 * 1024 * 1024;

/** One PNG chunk: length, type, payload, CRC32 of type+payload. */
function chunk(type: string, payload: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(payload.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), payload])), 0);
  return Buffer.concat([head, payload, tail]);
}

/**
 * A genuinely decodable PNG of the required size, built with nothing but
 * `node:zlib`.
 *
 * ## Why it is constructed rather than committed or produced with sharp
 *
 * The API sniffs magic bytes and then RE-ENCODES the image through sharp, so a
 * file that merely starts with the PNG signature is refused as unreadable —
 * and the test would then pass for the wrong reason, since a refusal is not
 * the size failure it is meant to catch. It has to be a real image.
 *
 * `sharp` itself is not resolvable from `apps/web` (it belongs to the API),
 * and a 2 MB binary fixture in git would be paid for on every clone forever
 * for a file whose only interesting property is its length.
 *
 * The pixels are noise on purpose: DEFLATE compresses a flat colour to almost
 * nothing, so a solid 2200×1240 image would encode to a few kilobytes and
 * quietly stop testing anything.
 */
function buildLargePng(): Buffer {
  const width = 1000;
  const height = 700;
  const stride = 1 + width * 3;

  /*
   * `randomFillSync`, not an arithmetic pattern.
   *
   * The first attempt filled the pixels with `(y * prime + x * prime) % 251`,
   * which LOOKS like noise and is perfectly periodic along a scanline: DEFLATE
   * took a 2.8 MB image down to 40 KB, and the test would have uploaded a
   * 40 KB file while claiming to prove something about 2 MB ones. Cryptographic
   * random bytes are the one thing a compressor cannot shrink.
   */
  const raw = Buffer.alloc(height * stride);
  randomFillSync(raw);
  // Every scanline's filter byte back to 0 (None) — a random value there is an
  // undefined filter type and libpng rejects the whole image.
  for (let y = 0; y < height; y += 1) raw[y * stride] = 0;

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  // bytes 10–12 stay zero: deflate, adaptive filtering, no interlace.

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  if (png.byteLength <= OVER_THE_OLD_LIMIT) {
    throw new Error(
      `generated PNG is ${png.byteLength} bytes, which does not exceed the old 1 MB ceiling — ` +
        'this test would pass against the bug it exists to catch',
    );
  }
  return png;
}

test.describe('admin uploads', () => {
  test('accepts a cover image well past the old 1 MB server-action ceiling', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/courses/new');

    /*
     * `toHaveCount(1)` before anything else, and it is doing two jobs.
     *
     * It WAITS: under PPR the prerendered shell is served first and the
     * streamed render replaces it, so for a moment both copies of the form are
     * in the document and a bare locator is a strict-mode violation rather
     * than a flake to retry around.
     *
     * And it ASSERTS: `<Label htmlFor>` points at exactly one element, so a
     * duplicate that OUTLIVED the stream would be a real accessibility defect
     * — a label wired to a control the user is not looking at. Settling on
     * `.last()` would have hidden that.
     */
    const cover = page.locator('#course-cover');
    await expect(cover).toHaveCount(1);

    const key = page.locator('input[name="coverKey"]');
    await expect(key).toHaveValue('');

    await cover.setInputFiles({
      name: 'big-cover.png',
      mimeType: 'image/png',
      buffer: buildLargePng(),
    });

    /*
     * «من غير قص», deliberately — and this is not a detail.
     *
     * Picking a file now opens the crop dialog instead of uploading straight
     * away. Cropping re-encodes to a 1600px WebP, which would take this 2 MB
     * PNG comfortably UNDER the old 1 MB ceiling — so a test that pressed
     * «تمام، استخدمها» would pass on the broken code and prove nothing at all.
     * The un-cropped path is the one that puts the original bytes on the wire.
     */
    await page.getByRole('button', { name: copy.admin.media.cropUseOriginal }).click();

    /*
     * A generous timeout on purpose: two megabytes cross the wire and then go
     * through sharp. The FAILURE this guards against is not slowness, it is
     * the value never arriving at all — which is what a short timeout would
     * also produce, indistinguishably.
     */
    await expect(key).not.toHaveValue('', { timeout: 30_000 });
    await expect(key).toHaveValue(/\.webp$/);

    // And the refusal line stays absent — a stored key plus a visible error
    // would mean the upload succeeded while still telling the instructor it
    // had not.
    await expect(page.getByText(copy.admin.media.uploadTooLarge)).toBeHidden();
  });

  /**
   * The crop path end to end: pick → adjust → the cropped image is what lands.
   *
   * Deliberately NOT asserting the pixels. What can break here is the wiring —
   * the dialog opening, the canvas producing a blob, that blob reaching the
   * upload with a name and a type the allowlist accepts. A test that compared
   * pixel data would fail on a browser-version change in the WebP encoder and
   * tell nobody anything.
   */
  test('crops a picked image and uploads the crop', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/courses/new');

    const cover = page.locator('#course-cover');
    await expect(cover).toHaveCount(1);

    await cover.setInputFiles({
      name: 'to-crop.png',
      mimeType: 'image/png',
      buffer: buildLargePng(),
    });

    // Zoom in, so the export is a genuine sub-rectangle rather than the whole
    // picture re-encoded — the crop maths is the part worth exercising.
    const zoom = page.getByRole('slider', { name: copy.admin.media.cropZoom });
    await expect(zoom).toBeEnabled();
    await zoom.fill('2');

    await page.getByRole('button', { name: copy.admin.media.cropConfirm }).click();

    const key = page.locator('input[name="coverKey"]');
    await expect(key).not.toHaveValue('', { timeout: 30_000 });
    await expect(key).toHaveValue(/\.webp$/);
  });
});
