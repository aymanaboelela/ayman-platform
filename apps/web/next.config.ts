import path from 'node:path';
import type { NextConfig } from 'next';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:3300';
const MEDIA_ORIGIN = process.env.NEXT_PUBLIC_MEDIA_ORIGIN ?? 'http://localhost:3300';
const mediaOriginUrl = new URL(MEDIA_ORIGIN);

const nextConfig: NextConfig = {
  // Emits .next/standalone with a self-contained server.js and only the
  // node_modules actually reached — the runtime image copies that instead of
  // the whole pnpm workspace.
  output: 'standalone',
  // The workspace root, so the tracer follows symlinked pnpm deps out of
  // apps/web. Without it the standalone bundle silently misses packages.
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),

  /**
   * The one thing the tracer cannot find on its own: libvips.
   *
   * `sharp` is traced correctly — the package, its `@img/sharp-<platform>`
   * addon, and the `.node` binary all arrive in `.next/standalone`. What does
   * NOT arrive is the shared library that addon links against. Compared
   * directly on 2026-08-12:
   *
   *   workspace   libvips-cpp.8.18.3.dylib   17,765,992 bytes
   *   standalone  index.js                           28 bytes   ← and nothing else
   *
   * The `index.js` inside each `@img/sharp-libvips-<platform>` package is a
   * stub the tracer can read and follow; the multi-megabyte `.dylib`/`.so`
   * beside it is loaded by dlopen at runtime, from a path the static tracer
   * never sees. So it is left behind,
   * and the addon fails to load with "Could not load the sharp module using
   * the <platform> runtime".
   *
   * Next answers that failure by serving images UNRESIZED — 200, correct
   * content-type, original bytes, no log line. Production was shipping 206,420
   * bytes for a 384px request that should have been 16,262. See
   * `scripts/verify-sharp.mjs`, which fails the Docker build rather than let
   * that ship again.
   *
   * The glob covers every platform variant deliberately: the file that matters
   * is named for the OS and arch of whatever machine runs the build, and this
   * config must not have to know which one that is.
   */
  outputFileTracingIncludes: {
    '/**': ['../../node_modules/.pnpm/@img+sharp-libvips-*/node_modules/@img/**/*'],
  },

  reactStrictMode: true,

  // Dynamic-by-default with explicit `use cache` opt-in. Retrofitting this later
  // is the expensive path, so it is on from day one.
  cacheComponents: true,

  /*
   * ⚠️ There is deliberately NO `deploymentId` here, and it was tried.
   *
   * The per-build token this app needs — `NEXT_PUBLIC_BUILD_ID`, computed in
   * the same `apps/web/Dockerfile` layer that runs `next build`, so it changes
   * exactly when the code does — is a plain `NEXT_PUBLIC_*` variable and
   * reaches the browser as an inlined string on its own. That is all
   * `components/pwa/service-worker-register.tsx` needs in order to register
   * `/sw.js?v=<token>`, which is what makes every deploy look like a new
   * service worker and lets `activate` drop the previous build's cached
   * chunks. Setting `deploymentId` to the same value looked like tidy
   * reinforcement of that and is not:
   *
   *   · It appends `?dpl=<token>` to EVERY `/_next/static/*` URL. Those
   *     filenames are already content-hashed, so the query adds no correctness
   *     and changes the URL of every asset on every deploy even when not one
   *     byte of it moved. `public/sw.js` caches those cache-first, keyed on the
   *     full URL — `ignoreSearch` defaults to false — so a returning student
   *     re-downloads the entire JS and CSS payload after each deploy, on
   *     Egyptian mobile data, several times an evening. It also puts two
   *     byte-identical copies of every shared chunk in the cache while a device
   *     spans two builds, against `MAX_ASSET_ENTRIES`.
   *   · It falsifies the premise sw.js's own cache-first branch rests on and
   *     states out loud: "a changed file is a changed URL".
   *   · The one thing it does buy — the client comparing a build id against
   *     every RSC response and answering a mismatch with a full page load —
   *     already happens without it. `app-index.js` calls `setNavigationBuildId`
   *     with the flight payload's own build id when no deployment id is
   *     configured, and `fetch-server-response.js` compares that.
   *
   * If it is ever reintroduced, `experimental.immutableAssetToken` is the knob
   * that separates the two concerns — and the asset re-download above is the
   * number to measure first.
   */

  experimental: {
    /**
     * How long the CLIENT router may reuse a page it already has before it
     * refetches it — Next's default is `dynamic: 0`, i.e. never.
     *
     * Every signed-in route in this app is dynamic, so with the default in
     * force, LEAVING a page and coming back to it thirty seconds later threw
     * away everything the router was holding and re-rendered the route from
     * scratch on the server. `/dashboard` alone is ten parallel API calls (its
     * own comments count them down against the `short` throttle); the student
     * sits on `loading.tsx` for every one of those round trips, every time.
     *
     * That is the reported bug, and it is worth being precise about why a
     * RELOAD of the same page felt instant while the soft navigation did not —
     * «بيدخل على صفحة ويجي يرجع لها تاني، بتقعد تلود، بس أول ما أعمل refresh
     * في ثانية تروح». A document request is served the prerendered PPR shell
     * immediately and streams the dynamic holes into it. A soft navigation has
     * no shell to paint: the router has to have the RSC payload before it can
     * commit the route, so the whole dynamic render is on the critical path.
     * Refreshing was not faster than navigating — it was a different code path
     * that had something to paint first.
     *
     * ⚠️ This governs LINK navigations, and only those. The browser's own
     * back/forward is already exempt and always was: `readFromBFCache` passes
     * `-1` where the current time goes, "during a back/forward navigation, it
     * doesn't matter how stale the data might be" (segment-cache/bfcache.js).
     * The regular-navigation twin of that read, `readFromBFCacheDuringRegular-
     * Navigation`, is the one that takes a real clock and is therefore the one
     * this number moves. Which is the case that matters here: this app is
     * installed as a PWA with no browser chrome, so "going back to a page" is
     * a tap on the rail, the topbar or a breadcrumb — a link — essentially
     * every time.
     *
     * 30 seconds, not more: this is a cache the student cannot see and did not
     * ask for, so the number is set by how long a stale figure may sit on a
     * screen, not by how much traffic it saves. Long enough to make going back
     * and forth feel instant, short enough that nobody reads a wrong number
     * twice.
     *
     * ⚠️ WRITES HAVE TO CLEAR IT, and this is the part that is not free.
     *
     * `router.refresh()` is the only call that empties the client router cache,
     * and a Server Action does it wholesale — which covers every admin screen
     * and most of the app, because those are Server Actions or already call
     * `refresh()`. It did NOT cover the one path that matters most: completing
     * a lesson is a plain `apiPost` straight to Nest, and `LessonNav.finish()`
     * then pushed to the next lesson without refreshing anything. With a stale
     * time in force that push could replay a CACHED render of a lesson that was
     * still gated — the course refusing to advance — and `/library` and
     * `/dashboard` would keep showing the lesson unfinished. That call site now
     * refreshes; see the ⚠️ in `components/player/lesson-nav.tsx` for the whole
     * argument.
     *
     * So the rule for anything added later: a browser-side write whose result
     * another ROUTE renders has to call `router.refresh()`. Inside one route it
     * does not matter — the component already has the answer in its own state.
     *
     * ⚠️ ONE DOCUMENTED EXCEPTION, and it is worth knowing before adding a
     * refresh anywhere: `refresh()` re-requests the CURRENT route, so it is
     * unsafe on a route the write itself makes redirect. Enrolling is exactly
     * that — `proxy.ts` sends an enrolled student off `(site)/courses/:slug` to
     * `/library/:slug`, so refreshing there navigates instead of refreshing and
     * races the push into the lesson. It cost two red Playwright shards before
     * it was understood. See the ⚠️ in `components/site/course-start-button.tsx`.
     *
     * ## The residue, stated rather than glossed
     *
     * One write cannot use `router.refresh()` at all: submitting a quiz. The
     * refresh would re-render the ATTEMPT route, whose server render posts
     * `resume` (see `components/quiz/quiz-runner.tsx`). Two pages answer that
     * with `unstable_dynamicStaleTime` instead — `quizzes/[lessonId]` takes 0,
     * because a reused copy of it can cost a student a whole sitting, and
     * `library/[slug]` takes 5, because that is where a lesson is drawn locked
     * or open.
     *
     * What is left after all that: `/dashboard` and the `/library` LIST can lag
     * a passed quiz by up to thirty seconds — a percentage and a count, on the
     * two screens this whole setting exists to stop re-rendering. Trading a
     * cosmetic half-minute on a number for the reported «بتقعد تلود» on the
     * app's two most-revisited pages is the deal being made here, deliberately
     * and in that direction.
     *
     * `static` is deliberately NOT set. It is not the prefetch knob it looks
     * like: `next/dist/server/config.js` reads `experimental.staleTimes.static`
     * to seed `cacheLife.default.stale`, so a value here would quietly change
     * SERVER cache behaviour for every `'use cache'` entry that does not name
     * its own profile. Leaving it undefined keeps Next's 300.
     */
    staleTimes: { dynamic: 30 },
  },

  /**
   * Where every `'use cache'` entry is stored. Next's built-in handler is an
   * LRU inside the process, so a deploy or a restart empties the cache — and
   * `getBranding()` is read by the ROOT layout, meaning the first visitor after
   * every deploy pays for a cold read on the path of every page.
   *
   * Top-level, not `experimental.cacheHandlers` — the experimental spelling is
   * marked `@deprecated` in `next/dist/server/config-shared.d.ts`.
   *
   * The path is stored relative to `distDir` at build time and re-resolved at
   * runtime, and `collect-build-traces` adds it (and `ioredis`) to the
   * standalone bundle — so no `outputFileTracingIncludes` entry is needed.
   */
  cacheHandlers: {
    default: path.join(import.meta.dirname, 'cache-handler', 'redis.js'),
  },

  transpilePackages: ['@ayman/ui', '@ayman/contracts', 'three'],

  /**
   * Media is served from a DIFFERENT origin than the app (Task 13, A10), so
   * `next/image` needs it on the allowlist explicitly — `unoptimized` is
   * unnecessary once the origin is declared here.
   */
  images: {
    /**
     * Next 16 refuses to fetch an upstream image whose host resolves to a
     * private IP — an SSRF guard, and a correct one. In development the media
     * origin IS `http://localhost:3300`, so every uploaded avatar and every
     * branded mark fails to optimise with
     * `upstream image … resolved to private ip` and renders broken.
     *
     * Scoped to non-production by an environment check, not by a comment
     * asking someone to remember: in production `NEXT_PUBLIC_MEDIA_ORIGIN` is
     * a real host on the public internet, the guard has something real to
     * protect against, and this stays `false`.
     */
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== 'production',

    /**
     * The `q` values `/_next/image` will serve. Declaring this is NOT optional
     * once any call site passes `quality`: since Next 16 the default is
     * `qualities: [75]` (`next/dist/shared/lib/image-config.js`) and the
     * optimizer answers an unlisted value with `"q" parameter (quality) of N is
     * not allowed` at REQUEST time — a broken image in production that the
     * build never complains about.
     *
     * So 75 has to stay: it is what every `<Image>` that passes no `quality`
     * resolves to, which is all of them but one. 60 is the hero
     * (`components/site/site-hero.tsx`), encoded below the default because
     * `.hero__scrim` covers it with three gradients.
     *
     * The list is kept to exactly the two in use rather than a menu of round
     * numbers, because it is also the bound on how many variants a stranger can
     * mint: `/_next/image` is public, and every allowed (url, w, q) triple is a
     * separate entry in the optimizer's disk cache.
     */
    qualities: [60, 75],

    remotePatterns: [
      {
        protocol: mediaOriginUrl.protocol.replace(':', '') as 'http' | 'https',
        hostname: mediaOriginUrl.hostname,
        port: mediaOriginUrl.port,
        pathname: '/media/**',
      },
      /**
       * Google profile photos, for the avatar on /onboarding.
       *
       * Listing the host here rather than pointing an `<img>` straight at it
       * is what keeps the CSP untouched: the optimizer fetches server-side
       * and re-serves from `/_next/image` on OUR origin, so the existing
       * `img-src 'self'` already covers it. A direct `<img src="https://lh3…">`
       * would need `img-src` widened, and — since `CSP_ENFORCE` is still unset
       * — would have looked fine right up until the day the policy was
       * enforced.
       *
       * It also stops a request going to Google on every page view that shows
       * an avatar, which would tell them where a signed-in student is
       * browsing, and it survives Google rotating the URL.
       */
      { protocol: 'https', hostname: 'lh3.googleusercontent.com', pathname: '/**' },
    ],
  },

  /**
   * Pins the monorepo root explicitly. Without this, Turbopack's root
   * auto-detection climbs the directory tree looking for the outermost
   * lockfile and can latch onto an unrelated one above this repo (e.g. a
   * stray package-lock.json in a parent directory on the host machine),
   * which then misresolves every workspace package import.
   */
  turbopack: {
    root: path.join(__dirname, '..', '..'),
  },

  /**
   * Cache-Control for the assets Next does NOT long-cache on its own.
   *
   * Next's long-cache path is gated on `matchedOutput.type ===
   * 'nextStaticFolder'` (`router-server.js`), i.e. `/_next/static/*` and
   * nothing else. Everything under `public/` falls through to the plain static
   * handler with an ETag and no Cache-Control, and the App Router's static
   * metadata routes answer `public, max-age=0, must-revalidate` (visible in
   * `.next/server/app/favicon.ico.meta`). `proxy.ts` sets no Cache-Control
   * either, so without this block every one of these is a conditional request
   * on every visit.
   *
   * These win over the route's own header rather than being ignored:
   * `send-response.js` only appends a response header "if it is not present in
   * the outbound response", and `send-payload.js` guards its own write with
   * `!res.getHeader('Cache-Control')`. Both see the value set here first.
   *
   * `/brand/` used to be left out on the reasoning that `footer-dragons.tsx`
   * and `tracks-dragon.tsx` gate those ~1 MB webm pairs behind
   * `(min-width: 64rem)`, so only desktop — which has the bandwidth — would
   * ever ask for them. The gate holds; the conclusion did not. A desktop
   * Lighthouse run against the deployed site shows `dragon-ride.webm` (849 KB)
   * and `dragon-blaze.webm` (831 KB) arriving with a FOUR HOUR freshness
   * lifetime, 1,143 KiB of the page's 3,056 KiB flagged as re-fetchable. The
   * bandwidth argument is about the FIRST visit; every visit after it was
   * paying again for bytes that have never changed.
   *
   * ⚠️ Do NOT add a `Link` rule here. It looks like the safe home for the
   * agent-discovery relations — `proxy.ts` forbids them and this is a different
   * mechanism — and it is not. Verified on a real standalone build on
   * 2026-08-12 by patching the compiled rule into
   * `.next/standalone/apps/web/.next/routes-manifest.json` and forcing a shell
   * revalidation: the value stored in `.next/server/app/index.meta` went from
   * one copy (901 bytes) to two (1081), +180 bytes a copy — the same unbounded
   * growth, and the same fingerprint as the outage `proxy.ts` documents.
   *
   * Both mechanisms end up on the same object, which is why the distinction
   * does not help. `router-server.js` applies these rules with `res.setHeader`
   * BEFORE the render, and `app-render.js`'s `setMetadataHeader` then does
   * `metadata.headers[name] = res.getHeader(name)` when React appends its font
   * preloads — so whatever sits on the outgoing response at that moment is
   * captured into the cache entry, and re-added the next time it revalidates.
   * `Cache-Control` is safe here precisely because nothing reads it back.
   *
   * The relations are published from Cloudflare instead, where the origin's
   * cache never sees them: `deploy/cloudflare/link-header.json`.
   */
  async headers() {
    return [
      {
        /**
         * `public/pyodide` is 13.4 MB across four files (pyodide.asm.wasm
         * 9,596,462 · python_stdlib.zip 2,545,106 · pyodide.asm.mjs 1,249,447,
         * plus the loader). Uncached that is four conditional revalidations on
         * every `/playground` visit — roughly 250 ms of RTT each on Egyptian
         * 3G even when all four come back 304.
         *
         * The sharper problem is eviction, not the 304s: on a low-storage
         * Android a `max-age=0` entry is the first thing the HTTP cache drops,
         * and then the student re-downloads the entire interpreter.
         * `app/(app)/playground/page.tsx` deliberately puts that download
         * behind a button labelled with its size, which makes it worse that
         * the second press could cost as much as the first.
         *
         * `max-age` WITHOUT `immutable`, and that is not an oversight. These
         * URLs carry no version segment and no content hash —
         * `scripts/vendor-pyodide.mjs` pins the bytes to the `pyodide` version
         * in package.json and copies them to these same stable paths every
         * time. `immutable` on a stable URL is unrevalidatable by
         * construction: bumping the dependency would strand every cached
         * student on the old interpreter for the full max-age with no way to
         * invalidate them. Thirty days of ordinary max-age still leaves the
         * door open for a revalidation; `immutable` would require putting the
         * version in the path first.
         */
        source: '/pyodide/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000' }],
      },
      {
        /**
         * The brand media in `public/brand/` — the two dragon webm/mov pairs
         * (~1.7 MB together) and the hero and section artwork next/image
         * optimises from.
         *
         * `max-age` WITHOUT `immutable`, for exactly the reason spelled out on
         * the pyodide rule above: these paths carry no content hash. They are
         * stable filenames a designer overwrites in place, so `immutable` would
         * be unrevalidatable by construction and would strand every returning
         * visitor on the old artwork for the whole window. Thirty days of
         * ordinary `max-age` still lets a browser probe with a conditional
         * request and pick up a replacement.
         *
         * If a swap ever needs to land faster than a month, the honest fix is
         * to put a version segment in the path — not to shorten this back to
         * four hours for everyone.
         */
        source: '/brand/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000' }],
      },
      {
        /**
         * The three icon assets, ~99 KB of first-load bytes for an image that
         * renders at 16-32 CSS px. Every href Next emits for them is already
         * content-addressed — `/favicon.ico?favicon.44bbejt3wn00b.ico`,
         * `/icon.png?icon.14y6cgqkiu6mt.png`,
         * `/apple-icon.png?apple-icon.1y_6u-x6c6941.png` — so a year is safe:
         * changing the file changes the URL.
         *
         * Still no `immutable`, for one reason: a browser's implicit probe of
         * the bare `/favicon.ico` carries no hash and hits this same rule.
         * That path is worth keeping cheap to revalidate. It is also the least
         * exposed of the three — the branded mark comes from the media origin
         * via `branding.faviconAssetId` in the root layout, and these are the
         * fallback default.
         */
        source: '/:icon(favicon\\.ico|icon\\.png|apple-icon\\.png)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000' }],
      },
    ];
  },

  /**
   * Single origin: the browser only ever sees `/api/...` on the web origin.
   * This is what makes __Host- cookies, SameSite=Strict, and zero CORS possible
   * simultaneously. Never call the API host directly from client code.
   */
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
