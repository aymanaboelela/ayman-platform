import type { MetadataRoute } from 'next';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { SITE_URL } from '@/lib/seo/jsonld';

/**
 * Every URL a crawler should know about, and no others.
 *
 * ⚠️ `/login`, `/register`, `/dashboard`, `/path`, `/admin` and the lesson
 * player are all absent on purpose. A sitemap is a positive assertion that a
 * URL belongs in the index; listing a `noindex` page here is a direct
 * contradiction, and Search Console reports it as an error rather than
 * quietly ignoring it.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Same reason as generateStaticParams: a sitemap missing its course
  // entries for one build is recoverable; a build that will not complete is not.
  const { courses } = await getCatalogOrEmpty();

  return [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/courses`, changeFrequency: 'daily', priority: 0.9 },
    // The page a bare-name search should land on. High priority and a slow
    // change frequency for the same reason: it is one of the two or three URLs
    // on this site that will not move, and it is the one that answers
    // «أيمن أبو العلا» rather than «منصة أيمن أبو العلا».
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.9 },
    // Static, entirely self-contained, and the natural landing page for
    // "تعلم البرمجة" style queries that are not brand searches.
    { url: `${SITE_URL}/essentials`, changeFrequency: 'monthly', priority: 0.6 },
    // The three year listings are real, permanent routes (`/years/[year]`
    // only accepts 1–3, enforced by `parseYear`), and they were missing here
    // entirely — nothing but the site's own navigation pointed at them.
    ...[1, 2, 3].map((year) => ({
      url: `${SITE_URL}/years/${year}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    // Only published courses are in getCatalog(), so a draft can never be
    // announced here — which is the usual way an unreleased URL leaks.
    ...courses.map((course) => ({
      url: `${SITE_URL}/courses/${course.slug}`,
      // updatedAt, not publishedAt: <lastmod> means "last modified".
      lastModified: new Date(course.updatedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
