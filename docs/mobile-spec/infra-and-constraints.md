# Infrastructure & operational constraints — what a Flutter client must respect

Everything here is read out of the repository, not remembered. Every non-obvious claim
cites a repo-relative path so it can be checked. Written for a Flutter engineer who has
never opened this codebase.

Companion files in this directory cover the product surface: `api-surface.md`,
`auth.md`, `content-and-player.md`, `notifications.md`, `chat-and-assistant.md`,
`student-app.md`, `design-system.md`. This file covers only the *operational envelope*
— hosts, headers, limits, cookies, config, CI, and the failure modes.

---

## 0. One-paragraph summary

The platform is a single Node process for the API (NestJS, port `3300`) and a single
Node process for the web (Next.js standalone, port `3200`), plus Postgres and Redis,
run as one Docker Compose stack by **Dokploy** on a **2 GB VPS**, behind **Cloudflare**.
The browser only ever sees one origin, `https://aymanaboelela.com`, and **no CORS is
configured anywhere** — a fact that is load-bearing for the web design and is *not* an
obstacle for a native client, because a native HTTP client is not subject to the
same-origin policy at all. Sessions for native clients are already supported: the
better-auth `bearer()` plugin is registered and returns a token in the `set-auth-token`
response header. Rate limiting is Redis-backed, layered, keyed on the session (cookie
*or* bearer token), and **fails closed** — a Redis outage is a 500 on every
non-`/api/health` route.

---

## 1. Deployed topology

### 1.1 The hosts

| Host | Serves | Backed by |
|---|---|---|
| `aymanaboelela.com` (+ `www.`) | the whole web app **and** `/api/*` | `web` container `:3200`, `api` container `:3300` |
| `media.aymanaboelela.com` | `/media/*` only — every uploaded byte | the **same** `api` container `:3300` |
| `video.aymanaboelela.com` | HLS mirrors of lectures (`master.m3u8` + segments) | Cloudflare R2 bucket public custom domain |
| `links.aymanaboelela.com` | *not created* — the bio link is `aymanaboelela.com/links` | — |

Source: the header comment in `docker-compose.yml` lines 1-13, which states the exact
Dokploy routing table:

```
aymanaboelela.com        /api    → api   :3300
aymanaboelela.com        /       → web   :3200
media.aymanaboelela.com  /media  → api   :3300
```

`deploy/Caddyfile` encodes the same arrangement for the pre-Dokploy systemd install
(**do not run it** — see §9.2). `docs/runbooks/links-subdomain.md` documents that
`links.` does not exist and, if it ever does, must be a Cloudflare **Redirect Rule** to
`/links`, not a second host.

### 1.2 What sits in front

Three layers, outermost first:

1. **Cloudflare** — DNS + proxy (orange cloud), `SSL/TLS: Full (strict)`,
   `Always Use HTTPS` on. `docs/runbooks/vps-setup.md` §9 is the procedure; the setup
   sequence deliberately starts grey (DNS-only) so Caddy/Traefik can complete the
   Let's Encrypt HTTP challenge, then flips to orange.
2. **Traefik**, managed by Dokploy. `docker-compose.yml` writes **no Traefik labels by
   hand** — Dokploy generates them from its own domain records, and hand-written labels
   conflict with them (lines 3-8). The `dokploy-network` is declared `external: true`;
   a container not attached to it is invisible to Traefik and the domain times out.
3. The containers themselves.

There is **no Nginx and no separate API gateway.** `X-Accel-Buffering: no` appears on
the two SSE routes anyway, as defence against whatever proxy may appear later
(`apps/api/src/modules/notifications/notifications.controller.ts:87-90`,
`apps/api/src/modules/assistant/ai/assistant-ask.controller.ts:95-99`).

### 1.3 How the web proxies `/api/*`

Two independent mechanisms exist, and only one of them is on the production request
path:

- **`apps/web/next.config.ts` → `rewrites()`**:
  `{ source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` }` where
  `API_ORIGIN` defaults to `http://localhost:3300`. In the container `API_ORIGIN` is
  `http://api:3300` (`docker-compose.yml`, `web.environment`). This is what makes
  `pnpm dev` and Playwright work against a single origin.
- **In production the edge routes `/api` straight at the API container**, skipping the
  Next hop entirely — `docker-compose.yml`'s routing table, and `deploy/Caddyfile`'s
  comment: «بيروح لـ 3300 مباشرة، مش عن طريق الـ rewrite بتاع Next … في الإنتاج توجيهه من
  هنا بيوفّر قفزة زيادة على كل طلب».

Either way, **`https://aymanaboelela.com/api/...` reaches NestJS**. The API's global
prefix is set in `apps/api/src/main.ts`:

```ts
app.setGlobalPrefix('api', {
  exclude: [{ path: 'media/:prefix/:name', method: RequestMethod.GET }],
});
```

So every route is `/api/...` **except** the media read, which is deliberately excluded
so that attacker-uploaded bytes never come back through the app-origin rewrite
(`main.ts` lines 25-34).

### 1.4 Therefore: the base URLs a Flutter client must use

```dart
const apiBase   = 'https://aymanaboelela.com/api';   // every endpoint
const mediaBase = 'https://media.aymanaboelela.com/media'; // uploaded assets
const videoBase = 'https://video.aymanaboelela.com'; // HLS mirror, when present
```

Three separate constants, never derived from one another:

- `MEDIA_BASE_URL` **must be a different origin from `APP_URL`** — the API refuses to
  boot otherwise, with the message
  `MEDIA_BASE_URL must be a DIFFERENT origin than APP_URL (spec §7 P6) — a same-origin
  upload is same-origin XSS regardless of CSP`
  (`apps/api/src/config/env.ts`, the final `.refine()`).
- The video origin is `VIDEO_MIRROR_PUBLIC_URL` (API) / `NEXT_PUBLIC_VIDEO_ORIGIN`
  (web) and is **never derived from `VIDEO_MIRROR_ENDPOINT`**, which is the
  credentialed, internal S3 endpoint (`env.ts`, `VIDEO_MIRROR_PUBLIC_URL` docblock).
- Media URLs come back from the API as *storage keys*, and the client builds
  `${mediaBase}/${key}`; see `apps/api/src/common/media/media-url.ts` and
  `apps/web/lib` `mediaUrl()`. Some responses (e.g. `posterUrl`) are already absolute.

