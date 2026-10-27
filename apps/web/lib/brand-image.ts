import { BRAND_IMAGE_SLOTS, type BrandImageSlot } from '@ayman/contracts/admin/brand-images';
import type { BrandingRead } from '@ayman/contracts/admin/settings';
import { mediaUrl } from '@ayman/ui/branding';
import { BRAND_ASSET_RATIO, getBrandAsset, type BrandAsset, type BrandAssetKind } from '@/lib/brand-assets';

/**
 * A picture as a page renders it: the light-mode file, and the dark-mode one
 * when the instructor uploaded a different picture for dark mode.
 *
 * `dark: null` means «same picture in both modes» — every stored row before
 * dark slots existed, and every slot an instructor only filled once.
 */
export interface ThemedBrandImage {
  light: BrandAsset;
  dark: BrandAsset | null;
}

/**
 * An upload's intrinsic size is not in the settings payload (the same fact
 * `<MediaSlot>`, `<BoardMark>` and `<CourseCover>` are written around), so
 * the slot's RATIO stands in for it — which is all `next/image` needs to
 * reserve the right box. Each surface's `object-fit` does the rest.
 */
export function uploadedAsset(key: string, kind: BrandAssetKind): BrandAsset {
  const width = 1200;
  return { src: mediaUrl(key), width, height: Math.round(width / BRAND_ASSET_RATIO[kind]) };
}

/**
 * Upload first, the file in `public/brand/` second — the order `<MediaSlot>`
 * has always used. On Ayman's stack every key is null until he uploads, so it
 * falls through to his files and not a byte changes; on any other stack
 * `getBrandAsset` is gated to `undefined` and the upload is the only source.
 *
 * Only a dark upload and nothing else still renders: it becomes the picture
 * for both modes rather than leaving light mode empty.
 */
export function brandImage(
  branding: BrandingRead,
  kind: Extract<BrandAssetKind, BrandImageSlot>,
): ThemedBrandImage | undefined {
  const def = BRAND_IMAGE_SLOTS.find((row) => row.slot === kind);
  const lightKey = def ? branding[def.lightKey] : null;
  const darkKey = def?.darkKey ? branding[def.darkKey] : null;

  const light = lightKey ? uploadedAsset(lightKey, kind) : getBrandAsset(kind);
  const dark = darkKey ? uploadedAsset(darkKey, kind) : null;

  if (light) return { light, dark };
  if (dark) return { light: dark, dark: null };
  return undefined;
}

/**
 * The same pair from two storage keys a preset already holds, at the box that
 * preset declares. For the presets that draw `branding.portraitKey` /
 * `heroKey` directly rather than through `<MediaSlot>`.
 */
export function keyPair(
  lightKey: string,
  darkKey: string | null,
  width: number,
  height: number,
): ThemedBrandImage {
  return {
    light: { src: mediaUrl(lightKey), width, height },
    dark: darkKey ? { src: mediaUrl(darkKey), width, height } : null,
  };
}

/** `<2 hex>/<uuid>.webp` — the only shape a storage key takes (`mediaUrl`). */
const STORAGE_KEY = /^[0-9a-f]{2}\/[0-9a-f-]{36}\.webp$/;

/**
 * The default course picture as a CSS variable, for the root layout's inline
 * `<style>`.
 *
 * A variable and not a prop because `<CourseArt>` renders on nineteen
 * screens, server and client alike, and none of them has the branding in
 * hand. `.course-art::before` paints it under the subject's own gradient, so
 * coverless courses gain a photograph and still differ by hue and glyph.
 *
 * The key goes into a stylesheet, so it is checked against the one shape a
 * storage key can have — the same reason the accent is a bounded number and
 * never a colour string (`renderBrandingStyle`). Anything else emits nothing.
 */
export function courseCoverStyle(branding: BrandingRead): string {
  const rule = (key: string | null) =>
    key && STORAGE_KEY.test(key) ? `--course-cover-default:url("${mediaUrl(key)}");` : '';
  const light = rule(branding.courseCoverKey);
  const dark = rule(branding.courseCoverDarkKey);
  return (light ? `:root{${light}}` : '') + (dark ? `:root[data-theme="dark"]{${dark}}` : '');
}
