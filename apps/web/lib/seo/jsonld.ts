import { copy, youTubeEmbedUrl, youTubeThumbnailUrl } from '@ayman/contracts';

/**
 * The site origin. Nothing else in the app is host-aware, so switching to a
 * real domain is one environment variable.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3200').replace(
  /\/$/,
  '',
);

const absolute = (path: string): string => `${SITE_URL}${path}`;

/**
 * The subset of `CatalogCourse` the JSON-LD builders actually read — a
 * narrower structural type than the full contract on purpose, so a course
 * fixture in a test only needs to supply the fields these functions use,
 * not every field the public catalog API happens to return.
 */
export interface CourseForJsonLd {
  slug: string;
  title: string;
  subtitle: string | null;
  systemNameAr: string;
  subjectNameAr: string;
  trackLabelAr: string | null;
  year: number;
  totalSeconds: number;
}

/** `PT1H1M1S`. Zero is `PT0S`, not the empty `PT`, which validators reject. */
export function secondsToIso8601Duration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds === 0) return 'PT0S';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `PT${hours > 0 ? `${hours}H` : ''}${minutes > 0 ? `${minutes}M` : ''}${
    rest > 0 ? `${rest}S` : ''
  }`;
}

/**
 * Stable `@id`s. Structured data on separate pages only describes ONE entity
 * when the pages agree on its identifier — without these, the landing page's
 * organisation and a course page's `provider` are two unrelated organisations
 * to a crawler, and neither accumulates the signal the other earned.
 */
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const PERSON_ID = `${SITE_URL}/#person`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

/**
 * The instructor's own profiles. Fed into `sameAs`, which is the strongest
 * single signal for tying a bare-name query to this site — it is what turns
 * "a page about someone with this name" into "the page about THIS person".
 *
 * Supplied by the instructor on 2026-08-04 and normalised here rather than
 * pasted as given: every one arrived carrying share/referral parameters
 * (`?si=`, `?igsh=`, `&utm_source=qr`, `?_t=`) that identify the SHARE, not
 * the profile. Two identical entities under two query strings are two entities
 * to a crawler, so `sameAs` takes the canonical form only.
 *
 * All four were verified to resolve at the URL written here. Facebook needed a
 * real browser to check: it answers any non-browser request with 400 whatever
 * the URL, so `curl` can neither confirm nor deny one.
 *
 * The Facebook entry is the canonical profile, not the `/share/<id>/` link it
 * arrived as. Two different share ids were supplied and BOTH redirect to
 * `facebook.com/aymanaboelela2` ("Ayman Abo El Ela") — resolved by loading
 * each in Playwright. A share id is not guaranteed permanent and Google's
 * guidance asks for the official profile URL, so the destination is what is
 * published.
 */
const SAME_AS: readonly string[] = [
  'https://www.youtube.com/@2ayman6',
  'https://www.instagram.com/2ayman6',
  'https://www.tiktok.com/@2ayman_6',
  'https://www.facebook.com/aymanaboelela2',
];

/** `sameAs: []` is not the same as no `sameAs` — an empty array is a claim of "none". */
function withSameAs<T extends object>(entity: T): T & { sameAs?: readonly string[] } {
  return SAME_AS.length > 0 ? { ...entity, sameAs: SAME_AS } : entity;
}

/**
 * The instructor as a distinct entity from the platform.
 *
 * This is the piece that answers the bare-name query. "أيمن أبو العلا" is a
 * PERSON search, and a site that only ever describes itself as an organisation
 * gives a crawler nothing to match against it — `alternateName` carrying the
 * hamza-less spellings is doing the actual work here, because that is what
 * students type. See `copy.seo` for why the misspellings live in metadata and
 * never in visible copy.
 */
