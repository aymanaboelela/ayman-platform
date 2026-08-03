# Login-gated content — design

**Date:** 2026-08-03
**Status:** approved
**Scope:** no lesson content — video, text, resources — reaches an anonymous
visitor, including the free-preview lesson that plays on the public course page
today; a student who is turned away lands back where they were once they sign
in; a signed-in student reaches the player in one click; and a session lasts
long enough that signing in is a rare event rather than a weekly one.
**Out of scope:** payment, per-course pricing, and anything that changes *who*
is entitled to a course once signed in — v1 stays free for every registered
student. Content protection beyond the app boundary (see §2).

## 1. Why

The founder's requirement, stated directly: *nobody opens a video or anything
else — even a free one — without signing in first; once signed in, the platform
remembers, and courses just work.*

Three things stand between the platform and that sentence.

**The public course page plays a video to anyone.** `GET
/api/catalog/courses/:slug` is `@Public()` and returns `videoExternalId` for any
lesson flagged `isFreePreview`
(`apps/api/src/modules/catalog/catalog.service.ts`). The page embeds it in a
`<YouTubeEmbed>` and additionally announces it in `VideoObject` JSON-LD
(`apps/web/app/(site)/courses/[slug]/page.tsx`). No session is involved at any
point.

**Signing in loses your place.** `proxy.ts` already redirects an anonymous
visitor to `/login?next=<pathname>`, but `LoginForm` never reads `next` — it
calls `resolvePostLoginDestination()` and lands on `/dashboard` or
`/onboarding` unconditionally. The `next` parameter has been written and
ignored since it was added.

**Signing in isn't enough to reach a lesson.** `PlayerService.outline` requires
an *active enrollment* and 404s without one, and **nothing in `apps/web` ever
calls `POST /api/courses/:courseId/enroll`**. There is no enroll affordance
anywhere in the product. A student can register, complete onboarding, and still
find every course unreachable — which makes "signed in and it just works" false
today, independent of any gate.

A fourth, smaller one: Better Auth runs on its default **7-day** session
(`apps/api/src/auth/auth.config.ts` declares no `session` block), so a student
away for a week signs in again.

## 2. What this does NOT protect

The platform spec (`2026-07-25-ayman-platform-design.md`, §Content protection)
records the decision plainly: **"Videos are public YouTube links; DRM would be
theater."**

This design gates *the platform*. Anyone holding an 11-character YouTube id can
still watch on youtube.com, and no change on this side alters that. What it buys
is real but bounded: the app stops handing ids to strangers, and browsing
converts into registration.

For the gate to protect anything at all, **the videos must be Unlisted on
YouTube**. Then the id is the key, and this design is what protects the key.
That is a channel setting, not code, and it is a precondition of the security
value claimed here — not an optimisation. Public videos plus this gate is a
funnel, not a control, and the spec says so rather than letting anyone conclude
otherwise from the code.

## 3. Founder decisions (locked)

Recorded so no plan re-litigates them:

1. **The catalog stays public; the content is gated.** `/courses` and
   `/courses/:slug` keep rendering titles, descriptions, section names, lesson
   names and durations for anonymous visitors and crawlers. Video, text and
   resources require a session. The sitemap, per-course metadata and
   `courseJsonLd` all survive; the alternative (gating the catalog) would have
   removed the platform from search results entirely.
2. **One button does everything.** A single "ابدأ الكورس" on the course page
   enrolls if needed and navigates to the lesson. No separate enroll step, and
   no silent enrollment on an accidental click.
3. **Sessions last 90 days, rolling.** A student who opens the platform at least
   once a term never signs in twice.
4. **No session cookie cache.** Every request re-reads the session, so revoking
   a device from `/settings/devices` takes effect immediately rather than after
   a cache window.

## 4. The gate

### 4.1 `videoExternalId` leaves the public contract

`CatalogLessonSchema.videoExternalId` is **deleted from
`packages/contracts/src/catalog.ts`**, not filtered at the service. That file
documents itself as "the allowlist the catalog serializer is tested against" —
removing the field there makes re-adding it to the wire a compile error in
`CatalogService.findBySlug`, rather than a one-line regression somebody can
reintroduce by pasting a `select`.

`isFreePreview` and `durationSeconds` stay: neither is a key to anything, and the
outline reads as a real table of contents with them.

### 4.2 `videoObjectJsonLd` leaves the public page

