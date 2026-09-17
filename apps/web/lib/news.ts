import { cacheLife, cacheTag } from 'next/cache';
import { NewsListSchema, NewsPostDetailSchema } from '@ayman/contracts';
import type { NewsList, NewsPostDetail } from '@ayman/contracts';
import { apiGet, apiGetOrNull } from '@/lib/api';
import { TAG_NEWS } from '@/lib/cache-tags';

/**
 * «نيوز» — the public articles section, read side.
 *
 * ⚠️ With `cacheComponents: true`, `fetch` is NOT cached by default and blocks
 * rendering. These three are the `'use cache'` boundary for the section; a
 * page that calls the API outside one of them is a page that hits Postgres on
 * every crawler request — and the entire point of this section is that
 * crawlers hit it a lot.
 *
 * `cacheLife('hours')` rather than `'minutes'`: an article changes when it is
 * edited, which is rare, and `TAG_NEWS` is invalidated explicitly on every
 * publish so freshness never depends on the clock.
 */
export async function getNewsList(): Promise<NewsList> {
  'use cache';
  cacheLife('hours');
  cacheTag(TAG_NEWS);
  return apiGet('/api/news', NewsListSchema);
}

/**
 * The failure-tolerant variant, for surfaces that must render whether or not
 * the API answers — the sitemap and `llms.txt`, both of which are read by
 * crawlers and must not 500 on a transient blip.
 *
 * The `try` has to be INSIDE the `'use cache'` body: an error thrown while a
 * cached function is executing surfaces to the caller as an opaque digest that
 * React re-throws during render, so a `try/catch` at the call site never sees
 * it. Same reasoning as `getCatalogOrEmpty`, and `cacheLife('minutes')` for
 * the same reason too — this caches its own failures, and a restart must not
 * blank the section for the rest of the day.
 */
export async function getNewsListOrEmpty(): Promise<NewsList> {
  'use cache';
  cacheLife('minutes');
  cacheTag(TAG_NEWS);

  try {
    return await apiGet('/api/news', NewsListSchema);
  } catch {
    return { posts: [], total: 0 };
  }
}

/**
 * ⚠️ The route param is normalised before it is used, and Arabic slugs are the
 * reason this is not optional.
 *
 * `/news/[slug]` hands its param to `generateMetadata` DECODED and to the page
 * component still PERCENT-ENCODED. For an ASCII slug the two strings are
 * identical and nothing shows. For the Arabic slugs this section exists to
 * serve, `encodeURIComponent` on the already-encoded value double-encodes it,
 * `GET /api/news/:slug` 404s, and the page calls `notFound()` — while its own
 * `<title>` and `<meta description>` render correctly, because those came from
 * the metadata pass that got the good string.
 *
 * The failure is close to invisible: the article is in `GET /api/news`, on the
 * index, and in the sitemap; only its own URL is blank, and it answers 200 —
 * a soft 404 that a crawler indexes as an empty page.
 *
 * Decoding first is idempotent for an already-decoded slug. The `catch` covers
 * a lone `%`, which `NewsSlugSchema` permits (it only forbids `/`, `.` and
 * whitespace) and which `decodeURIComponent` throws on.
 */
export function newsPostPath(slug: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    decoded = slug;
  }
  return `/api/news/${encodeURIComponent(decoded)}`;
}

/**
 * `null` for a draft or an unknown slug — the API cannot tell them apart,
 * deliberately.
 *
 * The path is built OUTSIDE the cached function rather than inside it, and
 * that is the point: the encoded and the decoded spelling of one Arabic slug
 * would otherwise be two cache keys for the same article, so every article
 * would be fetched and stored twice.
 */
export async function getNewsPost(slug: string): Promise<NewsPostDetail | null> {
  return getNewsPostByPath(newsPostPath(slug));
}

async function getNewsPostByPath(path: string): Promise<NewsPostDetail | null> {
  'use cache';
  cacheLife('hours');
  cacheTag(TAG_NEWS);

  return apiGetOrNull(path, NewsPostDetailSchema);
}
