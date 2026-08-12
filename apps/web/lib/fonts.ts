import localFont from 'next/font/local';

/**
 * IBM Plex Sans Arabic + IBM Plex Mono, self-hosted from Fontsource.
 *
 * Fontsource ships these PRE-SUBSETTED PER SCRIPT (separate `-arabic-` and `-latin-`
 * files), which is stronger than hand-authored unicode-range: the browser genuinely
 * never downloads the Arabic file for a Latin-only run, and we maintain no ranges.
 *
 * These two faces are metrically identical (x-height 516, cap-height 698 at 1000upm),
 * so mixed runs like `استخدم const بدلاً من var` need no size-adjust correction.
 *
 * Static weights only — no variable build of Plex Sans Arabic exists anywhere.
 *
 * There is deliberately NO arabic-700 face. It measured 44,280 bytes of the
 * 217,776 this family used to cost, and with `preload: true` below every face
 * listed here is fetched eagerly on first paint whether or not the page uses
 * it — so that 44 KB was on the critical path of every route to serve, in the
 * whole product, three strings in the assistant widget and one notification
 * badge count. Those four moved to `font-semibold`. Latin already had no 700
 * (Fontsource ships latin at 400 and 600 here), so Latin runs have always
 * resolved `font-weight: 700` this way; Arabic now behaves the same.
 *
 * The consequence to know about: the marketing site's stylesheets still ask
 * for 700 in 35 places via `font-weight: var(--fw-bold)` (app/(site)/styles/
 * — sections, pages, blocks, media, theme). With no 700 face declared, CSS
 * font matching walks down to the nearest heavier-then-lighter candidate and
 * lands on the 600 face; whether the UA also paints synthetic bold on top of
 * it is UA-dependent, so those headings will render at 600 or at a faux-bold
 * 600 rather than true 700. That is a visual change on the marketing pages,
 * not just in the two components that changed class. If someone decides a
 * marketing heading needs real 700 back, the honest fix is to restore this
 * face and pay the 44 KB — not to leave 35 rules quietly asking for a weight
 * that does not exist.
 */
export const plexArabic = localFont({
  src: [
    {
      path: '../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-500-normal.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: '../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-400-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-600-normal.woff2',
      weight: '600',
      style: 'normal',
    },
  ],
  variable: '--font-plex-arabic',
  display: 'swap',
  preload: true,
});

export const plexMono = localFont({
  src: [
    {
      path: '../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2',
      weight: '600',
      style: 'normal',
    },
  ],
  variable: '--font-plex-mono',
  display: 'swap',
  preload: false,
});
