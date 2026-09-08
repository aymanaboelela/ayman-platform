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
 * The cache version — the BUILD that registered this worker, not a number
 * somebody has to remember to bump.
 *
 * ## What it was, and what that cost
 *
 * A hand-written `'v4'`. A browser installs a new worker when the BYTES of
 * `/sw.js` change, and this is a static file no build step rewrites — apps/web's
 * build is `node scripts/vendor-pyodide.mjs && next build`, and `scripts/` holds
 * that one file and nothing else. So `activate` below, and the purge inside it,
 * ran on the deploys that edited THIS file and on no others. Every deploy in
 * between left its `/_next/static/` chunks on the device with nothing to take
 * them out again; the only thing keeping that from filling a phone was
 * MAX_ASSET_ENTRIES evicting by insertion order.
 *
 * The comment that stood here named the obvious repair — register as
 * `/sw.js?v=<build id>` so every deploy looks like a new worker — and listed
 * three reasons it could not be done: `process.env.NEXT_DEPLOYMENT_ID` compiles
 * to the literal `false` with no `deploymentId` in `next.config.ts`, the App
 * Router build id never reaches client code, and `apps/web/Dockerfile` forwarded
 * only `NEXT_PUBLIC_*` args that do not change when the code does. It closed by
 * saying the fix was a Dockerfile change rather than a change to this file.
 *
 * It was, and that change is made. The Dockerfile computes a token in the same
 * layer that runs `next build` — so it changes when the code does and only then
 * — and passes it as `NEXT_PUBLIC_BUILD_ID`, which is an ordinary inlined
 * string. `service-worker-register.tsx` puts it in the query.
 *
 * ⚠️ It is NOT wired to Next's `deploymentId`, deliberately: that would put
 * `?dpl=` on every asset URL and break the premise the cache-first branch below
 * rests on — "a changed file is a changed URL" — by changing every URL on every
 * deploy. See `next.config.ts`.
 *
 * ## Reading it back out
 *
 * `self.location` for a service worker is its own script URL, query included, so
 * the worker can read the token it was registered with. No build step rewrites
 * this file, which is precisely why the value has to arrive by URL.
 *
 * The `'v4'` fallback covers the two cases with no token: `next dev`, and a
 * device whose registration predates this change. Both behave exactly as they
 * did — one cache name, purged only when this file's bytes change.
 *
 * ⚠️ WHEN the previous build's chunks come off the device is not decided here.
 * It is decided by the absence of `skipWaiting()` in `install` — read that.
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'v4';
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

/**
 * The name of the cache belonging to the worker currently in charge — read off
 * that worker's own script URL, which is where its VERSION came from.
 *
 * `null` on a first install (nothing is in charge yet) and for a registration
 * that predates the `?v=` query, whose cache is the `'v4'` fallback.
 */
function activeCacheName() {
  const active = self.registration.active;
  if (!active) return null;
  try {
    return `ayman-static-${new URL(active.scriptURL).searchParams.get('v') || 'v4'}`;
  } catch {
    return null;
  }
}

/**
 * Drops every `ayman-static-*` cache except the two that can legitimately be in
 * use: the one this worker is about to serve from, and the one the worker
 * currently in charge is serving from.
 *
 * ⚠️ This runs in `install`, not only in `activate`, and that is the whole of
 * the storage bound.
 *
 * `activate` also purges — and with `skipWaiting()` gone (see below) it may not
 * run for a long time, because the browser holds a new worker in `waiting` for
 * as long as ANY tab from the previous build is still open. A student who never
 * closes the app would therefore accumulate one `ayman-static-<buildId>` per
 * deploy, unpurged, forever. `MAX_ASSET_ENTRIES` bounds each cache and does
 * nothing about how many there are, so the origin-wide eviction that constant
 * exists to prevent — the one that takes the offline page with it — would come
 * straight back by another route.
 *
 * Two, not one, and not "the newest N": the second name is computed from the
 * active worker rather than guessed, so this cannot delete a build somebody is
 * running no matter how many deploys they have slept through.
 */
async function purgeOtherBuilds() {
  const keep = new Set([STATIC_CACHE]);
  const active = activeCacheName();
  if (active) keep.add(active);

  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith('ayman-static-') && !keep.has(name))
      .map((name) => caches.delete(name)),
  );
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
      // Swallowed: a purge that fails is wasted disk, and failing the install
      // over it would cost the offline page that was just written.
      await purgeOtherBuilds().catch(() => {});
    })(),
  );
});

