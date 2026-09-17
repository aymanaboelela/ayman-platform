import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { getNewsListOrEmpty } from '@/lib/news';
import { SITE_URL } from '@/lib/seo/jsonld';
import { sitemapLoc } from '@/lib/seo/sitemap-url';
import { isYearIndexable } from '@/lib/seo/year-visibility';

/**
 * The date the copy on the hand-written pages last changed — `/about`,
 * `/essentials`, `/links`, `/privacy`, `/terms`, and the floor for everything
 * else. Those pages render strings from `@ayman/contracts`, which has no
 * `updatedAt` to read.
 *
 * ⚠️ Bump this when you edit that copy, and only then. It is the one value in
 * this file no test can verify — a wrong date here is a claim to every crawler
 * that a page it already has is unchanged.
 */
/*
 * 2026-09-16 — `/privacy` («المنصة مجانية ومفيش أي مدفوعات» came out, it had
 * been false since checkout shipped) and the new `/subscribe`.
 *
 * ⚠️ It was missed on the day those shipped, which is the exact failure the
 * warning above describes: for a day the sitemap told every crawler that a page
 * whose copy had just been corrected — and a page that had not existed at
 * all — were both unchanged since the 13th. A new URL carrying a `lastmod`
 * from before it existed is the worst version of this: there is no cached copy
 * for the date to be compared against, so the only thing it can do is make the
 * URL look stale on arrival.
 */
const EDITORIAL_LAST_MODIFIED = new Date('2026-09-16T00:00:00.000Z');

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

  /**
   * `<lastmod>` for the pages that are not a row in a table.
   *
   * ⚠️ Every static entry below used to carry NO `lastModified` at all — only
   * the course and article entries had one. An AI-readiness scan on 2026-09-13
   * scored the sitemap 8/15 for it, and the deeper cost is that a crawler with
   * no last-modified date has to refetch the page to find out whether it moved.
   *
   * ⚠️ And it must NOT be `new Date()`. This route renders per request, so
   * "now" would tell every crawler that every page on the site changed seconds
   * ago, on every crawl, forever. That is not a small inaccuracy — it is the
   * signal that gets a sitemap's dates ignored wholesale.
   *
   * So: pages whose content comes from the database take the newest date of the
   * rows they render, and pages whose content is written in this repository
   * take `EDITORIAL_LAST_MODIFIED` — a hand-maintained constant.
   *
   * ⚠️ Bump `EDITORIAL_LAST_MODIFIED` when the COPY on those pages changes.
   * Nothing can check this for you: the copy lives in `@ayman/contracts` and a
   * date in this file has no relationship to it that a test could assert.
   */
  const newest = (dates: readonly string[], fallback: Date): Date => {
    const times = dates.map((date) => new Date(date).getTime()).filter((t) => !Number.isNaN(t));
    return times.length > 0 ? new Date(Math.max(...times)) : fallback;
  };

  const coursesModified = newest(
    courses.map((course) => course.updatedAt),
    EDITORIAL_LAST_MODIFIED,
  );
  const postsModified = newest(
    posts.map((post) => post.updatedAt),
    EDITORIAL_LAST_MODIFIED,
  );
  // The landing page renders the course grid and the books strip, so it is at
  // least as new as the newest thing on it.
  const homeModified = new Date(
    Math.max(coursesModified.getTime(), postsModified.getTime(), EDITORIAL_LAST_MODIFIED.getTime()),
  );

  return [
    { url: `${SITE_URL}/`, lastModified: homeModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/courses`, lastModified: coursesModified, changeFrequency: 'daily', priority: 0.9 },
    // The page a bare-name search should land on. High priority and a slow
    // change frequency for the same reason: it is one of the two or three URLs
    // on this site that will not move, and it is the one that answers
    // «أيمن أبو العلا» rather than «منصة أيمن أبو العلا».
    { url: `${SITE_URL}/about`, lastModified: EDITORIAL_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.9 },
    // Static, entirely self-contained, and the natural landing page for
    // "تعلم البرمجة" style queries that are not brand searches.
    { url: `${SITE_URL}/essentials`, lastModified: EDITORIAL_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.6 },
    // «إزاي أشترك؟» — the answer to a high-intent question that had no public
    // page at all. `monthly`: the steps change when the checkout does, which is
    // rarely, and the rails it names are read live rather than written here.
    { url: `${SITE_URL}/subscribe`, lastModified: EDITORIAL_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.6 },
    // «قسم الكتب» — a real commercial page and the answer to «كتاب أيمن أبو
    // العلا», so it sits with the catalogue rather than with the hub pages
    // below. `weekly`, not `monthly`: prices and stock move, and a crawler that
    // has cached a withdrawn title is showing a price nobody can pay.
    { url: `${SITE_URL}/books`, lastModified: coursesModified, changeFrequency: 'weekly', priority: 0.8 },
    // «كل اللينكات» — the URL that lives in the YouTube, Instagram, TikTok and
    // Facebook bios. Listed, and at a modest priority, on purpose: it is a hub
    // of links rather than a page of content, so it should not outrank the
    // pages it points at — but it is the best answer this site has to a query
    // like «قناة أيمن أبو العلا على واتساب», and a URL printed in four public
    // bios is one a crawler will find regardless. Better to declare it than to
    // have it discovered.
    { url: `${SITE_URL}/links`, lastModified: EDITORIAL_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.5 },
    // Low priority — nobody searches for these — but present, and that is the
    // point. Google flagged this site under «الصفحات المضلّلة» on 2026-08-06
    // with no sample URLs, and the platform's onboarding asks a minor for
    // their phone number and both parents'. These two pages are the answer;
    // listing them asserts they are meant to be crawled, so the reviewer
    // handling the reconsideration request finds them.
    { url: `${SITE_URL}/privacy`, lastModified: EDITORIAL_LAST_MODIFIED, changeFrequency: 'yearly' as const, priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: EDITORIAL_LAST_MODIFIED, changeFrequency: 'yearly' as const, priority: 0.3 },
    // «نيوز» — the article index. `daily` is a claim about how often the LIST
    // changes, not each article; the articles below say `monthly` because
    // evergreen teaching content genuinely does not move, and telling a
    // crawler otherwise wastes the crawl budget this section exists to earn.
    { url: `${SITE_URL}/news`, lastModified: postsModified, changeFrequency: 'weekly' as const, priority: 0.7 },
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
        lastModified: coursesModified,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
    // Only published courses are in getCatalog(), so a draft can never be
    // announced here — which is the usual way an unreleased URL leaks.
    // Only PUBLISHED articles reach this list — `GET /api/news` filters on
    // status in SQL, so a draft can never be announced here. That is the usual
    // way an unreleased URL leaks.
    /*
     * ⚠️ `sitemapLoc` on the two entries built from a DATABASE string. Next
     * writes `<loc>` unescaped and an article slug may legally contain `&` —
     * see `lib/seo/sitemap-url.ts` for why one such slug would take the whole
     * document down rather than its own row. The static entries above are
     * literals in this file and need nothing.
     */
    ...posts.map((post) => ({
      url: sitemapLoc(`${SITE_URL}/news/${post.slug}`),
      // `updatedAt`, not `publishedAt`: <lastmod> means "last modified", and
      // an article edited last week should be recrawled.
      lastModified: new Date(post.updatedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    ...courses.map((course) => ({
      url: sitemapLoc(`${SITE_URL}/courses/${course.slug}`),
      // updatedAt, not publishedAt: <lastmod> means "last modified".
      lastModified: new Date(course.updatedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
