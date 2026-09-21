import type { Metadata } from 'next';
import { copy } from '@ayman/contracts';
import { mediaUrl } from '@ayman/ui/branding';
import { getPublicSettingsOrDefaults } from '@/lib/settings';
import { markdownTwinPath } from '@/lib/agents/markdown-routes';
import { aymanOnly, IS_AYMAN, tenantName } from '@/lib/tenant';
import { SITE_URL } from './site-url';

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

/**
 * The 1200×630 card used when the admin has not uploaded one.
 *
 * Regenerate it with `scripts/og-card/` — the card is HTML, screenshotted, and
 * that directory holds both the source and the reason each choice was made.
 *
 * ⚠️ JPEG, and the FILENAME is load-bearing. It was `/og.png` (543 KB of a
 * photograph in a lossless format, for a 99 KB job). Facebook and WhatsApp
 * cache a scrape against the image URL for weeks, so replacing the bytes at an
 * unchanged path leaves every link already shared — and every new share, until
 * the cache expires — showing the previous card. Changing the path is what
 * makes a redesign actually reach the people the link is sent to; if this card
 * is ever redesigned again, change the filename again.
 *
 * ⚠️ HIS CARD, not a blank one — which is why it is wrapped in `aymanOnly()`
 * below rather than shipped to every deployment. The screenshot is his face
 * beside «منصة أيمن أبو العلا» with `aymanaboelela.com` printed along the
 * bottom, and this is the `og:image` on EVERY page: a stack that is not his
 * would put that card on every link its students paste into a WhatsApp group —
 * the single most-shared surface the platform has, carrying another man's name
 * and another site's domain. A share with no picture at all is a smaller link
 * preview; a share with the wrong picture is an advert for somebody else.
 *
 * A non-Ayman deployment gets its own card the moment an admin uploads one in
 * `/admin/settings` — `seo.ogImageKey` is read first and is untouched by this
 * gate — so this is a missing default, not a missing feature.
 */
const FALLBACK_OG_IMAGE = '/og.jpg';

/**
 * The three names this file prints, resolved once through the tenant gate.
 *
 * `copy/ar.ts` is written around him — `platformName` is «منصة أيمن أبو
 * العلا», `shortName` is «منصة أيمن», `instructor` is «المهندس أيمن أبو
 * العلا» — and rewriting that table is a separate piece of work. So the gate
 * sits at the point of USE instead: his stack reads exactly what it always
 * read, and any other `TENANT_KEY` gets `TENANT_DISPLAY_NAME`, or «المنصة»
 * when that deployment has not set one.
 *
 * These are the highest-leverage name reads in the app and that is why they
 * are gated first. `<title>` and `og:site_name` are on EVERY page: they are
 * the blue link in a search result and the bold line in a WhatsApp preview.
 * `appleWebApp.title` is narrower and more permanent — it is what an iPhone
 * writes under the home-screen icon, which outlives the tab, the session and
 * the browser.
 */
const PLATFORM_NAME = tenantName(copy.site.platformName);
const INSTRUCTOR_NAME = tenantName(copy.site.instructor);
export const SITE_SHORT_NAME = tenantName(copy.site.shortName);

/**
 * The full site title — the landing page's `<title>`, `title.default` wherever
 * a page supplies none, and `name` in the web app manifest, which imports it
 * from here rather than keeping a second copy. Two copies of a name that must
 * match is how they stop matching; `copy.site.shortName` carries the same note
 * for the same reason.
 *
 * ⚠️ COMPOSED on a non-Ayman stack rather than substituted, because
 * `copy.seo.defaultTitle` is one string with his name welded into the middle
 * of it — «منصة أيمن أبو العلا — البرمجة وعلوم الحاسب للبكالوريا المصرية».
 * `tenantName()` cannot reach inside a sentence, and omitting the title is not
 * an option: a page with no title is a worse failure than a generic one. So
 * his stack returns that literal byte for byte, and every other stack gets the
 * gated platform name joined to the tagline — which says what the site teaches
 * without saying whose face is on it.
 */
/**
 * The site description, gated the same way `SITE_TITLE` is and for the same
 * reason: `copy.seo.description` and `copy.seo.homeDescription` both weld his
 * name into the MIDDLE of a sentence («منصة المهندس أيمن أبو العلا لتعليم…»),
 * so `tenantName()` has nothing to swap — the whole sentence has to go.
 *
 * Caught by running a second stack: the title read «منصة المهندس محمد صبري»
 * while `<meta name="description">`, `og:description`, `twitter:description`
 * and the JSON-LD `WebSite.description` all still read his name. A title is
 * proof-read by whoever opens the tab; a description is read by Google.
 *
 * The replacement is built from the tenant's own name and the platform's
 * tagline, which is neutral — it names the subject and the exam system,
 * nobody's person.
 */
export const SITE_DESCRIPTION = IS_AYMAN
  ? copy.seo.description
  : `${PLATFORM_NAME} — ${copy.site.tagline}.`;

