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
 * ⚠️ WHEN the previous build's chunks come off the device is decided by the
 * build registry below (`purgeBuildsNobodyRuns`): as soon as no open tab is
 * running that build — not when the browser gets round to it.
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'v4';
const STATIC_CACHE = `ayman-static-${VERSION}`;
const OFFLINE_URL = '/offline';

/*
 * The brand mark this deployment is allowed to draw — and `null` unless the
 * page that registered this worker said otherwise.
 *
 * ## The leak, which was a FACE and not a name
 *
 * This was the literal `'/icons/icon-192.png'`, in two constants. That file is
 * not a logo: it is a crop of Ayman's photograph, cut from `public/team
 * /ayman.jpg` by `scripts/build-mobile-icons.mjs`. `app/manifest.ts` gates the
 * whole `icons` array behind `IS_AYMAN` and `app/offline/page.tsx` gates the
 * `<img>` it draws, both with long notes on why no generic tile can be
 * substituted — and this file, which is the one that puts that image on a
 * LOCK SCREEN, had no gate at all. Every push from every tenant's platform
 * showed another instructor's students his face beside a sentence signed with
 * their own teacher's name.
 *
 * ## Why it arrives in the URL
 *
 * `public/` ships byte-for-byte: no bundler, no `process.env`, no build-time
 * substitution of any kind — `apps/web`'s build is `node scripts/vendor
 * -pyodide.mjs && next build`, and neither step rewrites this file. The only
 * channel into a service worker that exists before it runs is its own script
 * URL, and this worker already uses it: `VERSION` above is read from `?v=`,
 * put there by `components/pwa/service-worker-register.tsx`. So the mark comes
 * the same way, from the same place, and `self.location` reads it back.
 *
 * ## Why the PATH and not a tenant flag
 *
 * `?tenant=<key>` would mean re-deciding `IS_AYMAN` here, in a file with no
 * access to the gate module and no way to tell "the parameter says no" from
 * "the parameter is missing" — and this is the one place in the product where
 * a missing parameter is genuinely likely, because a worker keeps whatever URL
 * it was registered with. Passing the URL puts the decision back in
 * `service-worker-register.tsx`, where `aymanOnly()` is imported and where a
 * tenant can one day pass its OWN mark with no change to this file.
 *
 * ## Fail closed
 *
 * No parameter ⇒ no mark: nothing precached, nothing drawn on the
 * notification. That is the same answer `app/offline/page.tsx` already gives
 * and for the same reason — there is no honest generic image to substitute,
 * and an empty circle reads as an asset that failed to load, which on a lock
 * screen is exactly the wrong thing to suggest.
 */
const MARK = new URL(self.location.href).searchParams.get('mark') || null;

/*
 * Precached on install so the offline page is available the FIRST time the
 * network drops, rather than only after the student has already visited it.
 * The mark comes along because the offline page renders it, and `next/image`
 * is unavailable there by construction — see `app/offline/page.tsx`.
 *
 * On a stack with no mark the list is the page alone, which is exactly right:
 * that page's `<img>` is behind `IS_AYMAN` there, so precaching the file would
 * be paying install-time bandwidth for an image nothing renders.
 */
const PRECACHE = MARK ? [OFFLINE_URL, MARK] : [OFFLINE_URL];

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

/*
 * ── Which build each open tab is running ────────────────────────────────────
 *
 * «لو فيها كاش من البلدات القديمة تتمسح» — a previous build's chunks come off
 * the device as soon as no open tab is running that build, and not one deploy
 * later.
 *
 * ## What it was, and why it was not enough
 *
 * This worker used to WAIT (no `skipWaiting`) until every tab of the previous
 * build had closed, and then carry that build's whole cache over into its own
 * before deleting it — because during the wait the old worker had been filing
 * the NEW build's chunks under the old name. Both halves were deliberate, and
 * between them old builds stayed: a student who never closes the installed app
 * kept the old worker indefinitely, and every handover copied the dead chunks
 * forward with the live ones, leaving them for `MAX_ASSET_ENTRIES` to push out
 * one deploy at a time.
 *
 * ## What it is now
 *
 * The new worker takes over at once (`skipWaiting` + `clients.claim`), and the
 * one thing that made that unsafe — deleting the cache a still-open old tab
 * lazy-loads its dialogs and players from — is answered by ASKING rather than
 * waiting: every page announces the build it runs (`service-worker-register
 * .tsx` posts `{ type: 'ayman:build', build, assets }` to its controller), and
 * the worker keeps the announcements here. A build's cache is deleted when no
 * open window is running it.
 *
 * And nothing is carried over wholesale any more. A page on the CURRENT build
 * lists the static files it has already loaded (`assets`, from Resource
 * Timing); those, and anything it fetches later, are copied forward from
 * whichever older cache holds them — cache-to-cache, no network, so an
 * unchanged chunk is still not downloaded twice — and everything else in the
 * old cache is dead weight that goes with it.
 *
 * ## The tabs that never say
 *
 * A tab from before this change does not announce, and an announcement can be
 * a moment behind the page that sent it. An open window with no entry is
 * therefore assumed to need the build that was in charge when this worker
 * arrived (`previous`) — one older cache kept, never more — and that cache is
 * purged on the first announcement after the last such window has gone.
 */
