import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { getNewsListOrEmpty } from '@/lib/news';
import { SITE_URL } from '@/lib/seo/jsonld';
import { isYearIndexable } from '@/lib/seo/year-visibility';

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
  // Same reason as `/llms.txt`: this reads the same `cacheLife('minutes')`
  // loaders, and a stale prerendered entry re-renders into
  // `DYNAMIC_SERVER_USAGE` instead of a sitemap. A sitemap that intermittently
  // 500s is worse than one rendered per request — Search Console records the
  // failure and backs off crawling.
  await connection();

  // Same reason as generateStaticParams: a sitemap missing its course
  // entries for one build is recoverable; a build that will not complete is not.
  const { courses } = await getCatalogOrEmpty();
  const { posts } = await getNewsListOrEmpty();

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
    // Low priority — nobody searches for these — but present, and that is the
    // point. Google flagged this site under «الصفحات المضلّلة» on 2026-08-06
    // with no sample URLs, and the platform's onboarding asks a minor for
    // their phone number and both parents'. These two pages are the answer;
    // listing them asserts they are meant to be crawled, so the reviewer
    // handling the reconsideration request finds them.
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly' as const, priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'yearly' as const, priority: 0.3 },
    // «نيوز» — the article index. `daily` is a claim about how often the LIST
    // changes, not each article; the articles below say `monthly` because
    // evergreen teaching content genuinely does not move, and telling a
    // crawler otherwise wastes the crawl budget this section exists to earn.
    { url: `${SITE_URL}/news`, changeFrequency: 'weekly' as const, priority: 0.7 },
    /**
     * The year listings — but only the ones that currently have a course, by
     * the same `isYearIndexable` the page's own `generateMetadata` uses to
     * decide `noindex`. See that function for why they must not diverge.
     *
     * All three used to be listed unconditionally, which published two
     * assertions that were not true: as of 2026-08-13 the البكالوريا rollout
     * has not reached year 3 at all, and year 1's course is a second-term one
     * that is not up yet. Both pages render «لسه مفيش كورسات منشورة للصف ده»,
     * and an entry at priority 0.7 tells a crawler that empty page is among the
     * most important on the site.
     *
     * Self-healing in both directions: publish a year-3 course and its page
     * returns here on the next build, with no code change.
     */
    ...[1, 2, 3]
      .filter((year) => isYearIndexable(courses, year))
      .map((year) => ({
        url: `${SITE_URL}/years/${year}`,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
    // Only published courses are in getCatalog(), so a draft can never be
    // announced here — which is the usual way an unreleased URL leaks.
    // Only PUBLISHED articles reach this list — `GET /api/news` filters on
    // status in SQL, so a draft can never be announced here. That is the usual
    // way an unreleased URL leaks.
    ...posts.map((post) => ({
      url: `${SITE_URL}/news/${post.slug}`,
      // `updatedAt`, not `publishedAt`: <lastmod> means "last modified", and
      // an article edited last week should be recrawled.
      lastModified: new Date(post.updatedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    ...courses.map((course) => ({
      url: `${SITE_URL}/courses/${course.slug}`,
      // updatedAt, not publishedAt: <lastmod> means "last modified".
      lastModified: new Date(course.updatedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
