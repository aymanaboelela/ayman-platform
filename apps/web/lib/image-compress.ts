'use client';

/**
 * Shrink a photo in the BROWSER before it is uploaded.
 *
 * ## The problem this exists for
 *
 * «في مشكلة مع العملاء بيجيلهم كده» — the transfer screenshot. A student pays,
 * screenshots InstaPay and presses «إرسال الطلب» on 4G with a nearly flat
 * battery, and sends the phone's raw file: a modern Android screenshot is a
 * 1080×2400 PNG, routinely 3–6 MB, and an iPhone photo of a screen is larger
 * still. Every byte crosses a mobile connection at the worst possible moment in
 * the flow — after the money has already left their account.
 *
 * Nothing on this platform compressed anything. The file went up exactly as the
 * camera wrote it, which made the upload slow enough to look broken, and put a
 * real share of phone photos over `MAX_UPLOAD_BYTES` (8 MB) where the only
 * outcome is a refusal on the last step of a paid order.
 *
 * ## It also fixes iPhone HEIC, which is the quieter half
 *
 * iOS stores photos as HEIC, and the API allowlist is png/jpeg/webp/avif/gif —
 * no HEIC. Safari usually transcodes on pick, but not from every share sheet or
 * gallery app, and when it does not the upload is rejected for a format the
 * student cannot even see. `createImageBitmap` decodes whatever the BROWSER can
 * render and this re-encodes it as JPEG, so the API only ever receives a format
 * it accepts.
 *
 * ## Failure returns the ORIGINAL file, never an error
 *
 * Compression is an optimisation, and an optimisation that can block an upload
 * is worse than no optimisation. An old browser with no `createImageBitmap`, a
 * codec the canvas cannot draw, a `toBlob` that answers `null`, a tainted
 * canvas — every one of them falls through to the untouched file, which is
 * exactly what would have been sent before this existed.
 *
 * It also declines its own result when that result is not smaller. Re-encoding
 * an already-small JPEG can grow it, and shipping a bigger file to save
 * bandwidth is the one outcome this must never produce.
 */

/**
 * Long edge, in CSS pixels.
 *
 * 1600 is chosen against what the image is FOR: an admin reading an InstaPay
 * receipt off it — a sender number, an amount, a date. A 1080-wide screenshot
 * is untouched by this bound (it is already under it), and a 12-megapixel photo
 * of a screen comes down to something whose text is still comfortably legible
 * at full zoom. Going lower starts to cost digits.
 */
const MAX_EDGE = 1600;

/**
 * JPEG, not WebP, and not PNG.
 *
 * PNG is lossless and would barely shrink a photograph. WebP is smaller than
 * JPEG at equal quality and IS on the API allowlist, but `canvas.toBlob`
 * silently falls back to PNG on any browser that cannot encode it — which would
 * turn a 4 MB screenshot into a 6 MB one on exactly the old devices this is
 * meant to help. JPEG is the one format every canvas can encode.
 */
const MIME = 'image/jpeg';

/** High enough that a receipt's small digits stay sharp; low enough that a
 *  full-screen screenshot lands in the low hundreds of KB. */
const QUALITY = 0.82;

export async function compressImage(file: File): Promise<File> {
  // Not an image at all (a PDF handed to the wrong picker) — leave it alone and
  // let the API's own allowlist give the real answer.
  if (!file.type.startsWith('image/')) return file;

  // A GIF may be animated, and drawing one to a canvas keeps only frame one —
  // silently destroying the file's whole point. It is on the API allowlist, so
  // it is passed through untouched.
  if (file.type === 'image/gif') return file;

  if (typeof createImageBitmap !== 'function') return file;

  let bitmap: ImageBitmap | null = null;
  try {
    /* `imageOrientation: 'from-image'` is load-bearing, not a nicety. A phone
       photo carries its rotation in EXIF and the raw pixels are sideways; a
       canvas draws the raw pixels. Without this, re-encoding turns an upright
       screenshot into a rotated one — and the EXIF that would have corrected it
       is gone, because re-encoding strips it. */
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) return file;
    /* A JPEG has no alpha. Without a painted background, anything transparent
       in the source encodes as BLACK — and a screenshot with rounded corners or
       a transparent status bar would arrive framed in black bars. */
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, MIME, QUALITY);
    });
    if (!blob || blob.size >= file.size) return file;

    /* The name matters: the API checks an EXTENSION allowlist before it sniffs
       magic bytes, so a re-encoded JPEG still called `.heic` or `.png` is
       refused for the name alone. */
    return new File([blob], toJpegName(file.name), {
      type: MIME,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}

/** `IMG_0421.HEIC` → `IMG_0421.jpg`. A name with no extension gets one. */
function toJpegName(name: string): string {
  const trimmed = name.replace(/\.[^./\\]+$/, '');
  return `${trimmed === '' ? 'upload' : trimmed}.jpg`;
}