const META_CACHE = 'ayman-sw-meta';
const REGISTRY_URL = '/__ayman-sw/builds';

async function readRegistry() {
  try {
    const meta = await caches.open(META_CACHE);
    const stored = await meta.match(new Request(REGISTRY_URL));
    const parsed = stored ? await stored.json() : null;
    if (parsed && typeof parsed === 'object' && parsed.clients && typeof parsed.clients === 'object') {
      return {
        clients: parsed.clients,
        previous: typeof parsed.previous === 'string' ? parsed.previous : null,
      };
    }
  } catch {
    // A registry that will not read is an empty one: every open tab becomes
    // "unknown", which is the conservative answer.
  }
  return { clients: {}, previous: null };
}

async function writeRegistry(registry) {
  try {
    const meta = await caches.open(META_CACHE);
    await meta.put(
      new Request(REGISTRY_URL),
      new Response(JSON.stringify(registry), { headers: { 'content-type': 'application/json' } }),
    );
  } catch {
    // Lost bookkeeping costs a purge that waits for the next announcement.
  }
}

/*
 * Every read-modify-write of the registry, and every purge, in one queue. Two
 * tabs announcing in the same second is the normal case after a deploy, and
 * two interleaved writes would drop one of them — making a tab that IS
 * running an old build look like one that is not.
 */
let bookkeeping = Promise.resolve();
function serially(task) {
  const run = bookkeeping.then(task, task);
  bookkeeping = run.catch(() => {});
  return run;
}

const isOurCache = (name) => name.startsWith('ayman-static-');

/**
 * Deletes every build's cache that no open window is running.
 *
 * Kept: this worker's own; each build an open window announced; and — only
 * while some open window has not announced — `previous`. Everything else with
 * the `ayman-static-` prefix goes, and nothing without it is touched.
 *
 * PRECACHE is rescued from a cache before it is deleted when this worker's own
 * cache lacks it. Install's precache is `.catch(() => {})` by design (a missing
 * icon must not leave the worker un-installed), so an install during a deploy
 * window or on a dropped connection has no `/offline` — and deleting the only
 * copy on the device would turn «مفيش نت دلوقتي» into a bare 503, the one thing
 * this worker exists to prevent.
 */
async function purgeBuildsNobodyRuns() {
  const names = (await caches.keys()).filter(isOurCache);
  if (!names.some((name) => name !== STATIC_CACHE)) return;

  const registry = await readRegistry();
  const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const live = {};
  for (const client of open) {
    const build = registry.clients[client.id];
    if (typeof build === 'string') live[client.id] = build;
  }
  const unidentified = open.some((client) => !(client.id in live));

  const keep = new Set([STATIC_CACHE, ...Object.values(live).map((build) => `ayman-static-${build}`)]);
  if (unidentified && registry.previous) keep.add(registry.previous);

  const current = await caches.open(STATIC_CACHE);
  for (const name of names) {
    if (keep.has(name)) continue;
    try {
      const doomed = await caches.open(name);
      for (const path of PRECACHE) {
        const request = new Request(path);
        if (await current.match(request)) continue;
        const copy = await doomed.match(request);
        if (copy) await current.put(request, copy);
      }
    } catch {
      // A rescue that fails must not keep the purge from running.
    }
    await caches.delete(name);
  }

  registry.clients = live;
  if (registry.previous && !keep.has(registry.previous)) registry.previous = null;
  await writeRegistry(registry);
}

/**
 * Copies the named static files into this build's cache from whichever older
 * cache holds them — the files a page on the current build has already loaded,
 * so a purge of the old cache does not cost a second download of a chunk that
 * did not change between builds.
 */
async function promote(hrefs) {
  const current = await caches.open(STATIC_CACHE);
  for (const href of hrefs) {
    try {
      if (typeof href !== 'string') continue;
      const url = new URL(href, self.location.href);
      if (url.origin !== self.location.origin || !url.pathname.startsWith('/_next/static/')) continue;
      const request = new Request(url.href);
      if (await current.match(request)) continue;
      const elsewhere = await caches.match(request);
      if (elsewhere) await current.put(request, elsewhere);
    } catch {
      // One file that will not move must not stop the rest.
    }
  }
  await trimAssetCacheOnce(current);
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
      // The build that was in charge when this one arrived: the one cache an
      // open tab that never announces itself can be assumed to need.
      await serially(async () => {
        const previous = activeCacheName();
        if (!previous || previous === STATIC_CACHE) return;
        const registry = await readRegistry();
        registry.previous = previous;
        await writeRegistry(registry);
      }).catch(() => {});
      // Take over now, not when the last tab of the old build closes — which,
      // for a student who keeps the installed app open, was never. What made
      // that unsafe (an old tab's chunks deleted under it) is the registry's
      // job now; see the block above.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Control the tabs that are already open — including the page that
      // registered this worker, which a first install would otherwise leave
      // uncontrolled until its next load.
      await self.clients.claim();
      await serially(purgeBuildsNobodyRuns).catch(() => {});
    })(),
  );
});