export function personJsonLd() {
  return withSameAs({
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': PERSON_ID,
    name: copy.site.instructor,
    alternateName: copy.seo.alternateNames,
    url: SITE_URL,
    image: absolute('/team/ayman.jpg'),
    jobTitle: copy.seo.jobTitle,
    description: copy.seo.personDescription,
    knowsLanguage: ['ar', 'en'],
    knowsAbout: ['البرمجة', 'علوم الحاسب', 'الخوارزميات', 'قواعد البيانات'],
    worksFor: { '@id': ORGANIZATION_ID },
    nationality: { '@type': 'Country', name: 'Egypt' },
  });
}

/**
 * `EducationalOrganization`, not the generic `Organization` it used to be —
 * it is a strict subtype, so nothing that consumed the old shape breaks, and
 * it is what makes the entity eligible to be understood as a school rather
 * than a company that happens to have a website.
 */
export function organizationJsonLd() {
  return withSameAs({
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': ORGANIZATION_ID,
    name: copy.site.platformName,
    alternateName: copy.seo.alternateNames,
    url: SITE_URL,
    description: copy.seo.description,
    slogan: copy.site.tagline,
    image: absolute('/team/ayman.jpg'),
    logo: absolute('/team/ayman.jpg'),
    founder: { '@id': PERSON_ID },
    inLanguage: 'ar',
    areaServed: { '@type': 'Country', name: 'Egypt' },
    address: { '@type': 'PostalAddress', addressCountry: 'EG' },
  });
}

/**
 * The site itself — a third, independent place a crawler can learn that
 * "منصه ايمن ابو العلا" names this site. Person, Organization and WebSite
 * agreeing on the same `alternateName` list is far stronger than any one of
 * them asserting it alone.
 *
 * NOT PRESENT: `potentialAction`/`SearchAction`. That is what earns the
 * sitelinks searchbox, and it requires a URL template that really performs a
 * search — `/courses` renders the full catalogue and ignores every query
 * parameter, so declaring `?q={search_term_string}` would be a claim the site
 * cannot honour. Add it the same day catalogue search ships, not before.
 */
export function webSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: copy.site.platformName,
    alternateName: copy.seo.alternateNames,
    url: SITE_URL,
    description: copy.seo.description,
    inLanguage: 'ar',
    publisher: { '@id': ORGANIZATION_ID },
  } as const;
}

/**
 * `provider` in its two shapes, as ONE type rather than a union of two.
 *
 * A union would be more honest about the data, but it makes every consumer —
 * including the tests — narrow before it can read `['@type']`, for a
 * distinction no consumer cares about. The optional fields say what they mean:
 * `@id` is always there, the readable rest is only there standalone.
 */
interface CourseProvider {
  '@id': string;
  '@type'?: 'EducationalOrganization';
  name?: string;
  url?: string;
}

/**
 * One course.
 *
 * `options.nested` is for a `Course` emitted INSIDE another node in the same
 * script — today only the catalog's `ItemList`. It changes nothing a crawler
 * reads; it drops the two pieces the surrounding document already states, on a
 * page where they are stated up to 86 times. See `courseListJsonLd` for the
 * measurement that motivated it.
 */
export function courseJsonLd(course: CourseForJsonLd, options: { nested?: boolean } = {}) {
  // `@id` ties this back to the one organisation the root layout emits on
  // every page, instead of minting an anonymous second one per course.
  //
  // Standalone (a course page), the name/url stay alongside it so the node is
  // still readable on its own. Nested in the catalog list they are dropped:
  // `app/layout.tsx` emits the FULL `EducationalOrganization` node under this
  // exact `@id` on every page including that one, so N copies of a name and a
  // URL the same document already carries are bytes and nothing else. That
  // cheaper shape is not new here — `instructor` below has always been a bare
  // `@id` reference for the same reason.
  const provider: CourseProvider = options.nested
    ? { '@id': ORGANIZATION_ID }
    : {
        '@type': 'EducationalOrganization',
        '@id': ORGANIZATION_ID,
        name: copy.site.platformName,
        url: SITE_URL,
      };

  return {
    // JSON-LD scopes `@context` to the node tree it is declared on, so a Course
    // inside the `ItemList` inherits the list's. Repeating it per item is 33
    // bytes × N asserting something already true. Standalone it is required —
    // without it the document has no vocabulary and every type is meaningless.
    ...(options.nested ? {} : { '@context': 'https://schema.org' }),
    '@type': 'Course',
    name: course.title,
    description: course.subtitle ?? copy.site.tagline,
    url: absolute(`/courses/${course.slug}`),
    inLanguage: 'ar',
    isAccessibleForFree: true,
    educationalLevel: `${course.systemNameAr} — ${course.year}`,
    about: course.subjectNameAr,
    provider,
    // The course is taught by the person, and the person is the thing being
    // searched for — this is what carries a course page's authority back to
    // the name query.
    instructor: { '@id': PERSON_ID },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EGP', category: 'Free' },
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: 'online',
      courseWorkload: secondsToIso8601Duration(course.totalSeconds),
    },
  };
}

