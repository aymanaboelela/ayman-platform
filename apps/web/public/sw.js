/*
 * The service worker — the one piece `app/manifest.ts` says is missing.
 *
 * Chrome will not offer "install" without a service worker that has a fetch
 * handler, no matter how complete the manifest is. That is the whole reason
 * this file exists, and it deliberately does the SMALLEST amount of work that
 * earns it.
 *
 * ## What this must never do, on this product specifically
 *
 * This is a platform people sign into, and a phone gets handed around. A
 * service worker that caches an HTML response caches it for the DEVICE, not
 * for the session — so caching `/dashboard` would let the next person to open
 * the app on that phone read the previous student's progress, offline, after a
 * sign-out, with nothing on screen to suggest it was stale. The Cache API is
 * not partitioned by cookie and does not expire when a session does.
 *
 * So:
 *   - No HTML is ever written to the cache. Not one page.
 *   - No `/api/*` response is ever written to the cache.
 *   - The ONLY things cached are content-addressed static assets, whose URLs
 *     change whenever their bytes do, plus one offline page — identical for
 *     every visitor, containing nothing personal — and the single icon that
 *     page renders.
 *
 * That is a real cost: this app does not work offline. Opening it on the
 * underground shows the offline page, not yesterday's lesson. Offline reading
 * of course content is a genuine feature worth building, but it needs the
 * content deliberately exported per signed-in student, not a cache that
 * silently keeps whatever the last request happened to return.
 */

/*
 * Bumped BY HAND, and it can only be bumped by hand.
 *
 * A browser installs a new worker when the BYTES of `/sw.js` change, and this
 * is a static file no build step rewrites — apps/web's build is
 * `node scripts/vendor-pyodide.mjs && next build`, and `scripts/` holds that
 * one file and nothing else. So `activate` below, and the purge inside it, run
 * on the deploys that edit THIS file and on no others.
 *
 * The obvious repair is to register as `/sw.js?v=<build id>`, so that every
 * deploy looks like a new worker and the purge runs every time. That does not
 * work here, and it is worth writing down why so nobody spends the afternoon
 * finding out again:
 *
 *   - `process.env.NEXT_DEPLOYMENT_ID` is defined as the literal `false` in the
 *     client bundle unless `deploymentId` is set in `next.config.ts`
 *     (`next/dist/build/define-env.js` — `!config.deploymentId` ⇒ `false`), and
 *     it is not set. It is a Vercel-ism; this app deploys to a VPS.
 *   - The App Router's build id never reaches client code. It arrives in the
 *     initial flight payload and is handed to `setNavigationBuildId` inside
 *     Next's own client runtime, reachable only by deep-importing
 *     `next/dist/client/navigation-build-id` — an internal path with no
 *     stability promise.
 *   - `apps/web/Dockerfile` forwards only `NEXT_PUBLIC_APP_URL` and
 *     `NEXT_PUBLIC_MEDIA_ORIGIN` as build args, neither of which changes when
 *     the code does.
 *
 * Getting a real per-deploy token into the browser is a Dockerfile and
 * docker-compose change, not a change to this file. Until someone makes it,
 * a version bump is a coarse, occasional reset — which is why the cache is
 * BOUNDED as well as versioned. See MAX_ASSET_ENTRIES.
 */
const VERSION = 'v2';
const STATIC_CACHE = `ayman-static-${VERSION}`;
const OFFLINE_URL = '/offline';
const OFFLINE_MARK = '/icons/icon-192.png';

/*
 * Precached on install so the offline page is available the FIRST time the
 * network drops, rather than only after the student has already visited it.
 * The mark comes along because the offline page renders it, and `next/image`
 * is unavailable there by construction — see `app/offline/page.tsx`.
 */
const PRECACHE = [OFFLINE_URL, OFFLINE_MARK];

/*
 * How many hashed assets this cache may hold, PRECACHE excluded.
 *
 * Every deploy ships a fresh set of content-hashed `/_next/static/` URLs, and
 * a cache-first worker adds each one the student happens to load. Nothing ever
 * takes the previous set out again: those URLs are never requested a second
 * time, so they are never overwritten, and the purge in `activate` only fires
 * when this file changes. On a 32 GB Android with a few hundred MB free that
 * ends the same way every time — the browser evicts the ORIGIN's storage
 * wholesale, and the precached offline page, the single thing this worker
 * exists to provide, is the first casualty.
 *
 * A count and not a byte budget, because the Cache API exposes no size per
 * entry and `storage.estimate()` reports the whole origin rather than this
 * cache. Chunks here run from a few KB to roughly 100 KB, so 150 entries is a
 * ceiling in the low tens of MB, and comfortably more than one build's worth
 * of the chunks any single student actually loads: a returning student still
 * finds a warm cache, and what gets dropped is the builds behind the current
 * one.
 */
const MAX_ASSET_ENTRIES = 150;

/*
 * Collapses a burst of writes into one scan. A cold load writes dozens of
 * chunks within a second or two, and each one would otherwise pay for a full
 * `cache.keys()`. Writes that land while a scan is in flight ride along with
 * it and may not be seen by it; the next load trims them, and being a handful
 * of entries over the ceiling for one visit costs nothing.
 */
let trimInFlight = null;

