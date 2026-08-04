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
 * YouTube, Instagram and TikTok were each verified to resolve 200 at the URL
 * written here. Facebook was not, and cannot be from a server: it answers any
 * non-browser request with 400 regardless of whether the URL is good.
 *
 * ⚠️ The Facebook entry is a SHARE link (`/share/<id>/`), not a profile URL,
 * because that is the form the instructor had to hand. It redirects to the
 * real page in a browser and works, but it is the weakest of the four: a share
 * id is not guaranteed permanent, and Google's guidance asks for the official
 * profile URL. Replace it with `facebook.com/<username>` (or the
 * `profile.php?id=…` permalink) the moment that is known.
 */
const SAME_AS: readonly string[] = [
  'https://www.youtube.com/@2ayman6',
  'https://www.instagram.com/2ayman6',
  'https://www.tiktok.com/@2ayman_6',
  'https://www.facebook.com/share/1H3gmMQBR2/',
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

export function courseJsonLd(course: CourseForJsonLd) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: course.title,
    description: course.subtitle ?? copy.site.tagline,
    url: absolute(`/courses/${course.slug}`),
    inLanguage: 'ar',
    isAccessibleForFree: true,
    educationalLevel: `${course.systemNameAr} — ${course.year}`,
    about: course.subjectNameAr,
    // `@id` ties this back to the one organisation the root layout emits on
    // every page, instead of minting an anonymous second one per course. The
    // name/url stay alongside it so the node is still readable standalone.
    provider: {
      '@type': 'EducationalOrganization',
      '@id': ORGANIZATION_ID,
      name: copy.site.platformName,
      url: SITE_URL,
    },
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
 */
export function courseListJsonLd(courses: readonly CourseForJsonLd[]) {
  if (courses.length < 3) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: courses.map((course, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: courseJsonLd(course),
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

// NOT PRESENT AND NOT TO BE ADDED: FAQPage. Google removed the documentation
// on 2026-06-15 and it produces zero rich results for a site like this one.
// The test above fails if it ever reappears.