Local development: `http://localhost:3200/api` (through Next's rewrite) or
`http://localhost:3300/api` (direct). Media is `http://localhost:3300/media` — the same
process, a different **port**, which still satisfies the different-origin assertion
(`apps/api/.env.example`, the `MEDIA_BASE_URL` block).

### 1.5 CORS — confirmed absent, and what that means

**Confirmed.** `main.ts` says «No CORS is configured anywhere» and a repo-wide grep
backs it:

```
$ rg "enableCors|Access-Control-Allow" apps/api/src apps/web
apps/api/src/modules/media/media.controller.ts:196:  'Access-Control-Allow-Origin': '*',
```

That single header is on `GET /media/:prefix/:name` only
(`apps/api/src/modules/media/media.controller.ts:160-198`), added so the admin cropper
can `fetch()` an existing image back as bytes. Its docblock argues it widens nothing:
the route is `@Public()`, reads no cookie, and already sets
`Cross-Origin-Resource-Policy: cross-origin`.

Consequences, stated precisely:

| Client | Effect of "no CORS" |
|---|---|
| **Flutter / Dart `dart:io` HttpClient, Dio, http (Android + iOS)** | **None.** CORS is a browser policy enforced by the browser; a native socket client never performs a preflight and never checks `Access-Control-Allow-Origin`. The API is fully callable as-is. |
| **Flutter Web** | **Fatal.** Every cross-origin `fetch`/`XHR` to `https://aymanaboelela.com/api` from another origin fails at preflight. Shipping Flutter Web requires either serving the Flutter bundle from `aymanaboelela.com` itself, or adding `app.enableCors(...)` in `main.ts` — which is an architectural change (see §4.4: it also interacts with `__Host-` cookies and better-auth's `trustedOrigins`). |
| **A browser-based dev tool / Swagger UI on another origin** | Blocked. Use `curl`/Postman/Dio instead. |

The absence of CORS is also a *security control that the CSRF guard leans on*: see §3.2.

### 1.6 The origin is bypassable

`apps/api/src/common/throttle/request-identity.ts` (`clientIpFromRequest` docblock)
records that the VPS still answers on its own IP, so anything hitting the origin
directly bypasses every Cloudflare control, and `cf-connecting-ip` can then be forged.
Closing the origin to Cloudflare's ranges is named as an **outstanding infrastructure
task**. A mobile client should not rely on edge-only protections.

### 1.7 Cloudflare quirks a mobile engineer will hit

- **100 MB upload ceiling on Free *and* Pro** — `docs/runbooks/vps-setup.md`, "قبل ما
  تبدأ" §3. A larger body is rejected by Cloudflare with `413` **before it reaches the
  server**, so it appears in no server log. The platform's own document limit was
  lowered to **95 MiB** (`MAX_DOCUMENT_BYTES` in
  `packages/contracts/src/admin/media.ts:275`) to stay underneath it and produce an
  Arabic error instead of an opaque 413.
- **User-Agent filtering.** Measured on the same URL at the same moment
  (`docs/runbooks/deploy.md`): `curl` with its default UA → **200**; Python `urllib`
  with its default UA → **403**. Send a realistic `User-Agent` from any tooling; CI's
  smoke test hardcodes a Chrome UA string for exactly this reason
  (`.github/workflows/ci.yml`, "Post-deploy smoke test").
- **Cloudflare injects scripts at the edge** (Web Analytics beacon from
  `static.cloudflareinsights.com`) that never appear in the origin's HTML. Irrelevant
  to a native client; relevant if you ever screen-scrape a page.
- **A DNS record is not a route.** `docs/runbooks/links-subdomain.md` records a `www`
  record created with no Traefik route: every path returned Traefik's plain-text 404
  *except* `/robots.txt`, which returned **200** with Cloudflare's own robots file.
  A 200 on `/robots.txt` proves nothing.
- **HSTS is `includeSubDomains; preload`**, so any new subdomain must serve HTTPS from
  its very first request or browsers will refuse it thereafter. Universal SSL covers
  one level of wildcard only (`*.aymanaboelela.com`, not `a.b.aymanaboelela.com`).

---

## 2. The deployed stack, service by service

From `docker-compose.yml`:

| Service | Image / build | Port | Notes |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | **no `ports:`** | deliberately not exposed. Healthcheck `pg_isready`. |
| `redis` | `redis:7-alpine` | **no `ports:`** | `--save "" --appendonly no` (no persistence), `--maxmemory ${REDIS_MAXMEMORY:-128mb}`, `--maxmemory-policy volatile-lru`. |
| `api` | `apps/api/Dockerfile` | 3300 | networks `[dokploy-network, default]`. Volume `media:/var/lib/ayman/media`. |
| `wa` | `services/wa` | 3400 | WhatsApp sender sidecar. **`networks: [default]` only** — deliberately unreachable from Traefik. |
| `web` | `apps/web/Dockerfile` | 3200 | `depends_on: api (service_healthy), redis (service_healthy)`. |

### 2.1 Healthchecks

- API: `apps/api/Dockerfile:97-98` —
  `HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=6` running
  `fetch('http://127.0.0.1:3300/api/health')`.
- Web: `apps/web/Dockerfile:120-121` — same cadence, `--start-period=30s`, an
  `http.get` on `/` with `maxHeaderSize: 262144`.

`GET /api/health` (`apps/api/src/health/health.controller.ts`) is `@Public()` and
`@SkipThrottle(SKIP_ALL_THROTTLERS)`. Response shape:

```json
{ "status": "ok" | "degraded",
  "service": "ayman-api",
  "database": "up" | "down",
  "startedAt": "2026-09-08T00:00:00Z" }
```

`startedAt` is captured at module import, second precision, and **changes on every
redeploy** — CI uses it to prove a deploy actually landed. `status` is `degraded` only
when Postgres is unreachable; **Redis being down does not show here**, by design (see
the controller's docblock and §5.4).

> ⚠️ `web` waits on `api`'s healthcheck and Traefik has no backend without it. One
> failed API healthcheck 404s the entire site — `docs/DEPLOYMENT.md` and the
> `GROQ_MODEL` empty-string incident in `apps/api/src/config/env.ts`
> (`optionalWithDefault` docblock): a variable whose only job is choosing a chat model
> took the whole platform down for an hour.

### 2.2 Graceful shutdown

`main.ts` calls `app.enableShutdownHooks()` **before** `listen()`. Without it Nest never
registers a `SIGTERM` listener and every deploy drops in-flight requests. A mobile
client should still expect connection resets during a deploy window and retry idempotent
GETs.

### 2.3 The deploy window

`docs/runbooks/deploy.md`: a few seconds of `404` during a deploy is **normal** — the old
container is down and the new one is starting. More than a minute means the build failed.
`docs/DEPLOYMENT.md` and the memory note "deploy-window blanks and cached 404s" both say:
wait ~10 minutes before diagnosing an empty list or a half-404 image after a deploy.

Also: `next build` bakes an *empty* `'use cache'` settings cache, so features gated on a
setting can vanish for minutes after every deploy.

---

## 3. Security headers, CSP, Permissions-Policy

### 3.1 Where they come from

**All of them are set by the web app, not by the API.** `apps/web/proxy.ts` (this is
Next 16's renamed `middleware.ts` — a file literally named `middleware.ts` now throws a
build error; see the file header) applies them via `applyBaseSecurityHeaders()`.
The API adds only `Cache-Control` / `Vary` (§3.5) and, on media, its own sandbox policy.

`applyBaseSecurityHeaders` (`apps/web/proxy.ts`, ~line 745) sets, on **every** web
response including redirects:

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-DNS-Prefetch-Control` | `off` |
| `X-Frame-Options` | `DENY` |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups` |
| `Cross-Origin-Resource-Policy` | `same-site` (**not** `same-origin` — media is a different origin, same site) |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` (production only) |
| `Reporting-Endpoints` | `csp-endpoint="/api/security/csp-report"` |
| `Permissions-Policy` | see below |
| `X-Robots-Tag` | `noindex, nofollow` on every protected path, and on `/dev/*` 404s and the JS-runner |

`Permissions-Policy`, verbatim from the source:

```
camera=(), microphone=(<self on /admin only>), geolocation=(), payment=(), usb=(),
serial=(), bluetooth=(), hid=(), midi=(), display-capture=(), browsing-topics=(),
interest-cohort=(), fullscreen=(self "https://www.youtube-nocookie.com" "https://www.youtube.com")
```

Two capabilities are **granted** rather than denied:
- `fullscreen` for both YouTube hosts — otherwise the embedded player cannot go
  fullscreen on a phone («ما أقدرش إن هو يلف عشان يبقى بعرض الفيديو كامل»).
- `microphone=(self)` **only on `/admin*`** (`isAdminRoute(pathname)`), because the
  admin inbox has a voice recorder. A denied feature is not a prompt the user can
  accept — `getUserMedia` rejects before the browser asks.

### 3.2 CSP

`buildPublicCsp(dev)` and `buildAuthenticatedCsp(_nonce, dev)` in `apps/web/proxy.ts`.
**They are currently identical** — the nonce parameter is accepted and deliberately
unused, because `cacheComponents: true` in `next.config.ts` serves authenticated routes
from a cached HTML shell that cannot carry a per-request nonce, and `'strict-dynamic'`
therefore blocked every Next chunk when enforcement was first switched on (read that
docblock before "restoring" the nonce).

Directives (production, non-dev):

```
script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://static.cloudflareinsights.com
           https://www.youtube.com https://www.clarity.ms https://scripts.clarity.ms
default-src 'self'
style-src 'self' 'unsafe-inline'
img-src 'self' blob: data: https://i.ytimg.com https://c.clarity.ms https://c.bing.com <MEDIA_ORIGIN>
font-src 'self'
media-src 'self' blob: <MEDIA_ORIGIN> <VIDEO_ORIGIN>
manifest-src 'self'
worker-src 'self' blob:
object-src 'none'
base-uri 'self'
form-action 'self'
frame-ancestors 'none'
frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com
          https://drive.google.com https://docs.google.com
connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com
            https://*.clarity.ms https://c.bing.com <VIDEO_ORIGIN>
report-uri /api/security/csp-report
report-to csp-endpoint
upgrade-insecure-requests            ← only when CSP_ENFORCE=true
```

Header name is `Content-Security-Policy` when `process.env.CSP_ENFORCE === 'true'`,
otherwise `Content-Security-Policy-Report-Only` (`CSP_HEADER_NAME` in `proxy.ts`).

> ⚠️ `docs/runbooks/launch-runbook.md` §1 still says *"Status: NOT YET DONE"* and
> describes a nonce + `'strict-dynamic'` policy. **That section is stale.** `proxy.ts`
> contains measurements taken *"on production 2026-08-15, with `CSP_ENFORCE` on"*,
> `docker-compose.yml` passes `CSP_ENFORCE: ${CSP_ENFORCE:-}` into `web`, and
> `apps/web/playwright.config.ts` forces `CSP_ENFORCE: 'true'` for the whole e2e suite.
> Trust `proxy.ts`.

One extra, **enforced** policy: the JavaScript playground worker at `JS_RUNNER_PATH`
gets its own `Content-Security-Policy: <JS_RUNNER_CSP>` (never report-only) — it is the
one response allowed to evaluate a string, and `public/js-runner.js` deletes `fetch`,
`XMLHttpRequest`, `importScripts`, `WebSocket` and `EventSource` at startup.

Media responses carry `Content-Security-Policy: default-src 'none'; sandbox`
(`apps/api/src/modules/media/media.controller.ts:180`).

### 3.3 Which of these affect a native client

**Almost none.** A Flutter app is not a browser: it does not parse CSP, does not enforce
`Permissions-Policy`, does not honour `X-Frame-Options`, `COOP` or `CORP`, and does not
run a report endpoint. Specifically:

| Header | Native impact |
|---|---|
| CSP (all forms) | **None.** Only a WebView that loads a page *from this origin* would apply it. |
| `Permissions-Policy` | **None natively** — but if you embed the site in a `webview_flutter`, `microphone`/`camera` are denied outside `/admin` and `getUserMedia` will reject with no prompt. |
| `Strict-Transport-Security` | **None** for Dart's HttpClient (no HSTS store). Always use `https://` explicitly. |
| `X-Frame-Options`, `frame-ancestors`, `COOP` | None. |
| `Cross-Origin-Resource-Policy: same-site` on web pages | None — and media serves `cross-origin` anyway, so `<img>`/`Image.network` from `media.aymanaboelela.com` works from anywhere. |
| `X-Content-Type-Options: nosniff` | None; but do trust the declared `Content-Type`: uploaded images are re-encoded and always served as `image/webp` (`OUTPUT_MIME`, `packages/contracts/src/admin/media.ts:46`). |
| `Cache-Control` / `Vary` from the API | **Yes** — see §3.5. |

The one CSP-adjacent thing a native client *does* inherit is the **consequence** of the
policy on the video path: `NEXT_PUBLIC_VIDEO_ORIGIN` must be in `media-src` **and**
`connect-src` for HLS to work in a browser. Natively you skip that, but the same
`VIDEO_MIRROR_PUBLIC_URL` config still decides whether a mirror exists at all.

If you ship a **WebView** for any screen (the admin panel, the Python playground, a
document viewer), you inherit the whole table above. `frame-ancestors 'none'` +
`X-Frame-Options: DENY` mean you cannot iframe the site from your own HTML shell; a
top-level WebView navigation is fine.

### 3.4 CSRF — this one **does** apply to native clients

`apps/api/src/modules/security/csrf.guard.ts` is registered as a second global
`APP_GUARD` (`security.module.ts`). On **`POST`, `PUT`, `PATCH`, `DELETE`** to any route
that is not `@Public()` (or is `@Public()` **and** `@RequireCsrf()`), it enforces three
checks in this order:

1. If `Origin` is present it must equal `APP_URL` **exactly** → else
   `403 "CSRF: origin mismatch"`.
2. If `Sec-Fetch-Site` is present it must be `same-origin` or `none` → else
   `403 "CSRF: cross-site request"`.
3. `x-csrf-token` must be present and non-empty → else
   `403 "CSRF: missing x-csrf-token header"`.

**Absent headers are accepted for 1 and 2** — server-to-server callers (Next Server
Actions, and a native app) carry neither. **Header 3 is not optional.** The guard checks
*presence only*; it never compares the value to the `__Host-csrf` cookie.

Therefore a Flutter client must:

```dart
dio.options.headers['x-csrf-token'] = 'mobile';  // any non-empty string
// and must NOT send an Origin header, or must send exactly:
// 'https://aymanaboelela.com'
```

Routes that are `@Public()` **and** `@RequireCsrf()` (so still need the header):
`POST /api/assistant/conversations` and `POST /api/assistant/conversations/:id/messages`
(`apps/api/src/modules/assistant/assistant.controller.ts`).

Routes that are `@Public()` and exempt: `POST /api/security/csp-report` (a browser
physically cannot attach a custom header to a violation report).

### 3.5 Cache headers the API sets

`apps/api/src/common/http/private-cache.interceptor.ts`, a global `APP_INTERCEPTOR`:
every response on a route that is **not** `@Public()` gets

```
Cache-Control: private, no-store
Vary: Cookie
```

unless the handler set its own. Public routes are left alone so `/api/catalog/*` can be
edge-cached. Practical rules for a Flutter client:

- **Do not cache authenticated responses to disk.** They carry named minors' phone
  numbers and exam scores; `no-store` is the deliberate choice over `no-cache`.
- `Vary: Cookie` is meaningless for a bearer client. If you ever add your own HTTP
  cache, key on the account, not on the URL.
- Media is `Cache-Control: public, max-age=31536000, immutable` — safe to cache
  aggressively; keys are content-addressed
  (`apps/api/src/modules/media/media.controller.ts:176`).
- Public catalog reads *are* cacheable at the edge; expect a stale catalog for minutes
  after an admin change made directly against the API (`curl` straight to Nest does not
  trigger Next revalidation).

---

## 4. Rate limiting

### 4.1 The four global throttlers

`apps/api/src/app.module.ts`, `ThrottlerModule.forRootAsync`:

| Name | Window | Limit | Keyed on |
|---|---|---|---|
| `short` | 1 s | **10** | session (`trackerFromRequest`) |
| `medium` | 60 s | **60** | session |
| `long` | 3600 s | **1000** | session |
| `ip` | 60 s | **1200** | client IP (`ipTrackerFromRequest`) |

Storage: `ThrottlerStorageRedisService(redis)` from `@nest-lab/throttler-storage-redis`
— counters are shared across replicas. `apps/api/src/test/throttler-storage.int-spec.ts`
proves the in-memory store multiplied every limit by the replica count.

**All four apply to every request simultaneously.** Hitting any one returns 429.

### 4.2 How your requests are bucketed (this is already mobile-aware)

`apps/api/src/common/throttle/request-identity.ts`, `trackerFromRequest()`, in order:

1. `Cookie: __Host-session_token=…` or `session_token=…` → `sess:<sha256(value)[0..22]>`
2. **`Authorization: Bearer <token>`** → `sess:<sha256(token)[0..22]>` — matched
   **case-insensitively** (`/^bearer\s+\S/i`), explicitly because *"Dio capitalises
   it"*. The docblock names the reason this branch exists: without it every signed-in
   mobile student would fall into the IP bucket, and Egyptian carrier NAT (Vodafone,
   Orange, Etisalat) would put thousands of subscribers into one 10-req/s bucket.
3. otherwise → `ip:<request.ip>`

`ipTrackerFromRequest()` prefers `cf-connecting-ip` and falls back to `request.ip`.
`main.ts` sets `app.set('trust proxy', 1)` — a specific hop count, never `true`, so a
client cannot spoof `X-Forwarded-For` into a fresh bucket.

The session key is **forgeable** (the token is hashed without being validated) and is
there for *fairness*; the `ip` throttler is the abuse ceiling. Don't rotate tokens to
dodge limits — you'll just hit the 1200/min IP bucket, and on a shared carrier NAT
you'll take other students down with you.

### 4.3 Per-route overrides

Every `@Throttle(...)` in `apps/api/src` (grep-verified, non-spec files):

| Route(s) | short | medium | long |
|---|---|---|---|
| `GET /api/health` | **skipped entirely** (`@SkipThrottle(SKIP_ALL_THROTTLERS)`) | | |
| `/api/catalog/*` (whole controller) | 300 / 1 s | 3000 / 60 s | 30 000 / 1 h |
| `/api/taxonomy` (whole controller) | 300 / 1 s | 3000 / 60 s | 30 000 / 1 h |
| `GET /api/books` | 300 / 1 s | 3000 / 60 s | 30 000 / 1 h |
| `GET /api/news`, `GET /api/news/:slug` | 300 / 1 s | 3000 / 60 s | 30 000 / 1 h |
| `GET /api/settings/branding`, `GET /api/settings/public` | 300 / 1 s | 3000 / 60 s | 30 000 / 1 h |
| `POST /api/lessons/:lessonId/heartbeat` | 2 / 1 s | **15 / 60 s** | 500 / 1 h |
| `POST /api/lessons/:lessonId/dwell` | 2 / 1 s | 20 / 60 s | — |
| `POST /api/assistant/conversations` (open) | 1 / 10 s | 3 / 600 s | 5 / 1 h |
| `POST /api/assistant/conversations/:id/messages` | 1 / 3 s | 10 / 600 s | — |
| `POST /api/assistant/ask` | 2 / 6 s | 20 / 600 s | 60 / 1 h |
| `POST /api/book-orders`, `POST /api/book-orders/screenshot` | 1 / 10 s | 3 / 600 s | 10 / 1 h |
| `POST /api/book-orders/:id/payment` | 1 / 5 s | 5 / 600 s | — |
| `POST /api/security/csp-report` | 20 / 10 s | — | — |
| `POST /api/errors` | `{ default: 20 / 60 s }` — **a no-op**, see below | | |

> ⚠️ `apps/api/src/modules/diagnostics/diagnostics.controller.ts:57` writes
> `@Throttle({ default: { limit: 20, ttl: seconds(60) } })`. There is **no throttler
> named `default`** in this app — the configured names are `short`, `medium`, `long`,
> `ip` (`THROTTLER_NAMES` in `request-identity.ts`). Per-name overrides are looked up by
> name, so this decorator changes nothing and `POST /api/errors` is governed by the
> global limits. Same class of silent failure as a bare `@SkipThrottle()`, which the
> same file documents at length. Assume **60/min**, not 20/min.

`@SkipThrottle()` must always be written `@SkipThrottle(SKIP_ALL_THROTTLERS)` — the bare
form writes `THROTTLER:SKIPdefault` and exempts nothing.

### 4.4 Login-specific throttling (separate mechanism)

`apps/api/src/auth/login-throttle.service.ts` — an **in-memory, per-process** ledger
keyed on the *identifier*, wired through better-auth's `before` hook:

- `FREE_ATTEMPTS = 3` — no delay for the first three failures.
- Progressive delay `2^attemptCount` seconds, capped at `MAX_DELAY_SECONDS = 30`.
- `LOCK_THRESHOLD = 10` failures → soft lock for `LOCK_DURATION_MS = 15 * 60 * 1000`
  (15 minutes).

The lock is **per identifier**, so a student locked out on their phone number can still
sign in with their email. An admin setting a new password clears the lock
(`login-throttle.instance.ts` explains why the singleton lives in its own module).

### 4.5 The 429 response, exactly

`@nestjs/throttler@6.5.0` sets these headers on **every** throttled request (verified in
`node_modules/.pnpm/@nestjs+throttler@6.5.0.../dist/throttler.guard.js`):

```
X-RateLimit-Limit-short      X-RateLimit-Remaining-short      X-RateLimit-Reset-short
X-RateLimit-Limit-medium     X-RateLimit-Remaining-medium     X-RateLimit-Reset-medium
X-RateLimit-Limit-long       X-RateLimit-Remaining-long       X-RateLimit-Reset-long
X-RateLimit-Limit-ip         X-RateLimit-Remaining-ip         X-RateLimit-Reset-ip
```

and, when blocked, `Retry-After-<name>` — e.g. **`Retry-After-medium: 41`**.

> ⚠️ There is **no plain `Retry-After` header**. The suffix is dropped only for a
> throttler literally named `default`, which this app does not configure
> (`getThrottlerSuffix` in the guard). A Dio interceptor that reads `Retry-After` will
> always find nothing. Read the four suffixed variants and take the maximum.

Body (through `AllExceptionsFilter`,
`apps/api/src/common/filters/all-exceptions.filter.ts`):

```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests",
  "requestId": "<uuid or the x-request-id you sent>",
  "timestamp": "2026-09-08T12:00:00.000Z"
}
```

### 4.6 What a Flutter app must do to avoid tripping them

The web app has hit 429s twice in ways that are recorded, and both are shapes a mobile
client will reproduce faster:

- **Bulk admin GETs 429 after roughly 60 calls.** That is exactly the `medium` bucket:
  60 requests / 60 s / session. Any screen that fans out one request per row will hit it.
- **A sequence of ~20 quiz-slot `POST`s 429s.** Same bucket, plus the `short` 10/s
  ceiling on any burst.

Rules:

1. **One request per screen, not per row.** Never `Future.wait` over a list of ids.
2. **Serialise writes.** Cap concurrency at 2-3 and put ≥120 ms between requests, which
   keeps you under `short` (10/s) with margin.
3. **Global token-bucket client-side.** Budget 55/minute (under `medium`'s 60) and
   900/hour (under `long`'s 1000) per signed-in session across the whole app.
4. **Back off on 429 using `Retry-After-<name>`**, not a fixed delay, and not a plain
   `Retry-After` (§4.5). Exponential jitter on top.
5. **Heartbeats are the tightest real limit: 15/minute.** The web sends one every ~10 s
   plus a final one on background/unmount. On mobile, throttle heartbeats to **one every
   15-20 seconds**, coalesce app-lifecycle events, and never fire one per `didChangeAppLifecycleState`
   transition. The endpoint's docblock notes 15/min already leaves room for "a remount
   plus a couple of retries" — a Flutter route rebuild storm will blow through it.
6. **Do not retry a 429 with a fresh token.** See §4.2.
7. **Prefetch the public reads** (`/api/catalog/*`, `/api/taxonomy`, `/api/books`,
   `/api/news`, `/api/settings/public`) — those are on the 300/s tier and are the cheap
   ones. The expensive ones are the authenticated per-student reads.
8. **`/api/me/dashboard` is named in `apps/web/proxy.ts` as the heaviest endpoint in the
   app.** Do not call it as a side effect of every navigation.

---

## 5. Cookies

### 5.1 Every cookie the platform sets

| Cookie | Set by | Name (prod / dev) | `HttpOnly` | `Secure` | `SameSite` | `Path` | `Domain` | Max-Age |
|---|---|---|---|---|---|---|---|---|
| session | better-auth (API) | `__Host-session_token` / `session_token` | ✅ | prod only | **`lax`** | `/` | **never set** | 90 days |
| CSRF | `apps/web/proxy.ts` | `__Host-csrf` (both envs) | ❌ (readable by JS by design) | **always `true`** | **`strict`** | `/` | never set | session |
| assistant guest | API assistant controller | `__Host-assistant` / `assistant` | ✅ | prod only | `strict` | `/` | never set | 90 days |
| better-auth OAuth `state` etc. | better-auth | library defaults | ✅ | prod only (`defaultCookieAttributes`) | library default | `/` | never set | short |

Sources: `apps/api/src/auth/auth.config.ts` (`advanced.cookies.session_token` and
`advanced.defaultCookieAttributes`), `apps/web/proxy.ts` (`ensureCsrfCookie`,
`CSRF_COOKIE = '__Host-csrf'`), `apps/api/src/modules/assistant/guest-token.ts`
(`guestCookieName`, `GUEST_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60`) and
`apps/api/src/modules/assistant/assistant.controller.ts:200-206`.

Details that matter:

- **No `Domain` attribute is ever set, anywhere.** `__Host-` forbids it, and setting one
  silently breaks the prefix. So the cookies are host-only for `aymanaboelela.com` and
  are **not** sent to `media.` or `video.`
- `useSecureCookies: false` in `advanced` is a **naming** switch that suppresses
  better-auth's automatic `__Secure-` prefix so `__Host-` can be hand-rolled. It also
  dropped `Secure` from every *other* auth cookie, which `defaultCookieAttributes:
  { secure: isProduction }` puts back.
- `SameSite=lax` on the session cookie, **not `strict`**, and this is load-bearing: with
  `strict`, Google's cross-site callback redirect withholds the cookie it just set and
  a successfully authenticated user is bounced back to `/login`. The CSRF defence does
  not lean on SameSite (§3.4).
- **`session.cookieCache` is deliberately absent.** Every authenticated request does one
  indexed read of the session row, so `DELETE /api/sessions/:id` ("أجهزتي") revokes a
  device **immediately**. Do not cache a session decision client-side for longer than a
  request either.
- Session lifetime: `expiresIn: 60*60*24*90` (90 days), `updateAge: 60*60*24` (the
  row/cookie is refreshed at most once a day). A student who opens the app once a term
  signs in once.

### 5.2 Why a native client cannot rely on cookies — and what to do instead

The reasoning is already written down, in `auth.config.ts`'s `bearer()` docblock:

> *A native client has no cookie jar it can be trusted to drive — iOS and Android both
> persist `__Host-` cookies inconsistently across process death, and a cookie a native
> client DOES send drags better-auth's origin check in with it
> (`origin-check.mjs`: `useCookies = headers.has('cookie')`), which then 403s because a
> native request has no `Origin` at all.*

Four concrete reasons, in order of how quickly they bite:

1. **Sending *any* `Cookie` header flips better-auth into browser mode** and its origin
   check then rejects the request (403) because a native request has no `Origin`.
   → **Never attach a cookie jar to your Dio client.** Explicitly disable
   `CookieManager` / `cookie_jar`.
2. `__Host-` requires `Secure` + no `Domain` + `Path=/`; Dart's `HttpClient` cookie
   handling does not model the prefix, and neither iOS `HTTPCookieStorage` nor Android's
   `CookieManager` guarantee survival across process death.
3. The CSRF cookie is minted by the **web proxy**, not the API. A native client that
   never loads an HTML page never receives `__Host-csrf` at all — so the double-submit
   value has to be invented locally anyway (§3.4).
4. `Vary: Cookie` on every authenticated response is inert for a bearer client, and any
   intermediary cache keying on it is wrong for you.

**Instead — the supported path, already implemented server-side:**

```
1. POST /api/auth/sign-in/email  (or /sign-in/phone-number)
   → 200, and the response carries the session token BOTH in the JSON body and in the
     `set-auth-token` response header.
2. Store that token in Keychain (iOS) / EncryptedSharedPreferences or Keystore (Android).
3. Send it on every subsequent request:
     Authorization: Bearer <token>
     x-csrf-token: <any non-empty string>          // on POST/PUT/PATCH/DELETE
   and send NO Cookie header and NO Origin header.
4. On 401, clear the token and route to sign-in.
```

`bearer()` is registered **first** in `plugins` so its before-hook injects the session
cookie internally before any other plugin's hook looks for a session, and it covers the
**whole API**, not just `/api/auth/**` — `AuthGuard` resolves sessions via
`auth.api.getSession({ headers: toWebHeaders(request.headers) })`, and `toWebHeaders`
copies **every** incoming header including `authorization`
(`apps/api/src/auth/guards/auth.guard.ts`).

> ⚠️ Remove the `bearer()` plugin and mobile requests become **anonymous**, not 401.
> Public routes keep working and only signed-in ones break — a failure mode that reads
> like a UI bug. This is called out explicitly in `auth.config.ts`.

The **assistant guest cookie** has no bearer equivalent. A signed-out student's support
thread is identified purely by `__Host-assistant`. On mobile, either require sign-in for
the assistant, or ask for a server-side change that accepts the guest token as a header.

---

## 6. Environment / build configuration the mobile app needs

### 6.1 What the API requires (for reference, and for running a local backend)

`apps/api/src/config/env.ts` validates `process.env` at boot and reports **every**
problem in one thrown error. Required (no default):

| Variable | Rule |
|---|---|
| `API_PORT` | int 1-65535 |
| `APP_URL` | must start `http://` or `https://` (a bare `localhost:3200` is rejected — WHATWG parses it as scheme `localhost`) |
| `DATABASE_URL` | must start `postgresql://` or `postgres://` — the **runtime** role, DML only |
| `DIRECT_DATABASE_URL` | same, the **owner** role, migrations only |
| `REDIS_URL` | must start `redis://` or `rediss://` |
| `BETTER_AUTH_SECRET` | ≥ 32 characters |
| `BETTER_AUTH_URL` | http(s) URL |

Defaults: `NODE_ENV=development`, `MEDIA_BASE_URL=http://localhost:3300/media`,
`MEDIA_ROOT=./.media`, `MEDIA_MAX_BYTES=8388608` (8 MiB),
`VIDEO_MIRROR_CONCURRENCY=1`,
`GEMINI_MODEL='gemini-2.5-flash,gemini-2.5-flash-lite,gemini-3.5-flash-lite'`,
`GROQ_MODEL='openai/gpt-oss-120b,openai/gpt-oss-20b'`.

Optional, all-or-nothing groups enforced by `.refine()`:
`GOOGLE_CLIENT_ID`+`GOOGLE_CLIENT_SECRET`; the four `APPLE_*`;
`WA_SERVICE_URL`+`WA_SERVICE_TOKEN`; the three `VAPID_*`.
Plus the five `VIDEO_MIRROR_*`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `ANTHROPIC_API_KEY`,
`INSTAPAY_INGEST_TOKEN`.

> ⚠️ **The empty-string trap.** `docker-compose.yml` substitutes an unset `${VAR:-}` as
> the **empty string**, not as "absent". Zod's `.default()` only fires on `undefined`, so
> `z.string().min(1).default('x')` reads `''` as "present but invalid" and **crashes the
> API at boot**, which takes the whole site down because `web` waits on `api`'s
> healthcheck. `env.ts` solves this with `optionalSecret` / `optionalHttpUrl` /
> `optionalWithDefault`, all of which `preprocess` `''` → `undefined`. If you add a
> variable, use one of those three.

Web (`apps/web`): `API_ORIGIN` (runtime, server-side), `NEXT_PUBLIC_APP_URL`,
`NEXT_PUBLIC_MEDIA_ORIGIN`, `NEXT_PUBLIC_VIDEO_ORIGIN`, `NEXT_PUBLIC_CLARITY_PROJECT_ID`,
`REDIS_URL` (cache handler, **runtime only, not a build arg**), `CSP_ENFORCE`.
`NEXT_PUBLIC_*` are baked into the bundle at build time — changing them needs a rebuild.

### 6.2 What the **Flutter build** needs equivalents of

Ship these as `--dart-define` values with a per-flavor `.env`-equivalent, never
hardcoded:

| Flutter constant | Prod value | Maps to | Notes |
|---|---|---|---|
| `API_BASE_URL` | `https://aymanaboelela.com/api` | `APP_URL` + `/api` | Not a separate `api.` host. Do not invent one. |
| `MEDIA_ORIGIN` | `https://media.aymanaboelela.com` | `NEXT_PUBLIC_MEDIA_ORIGIN` / `MEDIA_BASE_URL` | Must differ from the app origin. Media path is `${MEDIA_ORIGIN}/media/<key>`. |
| `VIDEO_ORIGIN` | `https://video.aymanaboelela.com` | `NEXT_PUBLIC_VIDEO_ORIGIN` / `VIDEO_MIRROR_PUBLIC_URL` | May legitimately be **empty** — then no lecture has a mirror and every player falls back to YouTube. Handle empty. |
| `SITE_URL` | `https://aymanaboelela.com` | `APP_URL` | For share links, deep links, `next=` targets, and the `Origin` header if you choose to send one. |
| `GOOGLE_SERVER_CLIENT_ID` | from Google Cloud | `GOOGLE_CLIENT_ID` | Required only if you add native Google Sign-In. Today the web flow uses the redirect URI `${APP_URL}/api/auth/callback/google` (`docs/runbooks/google-sign-in.md`). |
| `CSRF_TOKEN_VALUE` | any non-empty constant | — | Presence is the control (§3.4). |
| `CLARITY_PROJECT_ID` | `y1hu9w4lii` (the compose default) | `NEXT_PUBLIC_CLARITY_PROJECT_ID` | Only if you mirror the web's session analytics. |
| `MAX_UPLOAD_BYTES` | `8388608` | `MEDIA_MAX_BYTES` / `MAX_UPLOAD_BYTES` | Client-side pre-check; the server enforces it too. |
| `MAX_DOCUMENT_BYTES` | `99614720` (95 MiB) | `MAX_DOCUMENT_BYTES` | Kept under Cloudflare's 100 MB ceiling. |
| `MAX_VOICE_BYTES` | `20971520` (20 MiB) | `MAX_VOICE_BYTES` | `packages/contracts/src/admin/media.ts:322` |
| `ENV_NAME` | `production` / `staging` / `local` | `NODE_ENV` | Drives cookie names in dev if you ever need them. |

**No secret belongs in the Flutter build.** `BETTER_AUTH_SECRET`, `INSTAPAY_INGEST_TOKEN`,
`WA_SERVICE_TOKEN`, `VAPID_PRIVATE_KEY`, every provider API key — all server-only. Any
of them shipped in an APK is extractable in minutes; `.gitleaks.toml` + the pre-commit
hook exist to keep them out of the repo (§8.3).

There is **no staging environment** in this repo. `docker-compose.yml` describes one
stack; `deploy/` describes one host. Point `staging` at a locally-run backend or at a
second Dokploy stack you create.

---

## 7. CI — what gates a PR, and how long it takes

`.github/workflows/ci.yml` (1304 lines), triggered on `push` to `main`,
**every `pull_request`**, a nightly `schedule` at `02:00` UTC, and `workflow_dispatch`.

### 7.1 The jobs

| Job | Name in the UI | Runs on PR? | Measured | `timeout-minutes` |
|---|---|---|---|---|
| `gitleaks` | `gitleaks` | ✅ | < 1 min | 10 |
| `quality` | `lint + typecheck` | ✅ | ~1 min | 12 |
| `unit` | `unit tests` | ✅ | ~2 min | 15 |
| `integration` | `integration tests` | ✅ | ~1 min | 15 |
| `e2e` (matrix ×4) | `playwright 1/4` … `4/4` | ✅ | **5 / 21 / 4 / 18 min** | 45 |
| `e2e-gate` | `playwright` | ✅ | — | 10 |
| `images` | `docker images` | ❌ (main / schedule / dispatch only) | ~2 min 20 s for both images | 30 |
| `deploy` | `deploy to production` | ❌ (`push`/`dispatch` on `refs/heads/main` only) | poll loop 90 × 10 s | 25 |

`deploy` needs **all six**: `needs: [gitleaks, quality, unit, integration, e2e-gate, images]`.

**Wall-clock for a PR: ~21-22 minutes**, dominated entirely by the slowest Playwright
shard. Everything that is not Playwright finishes in about two minutes and runs in
parallel. `--shard` splits by **file count, not duration**, so two shards carry the heavy
specs and two idle — the comment in `ci.yml` says rebalancing is known-worthwhile and
deliberately not bundled into a timeout change.

### 7.2 What each job actually does

- **gitleaks** — `actions/checkout@v5` with `fetch-depth: 0` (full history), gitleaks
  `8.30.1`, `gitleaks detect --source . --config .gitleaks.toml --redact --exit-code 1`.
  This is the half that `git commit --no-verify` cannot skip.
- **quality** — `pnpm install --frozen-lockfile`, `pnpm --filter @ayman/api run
  db:generate` (Prisma client is generated, not committed, and typecheck imports it),
  `pnpm lint`, `pnpm typecheck`. No Postgres service; `DIRECT_DATABASE_URL` is a dummy
  string that only has to parse.
- **unit** — provisions a **real Postgres 16** service, runs
  `scripts/db-bootstrap.sql` → `prisma migrate deploy` → `db:generate` → `db:seed`, then
  `pnpm test` (`turbo run test`). The job comment is honest that "unit" is a misnomer:
  *28 of the API's 66 `*.spec.ts` files open a real connection.*
- **integration** — Postgres **and** Redis services, same bootstrap, then
  `pnpm test:integration` (`jest --config jest.integration.config.js`, `*.int-spec.ts`).
- **e2e** — four sharded runners, each with its own Postgres and Redis, cached Chromium,
  then `pnpm --filter @ayman/web exec playwright test --shard=N/4`.
  `fail-fast: false` so one red shard does not kill the other three.
- **e2e-gate** — a tiny job that carries the *required* status-check name and reads the
  shards' verdict, including `skipped`.
- **images** — builds `apps/api/Dockerfile` and `apps/web/Dockerfile` with
  `docker/build-push-action@v6`, `push: false`, and **no build cache** (the comment
  measures that `type=gha,mode=max` spent ~6 minutes exporting cache to save 19 seconds
  of `pnpm install`).
- **deploy** — fingerprints what production is serving, `POST`s the Dokploy webhook from
  `secrets.DOKPLOY_DEPLOY_URL`, polls `/api/health`'s `startedAt` and the served asset
  hashes for up to 15 minutes, then runs a post-deploy smoke test.

### 7.3 What the e2e suite covers

`apps/web/e2e/*.e2e.ts` + two legacy `*.spec.ts` (34 files):

`a11y`, `about-page`, `admin-course-builder`, `admin-publish-course`,
`admin-question-panel`, `admin-upload-size`, `admin.spec`, `agent-discovery`,
`assistant`, `assistant-mobile-sheet`, `course-outline`, `foundations`,
`hero-headline-fit`, `learning-path`, `links-page`, `login-gated-content`,
`module-eval-recovery`, `not-found`, `onboarding-wizard`, `playground`,
`playground-python`, `quiz-attempt-review`, `quiz.spec`, `signup-onboarding-lesson`,
`site-nav-lockup`, `skew-check`, `student-course-entry`, `student-library`,
`student-notifications`, `student-profile`, `student-results`, `student-shell`,
`study-surface-a11y`, `webgl-context-loss`.

`apps/web/playwright.config.ts`:

- `testMatch: /e2e\/.*\.(e2e|spec)\.ts$/`, `testDir: '.'`
- `fullyParallel: false`, `workers: 1` — one shared database, one shared demo
  course/quiz.
- `retries: 1` in CI, `timeout: 60_000`, `expect.timeout: 10_000`
- `locale: 'ar-EG'`, `timezoneId: 'Africa/Cairo'` — *"the product is Arabic-only and RTL.
  Running the browser in any other locale hides bidi bugs."*
- Projects: `desktop` (Chrome 1440×900) and `mobile` (**`devices['Pixel 7']`**).
- Two `webServer` entries — the API on `:3300` and the web on `:3200`, with the browser
  pointed at `:3200` only: *"Pointing Playwright at :3300 directly would test a topology
  that does not exist."*
- **`env: { CSP_ENFORCE: 'true' }`** on the web server, so every existing test is also a
  CSP test.

### 7.4 Other workflows

- **`uptime.yml`** — every 10 minutes. `curl`s `/`, `/courses`, `/about`, `/links`,
  `/login`, `/register`, `/essentials`, `/api/health` (API **last**, on purpose: it
  stayed 200 through a 13-hour outage) and then greps the home page body for
  `أيمن أبو العلا`, because Traefik's own 19-byte plain-text 404 is also a 200-shaped
  answer to a naive check. A second job checks production is not *stranded* behind
  `main`. A red run is the notification (GitHub emails the owner).
- **`rerun.yml`** — one automatic retry for a red run on `main`, written for transient
  GitHub 429s on action downloads. ⚠️ It wins `gh run list --limit 1`, so the latest run
  on `main` is often **not** CI.
- **`backup-check.yml`** — 02:00 UTC daily, reads the Cloudflare R2 bucket directly
  (`scripts/check-r2-backups.py`) to prove last night's Postgres dump (00:00 UTC) and
  media tarball (00:20 UTC) exist, are fresh, and are non-empty.

### 7.5 What a Flutter app would need to add to CI

Nothing in `.github/workflows` knows about Flutter today. To fit the existing shape:

1. A **new workflow file** (e.g. `mobile.yml`), *not* new jobs in `ci.yml` — `deploy`
   `needs:` every job in `ci.yml`, so a red or slow Flutter job would freeze production
   deploys. Keep it a separate required check.
2. **`paths:` filtering** on `apps/mobile/**` + `packages/contracts/**` so a web-only PR
   does not pay for a Flutter build.
3. Jobs: `flutter analyze` → `dart format --set-exit-if-changed` →
   `flutter test` (unit + widget) → optionally `flutter build apk --debug`
   and `flutter build ios --no-codesign` for compile coverage.
4. **A `timeout-minutes` on every job.** The repo learned this the hard way — GitHub's
   default is six hours and a wedged runner froze production for a working day
   (`ci.yml`, the `gitleaks` job comment).
5. A **contract-drift gate**. The API's authorization matrix already fails when a route
   has no coverage row (§8.2); the mobile equivalent is a generated-client check that
   fails when `packages/contracts` changes and the Dart models do not. Today the only
   machine-readable API description is `apps/web/app/openapi.json/route.ts`, and it
   covers **only the public catalog**.
6. Integration tests (`integration_test/`) need the same Postgres + Redis + seeded DB
   the `integration` job provisions, plus the API and web servers — model it on
   `playwright.config.ts`'s two-`webServer` arrangement.
7. `gitleaks` already scans the whole repo including any `apps/mobile` — no change
   needed, but do not commit `google-services.json` / `GoogleService-Info.plist`
   with real keys.

---

## 8. Test conventions

### 8.1 Three runners, three globs, deliberately non-overlapping

| Runner | Glob | Config | Command |
|---|---|---|---|
| Jest (API unit) | `src/**/*.spec.ts` | `apps/api/package.json` → `jest` block | `pnpm test` → `turbo run test` |
| Jest (API integration) | `src/**/*.int-spec.ts` | `apps/api/jest.integration.config.js` | `pnpm test:integration` |
| Vitest (web unit) | see `apps/web/vitest.config.ts` | — | part of `turbo run test` |
| Playwright | `e2e/**/*.{e2e,spec}.ts` | `apps/web/playwright.config.ts` | `pnpm test:e2e` |

`.*\.spec\.ts$` deliberately does **not** match `-spec` (`int-spec.ts`), which is what
keeps the two Jest suites apart.

**Both Jest configs are `maxWorkers: 1`** — they share one Postgres and one Redis
keyspace; 8 tests were observed failing under parallel workers and passing serially. Do
not "fix" the perceived slowness by raising it.

**Always run `turbo test` from the repo root, never a single package** — `packages/contracts`
has its own suite and CI runs it; a per-app run misses it.

`apps/api`'s `test` script is more than Jest:
```
jest && tsx test/file-signature.check.ts && tsx test/contracts-barrel.check.ts
```
The second guard exists because importing runtime values from the `@ayman/contracts`
**root barrel** makes the API fail to boot while every test still passes — import from
the subpath (`@ayman/contracts/video`, `@ayman/contracts/phone`, …).

`turbo.json` runs tasks in **strict env mode**: a task only sees the variables named in
its `env` list. For `test` that list is `API_PORT`, `APP_URL`, `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`, `DATABASE_URL`, `DIRECT_DATABASE_URL`, `REDIS_URL` — because
`csrf.guard.spec.ts` instantiates `CsrfGuard`, whose constructor runs the **full**
`loadEnv()` schema. Add a required env var and you must add it here too.

### 8.2 The authorization-matrix coverage gate

`apps/api/src/test/authorization-matrix.int-spec.ts` (2000+ lines) builds four Nest apps
(anonymous / student / other-student / admin) and asserts the status of **every
registered route** for each actor. Routes are enumerated from Nest's DI container, not
from a hand-written list (`apps/api/src/test/route-inventory.ts` → `enumerateRoutes()`,
which reports `{ method, path, controller, handler, isPublic, permission }` and prepends
the `api` prefix by hand because `setGlobalPrefix` is not visible in metadata).

The gate:

```ts
it('accounts for every registered route across this file, quiz.authz.spec.ts, or a documented gap', () => {
  ...
  expect(uncovered).toEqual([]);
});
```

Plus a second one, `it('marks nothing public by accident')`.

Escapes are two explicit sets with written reasons: `COVERED_BY_QUIZ_AUTHZ_SPEC`
(~40 quiz routes covered by `quiz.authz.spec.ts`) and `KNOWN_GAPS` (multipart uploads
that need a magic-byte-valid fixture, plus the three non-browser machine callers:
`POST /api/ingest/transfers`, `POST /api/marketing/wa/inbound`).

> **Every new route needs a row here.** It is a coverage gate and it only fails on the
> PR (it is an `*.int-spec.ts`, so it runs in the `integration` job, and locally only if
> Postgres **and** Redis are up). A mobile-motivated endpoint added without a matrix row
> turns the PR red in the `integration` job with a bare list of route strings.

### 8.3 Git hooks

`package.json` has `"prepare": "git config core.hooksPath .githooks"`, so `pnpm install`
wires them up.

**`.githooks/pre-commit`** — requires `gitleaks` on `PATH` (fails with
"run 'brew install gitleaks'" if absent) and runs
`gitleaks protect --staged --redact --config .gitleaks.toml`.

**`.githooks/pre-push`** — runs, in order:
`pnpm lint` → `pnpm typecheck` → `pnpm test`, then
`pnpm test:integration` **only if** `nc -z localhost 5432` **and** `nc -z localhost 6379`
both succeed (otherwise it prints `⊘ integration tests — skipped` and lets you through).
It prints elapsed seconds and lists the failed checks. `--no-verify` bypasses it, and
the hook itself says that is legitimate for a WIP push and not for one you intend to
merge.

Two known local-environment traps recorded in this repo's memory:

- A **fresh worktree** fails the pre-push hook on *setup* (missing `.env`, missing Prisma
  client), not on your change. The PR is the real gate.
- Two audit-chain specs are **red on this machine before you change anything**, and the
  pre-push hook blocks on them.

### 8.4 Local suite flakiness

The full local suite shares one database; a *different* random spec fails each run. Do
not attribute a single red spec to your change without re-running it in isolation.

---

## 9. Runbooks a mobile engineer must know

`docs/runbooks/` — 10 files. The ones that matter for mobile, in order:

### 9.1 `deploy.md` — how anything reaches production

- **Merging to `main` deploys. Do nothing else.** The `deploy to production` job posts to
  the Dokploy webhook after all checks pass.
- ⚠️ **The webhook URL is HTTP.** The token inside it is the whole credential and travels
  in the clear on every deploy. *"Treat it as leaked until the panel is behind HTTPS and
  the URL is rotated."*
- ⚠️ **Do not use the deploy key's `last_used` as evidence.** Measured a full day stale
  while deployments were succeeding. Read the Deployments tab and compare the commit hash
  to `git rev-parse origin/main`.
- Verify a deploy by looking at something that **changed in that deploy** — the icon URL
  hash, or `/api/health`'s `startedAt` — not by a 200.
- Most likely deploy failure: **RAM**. `exit code 137` / `Killed` in the log means the
  2 GB VPS OOM'd building the web bundle, not a code problem.
- `deploy/deploy.sh`, `deploy/ayman-*.service` are a **dead systemd install**. They run
  `next start`, which is incompatible with `output: 'standalone'`. Do not run them.

### 9.2 `vps-setup.md` — the box, the firewall, Cloudflare

2 GB RAM minimum, Ubuntu 24.04, `ufw allow OpenSSH` + `80,443/tcp` and nothing else —
verification is that `ufw status` shows **no** 5432, 6379, 3200 or 3300. Cloudflare goes
grey → certificates → orange, `SSL/TLS: Full (strict)`, `Always Use HTTPS`. Error
decoder table at the end maps Cloudflare `525` (nothing on 443), `526` (bad cert),
`413` (upload over the edge limit) and the `MEDIA_BASE_URL must be a DIFFERENT origin`
boot failure.

### 9.3 `google-sign-in.md` — the OAuth redirect a mobile app has to work around

The registered redirect URI is **`${APP_URL}/api/auth/callback/google`** — a *web* URI.
Apple is scaffolded API-side, has **no button in the UI**, and cannot be driven from
`http://localhost` at all. `docs/DEPLOYMENT.md` §4 adds the operational landmine: Apple's
`client_secret` is a **JWT that expires within 6 months**, so Apple sign-in will stop
working with no code change and no clear error. *"Set a reminder to renew every 5
months."*

### 9.4 `backups.md` — R2, and why the green log line is not evidence

Dokploy runs the Postgres dump at 00:00 UTC and the media tarball at 00:20 UTC into a
Cloudflare R2 bucket, configured **only in the Dokploy panel** (nothing in this repo).
`backup-check.yml` reads the bucket, because a run that uploads a zero-byte dump leaves a
**green** line. The `media` volume must be backed up with the database — one without the
other is not a complete restore. The `wasession` volume must **never** be backed up
(restoring stale WhatsApp pairing keys is the fastest way to permanently unlink the
number).

### 9.5 `instapay-transfers.md` — the one place a real handset is part of the architecture

Status as of 2026-09-08: *"code complete, nothing configured, nothing deployed."* With
`INSTAPAY_INGEST_TOKEN` unset the route rejects every request.

Relevant to mobile for two reasons:

- It documents, with evidence, that **iOS hands app notifications to no automation** —
  a platform rule, not a setting. That is why the receiver is a cheap **Android** handset:
  Android lets an app read another app's notifications. If anyone asks the Flutter app to
  read InstaPay pushes on iOS, this table is the answer.
- `POST /api/ingest/transfers` authenticates with a **header token**
  (`x-instapay-token`, compared in full, `UnauthorizedException` otherwise —
  `apps/api/src/modules/payments/transfers-ingest.controller.ts:36-40`) and no cookie,
  because *"the caller is a phone, not a browser, so a session cookie is the wrong
  question to ask and a header token is the right one."* That is the precedent for every
  machine-to-machine route.

### 9.6 `whatsapp-marketing.md`, `assistant-chat.md`, `agent-discovery.md`

- WhatsApp: the `wa` sidecar is on the internal network only, guarded by `x-wa-token`,
  and reachable at `http://wa:3400`. Not callable from a client.
- Assistant chat: `GEMINI_API_KEY` / `GROQ_API_KEY` / `ANTHROPIC_API_KEY` are all
  optional; unset, `POST /api/assistant/ask` **still answers**, out of written
  paragraphs. Do not treat a scripted answer as a failure.
- Agent discovery: `/openapi.json`, `/llms.txt`, `/.well-known/api-catalog`,
  `/.well-known/agent-skills/index.json`, `/docs/api`, and markdown twins of public
  pages (`/courses.md`, or `Accept: text/markdown`). The `Link` header advertising them
  is published **from Cloudflare**, not from the app — putting it in `proxy.ts` or
  `next.config.ts` makes Next capture it into the cached page shell and re-append a copy
  on every revalidation, which grew to 38 KB of headers and took the site down
  (`deploy/cloudflare/apply-link-header.mjs`, measured 2026-08-06 and again 2026-08-12).

---

## 10. Failure modes a mobile client must render honestly

| Symptom | Real cause | What the app should do |
|---|---|---|
| **500 on every authenticated route, `/api/health` still `ok`** | Redis is down. The throttler storage **rejects** rather than buffering (`throttler-storage.int-spec.ts`: *"rejects rather than buffers when Redis is unreachable"*), a rejecting guard is a 500, and the guard runs on every route except `/api/health`. | Show a platform-degraded state, not a login error. Do not sign the user out. Retry with long backoff. |
| **Every page 404s but `/api/health` is 200** | Traefik has no healthy backend — usually the API healthcheck failed and `web` never came up. Happened for 13 hours on 2026-08-06 with a 19-byte `text/plain` body. | A 404 with a tiny non-JSON body on a route you know exists is an outage, not a missing resource. |
| **404s for a few seconds, then fine** | Deploy window: old container down, new one starting. | Retry idempotent GETs once after ~2 s. |
| **Empty lists / half-broken images for ~10 minutes after a deploy** | `next build` bakes an empty `'use cache'`; Redis cache cold. | Do not surface an empty-state as an error. Wait before diagnosing. |
| **`429`** | §4. | Read `Retry-After-<name>`, back off, and fix the fan-out. |
| **`403 "CSRF: missing x-csrf-token header"`** | You omitted the header on a write. | §3.4. |
| **`403` from better-auth on sign-in** | You sent a `Cookie` header, which flipped better-auth into browser-mode origin checking, and a native request has no `Origin`. | Disable the cookie jar entirely. |
| **Signed-in requests silently behave as anonymous** | The `bearer()` plugin is missing/disabled server-side, or your `Authorization` header is malformed. Public routes keep working. | Treat "unexpectedly anonymous" as an auth bug, not a permissions bug. |
| **`413`** | Cloudflare's 100 MB edge limit, before the server. No server log entry. | Enforce `MAX_DOCUMENT_BYTES` (95 MiB) client-side and show the platform's own Arabic message. |
| **`403` from a script but `200` from `curl`** | Cloudflare UA filtering. | Always send a real `User-Agent`. |
| **`404` shaped like a soft-404 with a correct `<title>`** | Route-param encoding bug (an Arabic slug). | Percent-encode path segments exactly once. |
| **`ProcessException` / socket reset mid-request** | Deploy `SIGTERM` — shutdown hooks drain in-flight requests but the socket still closes. | Idempotent retry. |

Every error body from the API has the same shape
(`apps/api/src/common/filters/all-exceptions.filter.ts`):

```json
{ "statusCode": 403,
  "message": "…",
  "code": "quiz_not_open_yet",   // OPTIONAL — present only when the thrower supplied a string `code`
  "requestId": "…",
  "timestamp": "…" }
```

- `code` is the **machine-readable branch key**. It was absent until 2026-09-08, and its
  absence made every distinct refusal read as `"Forbidden Exception"`. Branch on `code`,
  fall back to `statusCode`, and only show `message` when you have nothing better.
- `requestId` echoes an inbound **`x-request-id`** header if you send one, otherwise it is
  a fresh UUID. **Send one from Flutter** (`uuid.v4()` per request) and log it — it is the
  only handle support has.
- Non-`HttpException` failures become a generic 500 with `message: "Internal server
  error"` and no detail. A malformed id and a missing row both become **404 `"Not Found"`**
  (`isPrismaDataValidationError` / `isPrismaRecordNotFound`).

---

## 11. Streaming endpoints (SSE) — Dio configuration

Two routes stream, and neither is WebSocket:

| Route | Auth | Content-Type |
|---|---|---|
| `GET /api/me/notifications/stream` | `@RequirePermission('profile:read')` | `text/event-stream; charset=utf-8` |
| `POST /api/assistant/ask` | `@Public()` + `@RequireCsrf()` | `text/event-stream; charset=utf-8` |

Both set `Cache-Control: private, no-store, no-transform`, `Connection: keep-alive`,
`X-Accel-Buffering: no`. The notifications stream writes `retry: 5000\n\n` first (the
browser's reconnect delay — reimplement that yourself in Dart) and sends
`data: {"type":"ping"}` heartbeats. Every frame is a copy of what
`GET /api/me/notifications` would return anyway, *"so a client that misses every frame is
behind by one poll, not wrong"* — meaning polling is an acceptable fallback on mobile,
where a held-open connection costs battery.

In Dio: `ResponseType.stream`, no `receiveTimeout` (or a very large one), parse
`data:` lines yourself, and close the stream when the app backgrounds. The server tears
down on `response.on('close')`, so closing your socket does stop the work.

The comment on the notifications stream explains why SSE and not WebSocket: it is plain
HTTP, goes through the same proxy, carries the same session credential, and passes the
same `RequirePermission` guard — *"A WebSocket would need its own upgrade path through
the proxy, its own authentication handshake, and its own reconnect logic, to carry
strictly less."* Do not ask for a WebSocket.

---

## 12. Uploads

- Multipart, field name **`file`**, single file
  (`FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } })`).
- Images: **8 MiB** (`MAX_UPLOAD_BYTES`, `packages/contracts/src/admin/media.ts:23`),
  re-encoded server-side and always served back as **`image/webp`** (`OUTPUT_MIME`).
- Documents: **95 MiB** (`MAX_DOCUMENT_BYTES:275`) — under Cloudflare's 100 MB edge cap.
- Voice: **20 MiB** (`MAX_VOICE_BYTES:322`).
- The server validates **magic bytes**, not the declared MIME
  (`apps/api/src/modules/media/file-signature.service.ts`, and `test/file-signature.check.ts`
  runs as part of `pnpm test`). A renamed extension is a 400.
- Upload routes are in the authorization matrix's `KNOWN_GAPS` for their 2xx path only —
  the 401/403 denial rows **are** covered.
- The web compresses images in the browser before upload; a Flutter client should do the
  same (`flutter_image_compress`) rather than relying on the 8 MiB rejection.
- ⚠️ Historical: an upload path once died silently at exactly 1 MB because of a Server
  Action body ceiling, and a small test file passed on the broken code. **Test uploads
  with a file near the limit, not a thumbnail.**

---

## 13. Concrete Dio setup that satisfies everything above

```dart
final dio = Dio(BaseOptions(
  baseUrl: const String.fromEnvironment('API_BASE_URL',
      defaultValue: 'https://aymanaboelela.com/api'),
  connectTimeout: const Duration(seconds: 10),
  receiveTimeout: const Duration(seconds: 20),
  // 4xx/5xx must not throw before we can read `code` out of the body.
  validateStatus: (s) => s != null && s < 600,
  headers: {
    'accept': 'application/json',
    // Presence is the CSRF control; the value is never compared server-side.
    'x-csrf-token': 'mobile',
    // Realistic UA — Cloudflare 403s some default agents.
    'user-agent': 'AymanApp/1.0 (Android; Flutter)',
  },
));

// ⚠️ NO CookieManager. Sending any Cookie header flips better-auth into
// browser-mode origin checking and every write 403s.
// ⚠️ NO Origin header (or exactly 'https://aymanaboelela.com').

dio.interceptors.add(InterceptorsWrapper(
  onRequest: (o, h) {
    o.headers['x-request-id'] = const Uuid().v4();          // shows up as `requestId`
    final t = tokenStore.read();
    if (t != null) o.headers['authorization'] = 'Bearer $t'; // case-insensitive server-side
    h.next(o);
  },
  onResponse: (r, h) {
    // Every sign-in / sign-up / refresh response that sets the session
    // emits this header. Persist it to the Keychain / Keystore.
    final t = r.headers.value('set-auth-token');
    if (t != null && t.isNotEmpty) tokenStore.write(t);
    h.next(r);
  },
));

// 429: read the SUFFIXED headers. There is no plain `Retry-After`.
int retryAfterSeconds(Headers h) => ['short', 'medium', 'long', 'ip']
    .map((n) => int.tryParse(h.value('retry-after-$n') ?? '') ?? 0)
    .fold(0, (a, b) => a > b ? a : b);
```

---

## 14. Checklist of everything that must change server-side or product-side for mobile

Nothing below is a bug in the web app — each is a place where the current design assumes
a browser.

1. **CSRF header on a native client is theatre.** `CsrfGuard` demands a non-empty
   `x-csrf-token` on every write, but a native app has no `__Host-csrf` cookie to echo,
   so it invents one. Either document that constant, or exempt requests carrying
   `Authorization: Bearer` (they cannot be cross-site-forged by an HTML form anyway).
   Today: the client must send a dummy value.
2. **The assistant's guest thread is cookie-only.** `__Host-assistant` is `HttpOnly` and
   has no bearer equivalent. A signed-out mobile user cannot have a support thread.
3. **Push is Web Push (VAPID) only.** `apps/api/src/modules/notifications/push.service.ts`
   speaks `web-push` and stores browser `PushSubscription` rows
   (`{ endpoint, keys: { p256dh, auth } }`). There is **no FCM and no APNs** anywhere in
   the repo. A native app needs new subscription storage, a new sender, and a new
   `notificationclick`-equivalent deep-link contract.
4. **No deep-link association files.** `apps/web/app/.well-known/` contains only
   `api-catalog` and `agent-skills` — no `apple-app-site-association`, no
   `assetlinks.json`. Universal Links / App Links must be added before OAuth callbacks or
   notification URLs can open the app.
5. **Google/Apple sign-in is a web redirect.** The registered redirect URI is
   `${APP_URL}/api/auth/callback/google`. Native Google Sign-In needs a server client id
   and a token-exchange endpoint; Apple is scaffolded, buttonless, untested, and its
   client secret expires within 6 months.
6. **No API versioning.** `setGlobalPrefix('api')` and nothing else — no `/v1`, no
   `Accept-Version`. A shipped app cannot be protected from a breaking contract change.
7. **Contracts are TypeScript-only.** `packages/contracts` is the source of truth and
   Dart cannot consume it. `apps/web/app/openapi.json` covers **only the public catalog**
   and is explicitly *"Read-only, unauthenticated … the same data the marketing site
   renders"*. Generating the authenticated surface (zod → JSON Schema → Dart) is a
   prerequisite for a type-safe client.
8. **Rate limits are tuned for a browser's request pattern.** Heartbeats at 15/min and
   the global 60/min will be hit by any list-detail screen that fans out. Either the
   client batches, or specific endpoints get raised ceilings.
9. **A Redis outage is a total outage for the app** (500 on everything but
   `/api/health`), because the throttler fails closed. The client needs a distinct
   degraded state.
10. **Media, video and API are three separate origins.** The client needs all three as
    config, must not derive one from another, and must handle `VIDEO_ORIGIN` being empty
    (no mirror → YouTube fallback → blocked on ministry tablets, which is the whole
    reason the mirror exists).
11. **Video playback is two players.** `mirror` non-null ⇒ HLS
    (`{ hlsUrl: string startsWith 'https://', maxHeight: int }`,
    `packages/contracts/src/video.ts:408-411`, reached via
    `LessonPlayer.video.mirror`); `mirror: null` ⇒ YouTube by `youtubeId` (the 11-char
    id, never a stored URL). Flutter needs both an HLS player and a YouTube player.
12. **No staging environment exists.** One compose stack, one host, one domain.
13. **Cloudflare's 100 MB edge cap** applies to the app's uploads too; the platform
    already lowered its own limit to 95 MiB to produce a decent error.
14. **The origin IP is reachable and `cf-connecting-ip` is forgeable there.** Certificate
    pinning in the app should pin the leaf/intermediate Cloudflare presents, and must be
    revisited if the origin is ever locked to Cloudflare ranges.
15. **CI has no Flutter lane and `deploy` needs every `ci.yml` job.** Put mobile in its
    own workflow (§7.5) or a slow Flutter build freezes web deploys.
16. **`apps/web` already ships a PWA** (`app/manifest.ts`, `public/sw.js`,
    `components/pwa/service-worker-register.tsx`, `app/offline/page.tsx`) with
    `display: standalone`, `lang: ar`, `dir: rtl`. Whatever the native app does about
    offline and add-to-home-screen has to be reconciled with the installed PWA, not
    designed as if none existed.
