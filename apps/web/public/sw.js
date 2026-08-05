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
 *     change whenever their bytes do, plus one offline page that is identical
 *     for every visitor and contains nothing personal.
 *
 * That is a real cost: this app does not work offline. Opening it on the
 * underground shows the offline page, not yesterday's lesson. Offline reading
 * of course content is a genuine feature worth building, but it needs the
 * content deliberately exported per signed-in student, not a cache that
 * silently keeps whatever the last request happened to return.
 */

const VERSION = 'v1';
const STATIC_CACHE = `ayman-static-${VERSION}`;
const OFFLINE_URL = '/offline';

/*
 * Precached on install so the offline page is available the FIRST time the
 * network drops, rather than only after the student has already visited it.
 * The icons come along because the offline page shows the mark.
 */
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png'];

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
   * Content-addressed assets only. `/_next/static/*` filenames contain a hash
   * of their own contents, so a cached entry can never be "stale" — a changed
   * file is a changed URL. Cache-first is therefore correct AND safe, and it is
   * what makes a repeat visit cheap on a phone.
   */
  const isImmutable =
    url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/');

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
          cache.put(request, response.clone());
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
