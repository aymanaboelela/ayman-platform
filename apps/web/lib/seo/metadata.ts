import type { Metadata } from 'next';
import { copy } from '@ayman/contracts';
import { mediaUrl } from '@ayman/ui/branding';
import { getPublicSettingsOrDefaults } from '@/lib/settings';
import { SITE_URL } from './jsonld';

/**
 * Every page's `<head>`, in one place.
 *
 * Two things were wrong before this file existed:
 *
 * 1. `/admin/settings` has had an SEO form — title, description, OG image —
 *    since Plan 6, and `getPublicSettings()` read it, but **nothing rendered
 *    it**. An editor could type a title, save it, see the success toast, and
 *    change absolutely nothing about the page. That is now `buildMetadata`'s
 *    first input.
 * 2. There was no `metadataBase`, so every relative OG/canonical URL Next
 *    emitted resolved against `localhost:3000` in production. Social previews
 *    and canonicals both silently pointed at nothing.
 */

/** The 1200×630 card used when the admin has not uploaded one. */
const FALLBACK_OG_IMAGE = '/og.png';

export interface PageMetaInput {
  /** Page title, WITHOUT the site suffix — the template appends it. */
  title?: string;
  description?: string;
  /** Absolute path on this origin, e.g. `/courses/intro`. Becomes the canonical. */
  path: string;
  /** `article` for a lesson or course; `website` everywhere else. */
  type?: 'website' | 'article';
  /** Overrides the admin's OG image for this page only (a course cover). */
  image?: string | null;
}

/**
 * ⚠️ `async`, and therefore only callable from `generateMetadata`. It reads
 * the admin settings through `getPublicSettingsOrDefaults()`, which is
 * `'use cache'`d and **cannot throw** — the same rule `getBranding()` follows
 * and for the same reason: this runs on the path of every prerendered page,
 * including inside `docker build` where no API exists to answer.
 */
export async function buildMetadata(input: PageMetaInput): Promise<Metadata> {
  const { seo } = await getPublicSettingsOrDefaults();

  // The admin's value wins, then the page's own, then the shipped default.
  // `.trim()` matters: the settings row defaults to `''`, and an empty string
  // is not an override — it is an untouched field.
  const adminTitle = seo.titleAr.trim();
  const adminDescription = seo.descriptionAr.trim();

  /**
   * ⚠️ The `absolute` branch is not a style choice. The root layout declares
   * `title.template = '%s | منصة أيمن أبو العلا'`, and Next applies a parent's
   * template to any PLAIN-STRING title a child returns. A page with no title
   * of its own falls back to the site title — which already ends in the
   * platform name — so letting it through the template produces
   * "منصة أيمن أبو العلا — … | منصة أيمن أبو العلا". Google rewrites titles
   * that repeat themselves, which throws away the exact-phrase match this
   * whole file exists to earn. `{ absolute }` opts that one case out.
   */
  const siteTitle = adminTitle || copy.seo.defaultTitle;
  const title = input.title !== undefined ? input.title : { absolute: siteTitle };
  /** Flattened for OG/Twitter, which take a string and know nothing of templates. */
  const flatTitle = input.title !== undefined ? `${input.title} | ${copy.site.platformName}` : siteTitle;
  const description = input.description ?? (adminDescription || copy.seo.description);
  const url = `${SITE_URL}${input.path}`;
  /*
   * `ogImageKey`, NOT `ogImageAssetId` — the same confusion that 404'd every
   * favicon (see the note in `app/layout.tsx`). Here it was worse than a
   * missing icon: a share card whose `og:image` 404s falls back to whatever
   * the platform decides, so an admin who set a share image watched WhatsApp
   * and Facebook ignore it with no error anywhere to explain why.
   */
  const image =
    input.image ??
    (seo.ogImageKey ? mediaUrl(seo.ogImageKey) : `${SITE_URL}${FALLBACK_OG_IMAGE}`);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: input.type ?? 'website',
      // `ar_EG`, not `ar`: the audience is specifically Egyptian, and the
      // locale is one of the few OG fields Facebook actually acts on.
      locale: 'ar_EG',
      siteName: copy.site.platformName,
      title: flatTitle,
      description,
      url,
      images: [{ url: image, width: 1200, height: 630, alt: copy.site.platformName }],
    },
    twitter: {
      card: 'summary_large_image',
      title: flatTitle,
      description,
      images: [image],
    },
    /*
     * iOS installs from Safari's share sheet and reads NONE of the web app
     * manifest to do it — not the name, not the icons, not `display`. These
     * three legacy meta tags are the whole iOS story, so without them an
     * iPhone home-screen shortcut opens in a Safari tab with its chrome, and
     * labels itself with the full document title.
     *
     * `statusBarStyle: 'default'` is deliberate over `black-translucent`: the
     * translucent one draws the page UNDER the status bar, which on an RTL
     * layout with a sticky top bar puts the clock on top of the account
     * control. The app has no full-bleed hero at the very top of a signed-in
     * screen that would earn that trade.
     *
     * The icon itself comes from `app/apple-icon.png`, which Next links
     * automatically — iOS ignores `manifest.icons` entirely.
     */
    appleWebApp: {
      capable: true,
      title: copy.site.shortName,
      statusBarStyle: 'default',
    },
  };
}

/**
 * The root layout's static half — the parts that are identical on every page
 * and must NOT wait on an API read: `metadataBase` in particular, because
 * without it every relative URL in a child's metadata resolves wrong, and a
 * child's `generateMetadata` cannot supply it retroactively.
 */
export const rootMetadata: Metadata = {
  // The single most load-bearing line in this file. Next resolves every
  // relative metadata URL — canonical, OG image, manifest — against it.
  metadataBase: new URL(SITE_URL),
  title: {
    default: copy.seo.defaultTitle,
    // Puts "منصة أيمن أبو العلا" — the exact phrase people search — in the
    // title of every single page, not just the landing one.
    template: `%s | ${copy.site.platformName}`,
  },
  description: copy.seo.description,
  applicationName: copy.site.platformName,
  // Ignored by Google, weighted lightly by Bing and Yandex, free to ship. The
  // real work is `alternateName` in the JSON-LD — see `copy.seo`.
  keywords: [...copy.seo.keywords],
  authors: [{ name: copy.site.instructor, url: SITE_URL }],
  creator: copy.site.instructor,
  publisher: copy.site.platformName,
  // Arabic phone numbers in course copy would otherwise be auto-linked by iOS
  // Safari, which rewrites the DOM under RTL text and breaks the layout.
  formatDetection: { telephone: false, address: false, email: false },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Without these three, Google caps the snippet and refuses to show a
      // large thumbnail — which is most of the click-through on a mobile SERP.
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
  alternates: {
    canonical: '/',
    languages: { 'ar-EG': '/' },
  },
};

/**
 * Applied by the `(app)`, `(admin)` and `(auth)` layouts.
 *
 * `robots.txt` already disallows these prefixes, but that is a CRAWL hint, not
 * an INDEX directive: a URL that is linked from anywhere else can still be
 * indexed — URL and anchor text only — while disallowed, which is the classic
 * way a `/dashboard` ends up in search results with no snippet. `noindex` on
 * the page is the directive that actually keeps it out. Neither is a security
 * control; `proxy.ts` and the API's guards are.
 */
export const privateRouteMetadata: Metadata = {
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};
