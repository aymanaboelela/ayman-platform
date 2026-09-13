/**
 * IndexNow — the key file (indexnow.org).
 *
 * IndexNow is a push protocol: instead of waiting for a crawler to come back,
 * the site POSTs a list of changed URLs and Bing, Yandex, Seznam and Naver
 * fetch them within hours. **Bing is the one that matters here** — it is the
 * index ChatGPT's search reaches for, so this is the shortest path from
 * publishing an article to an assistant being able to cite it.
 *
 * Google does NOT participate. Its side of this is Search Console, which needs
 * a verification token only the account owner can generate.
 *
 * ## Why the key is committed in plain sight
 *
 * ⚠️ This is NOT a secret and must not be treated as one. The protocol works
 * by having the key readable at a URL on the host: a submitter proves it
 * controls the domain by pointing at this file, and every engine fetches it
 * before accepting a submission. Hiding it in an environment variable would
 * make the file unservable and the whole mechanism inert.
 *
 * The worst a third party can do with it is ask Bing to re-crawl our own URLs.
 * Submissions are rejected for any host that does not serve the key, so it
 * cannot be used against another site.
 *
 * ⚠️ The DIRECTORY NAME is the key, and the body must be the same string.
 * `scripts/indexnow.mjs` reads the key off this directory rather than importing
 * the constant, so renaming the route moves both halves at once — but the
 * `export` below and the folder name still have to agree, and nothing checks
 * that. Rename by moving the folder, never by editing one of the two.
 */
export const INDEXNOW_KEY = 'f13415013728ef05e09cc079e83b86b8';

export function GET(): Response {
  return new Response(INDEXNOW_KEY, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
