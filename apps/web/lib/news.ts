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

/** `null` for a draft or an unknown slug — the API cannot tell them apart, deliberately. */
export async function getNewsPost(slug: string): Promise<NewsPostDetail | null> {
  'use cache';
  cacheLife('hours');
  cacheTag(TAG_NEWS);

  return apiGetOrNull(`/api/news/${encodeURIComponent(slug)}`, NewsPostDetailSchema);
}