export const SITE_TITLE = IS_AYMAN
  ? copy.seo.defaultTitle
  : `${PLATFORM_NAME} — ${copy.site.tagline}`;

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
  const siteTitle = adminTitle || SITE_TITLE;
  const title = input.title !== undefined ? input.title : { absolute: siteTitle };
  /** Flattened for OG/Twitter, which take a string and know nothing of templates. */
  const flatTitle = input.title !== undefined ? `${input.title} | ${PLATFORM_NAME}` : siteTitle;
  /*
   * ⚠️ `SITE_DESCRIPTION`, not `copy.seo.description`.
   *
   * The line above it gets this right — `adminTitle || SITE_TITLE` — and this
   * one reached past the gated constant to the raw copy string, which is the
   * whole reason `SITE_DESCRIPTION` exists eighty lines up. The effect was
   * that every page WITHOUT a description of its own, on a stack whose admin
   * had not typed one into /admin/settings, published «منصة المهندس أيمن أبو
   * العلا لتعليم…» as its `<meta name="description">`, its `og:description`
   * and its `twitter:description`. That is every page of a new tenant's site
   * on the day it launches, which is the day Google crawls it.
   */
  const description = input.description ?? (adminDescription || SITE_DESCRIPTION);
  const url = `${SITE_URL}${input.path}`;
  const markdownTwin = markdownTwinPath(input.path);
  /*
   * `ogImageKey`, NOT `ogImageAssetId` — the same confusion that 404'd every
   * favicon (see the note in `app/layout.tsx`). Here it was worse than a
   * missing icon: a share card whose `og:image` 404s falls back to whatever
   * the platform decides, so an admin who set a share image watched WhatsApp
   * and Facebook ignore it with no error anywhere to explain why.
   */
  const image =
    input.image ??
    (seo.ogImageKey ? mediaUrl(seo.ogImageKey) : aymanOnly(`${SITE_URL}${FALLBACK_OG_IMAGE}`));

  return {
    title,
    description,
    /*
     * `types['text/markdown']` — the per-page pointer at this page's markdown
     * twin.
     *
     * ⚠️ This is the relation that did NOT survive the move out of the `Link`
     * response header, and `components/agents/agent-discovery-links.tsx` says
     * so at the bottom of its own note: the shared `<head>` component cannot
     * know the path, so the hint had to come back per route. `metadata.alternates.types`
     * is where Next puts it, and this function is the one place every public
     * page already passes its path through.
     *
     * ⚠️ Via `markdownTwinPath`, never a `${path}.md` template. That function
     * is the SAME allowlist `proxy.ts` rewrites on, so a page with no twin
     * advertises none — a `rel="alternate"` pointing at a 404 is worse than
     * silence, because an agent that follows it concludes the site has no
     * markdown at all rather than that this one page has none.
     */
    alternates: {
      canonical: url,
      ...(markdownTwin ? { types: { 'text/markdown': `${SITE_URL}${markdownTwin}` } } : {}),
    },
    openGraph: {
      type: input.type ?? 'website',
      // `ar_EG`, not `ar`: the audience is specifically Egyptian, and the
      // locale is one of the few OG fields Facebook actually acts on.
      locale: 'ar_EG',
      siteName: PLATFORM_NAME,
      title: flatTitle,
      description,
      url,
      /*
       * SPREAD AWAY, not emitted empty. `image` is now optional — a stack that
       * is not Ayman's and whose admin has not uploaded a card has nothing to
       * put here (see `FALLBACK_OG_IMAGE`) — and the two wrong ways to say that
       * both ship a broken tag: `images: [{ url: undefined }]` renders
       * `<meta property="og:image" content="undefined">`, which scrapers fetch
       * as a relative path and resolve to a 404 on this origin, and `images: []`
       * is a claim of "no image" that some scrapers cache as hard as a real one.
       * The tag being absent is the only state that lets a crawler fall back to
       * the first suitable image in the document.
       *
       * `width`/`height` stay inside the branch: they describe THIS card, and a
       * 1200×630 declaration attached to a course cover of another shape is a
       * lie about bytes the scraper has already downloaded.
       */
      ...(image
        ? { images: [{ url: image, width: 1200, height: 630, alt: PLATFORM_NAME }] }
        : {}),
    },
    twitter: {
      // Left as `summary_large_image` even when there is no image: the card type
      // is a request, and Twitter/X renders a plain summary when no picture
      // resolves. Flipping it would also flip it back the day the admin uploads
      // one, and that is a decision this function should not be making twice.
      card: 'summary_large_image',
      title: flatTitle,
      description,
      ...(image ? { images: [image] } : {}),
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
      title: SITE_SHORT_NAME,
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
    default: SITE_TITLE,
    // Puts "منصة أيمن أبو العلا" — the exact phrase people search — in the
    // title of every single page, not just the landing one.
    template: `%s | ${PLATFORM_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: PLATFORM_NAME,
  /*
   * Ignored by Google, weighted lightly by Bing and Yandex, free to ship. The
   * real work is `alternateName` in the JSON-LD — see `copy.seo`.
   *
   * ⚠️ HIS STACK ONLY, and dropped whole rather than filtered. Eight of the
   * twenty-three entries are spellings of his name — «منصة أيمن أبو العلا»,
   * «ايمن ابو العلا», «Ayman Abo El Ela» — and a keywords tag exists precisely
   * so a search engine reads it. The other fifteen are subject terms that
   * would be honest on any stack, but nothing in the list says which entry is
   * which, and inventing that split here means a new personal keyword added to
   * `copy/ar.ts` next year ships to every deployment by default. The tag earns
   * nothing on Google to begin with, so omitting it costs another stack almost
   * nothing and costs his stack nothing at all.
   */
  ...(IS_AYMAN ? { keywords: [...copy.seo.keywords] } : {}),
  authors: [{ name: INSTRUCTOR_NAME, url: SITE_URL }],
  creator: INSTRUCTOR_NAME,
  publisher: PLATFORM_NAME,
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
