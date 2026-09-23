import { copy } from '@ayman/contracts';
import { waMeHref } from '@ayman/contracts/whatsapp';
import type { Entitlements } from '@ayman/contracts/admin/entitlements';
import type { PublicSettingsRead } from '@ayman/contracts/admin/settings';
import type { SocialKey } from '@/components/site/social-icons';
import { TENANT_CONTACT_FALLBACK } from '@/lib/tenant-contact';
import { IS_AYMAN } from '@/lib/tenant';
import { tenantName } from '@/lib/tenant';

const c = copy.landing;

/**
 * WHAT the footer says, for all three of them.
 *
 * ## Why this file exists at all
 *
 * `<SiteFooter>` used to be the only footer on the platform, so its link
 * tables, its "drop a social row that has no destination" rule and its
 * `features.books` filter could live inside it. They cannot now: `neon` and
 * `board` render their own footer, and a second copy of any of those rules is
 * a second place they can drift. The drift is not hypothetical — every one of
 * the rules below was written after the version without it shipped:
 *
 *   · a social icon pointing at `https://www.tiktok.com/` instead of at the
 *     instructor (hence `flatMap` and not a placeholder);
 *   · a «كلّمنا» button opening WhatsApp's marketing page (hence `waMeHref`
 *     answering `null` rather than a numberless URL);
 *   · `/books` surviving in the footer of every marketing page after the
 *     feature was switched off, which is a dead link on the whole site rather
 *     than on one page.
 *
 * Three footers re-deriving those from scratch is three chances to get one of
 * them wrong on a stack nobody is looking at.
 *
 * ## Why the presets take CONTENT and not the loaders
 *
 * `footerContent()` is pure — settings and entitlements in, strings out. The
 * two preset footers are then presentation only, which is what lets them live
 * under `presets/<name>/` and stay inside that directory's own guards: the
 * NEON directory may not read `copy.landing` at all (`neon-landing.test.ts`),
 * because that table is Ayman's landing page written out. The chrome words a
 * footer needs — «الصفحات», «حسابي», the rights line — are not that, and they
 * are ALREADY rendered on both preset pages today by the classic footer the
 * shell mounts under them. Handing them over as props keeps that true without
 * putting a `copy.landing` read inside a directory whose whole guarantee is
 * that it has none.
 *
 * ⚠️ `<SiteFooter>`'s own JSX deliberately does NOT read this object. It reads
 * the same tables and helpers, and keeps its markup byte for byte as it has
 * shipped — «منصتي زي ما هي بالظبط». Rewriting the classic arm to consume a
 * content object is exactly the "harmless refactor" that changes the HTML
 * Ayman's students are served.
 */
export type FooterLink = { href: string; label: string };

/**
 * No colour on here on purpose. `SOCIAL_MARKS[key]` already carries the hex,
 * the path AND `inkHex` — the variant TikTok needs on a surface that is dark
 * in both themes, where its official `#000000` measures 1.08:1 and vanished.
 * A footer that copied only `hex` out of the registry would be the second
 * place that decision lives and the one that gets it wrong on «الترمينال».
 */
export type FooterSocialLink = {
  key: SocialKey;
  href: string;
  label: string;
};

/**
 * `key` rather than a position, because each preset labels the columns in its
 * own vocabulary — «الترمينال» writes a `// pages` marker above them and
 * «اللوح» a pill chip — and both need to know WHICH column they are drawing
 * without counting.
 */
export type FooterColumnKey = 'pages' | 'years' | 'account';

export type FooterColumn = {
  key: FooterColumnKey;
  label: string;
  links: readonly FooterLink[];
};

export type FooterContent = {
  cta: { title: string; lead: string; primary: FooterLink; secondary: FooterLink };
  /** Through `tenantName()`, never `copy.site.name` raw. */
  name: string;
  /** The accessible name of the social list. */
  follow: string;
  social: readonly FooterSocialLink[];
  columns: readonly FooterColumn[];
  /**
   * Both `null` unless the dashboard holds a real destination. They were once
   * unconditional and pointed at `https://wa.me/` and
   * `https://www.facebook.com/groups/` — two buttons that looked like features
   * and worked like dead ends.
   */
  whatsapp: FooterLink | null;
  group: FooterLink | null;
  rights: string;
};

