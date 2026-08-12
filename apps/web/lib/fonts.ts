import localFont from 'next/font/local';

/**
 * IBM Plex Sans Arabic + IBM Plex Mono, self-hosted from Fontsource.
 *
 * Fontsource ships these PRE-SUBSETTED PER SCRIPT (separate `-arabic-` and
 * `-latin-` files) but with NO `unicode-range` on any of them. That is worth
 * being precise about, because the filenames invite the opposite conclusion:
 * `arabic-400.css` and `latin-400.css` in the package both declare the same
 * family at the same weight and neither carries a range, and the built
 * stylesheet reproduces that faithfully — every generated `@font-face` here
 * is `font-family: plexArabic`, one weight, no range. So the per-script split
 * saves bytes only at a weight one script uses and the other does not. On a
 * page written in either script, at a weight both files declare, the browser
 * matches the LAST-declared face, finds the glyph missing, and fetches the
 * other file too. Read these filenames as "how the family is packaged", never
 * as "this file will not be downloaded on an Arabic page".
 *
 * Hand-authoring the ranges to make that true was looked at and rejected: the
 * Latin subset's range starts at U+0000-00FF and the product renders every
 * number with `ar-EG-u-nu-latn` (Latin digits, on purpose — see the formatters
 * in `lib/notification-view.ts` and friends), so the Latin file is genuinely
 * needed on essentially every screen. There is no Arabic-only page to save it
 * on.
 *
 * These two faces are metrically identical (x-height 516, cap-height 698 at 1000upm),
 * so mixed runs like `استخدم const بدلاً من var` need no size-adjust correction.
 *
 * Static weights only — no variable build of Plex Sans Arabic exists anywhere.
 *
 * ------------------------------------------------------------------ weight 700
 *
 * The 700 faces are here on purpose, at 44,280 bytes (Arabic) + 19,504
 * (Latin), bringing the family to 237,280. An earlier pass deleted arabic-700
 * on the grounds that it served four call sites — three strings in the
 * assistant widget and the notification badge count — and moved those to
 * `font-semibold`. What that missed is that 35 rules across
 * `app/(site)/styles/` (29 on this family, six on Plex Mono) still say
 * `font-weight: var(--fw-bold)`: the hero title at clamp(2.25rem, 5vw, 4rem),
 * the footer watermark at clamp(2rem, 13vw, 11rem), every page, article and
 * section heading — plus every `<strong>` the news markdown renderer emits,
 * which the UA stylesheet resolves to 700 with no stylesheet of ours
 * involved. With no 700 face those all matched the 600 face and the UA was
 * then free to paint SYNTHETIC bold over it, which on Arabic script thickens
 * the joins into a smear. Marketing display type is precisely where real
 * weight earns its bytes, so this is the fix the deleted comment itself named:
 * restore the face and pay, rather than leave 35 rules asking for a weight
 * that does not exist.
 *
 * Latin 700 as well as Arabic, because the marketing stat numerals
 * (`.statband__n`, `.hero__stat-n`, `.profile__stat-n`) are Latin digits set
 * at the same `--fw-bold` as the Arabic heading beside them, at 28-40px.
 * Arabic-700 alone would have left every one of those numbers a visible step
 * lighter than its own heading.
 *
 * The cost is confined to the marketing routes, and that is not luck: after
 * this pass nothing under the app routes asks for 700 at all. The four
 * assistant/notification call sites are on `font-semibold`, the Plex Mono
 * rules now name 600 explicitly, `.exam-gate-dialog__point-title` — the only
 * `<strong>` in an app route — sets `--fw-medium`, and no Tailwind
 * `font-bold` survives anywhere in the repo. A face with `display: swap` and
 * no working preload is fetched only when a run that matches it is actually
 * painted, so the dashboard and the player never see these 63,784 bytes.
 *
 * On preload, so nobody re-derives it: `preload: true` below currently emits
 * nothing. `next-font-manifest.json` does list all faces for every route, but
 * `as="font"` appears zero times across every prerendered HTML — a manifest
 * key-shape mismatch under Turbopack. Do not "fix" that without measuring
 * first: pushing all 237,280 bytes into the preload queue would compete
 * directly with the LCP image.
 *
 * Plex Mono stays at 400/500/600. Its 700 would be another 14,908 bytes to
 * serve seven small Latin labels — the brand monogram, the glossary term, the
 * lab language chip, the rail counter's `<b>`, the course-card thumb mark, the
 * about mark and the portrait watermark. Note that only six of those name
 * `--font-mono` themselves; `.rail__counter b` inherits it, which is exactly
 * how a "why is this one still faux-bold" bug survives an audit. Those rules
 * now ask for 600 by name, and `font-synthesis-weight: none` in
 * `app/globals.css` stops the UA faking the difference.
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
      path: '../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff2',
      weight: '700',
      style: 'normal',
    },
    /* Latin runs 400/600/700 — the missing 500 is a decision, not an
       oversight. Nothing in the product puts `font-medium` on a Latin-only
       run, and per-character in-family fallback lands the odd Latin word
       inside a 500 Arabic line on latin-400, still inside the family rather
       than out in the system font. The file would be 20 KB to change
       something nobody can point at. */
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
    {
      path: '../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-700-normal.woff2',
      weight: '700',
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