`videoObjectJsonLd` embeds `https://www.youtube.com/watch?v=<id>` as
`contentUrl`. Keeping it would defeat §4.1 in the same HTML document. It is
removed from `(site)/courses/[slug]/page.tsx`; `courseJsonLd` and
`breadcrumbJsonLd` are untouched.

**Cost, stated plainly:** video rich results for course pages are gone. This is
the price of the gate, and the founder accepted it. `lib/seo/jsonld.ts` keeps
the `videoObjectJsonLd` helper — the *player* page could legitimately use it in
a future plan — but no public route calls it.

### 4.3 What replaces the player on the public page

A locked panel, backed by the course cover (`coverKey`) rather than
`youTubeThumbnailUrl(externalId)` — the YouTube thumbnail would need exactly the
id §4.1 just removed. Courses with no cover fall back to the existing
`YEAR n` mark the aside already renders.

The panel carries the CTA (§5) and one line of copy explaining that the lesson
opens after signing in.

## 5. The one button

`(site)/courses/[slug]` is wrapped in `'use cache'` with `cacheLife('hours')`
(`lib/catalog.ts`) — one cached HTML document is served to every visitor, so the
page **cannot** render a different CTA per session without giving up that cache.

So the button does not branch on render. It branches on *click*:

```
"ابدأ الكورس"
   │
   └─ POST /api/courses/:courseId/enroll
        │
        ├─ 401 → /login?next=/courses/<slug>
        │        the login page reads `next` and shows
        │        "سجّل دخول عشان تكمل"
        │
        ├─ 200 → /courses/<slug>/lessons/<resumeLessonId>
        │
        └─ other → inline error, stay on the page
```

Three properties fall out of this, and each was a design goal:

- **The page stays fully cacheable.** No session probe on render, no
  `dynamic` opt-out, no per-visitor HTML.
- **No flash and no skeleton.** Anonymous and signed-in visitors see the same
  button in the same place at first paint. Nothing rearranges under the cursor.
- **The "you must sign in first" message appears where the founder asked for
  it** — at the moment of the click, on the page it sent them to.

`enroll` is a Prisma `upsert` keyed on `(userId, courseId)`, so it is already
idempotent: an enrolled student clicking again re-enters the same enrollment
rather than creating a second one.

### 5.1 `resumeLessonId`

`POST /api/courses/:courseId/enroll` gains one field. The response becomes:

```ts
{ enrollmentId, access, resumeLessonId }
```

`resumeLessonId` is the enrollment's `lastLessonId` when set, otherwise the
first published lesson of the first published section, otherwise `null` (a
published course with no published lessons — rendered as a disabled button, not
a crash).

It exists so the click costs **one** round trip. The alternative — enroll, then
`GET /api/courses/:slug/outline` to discover where to go — puts a second
sequential request on the critical path of the product's primary action.

The existing `enrollmentId` and `access` fields are untouched; this is additive,
so `entitlement.service.spec.ts` keeps asserting what it asserts.

### 5.2 CSRF

`apiPost` sends `x-csrf-token` from the `__Host-csrf` cookie, and `proxy.ts`
mints that cookie on **every** response including public routes
(`ensureCsrfCookie` runs on the `!isProtectedRoute` branch). An anonymous
visitor therefore has a valid CSRF token before the button exists, and the
anonymous POST reaches `AuthGuard` and returns **401**, not a 403 from
`CsrfGuard`. The client treats 401 — and only 401 — as "not signed in".

## 6. Coming back to where you were

### 6.1 The sanitiser is the load-bearing part

`next` arrives from the query string and ends up in a client-side navigation.
Unvalidated, `/login?next=https://evil.com` is a textbook open redirect, on the
one page a user is most primed to trust.

A single exported `safeNext(raw: string | null): string | null` is the only way
any surface reads it. It returns the value **only** when it is a same-origin
absolute path:

| Input | Result | Why |
|---|---|---|
| `/courses/x` | `/courses/x` | the intended shape |
| `https://evil.com` | `null` | absolute URL |
| `//evil.com` | `null` | protocol-relative — the classic bypass |
| `/\evil.com` | `null` | backslash; some browsers normalise it to `//` |
| `courses/x` | `null` | not rooted |
| `null` / `''` | `null` | nothing to do |

Callers fall back to their existing destination when it returns `null`. This
function gets its own unit-test table before anything calls it.

### 6.2 The four surfaces that carry it

