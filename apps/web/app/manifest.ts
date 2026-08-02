import type { MetadataRoute } from 'next';
import { copy } from '@ayman/contracts';

/**
 * The web app manifest — what Android/Chrome read when a student taps
 * "Add to home screen", and one of the signals Google uses to render the
 * site name in mobile results.
 *
 * `name` is the full platform name and `short_name` is what actually fits
 * under a home-screen icon; Android truncates past roughly 12 characters, so
 * "منصة أيمن" is a deliberate choice rather than a shortened accident.
 *
 * ⚠️ No `icons` array. Next serves `/favicon.ico` and the admin's uploaded
 * favicon (see the root layout), but a manifest that declares a 192×192 and a
 * 512×512 which do not exist makes Chrome refuse the install prompt outright
 * and log an error — strictly worse than declaring none. Add both PNGs and
 * this entry together, never one without the other.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: copy.seo.defaultTitle,
    short_name: 'منصة أيمن',
    description: copy.seo.description,
    start_url: '/',
    display: 'standalone',
    // Matches the `viewport.themeColor` light value in the root layout. A
    // mismatch shows as a colour flash in the Android task switcher.
    background_color: '#FCFCFD',
    theme_color: '#FCFCFD',
    lang: 'ar',
    dir: 'rtl',
    categories: ['education'],
  };
}
