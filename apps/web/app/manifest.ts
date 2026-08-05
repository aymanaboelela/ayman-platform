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
 * The `icons` array and the PNGs behind it landed together, which is the only
 * safe order: a manifest that declares sizes which 404 makes Chrome log an
 * error and refuse to install, strictly worse than declaring none. All three
 * files exist in `public/icons/`.
 *
 * `maskable-512` is a SEPARATE file from `icon-512`, not the same bytes listed
 * twice. Android crops a maskable icon to whatever shape the launcher uses and
 * only guarantees the central 80% circle, so that one is the portrait scaled to
 * 80% and padded out to the edges in the brand accent. Declaring the full-bleed
 * photo as maskable instead would let a circular launcher cut the face.
 *
 * ⚠️ This does NOT by itself produce the automatic install prompt. Chrome also
 * requires a service worker with a fetch handler, and this app ships none — so
 * what these icons actually fix is the MANUAL "add to home screen" flow and the
 * icon Android shows for it, which until now fell back to the favicon. Adding a
 * service worker is a separate decision with its own caching consequences.
 *
 * ⚠️ The source photograph is 1600×900 and the face occupies ~240px of it, so
 * 512 is a genuine upscale and looks soft next to a vector mark. A higher-
 * resolution portrait is the fix; nothing in the encoding recovers detail the
 * original never had.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: copy.seo.defaultTitle,
    short_name: copy.site.shortName,
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
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
