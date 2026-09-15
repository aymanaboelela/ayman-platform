import { INDEXNOW_KEY } from '@/app/f13415013728ef05e09cc079e83b86b8.txt/route';
import { SITE_URL } from '@/lib/seo/jsonld';

/**
 * IndexNow, fired the moment something is published.
 *
 * ## Why this exists on top of `scripts/indexnow.mjs`
 *
 * The script submits the whole sitemap and somebody has to run it. In practice
 * nobody does, so publishing an article still meant waiting for a crawler —
 * days to weeks — which is the delay the key file was added to remove. The
 * push only pays for itself if it happens without anyone remembering.
 *
 * **Bing is the reason.** It is the index ChatGPT's search reads, so this is
 * the shortest path from «نشرنا مقال» to an assistant being able to cite it.
 * Yandex, Seznam and Naver share the same endpoint. Google does not
 * participate at all; its side is Search Console, which needs a human.
 *
 * ## The rules this has to obey
 *
 * ⚠️ It must NEVER fail the action that triggered it. Publishing an article is
 * the user's work; a search engine being unreachable is not their problem and
 * must not surface as a save that appears to have failed. Every path here
 * swallows its error.
 *
 * ⚠️ It must never DELAY the action either — which is what `after()` is for.
 * A floating promise in a server action is not guaranteed to run to completion;
 * `after()` is Next's supported way to say "do this once the response is
 * sent", and it keeps the request alive long enough for the POST to land.
 *
 * ⚠️ Submit ONLY URLs that are in the sitemap. IndexNow is a positive
 * assertion that a URL belongs in an index, exactly like `<lastmod>`, and the
 * fastest way to get a host's submissions ignored is to push URLs that answer
 * 404 or carry `noindex`. That is why the callers pass a published article's
 * path and never a draft's.
 */

/** Every participating engine reads from this one endpoint. */
const ENDPOINT = 'https://api.indexnow.org/IndexNow';

/**
 * ⚠️ The submission is only accepted from a host that SERVES the key, and a
 * host nobody outside can resolve cannot serve it. So `localhost` and any
 * plain-http origin are skipped rather than attempted: a dev save would
 * otherwise spend a network timeout per publish and log a rejection that looks
 * like a misconfiguration.
 *
 * This is also what keeps a preview deploy from submitting production's URLs
 * under production's key — a preview has its own host, fails this test only if
 * it is http, and otherwise submits its OWN urls, which is harmless and
 * correct.
 */
function submittableOrigin(): string | null {
  try {
    const origin = new URL(SITE_URL);
    if (origin.protocol !== 'https:') return null;
    if (origin.hostname === 'localhost' || origin.hostname === '127.0.0.1') return null;
    return origin.hostname;
  } catch {
    return null;
  }
}

/**
 * Push a set of just-changed PATHS (`/news/…`, `/courses/…`) to IndexNow.
 *
 * Returns whether a submission was actually attempted, which is what the test
 * asserts on — the call is fire-and-forget everywhere else.
 */
export async function submitToIndexNow(paths: readonly string[]): Promise<boolean> {
  const host = submittableOrigin();
  if (host === null || paths.length === 0) return false;

  const urlList = [...new Set(paths)].map((path) => `${SITE_URL}${path}`);

  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host,
        key: INDEXNOW_KEY,
        // Spelled out rather than left implicit. The engines will look for the
        // key at the host root anyway, but a submission naming its key
        // location is accepted by every implementation and ambiguous to none.
        keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
        urlList,
      }),
      // A search engine is not in the critical path of anything. If it has not
      // answered in ten seconds the publish is long since done.
      signal: AbortSignal.timeout(10_000),
    });
    return true;
  } catch {
    // Deliberately silent — see the header. A rejected or unreachable
    // submission costs a slower first crawl and nothing else, and the article
    // is already live either way.
    return false;
  }
}
