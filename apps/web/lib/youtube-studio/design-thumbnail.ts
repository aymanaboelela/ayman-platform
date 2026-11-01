import { designDownloadPath, type DesignAsset } from '@ayman/contracts/designs';
import { MAX_YOUTUBE_THUMBNAIL_BYTES } from '@ayman/contracts/youtube/studio';

/** YouTube's own recommended thumbnail size. */
const WIDTH = 1280;
const HEIGHT = 720;

/**
 * A design from the studio as a file `uploadYoutubeThumbnail` accepts.
 *
 * The original goes as it is when YouTube would take it unchanged: JPEG or
 * PNG, 16:9, under 2 MB. Anything else — a 4K PNG of 9 MB, a square post — is
 * drawn onto a 1280×720 canvas (cover-cropped from the centre, the way
 * YouTube itself crops) and encoded as JPEG, stepping the quality down until
 * it fits. Done in the browser so the designer's original never passes
 * through the media library's WebP re-encode.
 */
export async function designAsThumbnail(design: DesignAsset): Promise<File> {
  const response = await fetch(designDownloadPath(design), { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`design download ${response.status}`);
  const blob = await response.blob();
  const type = design.format === 'png' ? 'image/png' : 'image/jpeg';
  const name = `${design.name || 'thumbnail'}.${design.format === 'png' ? 'png' : 'jpg'}`;

  const sixteenNine = Math.abs(design.width / design.height - WIDTH / HEIGHT) < 0.01;
  if (sixteenNine && blob.size <= MAX_YOUTUBE_THUMBNAIL_BYTES) return new File([blob], name, { type });

  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d context');
  const scale = Math.max(WIDTH / bitmap.width, HEIGHT / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
  bitmap.close();

  for (const quality of [0.92, 0.85, 0.75, 0.6]) {
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (jpeg && jpeg.size <= MAX_YOUTUBE_THUMBNAIL_BYTES) {
      return new File([jpeg], name.replace(/\.png$/, '.jpg'), { type: 'image/jpeg' });
    }
  }
  throw new Error('thumbnail too large');
}
