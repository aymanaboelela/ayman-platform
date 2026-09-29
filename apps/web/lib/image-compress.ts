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

/**
 * The extensions the API's FIRST gate reads off the file NAME
 * (`ALLOWED_UPLOAD_EXT` in `@ayman/contracts/admin/media` — copied, not
 * imported, so this client module does not pull the contracts' Zod schemas
 * into every upload bundle; `image-compress.test.ts` pins the two together).
 */
const API_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'heic', 'heif']);

function extensionOf(name: string): string {
  const match = /\.([^./\\]+)$/.exec(name);
  return match ? match[1]!.toLowerCase() : '';
}

/**
 * ⚠️ «ارفع الواجب بيقول الملف غير مدعوم» — a file the API would refuse for its
 * NAME or TYPE is converted even when the JPEG comes out bigger.
 *
 * This used to decline any result that was not smaller, and hand the ORIGINAL
 * up instead. For a `.jfif` (what WhatsApp Web and Windows save a photo as), a
 * `.bmp`, a `.tiff`, a camera file with no extension at all, or anything the
 * phone labelled with an empty type, the original is refused at the first gate
 * — so «not smaller» meant «not accepted», and the student read «ده مش ملف
 * صورة» about a photo of their homework.
 */
function apiRefusesAsIs(file: File): boolean {
  return !API_EXTENSIONS.has(extensionOf(file.name)) || !file.type.startsWith('image/');
}

export async function compressImage(file: File): Promise<File> {
  const mustConvert = apiRefusesAsIs(file);

  // A GIF may be animated, and drawing one to a canvas keeps only frame one —
  // silently destroying the file's whole point. It is on the API allowlist, so
  // it is passed through untouched.
  if (file.type === 'image/gif' && !mustConvert) return file;

  if (typeof createImageBitmap !== 'function') return mustConvert ? await renamedBySignature(file) : file;

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
    if (!context) return mustConvert ? await renamedBySignature(file) : file;
    /* A JPEG has no alpha. Without a painted background, anything transparent
       in the source encodes as BLACK — and a screenshot with rounded corners or
       a transparent status bar would arrive framed in black bars. */
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, MIME, QUALITY);
    });
    if (!blob) return mustConvert ? await renamedBySignature(file) : file;
    if (!mustConvert && blob.size >= file.size) return file;

    /* The name matters: the API checks an EXTENSION allowlist before it sniffs
       magic bytes, so a re-encoded JPEG still called `.heic` or `.png` is
       refused for the name alone. */
    return new File([blob], toJpegName(file.name), {
      type: MIME,
      lastModified: file.lastModified,
    });
  } catch {
    // The browser cannot draw it — a PDF from the wrong picker, or HEIC on
    // Chrome/Android. The API decodes HEIC itself; all it needs is a NAME its
    // first gate accepts, which the bytes can tell us.
    return mustConvert ? await renamedBySignature(file) : file;
  } finally {
    bitmap?.close();
  }
}

/**
 * The file untouched, renamed after what its first bytes say it is — so a HEIC
 * photo called `image` or `IMG_0421.heics`, which no browser here can draw,
 * still reaches the API's HEIC decoder instead of dying on its name. Anything
 * unrecognised is returned as it came, for the API to give the real answer.
 */
async function renamedBySignature(file: File): Promise<File> {
  const extension = await sniffImageExtension(file);
  if (extension === null || extension === extensionOf(file.name)) return file;
  const stem = file.name.replace(/\.[^./\\]+$/, '') || 'upload';
  return new File([file], `${stem}.${extension}`, {
    type: extension === 'heic' ? 'image/heic' : `image/${extension === 'jpg' ? 'jpeg' : extension}`,
    lastModified: file.lastModified,
  });
}

/** `jpg` | `png` | `webp` | `gif` | `heic` from the magic bytes, or `null`. */
export async function sniffImageExtension(file: Blob): Promise<string | null> {
  const bytes = await headBytes(file, 16);
  if (bytes === null) return null;
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(0, 3) === 'GIF') return 'gif';
  // ISO-BMFF: `....ftyp<brand>`. The HEIF brands a phone writes, stills and
  // Live-Photo sequences alike; AVIF is `avif`/`avis` and the API takes it.
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return 'heic';
    if (brand === 'avif' || brand === 'avis') return 'avif';
  }
  return null;
}

/** `IMG_0421.HEIC` → `IMG_0421.jpg`. A name with no extension gets one. */
function toJpegName(name: string): string {
  const trimmed = name.replace(/\.[^./\\]+$/, '');
  return `${trimmed === '' ? 'upload' : trimmed}.jpg`;
}

/** The first `n` bytes — `Blob.arrayBuffer` where it exists, `FileReader` on the older browsers without it. */
async function headBytes(file: Blob, n: number): Promise<Uint8Array | null> {
  const part = file.slice(0, n);
  if (typeof part.arrayBuffer === 'function') {
    try {
      return new Uint8Array(await part.arrayBuffer());
    } catch {
      return null;
    }
  }
  if (typeof FileReader === 'undefined') return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result instanceof ArrayBuffer ? new Uint8Array(reader.result) : null);
    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(part);
  });
}