/*
 * ⚠️ There is deliberately NO `self.skipWaiting()` above any more, and it is
 * the single line that makes the per-build cache version safe.
 *
 * It used to be there, with the note "take over immediately rather than waiting
 * for every tab to close — safe here BECAUSE nothing personal is cached". That
 * reasoning was about privacy and it still holds; what changed is that the
 * takeover now has a SECOND consequence it did not have when VERSION was a
 * hand-bumped constant.
 *
 * `activate` purges every cache whose name is not the current one. With VERSION
 * derived from the build, "not the current one" means "the build the open tab is
 * still running". So `skipWaiting` would now mean: deploy, the new worker takes
 * over a tab that is mid-lesson, and that tab's chunks are deleted from the
 * device — at the same moment the container that could re-serve them has been
 * replaced. The next dialog, player or panel that tab lazy-loads asks for a file
 * neither the cache nor the server has. It would have made «المستخدمين يفضلوا
 * فاتحين الأبليكيشن» strictly worse than the stale cache it was fixing.
 *
 * Without it the browser holds the new worker in `waiting` until no client is
 * controlled by the old one — i.e. until every tab from the previous build has
 * gone. Then it activates and the purge is, by construction, only ever deleting
 * builds nothing is using.
 *
 * What that costs: a student who never closes the tab keeps the old worker.
 * That is a worker whose entire job is serving content-addressed assets and one
 * offline page, so "old" costs them nothing — and their tab still picks up the
 * new BUILD, because Next answers a build-id mismatch on the next navigation
 * with a full document load (`fetch-server-response.js`), and
 * `lib/stale-deploy.ts` catches the two failure shapes that get there first.
 *
 * `clients.claim()` in `activate` stays. It is not the same thing: it only runs
 * once this worker has actually been allowed to activate, and it is what makes a
 * FIRST install control the page that installed it.
 */

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop every cache from an older VERSION. Without this, bumping the
      // version leaves the old bytes on the device forever.
      //
      // Reaching here means the previous worker has been released — every tab
      // from that build is gone — so `activeCacheName()` inside
      // `purgeOtherBuilds` now resolves to this worker and the "keep two" set
      // collapses to one. That is why this is the same call `install` makes
      // rather than a second, laxer copy of the rule: the two moments differ in
      // what is still in use, not in what the rule is.
      await purgeOtherBuilds().catch(() => {});
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
   *
   * ⚠️ ONE RETRY BEFORE GIVING UP, and it is the whole of a reported bug.
   *
   * A single rejected `fetch` was treated as "this device is offline", and it
   * is not: the other thing that rejects a navigation here is US. Every deploy
   * has a window where the old container has stopped and the new one has not
   * finished starting, and Traefik has no backend to route to — the runbook
   * says so in as many words ("الـ 404 لثواني وقت النشر طبيعي — دي الحاوية
   * القديمة وقفت والجديدة لسه بتقوم"). For those seconds a student on full 4G
   * was shown «مفيش نت دلوقتي» and two buttons, and the fix they found for
   * themselves was to press «حاول تاني» — «لازم أعمل try again عشان تشتغل
   * كويس».
   *
   * If pressing the button by hand works, the worker can press it. One retry,
   * after a short pause, costs a genuinely-offline student about half a second
   * on a screen they were going to get anyway, and costs a student caught in a
   * deploy window nothing at all — they never see the screen.
   *
   * Deliberately ONE retry and not a loop. This runs before anything is
   * painted, so every attempt is time the student spends looking at the
   * previous page with a spinner; a worker that kept trying would reproduce the
   * infinite-loading complaint that `lib/api.ts` bounds on the server side.
   */
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          // Long enough for a container to finish binding its port, short
          // enough not to read as a hang.
          // `self.setTimeout`: a worker's global is `self`, and the lint config
          // for this file registers the service-worker globals rather than the
          // browser's.
          await new Promise((resolve) => self.setTimeout(resolve, 600));
          try {
            return await fetch(request);
          } catch {
            const offline = await caches.match(OFFLINE_URL);
            return (
              offline ??
              new Response('', { status: 503, statusText: 'Offline' })
            );
          }
        }
      })(),
    );
  }
});

/*
 * Web Push — the leg that reaches this browser with no tab open at all.
 *
 * `PushService.notifyUser` (apps/api) sends a JSON body of `{ title, body,
 * url, tag }`, already resolved into Arabic prose server-side by
 * `push-text.ts` — this handler's whole job is turning that into
 * `showNotification` and nothing more. No copy table here and no per-kind
 * branching: a new admin kind that wants push is a `case` added to
 * `push-text.ts`, not a code change on every device that already installed
 * this worker.
 *
 * `icon`/`badge` are constants rather than carried on the payload — every
 * push from this platform shows the same mark, and a per-notification image
 * would spend bytes of a payload Web Push caps at 4 KB on a picture that
 * would look identical every time anyway. This is the «صورة» the toggle
 * promises: a bare-text push with no icon is the thing that reads as broken.
 */
const NOTIFICATION_ICON = '/icons/icon-192.png';

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // A payload that is not JSON — not a shape this platform's own sender
    // ever produces, but a malformed push must still show SOMETHING rather
    // than silently do nothing, which reads to him as "it never arrived"
    // with no way to tell why.
    data = {};
  }

  const title = typeof data.title === 'string' && data.title ? data.title : 'إشعار جديد';
  const url = typeof data.url === 'string' && data.url ? data.url : '/admin';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : '',
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_ICON,
      // Collapses repeats in the OS tray — the same reason
      // `notification-stream.tsx`'s own `tag` does for the toast twin of
      // this, three questions in a minute replace one another instead of
      // stacking three times.
      tag: typeof data.tag === 'string' && data.tag ? data.tag : 'ayman-push',
      lang: 'ar',
      dir: 'rtl',
      data: { url },
    }),
  );
});

/*
 * Clicking the notification. Focuses an already-open tab on the right page
 * rather than always opening a new one, the same instinct
 * `notification-stream.tsx`'s own toast action has (`router.push` there) —
 * just reached from the one context that can act with no tab open at all.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/admin';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      // An open tab already on that exact page — focus it rather than
      // adding a second one.
      for (const client of allClients) {
        // `client.url` is always absolute; `url` here is app-relative, so it
        // is resolved against this worker's own origin before comparing.
        if (new URL(client.url).pathname === url && 'focus' in client) {
          return client.focus();
        }
      }

      // No tab on that exact page, but a DIFFERENT open tab still beats a
      // fresh window — reuses it rather than adding a second app instance to
      // the taskbar — and navigates it there.
      const existing = allClients.find((client) => 'focus' in client);
      if (existing) {
        await existing.focus();
        return 'navigate' in existing ? existing.navigate(url) : undefined;
      }

      return self.clients.openWindow(url);
    })(),
  );
});
