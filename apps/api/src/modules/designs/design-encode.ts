import { PayloadTooLargeException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import sharp from 'sharp';
import {
  DESIGN_PUBLISH_MAX_EDGE,
  MAX_DESIGN_PIXELS,
  type DesignFormat,
  type DesignPublishShape,
} from '@ayman/contracts/designs';

/**
 * The studio's image pipeline — the same idea as `MediaService.gateAndEncode`
 * with the opposite brief about QUALITY.
 *
 * ## What is the same: nothing is stored as uploaded
 *
 * Every master is fully DECODED and RE-ENCODED here. That is the control that
 * matters, not the magic-byte sniff in front of it: a PNG/HTML polyglot sniffs
 * as PNG, and re-encoding it writes a PNG with no HTML in it. The re-encode
 * also drops every metadata block (EXIF, GPS, XMP, comments, and anything a
 * tool hid in a private chunk), and converts the colour to sRGB through the
 * embedded ICC profile, so what the instructor downloads is what a browser
 * shows.
 *
 * ## What is different: no resize, and lossless where the source was
 *
 * The library stores 1600px at q82 WebP, because it is stored to be SHOWN.
 * This is the designer's delivery, stored to be USED — re-exported to YouTube,
 * printed, cropped again later — so:
 *
 *   · the pixel dimensions are kept exactly;
 *   · a JPEG stays a JPEG at q97 with 4:4:4 chroma (no visible loss, and the
 *     sharp text on a thumbnail keeps its colour edges);
 *   · everything else — PNG, WebP, AVIF — becomes a LOSSLESS PNG, alpha kept.
 *
 * PNG/JPEG rather than WebP on purpose: they are what YouTube's custom
 * thumbnail upload accepts, and what every tool a designer opens can read.
 *
 * ## ⚠️ One at a time, because three stacks share four cores
 *
 * A 4K PNG encode is seconds of CPU on every libvips thread. CLAUDE.md §5 is
 * the night the shared server went down to unbounded media work, so encodes
 * run in ONE slot with a short queue behind it, and anything past the queue
 * is a 503 the client retries — never a pile-up.
 */

const MAX_RUNNING = 1;
const MAX_QUEUED = 6;
let running = 0;
const queue: Array<() => void> = [];

export async function withEncodeSlot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= MAX_RUNNING) {
    if (queue.length >= MAX_QUEUED) {
      throw new ServiceUnavailableException('image processing is busy, try again shortly');
    }
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  running += 1;
  try {
    return await work();
  } finally {
    running -= 1;
    queue.shift()?.();
  }
}

/** A runaway decode is killed rather than left holding the slot. */
const ENCODE_TIMEOUT_SECONDS = 90;

/** The grid tile. Big enough for a 2× card, small enough that 40 load fast. */
const PREVIEW_EDGE = 960;

function decodeFailure(error: unknown): never {
  if (error instanceof Error && /pixel limit/i.test(error.message)) {
    throw new PayloadTooLargeException('image dimensions are too large');
  }
  throw new BadRequestException('file could not be processed as an image');
}

function open(buffer: Buffer) {
  // `animated: false`: a designer's export is one frame, and a multi-frame
  // WebP/AVIF keeps its first — what a thumbnail shows anyway.
  return sharp(buffer, { limitInputPixels: MAX_DESIGN_PIXELS, failOn: 'error', animated: false });
}

export interface EncodedDesign {
  master: Buffer;
  preview: Buffer;
  format: DesignFormat;
  width: number;
  height: number;
}

/**
 * `detectedMime` is what the BYTES said (`FileSignatureService`), never the
 * upload's Content-Type or its name.
 */
export async function encodeDesign(buffer: Buffer, detectedMime: string): Promise<EncodedDesign> {
  const probe = await open(buffer).metadata().catch(decodeFailure);
  if (!probe.width || !probe.height) decodeFailure(new Error('no dimensions'));

  const format: DesignFormat = detectedMime === 'image/jpeg' ? 'jpg' : 'png';

  // `.rotate()` with no angle applies the EXIF orientation and then the
  // metadata (orientation tag included) is dropped by the encode — so the
  // picture is upright for every reader, including ones that ignore EXIF.
  const oriented = open(buffer).rotate().timeout({ seconds: ENCODE_TIMEOUT_SECONDS });
  const encoder =
    format === 'jpg'
      ? oriented.jpeg({ quality: 97, chromaSubsampling: '4:4:4', mozjpeg: false })
      : oriented.png({ compressionLevel: 6, adaptiveFiltering: true });

  const master = await encoder.toBuffer({ resolveWithObject: true }).catch(decodeFailure);

  // The preview is cut from the CLEAN master, never from the upload — so even
  // the tile the grid paints has been through the re-encode once already.
  const preview = await sharp(master.data, { limitInputPixels: MAX_DESIGN_PIXELS })
    .resize(PREVIEW_EDGE, PREVIEW_EDGE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .timeout({ seconds: ENCODE_TIMEOUT_SECONDS })
    .toBuffer()
    .catch(decodeFailure);

  return {
    master: master.data,
    preview,
    format,
    width: master.info.width,
    height: master.info.height,
  };
}

const ASPECT: Record<Exclude<DesignPublishShape, 'original'>, number> = {
  cover: 16 / 9,
  round: 1,
  book: 3 / 4,
};

/**
 * The size a published copy is cut to: the largest box of the target shape
 * that fits inside the master (a centre crop, like `object-fit: cover`), then
 * scaled so its long edge is at most `DESIGN_PUBLISH_MAX_EDGE`. Never larger
 * than the master — upscaling adds bytes, not detail.
 */
export function publishBox(
  width: number,
  height: number,
  shape: DesignPublishShape,
): { width: number; height: number } {
  let boxW = width;
  let boxH = height;
  if (shape !== 'original') {
    const aspect = ASPECT[shape];
    boxW = width;
    boxH = Math.round(width / aspect);
    if (boxH > height) {
      boxH = height;
      boxW = Math.round(height * aspect);
    }
  }
  const scale = Math.min(1, DESIGN_PUBLISH_MAX_EDGE / Math.max(boxW, boxH));
  return { width: Math.max(1, Math.round(boxW * scale)), height: Math.max(1, Math.round(boxH * scale)) };
}

/**
 * The copy the SITE serves. WebP like every library image (one Content-Type
 * on the public route), but at q90 rather than the library's q82 and up to
 * 2560px rather than 1600 — «تتحط في المحاضرة بجودة عالية جدًا».
 */
export async function encodePublished(
  master: Buffer,
  shape: DesignPublishShape,
): Promise<{ data: Buffer; width: number; height: number }> {
  const probe = await open(master).metadata().catch(decodeFailure);
  const box = publishBox(probe.width ?? 1, probe.height ?? 1, shape);
  const result = await open(master)
    .resize(box.width, box.height, { fit: 'cover', position: 'centre' })
    .webp({ quality: 90, smartSubsample: true, effort: 5 })
    .timeout({ seconds: ENCODE_TIMEOUT_SECONDS })
    .toBuffer({ resolveWithObject: true })
    .catch(decodeFailure);
  return { data: result.data, width: result.info.width, height: result.info.height };
}