/**
 * ⚠️ The `Course` "course info" rich result was DEPRECATED in Sept 2025. The
 * shape Google still supports on a catalog page is an `ItemList` carrying at
 * least THREE `Course` items — below three it produces nothing, so emitting
 * a one-item list is pure page weight. Returning null is the honest
 * behaviour.
 *
 * ⚠️ Because that shape was tuned against a live Google requirement, any
 * change to what this emits goes through the Rich Results Test before it
 * ships — structured data breaks silently and nothing in CI notices.
 *
 * The items are built with `nested: true`. Measured on the built
 * `.next/server/app/courses.html` (86 courses): the script is 73,213 raw bytes,
 * and dropping the per-item `@context` plus the `EducationalOrganization`
 * name/url from each `provider` takes 12,126 of them — 16.6%. Gzip had already
 * absorbed nearly all of the transfer cost, so this is NOT a bandwidth fix:
 * 3,528 → 3,336 bytes on the wire, 192 bytes. What it buys is 12 KB a low-end
 * Android no longer decompresses, tokenises and parses. Modest, and worth
 * having only because it is free — the shape a crawler reads is unchanged.
 */
export function courseListJsonLd(courses: readonly CourseForJsonLd[]) {
  if (courses.length < 3) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: courses.map((course, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: courseJsonLd(course, { nested: true }),
    })),
  };
}

export function videoObjectJsonLd(video: {
  externalId: string;
  name: string;
  description: string;
  durationSeconds: number;
  uploadDate: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: video.name,
    description: video.description,
    // Built from the id, server-side. Same rule as the player.
    embedUrl: youTubeEmbedUrl(video.externalId),
    thumbnailUrl: youTubeThumbnailUrl(video.externalId),
    duration: secondsToIso8601Duration(video.durationSeconds),
    uploadDate: video.uploadDate,
    inLanguage: 'ar',
  };
}

export function breadcrumbJsonLd(trail: ReadonlyArray<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: absolute(entry.path),
    })),
  };
}

/**
 * One article. `@type: Article`, deliberately NOT `NewsArticle`.
 *
 * `NewsArticle` asks Google to treat the page as journalism with a news
 * lifecycle — surfaced in Top Stories, decayed hard once it is a few days old.
 * This section is named «نيوز» but its content is evergreen teaching material
 * that should keep ranking for years, and the wrong type would actively work
 * against that.
 *
 * `author` and `publisher` point at the SAME `@id`s the landing page declares,
 * so every article accrues signal to the one Person and Organisation rather
 * than minting a new pair per page.
 */
export function articleJsonLd(post: {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  updatedAt: string;
}) {
  const url = absolute(`/news/${post.slug}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${url}#article`,
    // `mainEntityOfPage` is what tells Google this article IS this page,
    // rather than something merely mentioned on it.
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    headline: post.title,
    description: post.excerpt,
    // datePublished never moves; dateModified does. Emitting `updatedAt` for
    // both would tell a crawler every article is new on every typo fix.
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    inLanguage: 'ar',
    author: { '@id': PERSON_ID },
    publisher: { '@id': ORGANIZATION_ID },
    isAccessibleForFree: true,
  };
}

