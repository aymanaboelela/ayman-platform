import type { MetadataRoute } from 'next';
import { SITE_DESCRIPTION, SITE_SHORT_NAME, SITE_TITLE } from '@/lib/seo/metadata';
import { IS_AYMAN } from '@/lib/tenant';

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
    /*
     * Both imported from `lib/seo/metadata.ts` rather than read from `copy`
     * here, and that is not tidiness — it is the same rule the copy table
     * already states about `shortName`: iOS reads `appleWebApp.title` and
     * ignores this file entirely, Android reads `short_name` and ignores the
     * meta tag, so the two names must agree and the only way to guarantee that
     * is for there to be one of them. The tenant gate made the point sharper:
     * a second deployment gating one of the pair and not the other would put
     * its own name on an Android launcher and «منصة أيمن» on an iPhone's.
     *
     * `SITE_TITLE` is `copy.seo.defaultTitle` byte for byte on his stack; see
     * the note there for why another stack gets a composed one instead.
     */
    name: SITE_TITLE,
    short_name: SITE_SHORT_NAME,
    /*
     * ⚠️ `SITE_DESCRIPTION` — the same import as the two lines above it, and
     * for the third time the same reason. `description` was the one field in
     * this object still reading `copy` directly, so a second deployment's
     * manifest carried its own name, its own short name, and «منصة المهندس
     * أيمن أبو العلا لتعليم…» underneath them.
     *
     * Not cosmetic on this surface in particular: Chrome shows the manifest
     * description in the install prompt and Play's "install app" sheet reads
     * it, so it is the sentence a student sees at the exact moment they decide
     * to put the icon on their home screen.
     */
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    // Matches the `viewport.themeColor` light value in the root layout. A
    // mismatch shows as a colour flash in the Android task switcher.
    background_color: '#FCFCFD',
    theme_color: '#FCFCFD',
    lang: 'ar',
    dir: 'rtl',
    categories: ['education'],
    /*
     * ⚠️ HIS STACK ONLY. All three files are crops of the SAME photograph of
     * Ayman — `icon-192` and `icon-512` full-bleed, `maskable-512` the same
     * portrait scaled to 80% and padded in the brand accent. A home-screen icon
     * is the most permanent thing a website can put on a student's phone: it
     * survives the tab, the session and the browser, and it is a picture of a
     * person the student is meant to recognise as their teacher. Shipping his
     * face there on another instructor's deployment is the same mistake as the
     * favicon, made harder to undo.
     *
     * ## What a non-Ayman stack ships instead: NO `icons` ARRAY AT ALL
     *
     * Not a substitute icon, because there is no honest one to substitute. The
     * three PNGs are per-person by construction and this repository ships no
     * generic mark; the closest thing the product has is the accent colour,
     * which is per-deployment and lives in the database, not in `public/` where
     * a manifest icon has to resolve. An invented placeholder tile would be a
     * brand nobody chose, permanently installed.
     *
     * Omitting the array is safe in a way that a wrong path is not. The warning
     * at the top of this file is about DECLARED SIZES THAT 404 — Chrome logs an
     * error and refuses to install — and that is not this case: the files still
     * exist, they are simply not claimed. A manifest with no `icons` is valid;
     * Chrome then falls back to the page's own `<link rel="icon">`, and failing
     * that draws a letter tile from `short_name`. Install still works, which is
     * the whole point of the manual "add to home screen" flow this file exists
     * to fix.
     *
     * ⚠️ That fallback is exactly where the remaining leak is, and it is not
     * fixable from here: `app/icon.png` and `app/apple-icon.png` are Next
     * FILE-CONVENTION icons, picked up by filename with no code path to gate,
     * and both are the same face. The per-deployment answer already in the
     * product is `/admin/settings` → favicon, which `app/layout.tsx` emits as a
     * `<link rel="icon">` from `branding.faviconKey`. Until an admin sets one,
     * a non-Ayman stack still shows his face in the tab.
     */
    ...(IS_AYMAN
      ? {
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: '/icons/maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        }
      : {}),
  };
}
