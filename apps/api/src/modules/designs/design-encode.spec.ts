import sharp from 'sharp';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { encodeDesign, encodePublished, publishBox } from './design-encode';

async function png(width: number, height: number, alpha = false): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background: alpha ? { r: 200, g: 40, b: 90, alpha: 0.5 } : { r: 200, g: 40, b: 90 },
    },
  })
    .png()
    .toBuffer();
}

describe('encodeDesign — the studio keeps every pixel and nothing else', () => {
  it('keeps the exact dimensions of a 4K master (no 1600px cap like the library)', async () => {
    const out = await encodeDesign(await png(3840, 2160), 'image/png');
    expect(out.format).toBe('png');
    expect([out.width, out.height]).toEqual([3840, 2160]);
    const meta = await sharp(out.master).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 3840, 2160]);
  });

  it('keeps transparency on a PNG', async () => {
    const out = await encodeDesign(await png(64, 64, true), 'image/png');
    expect((await sharp(out.master).metadata()).hasAlpha).toBe(true);
  });

  it('a JPEG stays a JPEG, at 4:4:4 chroma', async () => {
    const jpeg = await sharp(await png(400, 300)).jpeg({ quality: 90 }).toBuffer();
    const out = await encodeDesign(jpeg, 'image/jpeg');
    expect(out.format).toBe('jpg');
    const meta = await sharp(out.master).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.chromaSubsampling).toBe('4:4:4');
  });

  it('a WebP becomes a lossless PNG', async () => {
    const webp = await sharp(await png(200, 100)).webp({ lossless: true }).toBuffer();
    const out = await encodeDesign(webp, 'image/webp');
    expect(out.format).toBe('png');
    expect((await sharp(out.master).metadata()).format).toBe('png');
  });

  it('⚠️ destroys a polyglot — HTML appended to a valid PNG does not survive', async () => {
    const payload = Buffer.from('<html><script>alert(document.cookie)</script></html>');
    const polyglot = Buffer.concat([await png(32, 32), payload]);
    const out = await encodeDesign(polyglot, 'image/png');
    expect(out.master.includes(Buffer.from('<script>'))).toBe(false);
    expect(out.preview.includes(Buffer.from('<script>'))).toBe(false);
  });

  it('⚠️ strips EXIF/GPS and applies the orientation', async () => {
    const tagged = await sharp(await png(300, 100))
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExifMerge({ IFD0: { Copyright: 'secret-tag' } })
      .toBuffer();
    expect((await sharp(tagged).metadata()).orientation).toBe(6);
    const out = await encodeDesign(tagged, 'image/jpeg');
    const meta = await sharp(out.master).metadata();
    expect(meta.exif).toBeUndefined();
    expect(out.master.includes(Buffer.from('secret-tag'))).toBe(false);
    // Orientation 6 = a quarter turn: the stored picture is upright, 100×300.
    expect([out.width, out.height]).toEqual([100, 300]);
  });

  it('the grid preview is a small WebP cut from the clean master', async () => {
    const out = await encodeDesign(await png(3840, 2160), 'image/png');
    const meta = await sharp(out.preview).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(960);
  });

  it('refuses bytes that are not a decodable image with a 400, not a 500', async () => {
    const truncated = (await png(64, 64)).subarray(0, 60);
    await expect(encodeDesign(truncated, 'image/png')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a decompression bomb by its header, before allocating it', async () => {
    // 9000 × 9000 = 81 MP, over the 64 MP ceiling. Built tiny on purpose: a
    // single-colour PNG compresses to almost nothing, which is the attack.
    const bomb = await sharp({ create: { width: 9000, height: 9000, channels: 3, background: '#000' } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await expect(encodeDesign(bomb, 'image/png')).rejects.toBeInstanceOf(PayloadTooLargeException);
  });
});

describe('publishBox — the published copy is cut to the frame it is shown in', () => {
  it('a 1920×1080 thumbnail publishes as-is for a 16/9 cover', () => {
    expect(publishBox(1920, 1080, 'cover')).toEqual({ width: 1920, height: 1080 });
  });

  it('a 4K master is capped at 2560 on the long edge', () => {
    expect(publishBox(3840, 2160, 'cover')).toEqual({ width: 2560, height: 1440 });
  });

  it('a square design is centre-cropped to 16/9, never stretched or upscaled', () => {
    expect(publishBox(1000, 1000, 'cover')).toEqual({ width: 1000, height: 563 });
  });

  it('round and book frames', () => {
    expect(publishBox(1920, 1080, 'round')).toEqual({ width: 1080, height: 1080 });
    expect(publishBox(1920, 1080, 'book')).toEqual({ width: 810, height: 1080 });
  });

  it('original keeps the aspect and only caps the size', () => {
    expect(publishBox(5000, 1000, 'original')).toEqual({ width: 2560, height: 512 });
  });

  it('encodePublished writes a WebP at exactly that box', async () => {
    const out = await encodePublished(await png(3840, 2160), 'cover');
    const meta = await sharp(out.data).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 2560, 1440]);
  });
});
