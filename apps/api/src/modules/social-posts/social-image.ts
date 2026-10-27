import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { SOCIAL_IMAGE_SIZE, type SocialPostFormat } from '@ayman/contracts/social/posts';

/**
 * The picture the browser drew, re-encoded before anything public serves it.
 *
 * The bytes come from an admin's canvas, but the route takes a file like any
 * upload, so they get the same treatment as every image on the platform:
 * fully decoded and re-encoded by sharp (a polyglot comes out as a plain
 * JPEG, every metadata block is dropped), and the dimensions checked against
 * the format the post is in — a 1080×1920 story uploaded onto a square post
 * is a bug in the page, and publishing it would crop someone's name off.
 *
 * JPEG q90, 4:4:4 chroma: Instagram accepts JPEG only, and the red-on-white
 * text of a card bleeds visibly at the default 4:2:0.
 */
export const SOCIAL_IMAGE_MIME = new Set(['image/jpeg', 'image/png']);

const MAX_PIXELS = 1080 * 1920 * 2;
const ENCODE_TIMEOUT_SECONDS = 60;

export async function encodeSocialImage(buffer: Buffer, format: SocialPostFormat): Promise<Buffer> {
  const expected = SOCIAL_IMAGE_SIZE[format];
  const fail = (): never => {
    throw new BadRequestException('file could not be processed as an image');
  };

  const probe = await sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).metadata().catch(fail);
  if (probe.width !== expected.w || probe.height !== expected.h) {
    throw new BadRequestException(`image must be ${expected.w}x${expected.h}`);
  }

  return sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true })
    .timeout({ seconds: ENCODE_TIMEOUT_SECONDS })
    .toBuffer()
    .catch(fail);
}
