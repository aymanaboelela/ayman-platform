import { describe, expect, it, vi, afterEach } from 'vitest';
import { compressImage } from './image-compress';

/**
 * jsdom has no canvas encoder and no `createImageBitmap`, so these cases pin
 * the two things that can be pinned without a real browser: WHICH files are
 * left alone, and that every failure path returns the original file rather
 * than throwing.
 *
 * That second half is the one that matters. Compression is an optimisation on
 * the last step of an order the student has already paid for — if it can throw,
 * it can lose the sale, and no amount of size saved is worth that.
 *
 * The actual pixel work is verified in the browser by
 * `e2e/book-order-screenshot.e2e.ts`, which uploads a file over 1 MB — a small
 * test image passes on broken code and proves nothing here, the same trap the
 * Server Action ceiling was missed by.
 */

function fileOf(name: string, type: string, bytes = 2048): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('compressImage', () => {
  it('leaves a non-image alone — the API allowlist gives the real answer', async () => {
    const pdf = fileOf('receipt.pdf', 'application/pdf');
    await expect(compressImage(pdf)).resolves.toBe(pdf);
  });

  it('leaves a GIF alone rather than keeping only its first frame', async () => {
    // Drawing an animated GIF to a canvas silently destroys the animation,
    // which is the whole point of the file. It is on the API allowlist, so it
    // travels untouched.
    const gif = fileOf('reaction.gif', 'image/gif');
    await expect(compressImage(gif)).resolves.toBe(gif);
  });

  it('returns the original when the browser has no createImageBitmap', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    const png = fileOf('shot.png', 'image/png');
    await expect(compressImage(png)).resolves.toBe(png);
  });

  it('returns the original when decoding throws — never rejects', async () => {
    // An HEIC the browser cannot decode, a corrupt file, a tainted canvas.
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.reject(new Error('unsupported codec'))),
    );
    const heic = fileOf('IMG_0421.HEIC', 'image/heic');
    await expect(compressImage(heic)).resolves.toBe(heic);
  });

  /* jsdom's canvas has no 2D context — `getContext` answers null and the
     compressor bails to the original file, which is correct behaviour and
     also means nothing past that line can be reached without this stub. */
  function stubCanvas(): void {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
  }

  it('returns the original when the canvas has no 2D context', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve({ width: 1080, height: 2400, close: vi.fn() })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const png = fileOf('shot.png', 'image/png');
    await expect(compressImage(png)).resolves.toBe(png);
  });

  it('returns the original when toBlob answers null', async () => {
    stubCanvas();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve({ width: 1080, height: 2400, close: vi.fn() })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => {
      (cb as (b: Blob | null) => void)(null);
    });
    const png = fileOf('shot.png', 'image/png');
    await expect(compressImage(png)).resolves.toBe(png);
  });

  it('declines its own result when re-encoding made the file BIGGER', async () => {
    // Re-encoding an already-small JPEG can grow it. Shipping a bigger file to
    // save bandwidth is the one outcome this must never produce.
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve({ width: 200, height: 200, close: vi.fn() })),
    );
    stubCanvas();
    const small = fileOf('tiny.jpg', 'image/jpeg', 512);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => {
      (cb as (b: Blob | null) => void)(new Blob([new Uint8Array(4096)], { type: 'image/jpeg' }));
    });
    await expect(compressImage(small)).resolves.toBe(small);
  });

  it('renames to .jpg so the API extension allowlist accepts the re-encode', async () => {
    // The API checks the EXTENSION before it sniffs magic bytes, so a JPEG
    // still called `.HEIC` is refused for its name alone.
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve({ width: 3000, height: 4000, close: vi.fn() })),
    );
    stubCanvas();
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => {
      (cb as (b: Blob | null) => void)(new Blob([new Uint8Array(64)], { type: 'image/jpeg' }));
    });
    const out = await compressImage(fileOf('IMG_0421.HEIC', 'image/heic', 5_000_000));
    expect(out.name).toBe('IMG_0421.jpg');
    expect(out.type).toBe('image/jpeg');
    expect(out.size).toBeLessThan(5_000_000);
  });
});