| Surface | Today | After |
|---|---|---|
| `LoginForm` | always `/dashboard` or `/onboarding` | `safeNext` when onboarding is complete; otherwise `/onboarding?next=…` |
| `RegisterForm` | always `/onboarding` | `/onboarding?next=…` |
| `OnboardingForm` | `router.replace('/dashboard')` | `safeNext` from its own query, else `/dashboard` |
| `AuthProviders` (Google) | `callbackURL: '/onboarding'` | `/onboarding?next=…` |

The "ماعنديش حساب" link on `/login` and its counterpart on `/register` carry
`next` across, so a visitor who needs to register first is not dropped either.

An incomplete-onboarding student is **never** sent straight to `next`:
onboarding comes first, and `next` rides along to be honoured at the end. That
ordering already exists in `proxy.ts`'s redirect matrix and this must not
contradict it.

### 6.3 The login page says why

When `safeNext` returns a path, `/login` renders a notice above the form —
"سجّل دخول عشان تكمل". Presence of `next` is the signal; no second query
parameter is introduced to carry a reason that `next` already implies.

### 6.4 An already-signed-in visitor never sees a login form

`decideRedirect` gains one rule: an authenticated visitor requesting `/login` or
`/register` is redirected away — to `safeNext` if present, else `/dashboard`
(or `/onboarding` if incomplete, reusing the existing precedence).

This is the last piece of "don't make them sign in every time": a stale bookmark
or a "تسجيل الدخول" link tapped out of habit now lands on the dashboard instead
of an empty form. `/login` and `/register` join the set of paths the matrix
decides on — they are *not* added to `PROTECTED_PREFIXES`, which would invert
their meaning.

## 7. Staying signed in

`auth.config.ts` gains an explicit `session` block:

```ts
session: {
  expiresIn: 60 * 60 * 24 * 90,  // 90 days
  updateAge: 60 * 60 * 24,       // refreshed at most once a day
}
```

`expiresIn` sets both the row's expiry and the cookie's `Max-Age`. `updateAge`
keeps it rolling — a session used on day 89 is good for another 90 — while
bounding the refresh write to one per day per session rather than one per
request.

**`cookieCache` is deliberately not enabled** (§3.4). It would let the API trust
a signed cookie for a few minutes without reading the session row, which is
exactly what makes `DELETE /api/sessions/:id` — the "أجهزتي" revoke a student
uses when they lose a phone — stop being immediate. A single indexed
primary-key read per request is not the bottleneck at this platform's size, and
trading a security control for it is not a trade worth making. This paragraph
exists so nobody later "optimises" it back in without reading why.

## 8. Testing

The gate is the kind of thing that regresses silently — a `select` grows a
field, a JSON-LD helper comes back — so the tests are written to fail loudly on
exactly those two moves.

| Level | Test | What it prevents |
|---|---|---|
| Contract | `CatalogLessonSchema` rejects `videoExternalId` | the field returning to the public shape |
| API unit | `findBySlug` output has no video id on **any** lesson, free-preview included | the service re-adding it |
| API int | anonymous `GET /api/catalog/courses/:slug` body contains no 11-char id | end-to-end proof, independent of the serializer |
| API unit | `enroll` returns `resumeLessonId`: `lastLessonId` when set, first lesson when not, `null` when the course has none | the one-click flow breaking |
| Web unit | `safeNext` table from §6.1 | the open redirect |
| Web unit | `decideRedirect` cells for `/login` + `/register`, authenticated and not | signed-in users seeing a login form; anonymous ones being locked out of it |
| E2E | anonymous → course page → "ابدأ الكورس" → login (notice shown) → back to the same course → enrolled → lesson plays | the whole path, as the founder described it |
| Manual | view-source on a public course page: no 11-char id, no `youtube.com` URL | anything the above three miss |

The E2E test is the one that actually encodes the requirement. The rest defend
its parts.

## 9. Non-goals

- Payments, pricing, or any entitlement that is not "registered ⇒ allowed".
  `AccessGrant` already models more than v1 uses; this design adds nothing to it.
- Signed or expiring video URLs, a proxied player, or any other attempt at
  content protection beyond the app boundary (§2).
- Removing the `isFreePreview` column. It stays meaningful — an admin marks the
  lesson that leads the outline — it simply no longer implies "playable by
  strangers".
- Reworking `/settings/devices`, beyond confirming §7 leaves revocation
  immediate.
- Per-course or per-lesson visibility windows: `visible_from` / `visible_to`
  stay reserved and unenforced.