/** The index. `ItemList` needs three entries to earn a rich result — below that this returns null. */
export function articleListJsonLd(posts: readonly { slug: string; title: string }[]) {
  if (posts.length < 3) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: posts.map((post, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: post.title,
      url: absolute(`/news/${post.slug}`),
    })),
  };
}

/**
 * `FAQPage` — added 2026-08-12, reversing the note that stood here.
 *
 * ⚠️ The previous decision was not wrong; its premise was narrower than the
 * goal now. It read: "NOT TO BE ADDED: Google removed the documentation on
 * 2026-06-15 and it produces zero rich results for a site like this one."
 * Both halves are still true, and neither is the reason this exists.
 *
 * Rich results are a Google SERP feature. What this markup is for is the
 * other consumer: an assistant grounding an answer to «إيه هي البكالوريا» or
 * «أبدأ منين في البرمجة» reads a page and has to decide what on it is a
 * question and what is its answer. From `<details>`/`<summary>` that is an
 * inference — a good one, usually, but one that competes with every other
 * heading on the page. From `mainEntity[]` it is a labelled pair. Same words,
 * no ambiguity, and the extraction survives the markup being restyled.
 *
 * So the two decisions coexist: do not expect a rich result, and do not
 * remove this because a rich-results test reports nothing. The test that
 * guards this now asserts FAQPage appears ONLY here — every other builder on
 * this surface stays clean, which is what the original note was protecting.
 *
 * ⚠️ Pass the rows the page ACTUALLY renders, never `DEFAULT_ROWS` as a
 * convenience. The admin composes this section (`home_blocks`), so the
 * shipped defaults and the live block drift apart the first time anyone edits
 * it — and structured data describing questions the page does not show is the
 * one failure mode here that is worse than no structured data at all.
 */
/**
 * `DefinedTermSet` — the twelve terms on `/essentials`.
 *
 * The FAQ answers questions about the platform. This answers questions about
 * the subject: «يعني إيه متغير», «الحلقة في البرمجة إيه» — asked constantly, by
 * exactly the beginner this page was written for, and increasingly asked to an
 * assistant rather than to a search box. The page already answers all twelve in
 * one clean sentence each; `DefinedTermSet` is the type that says so.
 *
 * `name` is the Arabic term and `alternateName` the English keyword, in that
 * order and not the reverse: the page is Arabic, the student searches in
 * Arabic, and the English column exists so they recognise the token when they
 * meet it in real code. Both are published because the question arrives in
 * either language.
 *
 * ⚠️ `termUrl` must resolve to a real anchor on the page. The `id` is written
 * from `termSlug` in `essentials-terms.ts` and read here through the same
 * function — do not inline the slugging in either place.
 */
export function definedTermSetJsonLd(
  terms: ReadonlyArray<{ en: string; ar: string; body: string }>,
  termUrl: (term: { en: string; ar: string; body: string }) => string,
) {
  if (terms.length === 0) return null;

  const setId = absolute('/essentials#glossary');
  return {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    '@id': setId,
    name: copy.essentials.listTitle,
    description: copy.essentials.listLead,
    inLanguage: 'ar',
    publisher: { '@id': ORGANIZATION_ID },
    hasDefinedTerm: terms.map((term) => ({
      '@type': 'DefinedTerm',
      name: term.ar,
      alternateName: term.en,
      description: term.body,
      inDefinedTermSet: { '@id': setId },
      url: termUrl(term),
    })),
  };
}

export function faqPageJsonLd(rows: ReadonlyArray<{ questionAr: string; answerAr: string }>) {
  if (rows.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    // Ties the Q&A to the site entity rather than leaving it a free-floating
    // document, for the same reason the `@id`s above exist.
    isPartOf: { '@id': WEBSITE_ID },
    mainEntity: rows.map((row) => ({
      '@type': 'Question',
      name: row.questionAr,
      acceptedAnswer: { '@type': 'Answer', text: row.answerAr },
    })),
  };
}