export const PAGE_LINKS = [
  { href: '/', label: c.footerHome },
  { href: '/courses', label: c.coursesCta },
  { href: '/essentials', label: c.trackEssentialsTitle },
  // «الكتب». Linked from every page for the reason `/about` gives below —
  // otherwise it is a sitemap entry nothing points at — and directly under the
  // catalogue, because the two are the same question asked about two products.
  { href: '/books', label: copy.books.pageTitle },
  // `/about` is linked from every page in the site because that is how it gets
  // crawled and weighted at all — a page in the sitemap that nothing links to
  // reads as an orphan. The label is his NAME rather than «عن المنصة», so the
  // anchor text matches the query it exists to answer.
  // ⚠️ `tenantName`, because `aboutPageTitle` IS the name — literally the
  // string «أيمن أبو العلا» and nothing else (`copy/ar.ts:1495`). The anchor
  // text is deliberately a person's name rather than «عن المنصة» so it matches
  // the query the page answers; on a second instructor's stack that reasoning
  // holds exactly as written, with a different person in it.
  { href: '/about', label: tenantName(c.aboutPageTitle) },
  // `/links` is reached almost entirely from OUTSIDE — it is the URL in four
  // bios — so it would otherwise be an orphan on this site: in the sitemap,
  // linked by nothing. That is the shape `/about`'s note above describes, and
  // it is worth one row here for the same reason.
  { href: '/links', label: copy.linkhub.pageTitle },
  // «نيوز» is the section that exists to be FOUND — it ranks for curriculum
  // queries the catalogue never will. Until this row it was reachable from
  // `/links` alone: in the sitemap, linked by one page, which is the orphan
  // shape both notes above describe and the worst possible position for the
  // one section whose entire job is search. The anchor text is the phrase
  // people type, not the section's name — see `copy.news.footerLink`.
  { href: '/news', label: copy.news.footerLink },
] as const;

export const YEAR_LINKS = [
  { href: '/years/1', label: c.trackYear1Title },
  { href: '/years/2', label: c.trackYear2Title },
] as const;

export const ACCOUNT_LINKS = [
  { href: '/register', label: c.footerRegister },
  { href: '/login', label: c.footerLogin },
  // In the ACCOUNT column, beside register and log in, because that is where
  // they are load-bearing: the two links sit next to the buttons that lead to
  // the form asking a student for their phone number and, optionally, both
  // parents'. A visitor deciding whether to hand that over can read who is
  // asking without leaving the decision.
  //
  // Reachable from every page is the requirement, not merely present — Google
  // flagged this site under «الصفحات المضلّلة» (social engineering) on
  // 2026-08-06 with no sample URLs, and the only structural difference between
  // this platform and one that would not be flagged was that nothing on it
  // said who collects the data or why. A policy nothing links to fixes
  // nothing.
  { href: '/privacy', label: copy.legal.privacyTitle },
  { href: '/terms', label: copy.legal.termsTitle },
] as const;

/**
 * تلات صفوف بيتشالوا على ستاك مش بتاع أيمن، وسطر رابع بيتشال مع الفيتشر.
 *
 * ## ليه دول بالذات
 *
 * التلاتة دول أقسام **بتاعة أيمن**، مش فيتشرز بتاعة المنصة:
 *
 * · `/essentials` — «التأسيس»، مسار بنى عليه هو بمحتواه هو. على ستاك تاني
 *   الصفحة موجودة وفاضية.
 * · `/links` — صفحة اللينكات، والرابط اللي في **باياته هو** على أربع منصات.
 *   الكومنت فوق بيقول إنها «بتتوصل من بره تقريبًا بالكامل» — وde صح عنده،
 *   ومعناه على ستاك تاني إنها صفحة محدش بيدخلها من أي مكان.
 * · `/books` — كان متفلتر بالفيتشر أصلًا، وده الصح ومكمّل: الفيتشر بيقول
 *   «المتجر شغّال»، والبوابة دي بتقول «الكتب دي بتاعة مين».
 *
 * ⚠️ **وشيل اللينك من الفوتر لوحده مش كفاية.** `app/sitemap.ts` عنده ليستة
 * **خاصة** مكتوبة بإيد — مش بيقرا `PAGE_LINKS` — فصف بيتشال من هنا وبيفضل
 * هناك بيدي محرّك البحث صفحة فاضية على دومين مدرّس تاني ويسيبه يشيلها بنفسه،
 * وده أسوأ من لينك ميت. الصفوف اللي هناك متبوّبة بنفس البوابة.
 *
 * وسبب وجود الفلتر أصلًا لسه قايم: الفوتر ده على كل صفحة تسويق، فلينك ميت
 * فيه مش لينك ميت واحد — ده لينك ميت في فوتر كل صفحة.
 */
const AYMAN_ONLY_PAGES: readonly string[] = ['/essentials', '/links'];

