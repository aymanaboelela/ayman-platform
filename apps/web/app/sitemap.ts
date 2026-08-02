import type { MetadataRoute } from 'next';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { SITE_URL } from '@/lib/seo/jsonld';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Same reason as generateStaticParams: a sitemap missing its course
  // entries for one build is recoverable; a build that will not complete is not.
  const { courses } = await getCatalogOrEmpty();

  return [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/courses`, changeFrequency: 'daily', priority: 0.9 },
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