/*
 * A page saying which build it runs. One message per document load (and per
 * controller change) — see `service-worker-register.tsx` — so the bookkeeping
 * below runs a handful of times per visit, never per request.
 */
self.addEventListener('message', (event) => {
  const data = event.data;
  const source = event.source;
  if (!data || data.type !== 'ayman:build' || typeof data.build !== 'string') return;
  if (!source || typeof source.id !== 'string') return;
  const build = data.build.slice(0, 100);
  const assets = Array.isArray(data.assets) ? data.assets.slice(0, MAX_ASSET_ENTRIES) : [];

  event.waitUntil(
    serially(async () => {
      const registry = await readRegistry();
      registry.clients[source.id] = build;
      await writeRegistry(registry);
      if (`ayman-static-${build}` === STATIC_CACHE) await promote(assets);
      await purgeBuildsNobodyRuns();
    }).catch(() => {}),
  );
});

/**
 * Whether a file an older cache answered should be copied into this build's
 * cache: yes for a page on this build (it will want it again), and for a page
 * that has not said yet (most often the first page after the deploy, which
 * loaded before announcing) — no for a page known to run an OLDER build, whose
 * chunks would otherwise ride forward into the cache the purge keeps.
 */
async function promoteFor(clientId, request, response) {
  const registry = await readRegistry();
  const build = clientId ? registry.clients[clientId] : undefined;
  if (typeof build === 'string' && `ayman-static-${build}` !== STATIC_CACHE) return;
  const current = await caches.open(STATIC_CACHE);
  await current.put(request, response);
  await trimAssetCacheOnce(current);
}

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
   *
   * `MARK &&` first: with no mark this branch must not match, and without the
   * guard `url.pathname === null` is merely false for every real request —
   * true only for the one nobody makes. Written as a guard rather than left to
   * luck because the next edit here should not have to work that out.
   */
  if (MARK && url.pathname === MARK) {
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
        const current = await caches.open(STATIC_CACHE);
        const own = await current.match(request);
        if (own) return own;

        // An older build's cache still has it: answer from there — that is
        // exactly what keeps a still-open old tab's lazy chunks working — and
        // copy it forward if the page asking is on this build. See `promoteFor`.
        const elsewhere = await caches.match(request);
        if (elsewhere) {
          event.waitUntil(promoteFor(event.clientId, request, elsewhere.clone()).catch(() => {}));
          return elsewhere;
        }

        const response = await fetch(request);
        // Only store a clean 200. An opaque or partial response cached here
        // would be indistinguishable from the real thing on the next load.
        if (response.ok && response.status === 200) {
          // Held open past the response so neither the write nor the trim is
          // cancelled when the worker is terminated a moment after answering.
          // The trim runs even when the write failed, because the way a write
          // fails here is a quota error — the exact moment trimming matters.
          event.waitUntil(
            current
              .put(request, response.clone())
              .catch(() => {})
              .then(() => trimAssetCacheOnce(current))
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
 * `icon`/`badge` come from the registration URL rather than the payload —
 * every push from this platform shows the same mark, and a per-notification
 * image would spend bytes of a payload Web Push caps at 4 KB on a picture that
 * would look identical every time anyway. This is the «صورة» the toggle
 * promises: a bare-text push with no icon is the thing that reads as broken.
 *
 * ⚠️ WHICH IS WHY THE GATE IS HERE AND NOT IN THE PAYLOAD. The mark is a crop
 * of one instructor's photograph (see `MARK` at the top), and this is the only
 * surface in the product that draws it on a device with nothing open: a
 * notification from a tenant's platform put HIS face on their student's lock
 * screen, over a line naming their own teacher. A tenant sends the same push
 * with no image, exactly as `app/offline/page.tsx` shows no mark — a bare-text
 * push is worse than one with a mark and far better than one with the wrong
 * person's.
 */
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
      // Spread rather than `icon: MARK ?? undefined`: the two keys are simply
      // absent on a stack with no mark, so nothing downstream has to agree
      // with us about how a browser reads an explicit `undefined` here.
      ...(MARK ? { icon: MARK, badge: MARK } : {}),
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
