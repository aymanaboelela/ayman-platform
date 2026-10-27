import Image, { type ImageProps } from 'next/image';
import type { ThemedBrandImage } from '@/lib/brand-image';

/**
 * A brand picture that can differ between light and dark mode.
 *
 * Both files are in the DOM and `globals.css` hides the one the current
 * `data-theme` does not want (`.theme-img--light` / `.theme-img--dark`). The
 * theme lives in `localStorage` and is applied by the prepaint script, so the
 * server cannot know which file to send — and a `<picture media>` source
 * would follow the OS, which this platform deliberately does not (see
 * `lib/theme.ts`).
 *
 * The hidden one costs nothing: it is `display: none` and lazy, and a lazy
 * image that is not rendered is never fetched. That is also why `priority`
 * only ever goes to the light file — light is the platform's default, so it is
 * the one the LCP preload should be spent on.
 */
export function ThemedImage({
  image,
  className,
  priority,
  fetchPriority,
  ...rest
}: Omit<ImageProps, 'src' | 'width' | 'height'> & { image: ThemedBrandImage }) {
  if (!image.dark) {
    return (
      <Image
        {...rest}
        src={image.light.src}
        width={image.light.width}
        height={image.light.height}
        priority={priority}
        fetchPriority={fetchPriority}
        className={className}
      />
    );
  }

  return (
    <>
      <Image
        {...rest}
        src={image.light.src}
        width={image.light.width}
        height={image.light.height}
        priority={priority}
        fetchPriority={fetchPriority}
        className={className ? `${className} theme-img--light` : 'theme-img--light'}
      />
      <Image
        {...rest}
        src={image.dark.src}
        width={image.dark.width}
        height={image.dark.height}
        className={className ? `${className} theme-img--dark` : 'theme-img--dark'}
      />
    </>
  );
}

/**
 * The same split for a raw `<img>` (or anything else): the class each half
 * carries. For call sites that render media-origin URLs without `next/image`.
 */
export const THEME_IMG_LIGHT = 'theme-img--light';
export const THEME_IMG_DARK = 'theme-img--dark';