export function footerPageLinks(features: Entitlements): readonly FooterLink[] {
  return PAGE_LINKS.filter((link) => {
    if (link.href === '/books') return features.books && IS_AYMAN;
    if (AYMAN_ONLY_PAGES.includes(link.href)) return IS_AYMAN;
    return true;
  });
}

/**
 * Every row comes from the setting, and a row with no destination is DROPPED —
 * never a bare platform root. An icon that links to `https://www.tiktok.com/`
 * is worse than no icon: it looks like a working link, and the student who taps
 * it lands on a stranger's feed.
 *
 * `TENANT_CONTACT_FALLBACK` is what fills the gap during the window where
 * there is no answer at all: `getPublicSettingsOrDefaults()` returns
 * `contact: {}` when the API is unreachable, `next build` runs with no API,
 * and every footer on the platform is prerendered — so without it the first
 * request after each deploy renders an empty list. It is per-DEPLOYMENT, so a
 * second instructor's stack falls back to its own accounts or to nothing,
 * never to somebody else's.
 */
export function footerSocial(
  contact: PublicSettingsRead['contact'],
): readonly { key: SocialKey; href: string; label: string }[] {
  return (
    [
      { key: 'youtube', href: contact.youtube ?? TENANT_CONTACT_FALLBACK.youtube, label: c.footerYoutube },
      { key: 'instagram', href: contact.instagram ?? TENANT_CONTACT_FALLBACK.instagram, label: c.footerInstagram },
      { key: 'facebook', href: contact.facebook ?? TENANT_CONTACT_FALLBACK.facebook, label: c.footerFacebook },
      { key: 'tiktok', href: contact.tiktok ?? TENANT_CONTACT_FALLBACK.tiktok, label: c.footerTiktok },
      { key: 'whatsapp', href: contact.whatsappChannel ?? TENANT_CONTACT_FALLBACK.whatsappChannel, label: c.footerWhatsappChannel },
    ] satisfies { key: SocialKey; href: string | null; label: string }[]
  ).flatMap(({ key, href, label }) => (href ? [{ key, href, label }] : []));
}

/**
 * Everything a preset footer renders, resolved once.
 *
 * ## What is deliberately NOT in here
 *
 * `copy.site.tagline` («البرمجة وعلوم الحاسب — نظام البكالوريا المصرية») and
 * `c.footerTagline` («البرمجة وعلوم الحاسب لطلبة البكالوريا المصرية»). Both sit
 * in the classic footer ungated, and neither contains a name, so
 * `tenant-identity-leak.spec.ts` cannot see them — a maths teacher's footer
 * currently announces that the platform teaches programming. That is a real
 * leak and it is not this change's to fix (it is a copy-table decision on a
 * live page), but there is no reason to copy it onto two brand-new footers on
 * the way past. Both presets close on the tenant's own name instead.
 *
 * `c.footerRights` IS carried through, hard-coded year and all. Same argument
 * in reverse: it is wrong on all three footers identically, which is a copy
 * fix, not a per-preset one — and a `new Date().getFullYear()` here would be
 * baked into a prerender and a `'use cache'` entry, so it would be a DIFFERENT
 * wrong year rather than none.
 */
export function footerContent({
  contact,
  features,
}: {
  contact: PublicSettingsRead['contact'];
  features: Entitlements;
}): FooterContent {
  const whatsappHref = waMeHref(contact.whatsapp);

  return {
    cta: {
      title: c.finalTitle,
      lead: c.finalLead,
      primary: { href: '/register', label: c.finalCta },
      secondary: { href: '/courses', label: c.coursesCta },
    },
    // ⚠️ `tenantName()`, like the nav's. A page whose header says one name and
    // whose footer says another is worse than either alone: it reads as a
    // platform reselling somebody else's brand.
    name: tenantName(copy.site.name),
    follow: c.footerFollow,
    social: footerSocial(contact),
    columns: [
      { key: 'pages', label: c.footerPages, links: footerPageLinks(features) },
      // One label, used for the visible heading AND for the landmark's name.
      // The classic footer labels this column's `<nav>` with
      // `c.tracksSelectTitle` and heads it with `copy.onboarding.year` — two
      // wordings for one column, which is a difference a reader can only
      // notice with a screen reader open. The presets are new, so they get the
      // simpler version rather than inheriting the discrepancy.
      { key: 'years', label: copy.onboarding.year, links: YEAR_LINKS },
      { key: 'account', label: copy.nav.dashboard, links: ACCOUNT_LINKS },
    ],
    whatsapp: whatsappHref ? { href: whatsappHref, label: c.footerWhatsapp } : null,
    group: contact.facebookGroup
      ? { href: contact.facebookGroup, label: c.footerCommunity }
      : null,
    rights: c.footerRights,
  };
}
