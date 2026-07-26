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

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: copy.site.name,
    url: SITE_URL,
    description: copy.site.tagline,
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
    provider: { '@type': 'Organization', name: copy.site.name, url: SITE_URL },
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