/**
 * Drops the oldest entries once the cache is over budget.
 *
 * `cache.keys()` resolves in insertion order, and `put` on a URL already
 * present deletes before it appends — so the front of the list is the least
 * recently WRITTEN entry. For content-hashed URLs, written exactly once on the
 * first load after the deploy that shipped them, that means the oldest build.
 * It is the right thing to evict and the closest to an LRU the Cache API
 * offers: there is no read timestamp to sort on.
 *
 * PRECACHE is held back explicitly rather than trusted to survive. Those
 * entries sit at the very front — written during install, before any asset —
 * so a plain "delete the first N" would take the offline page first, every
 * single time.
 */
async function trimAssetCache(cache) {
  const keys = await cache.keys();
  const evictable = keys.filter((request) => !PRECACHE.includes(new URL(request.url).pathname));
  const overflow = evictable.length - MAX_ASSET_ENTRIES;
  if (overflow <= 0) return;
  await Promise.all(evictable.slice(0, overflow).map((request) => cache.delete(request)));
}

function trimAssetCacheOnce(cache) {
  trimInFlight ??= trimAssetCache(cache).finally(() => {
    trimInFlight = null;
  });
  return trimInFlight;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // `addAll` rejects the whole install if any single entry 404s, which
      // would leave the worker permanently un-installed. These are individually
      // tolerant instead: a missing icon must not cost the offline page.
      await Promise.all(
        PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})),
      );
      // Take over immediately rather than waiting for every tab to close.
      // Safe here BECAUSE nothing personal is cached: the worst a mid-session
      // takeover can do is start serving hashed assets from disk.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop every cache from an older VERSION. Without this, bumping the
      // version leaves the old bytes on the device forever.
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('ayman-static-') && name !== STATIC_CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Anything that is not a plain GET can only be a write. Passing it straight
  // through keeps this worker out of the CSRF path entirely.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Another origin's problem — media lives on a different host BY DESIGN (see
  // the API's boot check), and re-serving it from this origin is exactly the
  // thing that separation exists to prevent.
  if (url.origin !== self.location.origin) return;

  // Never the API. Not read-through, not stale-while-revalidate, not at all:
  // every one of these responses is scoped to a session.
  if (url.pathname.startsWith('/api/')) return;

  /*
   * The offline page's mark, and only it.
   *
   * Stale-while-revalidate rather than cache-first, because unlike a chunk this
   * file sits at a STABLE path: the precached copy is answered immediately so
   * the offline page paints its mark with no network — the entire reason it is
   * precached — and the network copy replaces it in the background so that
   * redrawing the mark reaches a student on their next ONLINE load rather than
   * never. Cache-first would pin it: `app/manifest.ts` names this same file as
   * `icons[0]`, so a pinned copy is also what an install prompt would show.
   */
  if (url.pathname === OFFLINE_MARK) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(request);
        const fresh = fetch(request).then(async (response) => {
          if (response.ok && response.status === 200) {
            const cache = await caches.open(STATIC_CACHE);
            await cache.put(request, response.clone());
          }
          return response;
        });

        if (hit) {
          // Held open past the response, or terminating the worker the moment
          // it answers would cancel the revalidation every time.
          event.waitUntil(fresh.catch(() => {}));
          return hit;
        }
        // No precached copy — the install is individually tolerant of a 404 on
        // this file, so that is a state that can really happen. Behave exactly
        // as if there were no worker.
        return fresh;
      })(),
    );
    return;
  }

  /*
   * Content-addressed assets only. `/_next/static/*` filenames contain a hash
   * of their own contents, so a cached entry can never be "stale" — a changed
   * file is a changed URL. Cache-first is therefore correct AND safe, and it is
   * what makes a repeat visit cheap on a phone.
   *
   * `/icons/` used to be part of this test and deliberately is not any more:
   * the sentence above is false for it. `icon-192.png`, `icon-512.png` and
   * `maskable-512.png` are stable paths — `app/manifest.ts` writes them out
   * literally — so replacing the artwork changes the bytes and not the URL, and
   * cache-first served every returning student the old mark for as long as the
   * entry survived, with no way to invalidate it short of editing this file.
   * The two 512s are only ever fetched by the browser's manifest handling and
   * need no cached copy at all; the 192 is handled above, on its own terms.
   */
  const isImmutable = url.pathname.startsWith('/_next/static/');

  if (isImmutable) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(request);
        if (hit) return hit;

        const response = await fetch(request);
        // Only store a clean 200. An opaque or partial response cached here
        // would be indistinguishable from the real thing on the next load.
        if (response.ok && response.status === 200) {
          const cache = await caches.open(STATIC_CACHE);
          // Held open past the response so neither the write nor the trim is
          // cancelled when the worker is terminated a moment after answering.
          // The trim runs even when the write failed, because the way a write
          // fails here is a quota error — the exact moment trimming matters.
          event.waitUntil(
            cache
              .put(request, response.clone())
              .catch(() => {})
              .then(() => trimAssetCacheOnce(cache))
              .catch(() => {}),
          );
        }
        return response;
      })(),
    );
    return;
  }

  /*
   * Everything else — every page — goes to the network, every time, and is
   * never written to the cache. The offline page is served only when the
   * network actually fails, and only for a navigation, so a failed sub-request
   * cannot replace part of a page with it.
   */
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const offline = await caches.match(OFFLINE_URL);
          return (
            offline ??
            new Response('', { status: 503, statusText: 'Offline' })
          );
        }
      })(),
    );
  }
});
