'use client';

import { useEffect, useEffectEvent, useState, type RefObject } from 'react';
import { socialPostsCopy } from '@ayman/contracts/copy/social-posts';
import type { SocialPost, SocialPostFormat } from '@ayman/contracts/social/posts';
import { mediaUrl } from '@ayman/ui/branding';
import { canvasToBlob, loadFonts, resolveFonts } from '@/lib/share-card/canvas-kit';
import { coverKeyOf, drawSocialPost, photoKeysOf, type PostBrand } from '@/lib/social-posts/draw-post';
import { resolvePalette } from '@/lib/social-posts/palette';
import { uploadSocialImage } from '@/lib/social-posts/upload';

export type UploadState = 'none' | 'pending' | 'done' | 'failed';

export type ImageState =
  | { kind: 'rendering' }
  | { kind: 'ready'; url: string; blob: Blob; upload: UploadState }
  | { kind: 'failed'; message: string };

/**
 * A media image the canvas may read back. `crossOrigin` is what keeps the
 * canvas untainted — the public media route answers `Access-Control-Allow-
 * Origin: *` for exactly this kind of reader (see `media.controller.ts`) —
 * and a photo that fails is simply not drawn: initials stand in.
 */
function loadMedia(key: string): Promise<HTMLImageElement | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(undefined);
    img.src = mediaUrl(key);
  });
}

/**
 * Draws a post's picture when the editor opens, and — when the stored one is
 * missing or was drawn for the other format — uploads it, so «نشر دلوقتي»
 * and the scheduled cron always have a public JPEG to hand Meta.
 *
 * The state is KEYED by post and format: a new key reads as «rendering»
 * without a synchronous reset inside the effect, and a late answer for an
 * old key is dropped instead of painting the wrong picture.
 */
export function usePostImage(input: {
  post: SocialPost;
  format: SocialPostFormat;
  kindLabel: string;
  brand: PostBrand;
  fontHost: RefObject<HTMLDivElement | null>;
  canUpload: boolean;
  onUploaded: (post: SocialPost) => void;
}): ImageState {
  const { post, format, kindLabel, brand, fontHost, canUpload, onUploaded } = input;
  const key = `${post.id}:${format}`;
  const [stored, setStored] = useState<{ key: string; state: ImageState } | null>(null);

  const editable = post.status === 'draft' || post.status === 'scheduled';
  // Read at the moment the picture is ready, not when the effect starts: an
  // upload that just finished flips it, and that must not draw a second time.
  const needsUpload = useEffectEvent(
    () => editable && canUpload && !(post.imageUrl !== null && post.imageFormat === format),
  );
  const uploaded = useEffectEvent((next: SocialPost) => onUploaded(next));

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    const set = (state: ImageState) => {
      if (!cancelled) setStored({ key, state });
    };

    (async () => {
      const host = fontHost.current;
      if (!host) throw new Error('font host not mounted');
      const fonts = resolveFonts(host);
      const coverKey = coverKeyOf(post.facts);
      const photoKeys = photoKeysOf(post.facts);
      const [, cover, ...photos] = await Promise.all([
        loadFonts(fonts),
        coverKey ? loadMedia(coverKey) : Promise.resolve(undefined),
        ...photoKeys.map(loadMedia),
      ]);
      const photoMap = new Map<string, HTMLImageElement>();
      photoKeys.forEach((photoKey, i) => {
        const img = photos[i];
        if (img) photoMap.set(photoKey, img);
      });

      const canvas = document.createElement('canvas');
      drawSocialPost(canvas, {
        facts: post.facts,
        format,
        kindLabel,
        brand,
        palette: resolvePalette(host),
        fonts,
        images: { cover, photos: photoMap },
      });
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
      if (cancelled) return;
      url = URL.createObjectURL(blob);

      if (!needsUpload()) {
        set({ kind: 'ready', url, blob, upload: 'none' });
        return;
      }
      set({ kind: 'ready', url, blob, upload: 'pending' });
      const result = await uploadSocialImage(post.id, format, blob);
      if (cancelled) return;
      set({ kind: 'ready', url, blob, upload: result.ok ? 'done' : 'failed' });
      if (result.ok) uploaded(result.value);
    })().catch(() => set({ kind: 'failed', message: socialPostsCopy.renderFailed }));

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // `post.facts` never changes for a post; `key` (id + format) stands for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, kindLabel, brand.platform, brand.siteHost]);

  return stored?.key === key ? stored.state : { kind: 'rendering' };
}
