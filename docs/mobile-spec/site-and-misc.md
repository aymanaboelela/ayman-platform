# Mobile spec — site & misc

Everything the Flutter app needs for: the public marketing surface, the news/SEO article
section, the Egyptian-curriculum taxonomy, profile & settings, media/uploads, marketing &
WhatsApp, feature flags / site settings / navigation, and client error reporting.

Every claim below is traceable to a file. Paths are repo-relative.

---

## 0. Conventions that apply to every endpoint in this document

### 0.1 Base URLs

There are **two** origins.

| Origin | What it serves | Env var (web) |
|---|---|---|
| API origin | everything under `/api/**` | `apps/web/next.config.ts` rewrites `/api/:path*` to the API |
| Media origin | `GET /media/:prefix/:name` — the raw image bytes | `NEXT_PUBLIC_MEDIA_ORIGIN` |

`apps/api/src/main.ts:32-34`:

```ts
app.setGlobalPrefix('api', {
  exclude: [{ path: 'media/:prefix/:name', method: RequestMethod.GET }],
});
```

So the media serve route is **NOT** under `/api`. It is `<mediaOrigin>/media/<storageKey>`.

`packages/ui/src/lib/branding.ts`:

```ts
export function mediaUrl(storageKey: string): string {
  const origin = process.env.NEXT_PUBLIC_MEDIA_ORIGIN ?? 'http://localhost:3300';
  return `${origin}/media/${storageKey}`;
}
```

**Flutter must reproduce exactly this**: the API returns *storage keys* (`ab/<uuid>.webp`),
never URLs, and the app builds the URL. The one exception is `User.image`, which may hold a
full `https://lh3.googleusercontent.com/…` URL for Google sign-ups — the rule the web uses is
*"starts with `http` → use as-is, otherwise treat as a storage key"*
(`apps/api/src/modules/profile/profile.service.ts`, `setAvatar` docblock).

### 0.2 Auth / CSRF

- Session is a cookie (`__Host-` prefixed, better-auth). Server-side `apiGet` in the web app
  forwards **no** cookie, which is why several public endpoints carry a widened throttle
  (see §0.3).
- Mutating routes decorated `@RequireCsrf()` need a custom header. `apps/web/lib/upload-client.ts`
  sends `CSRF_HEADER` with the cookie's value or the literal string `'browser-upload'`:
  > "The presence of a custom header IS the CSRF control — a cross-site HTML form cannot add
  > one… `CsrfGuard` also checks Origin and Sec-Fetch-Site."
- **Not every route in this document is CSRF-guarded.** `POST /api/errors` is deliberately not
  (`apps/api/src/modules/diagnostics/diagnostics.controller.ts`). `PATCH /api/profile/onboarding`
  and `/section` are not decorated with `@RequireCsrf()` either
  (`apps/api/src/modules/profile/profile.controller.ts`). The news admin routes are.

### 0.3 Throttling (matters — a mobile client that polls will hit these)

Default budget for the whole API (`apps/api/src/app.module.ts`): `short` 10/1s, `medium`
60/60s, `long` 1000/3600s, keyed on session-or-IP.

Widened on the public reference reads, identical constant in three places:

```ts
{ short: {limit: 300, ttl: 1s}, medium: {limit: 3000, ttl: 60s}, long: {limit: 30_000, ttl: 3600s} }
```

Applied to: `GET /api/taxonomy` (`taxonomy.controller.ts`), `GET /api/settings/branding` and
`GET /api/settings/public` (`admin/settings/settings.controller.ts`), `GET /api/news` and
`GET /api/news/:slug` (`news/news.controller.ts`), and the catalog controller.

`POST /api/errors` is `20 / 60s` per IP.

**Not** widened: `/api/home-blocks`, `/api/flags`, `/api/navigation` — those sit on the
default budget. A mobile client must cache them, not re-fetch per screen.

### 0.4 The copy table

All user-facing Arabic lives in `packages/contracts/src/copy/ar.ts` (Global Constraint 4).
Placeholders are `{name}` and are substituted by `formatCopy(template, { name })`
(`packages/contracts/src/format.ts`). Every string quoted in this document is verbatim from
that file; do not re-translate.

**No gendered address to students** — the platform never asks whether the student is a boy or
a girl and the copy must not guess (`copy.books` docblock).

---

## A. The public marketing site

Source: `apps/web/app/(site)/**`, shell in `apps/web/app/(site)/layout.tsx`.

### A.1 Route inventory, and what a mobile app should do with each

| Route | File | Data source | Mobile verdict |
|---|---|---|---|
| `/` | `(site)/page.tsx` | `GET /api/home-blocks` | **Do not port.** Marketing landing full of GSAP/WebGL. Ship a native "signed-out" screen instead. |
| `/courses` | `(site)/courses/page.tsx` | `GET /api/catalog` | Port as the native catalog (covered by the catalog spec, not here). |
| `/courses/[slug]` | `(site)/courses/[slug]/page.tsx` | catalog | Port (catalog spec). |
| `/years/[year]` | `(site)/years/[year]/page.tsx` | `GET /api/catalog`, filtered client-side | Port as a *filter* on the native catalog, not a screen. See §A.4. |
| `/books` | `(site)/books/page.tsx` | `GET /api/books` + `GET /api/settings/public` | Port (books/orders spec). |
| `/news` | `(site)/news/page.tsx` | `GET /api/news` | **Port** — §B. |
| `/news/[slug]` | `(site)/news/[slug]/page.tsx` | `GET /api/news/:slug` | **Port** — §B. |
| `/essentials` | `(site)/essentials/page.tsx` | 12 static terms + catalog | **Port as static content** — §A.5. The signed-in twin `/foundations` already exists. |
| `/about` | `(site)/about/page.tsx` | pure copy | Port as a small static screen, or link out. §A.6 |
| `/privacy` | `(site)/privacy/page.tsx` | copy + `contact.email` from settings | **Must exist in-app** (App Store / Play require it). §A.7 |
| `/terms` | `(site)/terms/page.tsx` | pure copy | **Must exist in-app.** §A.7 |
| `/links` | `(link)/links/page.tsx` | settings + `site-profiles.ts` | Link out; it is a bio-link page for external traffic. |

Not in `(site)` but adjacent: `/register`, `/login` (`(auth)`), `/welcome` (`(app)`).

### A.2 The landing page is composed from the DATABASE, not from `ar.ts`

This is the single most misunderstood thing in this area, so it is stated precisely.

**Chain:** `home_blocks` table → `GET /api/home-blocks` → `getHomeBlocks()` → `<HomePage>`.

- Table: `HomeBlock` in `apps/api/prisma/schema.prisma:3196-3210`.
  ```prisma
  model HomeBlock {
    id String @id @default(uuid(7)) @db.Uuid
    key String @unique
    type HomeBlockType
    props Json
    position Int
    isPublished Boolean @default(false)
    archivedAt DateTime?
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    @@index([position])
    @@map("home_blocks")
  }
  ```
- Postgres enum `HomeBlockType` (`schema.prisma:3175-3191`), **11 values, exactly**:
  `hero`, `whyRail`, `courseGrid`, `books`, `instructor`, `yearTracks`, `about`, `stats`,
  `testimonials`, `faq`, `cta`.
  Mirrored as `HOME_BLOCK_TYPES` in `packages/contracts/src/admin/home-blocks.ts`. A type in one
  and not the other is a 500 on insert, not a validation error.

**Endpoint (public):** `GET /api/home-blocks`
(`apps/api/src/modules/admin/home-blocks/home-blocks.controller.ts`, `@Public()`).

Returns a bare **array** (not an envelope) of:

```ts
// packages/contracts/src/admin/home-blocks.ts
HomeBlockSchema = z.object({
  id: z.string(),
  key: z.string(),
  position: z.number().int(),
  isPublished: z.boolean(),
  props: HomeBlockPropsSchema,   // discriminated union on props.type
})
```

Server filter and ordering (`home-blocks.service.ts` `listPublic`):

```ts
where:   { isPublished: true, archivedAt: null }
orderBy: [{ position: 'asc' }, { id: 'asc' }]
```

The `id: 'asc'` tiebreak is required — do not drop it.

**`props` union, field by field** (all from `packages/contracts/src/admin/home-blocks.ts`).
Shared: `eyebrow = z.string().max(60).default('')`, `lead = z.string().max(400).default('')`.

| `type` | Fields (name : type : rule) |
|---|---|
| `hero` | `eyebrowAr` str ≤60 def `''`; `headlineAr` str 4..120 **required**; `subheadlineAr` str ≤240 def `''`; `rotatingAr` string[1..120][] max 6 def `[]`; `leadAr` str ≤400 def `''`; `ctaLabelAr` str ≤40 def `''`; `ctaHref` str matching `/^\/[^\s]*$/` def `/register`; `secondaryCtaLabelAr` str ≤40 def `''`; `secondaryCtaHref` same regex def `/courses`; `stats` array (max 4) of `{value: str 1..20, labelAr: str 1..40}` def `[]`; `imageAssetId` uuid\|null def `null` |
| `whyRail` | `titleAr` str 2..80 req; `titleAccentAr` str ≤60 def `''`; `leadAr` ≤400; `leadSecondaryAr` ≤400; `items` array **min 2, max 12** of `{titleAr: 2..60, bodyAr: 4..240}` |
| `courseGrid` | `titleAr` 2..80 req; `leadAr` ≤400; `ctaLabelAr` ≤40 def `''`; `courseIds` uuid[] max 12 def `[]`; `limit` int 1..12 def **6** |
| `books` | `titleAr` 2..80 req; `leadAr` ≤400; `ctaLabelAr` ≤40 def `''`; `limit` int 1..12 def **3** |
| `instructor` | *nothing but `type`* — placement-only |
| `yearTracks` | *nothing but `type`* — placement-only |
| `about` | `titleAr` 2..120 req; `body1Ar` ≤600 def `''`; `body2Ar` ≤600 def `''`; `roleAr` ≤120 def `''`; `chipsAr` string[1..40][] max 4 def `[]` |
| `stats` | `titleAr` ≤80 def `''`; `items` **min 1 max 4** of `{labelAr: 1..40, value: 1..20}` |
| `testimonials` | `titleAr` ≤80 def `''`; `items` **min 1 max 12** of `{nameAr: 2..60, bodyAr: 4..400, avatarAssetId: uuid\|null def null}` |
| `faq` | `titleAr` ≤80 def `''`; `eyebrowAr` ≤60 def `''`; `items` **min 1 max 20** of `{questionAr: 4..200, answerAr: 4..1200}` |
| `cta` | `headlineAr` 4..120 req; `leadAr` ≤400; `ctaLabelAr` 2..40 **req**; `ctaHref` `/^\/[^\s]*$/` **req** |

Rule stated in the contract that a Flutter client must honour when it caches:
> "Every field added after a type ships MUST carry a `.default()`. Existing rows are re-parsed
> by `HomeBlocksService.toDto` on every read, so a new required field turns every stored block
> of that type into a 500."

**Fallback behaviour** (`apps/web/lib/home-blocks.ts`): `getHomeBlocks()` is `'use cache'` with
`cacheLife('minutes')`, and returns `DEFAULT_HOME_BLOCKS` when the API throws **or** when the
list is empty. The default page order is:
`hero`, `why-rail`, `featured-courses` (courseGrid, limit 3), `books-strip` (books, limit 3),
`year-tracks`, `about-instructor`, `faq` (10 rows).
There is deliberately **no** `instructor` block and `hero.stats` is deliberately `[]`
("taken off the hero by the brand owner… do not 'restore' them here").

**Admin routes** (same controller): `GET /admin/home-blocks` (`home:read`),
`POST /admin/home-blocks` (`home:write`), `PATCH /admin/home-blocks/:id`,
`PATCH /admin/home-blocks/:id/published` body `{isPublished}`, `DELETE /admin/home-blocks/:id`
(archive → `{ok:true}`), `POST /admin/home-blocks/:id/restore`,
`POST /admin/home-blocks/order` body `{ids: uuid[] 1..50, unique}`.
`HomeBlockCreateSchema.key` must match `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`.

**Mobile verdict:** a native app does not need `/api/home-blocks`. It is a web-page composer.
If the app ever wants an editable "home" it should get its own block set — do not reuse this
one, because `hero`/`yearTracks`/`whyRail` describe DOM sections with GSAP/WebGL behaviour that
does not exist on mobile.

### A.3 The shell: nav, footer, background layers

`apps/web/app/(site)/layout.tsx` mounts, in order: `WebMcpProvider` (renders nothing),
`AgentDiscoveryLinks`, `.dot-grid` + `DotGridSpotlight`, `SplashCursorMount` (WebGL fluid),
`SmoothScroll` (Lenis), `BlankPageProbe`, `SpecularButtons`, `SiteNav` (+ suspended
`SiteAccountSlot`), `children`, `SiteFooter`, suspended `AssistantSlot`.

All the atmosphere layers "self-disable under reduced motion and on coarse pointers, so neither
has ever run on a phone" — **so there is nothing here for Flutter to reproduce.**

`SiteNav` (`apps/web/components/site/site-nav.tsx`) has two states, `--over` (on the hero) and
`--pinned`; `/` is the only route with a hero. Content: logo mark + wordmark → `/`, theme
toggle, and an account slot (sign-in buttons for a visitor, the student's account for a
signed-in user).

`SiteFooter` (`apps/web/components/site/site-footer.tsx`) is a Server Component that reads
`getPublicSettingsOrDefaults()`. Structure:

- Closing CTA: `copy.landing.finalTitle` «نبدأ إمتى؟», `finalLead`, buttons `finalCta`
  «نبدأ دلوقتي» → `/register`, and `coursesCta` «كل الكورسات» → `/courses`.
- Brand column: wordmark (`copy.site.name` «أيمن أبو العلا» + `copy.site.tagline`
  «البرمجة وعلوم الحاسب — نظام البكالوريا المصرية»), `footerTagline`, social row.
- Social rows, **settings value first, `OFFICIAL_PROFILES` as fallback, row DROPPED if neither**:
  youtube / instagram / facebook / tiktok, plus `whatsappChannel` **with no fallback** (a bare
  `https://www.whatsapp.com/` was a shipped bug).
- `PAGE_LINKS`: `/` `footerHome`, `/courses` `coursesCta`, `/essentials`
  `trackEssentialsTitle`, `/books` `copy.books.pageTitle`, `/about` `aboutPageTitle`,
  `/links` `copy.linkhub.pageTitle`, `/news` **`copy.news.footerLink` = «شرح المنهج والدروس»**
  (deliberately not «نيوز»).
- `YEAR_LINKS`: `/years/1` «الصف الأول», `/years/2` «الصف الثاني». **Year 3 is not linked.**
- `ACCOUNT_LINKS`: `/register` «إنشاء حساب», `/login` «تسجيل الدخول», `/privacy`
  «سياسة الخصوصية», `/terms` «شروط الاستخدام».
- WhatsApp «كلّمنا» button: `waMeHref(contact.whatsapp)` — `null` when unset, and then the
  button is **not rendered**.

`waMeHref` (`packages/contracts/src/whatsapp.ts`) — reproduce verbatim:

```ts
const E164 = /^\+[1-9]\d{7,14}$/;
export function waMeHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (!E164.test(trimmed)) return null;
  return `https://wa.me/${trimmed.slice(1)}`;   // the '+' MUST be stripped
}
```

`packages/contracts/src/site-profiles.ts` holds the shipped fallbacks:

```
youtube   https://www.youtube.com/@2ayman6
instagram https://www.instagram.com/2ayman6
tiktok    https://www.tiktok.com/@2ayman_6
facebook  https://www.facebook.com/aymanaboelela2
OFFICIAL_WHATSAPP_CHANNEL = https://whatsapp.com/channel/0029VbDg0RG59PwNOoHE4l0i
OFFICIAL_WHATSAPP_E164    = +201021196367
```

`telegram`, `facebookGroup`, `whatsappGroup`, `email` have **no** fallback constant — render
them only when settings supply them.

### A.4 `/years/[year]` — the year filter

`apps/web/app/(site)/years/[year]/page.tsx`.

- Segment validated by `/^[123]$/`; anything else → 404 + `robots: {index:false, follow:false}`.
- Query param `?filter=free` — `'all' | 'free'`, anything other than the literal `free` is `all`.
  Free predicate is `isFreeCourse(course)` (`apps/web/lib/price.ts`).
- Titles: `YEAR_TITLES = {1: copy.years.year1, 2: copy.years.year2, 3: copy.years.year3}` =
  «الصف الأول بكالوريا» / «الصف الثاني بكالوريا» / «الصف الثالث بكالوريا». `<h1>` is
  `copy.years.title` («كورسات») + the year title.
- Filter pills: `copy.years.filterAll` «الكل», `copy.years.filterFree` «المجاني بس».
- List = `[...foundationCoursesOutsideYear(visible, year), ...visible.filter(c => c.year === year)]`.
- Empty states: `copy.years.empty` = «لسه مفيش كورسات منشورة للصف ده.»; with the free filter on,
  `copy.years.emptyFree` = «مفيش كورسات مجانية في الصف ده دلوقتي — جرّب «الكل».»
- **Grouping is by SUBJECT, in first-appearance order** (`apps/web/lib/course-groups.ts`
  `groupBySubject`) — never alphabetical, never by track.
- The foundation section renders **above** the subjects when it applies:
  badge `copy.years.foundationBadge` «ابدأ من هنا», title `foundationTitle` «الكورس التأسيسي»,
  lead `foundationLead` «الكورس ده مش لصف معيّن — أي حد لسه بادئ يبدأ منه، وبعده كورسات الصف بتبقى ماشية معاك.»
- Foundation matching is a **regex on the course title/subtitle**: `const FOUNDATION = /تأسيس/`
  (`apps/web/lib/foundation-courses.ts`). There is no flag on the course. `foundationCoursesOutsideYear`
  drops it from the year that already lists it, so it is never rendered twice.

**Arabic count label** — `courseCountLabel(n)` in `apps/web/lib/course-groups.ts`. Flutter must
copy this exactly; the naive `"$n كورس"` is wrong in three of four cases:

```
n == 1        → copy.years.countOne  = 'كورس واحد'      (NO numeral)
n == 2        → copy.years.countTwo  = 'كورسين'         (NO numeral)
3 <= n <= 10  → `${n} ${countFew}`   countFew  = 'كورسات'
n >= 11       → `${n} ${countMany}`  countMany = 'كورس'
```

Western digits, deliberately, matching the rest of the catalogue.

### A.5 `/essentials` — the 12-term glossary

`apps/web/app/(site)/essentials/page.tsx` + `apps/web/lib/essentials-terms.ts`.

Fully static. Sections in order: hero (badge `copy.essentials.badge` = `WARM-UP`, `<h1>`
`copy.essentials.title` = «قبل أول سطر كود», lead = `leadBefore` + inline code chip
`leadCode` = `ready = true` + `leadAfter`), then — **only when the catalog contains a match** —
the foundation-course section (`courseBadge` «نبدأ دلوقتي», `courseTitle`
«الكورس التأسيسي، كامل على المنصة», `courseLead`), then the glossary
(`listTitle` = «١٢ مصطلح مفيش كود بيتفهم من غيرهم», `listLead`).

The twelve terms (English keyword is structural, Arabic is copy):

| # | `en` | `ar` (`copy.essentials.tNAr`) | body (`tNBody`) |
|---|---|---|---|
| 1 | Variable | متغيّر | اسم بيتحط فيه قيمة عشان تتستخدم بعدين، وتتغيّر في أي وقت. |
| 2 | Function | دالة | شغل مكتوب مرة واحدة تحت اسم، وبيتنادى كل ما يحتاج بدل ما يتعاد. |
| 3 | Loop | حلقة | بتخلّي الكمبيوتر يكرّر نفس الخطوات لحد ما شرط معيّن يقف. |
| 4 | Array | مصفوفة | صف من القيم ورا بعض، كل واحدة ليها رقم مكانها تنادي بيه عليها. |
| 5 | Condition | شرط | مفترق طرق في الكود: لو ده صح يروح هنا، وغير كده يروح هناك. |
| 6 | Object | كائن | حاجة ليها صفات وأفعال، وبياناتها كلها متجمّعة في مكان واحد. |
| 7 | Data Type | نوع البيانات | القيمة دي رقم ولا نص ولا صح/غلط — النوع بيحدّد إيه اللي ينفع يتعمل بيها. |
| 8 | Operator | مُعامل | العلامات اللي بتشتغل على القيم: جمع وطرح ومقارنة ومنطق. |
| 9 | Error | خطأ | رسالة بتقولك إيه اللي وقف وفين بالظبط. دي أسرع طريقة تتعلم بيها. |
| 10 | Comment | تعليق | سطر مكتوب للبني آدم مش للكمبيوتر، بيفكّرك إنت عملت كده ليه. |
| 11 | Input / Output | مُدخل ومُخرج | الكود بياخد بيانات من برّه، وبيرجّع نتيجة تظهرلك على الشاشة. |
| 12 | Algorithm | خوارزمية | ترتيب الخطوات اللي بيحل المسألة — الفكرة نفسها قبل ما تتحوّل لكود. |

Anchor slug: `termSlug(term) = term.en.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')`
(so `Input / Output` → `input-output`).

The signed-in twin is `/foundations`, with its own copy: `appEyebrow` «05 / التأسيس»,
`appTitle` «التأسيس», `appSubtitle`, a search field `appSearch` «بحث عن مصطلح» and the no-match
line `appNoMatch` «مفيش مصطلح بالاسم ده.» — **that** is the version a mobile app should build.

### A.6 `/about`

`apps/web/app/(site)/about/page.tsx`. Pure copy, no API. `<h1>` is the bare name
`copy.landing.aboutPageTitle` = «أيمن أبو العلا»; lead `aboutPageLead` =
«مدرّس البرمجة وعلوم الحاسب لطلبة البكالوريا المصرية.»; then the shared `<AboutInstructor>`
section whose `<h2>` is `aboutTitle` = «مين أيمن أبو العلا؟» with bodies `aboutBody1`,
`aboutBody2`, `aboutBody3`, role `aboutRole`, chips `aboutChip1..3`
(«شرح بالكود» / «تمرين على كل درس» / «اختبارات ومتابعة»), and the résumé rail
`copy.landing.aboutCredits` (three entries: «درس فين؟» MTI, «درّس لمين؟» Google/Microsoft/IEEE,
«اشتغل فين؟» CCR/Avnology). CTA `aboutPageCta` = «الكورسات المتاحة» → `/courses`.

⚠️ The `aboutCredits` docblock: *"EVERY LINE HERE IS A FACT ABOUT A REAL PERSON, given by him.
Nothing in this array may be embellished."* Do not paraphrase into Flutter strings.

### A.7 `/privacy` and `/terms` — the legal pages

`apps/web/app/(site)/privacy/page.tsx`, `terms/page.tsx`, shell
`apps/web/components/site/legal-page.tsx`. Copy lives in `copy.legal`
(`packages/contracts/src/copy/ar.ts:4282-…`).

**These two must ship inside the mobile app** — both stores require a reachable privacy policy,
and this platform was flagged by Google Search Console under «الصفحات المضلّلة» on 2026-08-06
specifically because nothing said who collects the data (see `copy.legal.collectAccountBody`
and the `ACCOUNT_LINKS` note in the footer). The app's sign-up flow must link them the same way
the web onboarding does.

`/privacy` reads one live value: `contact.email` from `GET /api/settings/public`. When null it
renders `copy.legal.ownerContactFallback`.

`?from=onboarding` (narrowed through `legalOrigin`, an **enum, never a URL** — it is an
open-redirect guard) switches the top exit link to `copy.legal.backToOnboarding` =
«الرجوع لإكمال بياناتك».

Section order on `/privacy`: `ownerTitle` → `collectTitle` (items `collectAccount`,
`collectProfile`, `collectParents`, `collectProgress`, `collectTechnical`) → `neverTitle` →
`shareTitle` (list: `shareCloudflare`, `shareYoutube`, `shareClarity`, `shareHosting`) →
`cookiesTitle` → `rightsTitle` → `minorsTitle` → `changesTitle`. Footer line `updatedAt` =
«آخر تحديث: أغسطس ٢٠٢٦».

⚠️ Two of those strings are **factual claims about the sign-up form** and their docblocks say so
explicitly — changing what the mobile app collects without changing them makes the published
policy untrue:

- `collectAccountBody`: «الاسم ورقم الموبايل وكلمة السر. البريد الإلكتروني اختياري…»
- `collectProfileBody`: «الاسم الكامل، النوع، رقم الهاتف، المحافظة، اسم المدرسة، ونوع المدرسة (عام ولا لغات) والصف الدراسي.»
- `collectParentsBody`: «رقم واحد، وإجباري…»

⚠️ `neverBody` currently says «المنصة مجانية ومفيش أي مدفوعات فيها أصلاً» and
`copy.legal.termsQuizBody` describes the quiz rules. The platform **does** now take InstaPay /
Vodafone Cash payments (see the payments spec). This is a live inconsistency in the published
policy; a mobile app that adds in-app purchase must not copy that sentence.

Section order on `/terms`: `ownerTitle`, `termsUseTitle`, `termsContentTitle`, `termsQuizTitle`,
`termsAvailabilityTitle`, `termsTerminationTitle`.

### A.8 Loading / empty / error / 404 on the public surface

Every `(site)` route has a `loading.tsx` skeleton (there is a coverage test:
`apps/web/lib/loading-coverage.test.ts`).

**Error boundary** — `apps/web/app/(site)/error.tsx`:
- title `copy.errors.site.title` = «حصلت مشكلة في الصفحة دي»
- body `copy.errors.site.body` = «المشكلة عندنا إحنا مش عندك. نجرّب تحميلها تاني، ولو فضلت زي ما هي نرجع للرئيسية — باقي الموقع شغّال عادي.»
- buttons: `copy.common.retry` = «نحاول تاني» and `copy.nav.home` = «الرئيسية» — the home button is a **hard
  document load**, not a soft nav, because `/` is the likeliest route to be the one that threw.
- `error.digest` rendered under the label `copy.errors.digestLabel` = «كود العطل», `dir="ltr"`,
  mono, only when present.
- `error.message` is rendered **nowhere, on any surface, on purpose**.

**404** — `apps/web/app/(site)/not-found.tsx`: eyebrow `404` (`dir="ltr"`, kept out of the
`<h1>`), `copy.notFound.site.title` = «الصفحة دي مش موجودة», body
«يمكن الرابط قديم أو فيه حرف ناقص، أو الصفحة اتشالت. والرجوع للرئيسية أو للكورسات المتاحة من هنا.»,
primary CTA `copy.notFound.site.cta` = «كل الكورسات» → `/courses`, secondary → `/`.
No retry button — nothing failed.

⚠️ Documented web-only defect, stated so mobile does not inherit it: under
`cacheComponents: true` these 404s are served with **HTTP 200** and `x-nextjs-postponed: 1`
(measured on production 2026-08-15 on `/courses/no-such-course`). A native client must branch on
the API's own 404, not on the page.

The other three 404 variants, for reference: `copy.notFound.app` (cta «حسابي»),
`copy.notFound.admin` (cta «لوحة التحكم»), `copy.notFound.root` (cta «الرئيسية»).
Error variants: `copy.errors.app`, `copy.errors.site`, `copy.errors.auth`, `copy.errors.root`.

---

## B. News / SEO articles

### B.1 Model and enum

`apps/api/prisma/schema.prisma:3212-3273`.

```prisma
enum NewsStatus { draft  published  @@map("news_status") }

model NewsPost {
  id       String @id @default(uuid(7)) @db.Uuid
  slug     String @unique @db.Citext     // Arabic slugs are normal and expected
  title    String
  excerpt  String                        // card blurb + list excerpt + meta description, ONE field
  body     String                        // markdown, see §B.4
  status   NewsStatus @default(draft)
  coverKey String?  @map("cover_key")    // storage KEY, never a URL
  relatedCourseId String? @db.Uuid       // SetNull
  authorId String
  publishedAt DateTime?                  // set ONCE, on first publish
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([status, publishedAt(sort: Desc)])
}
```

DB CHECK `news_posts_published_has_date` refuses a published row with no `publishedAt`.

### B.2 Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/news` | `@Public()` | index, published only |
| GET | `/api/news/:slug` | `@Public()` | one article; a draft and a missing slug are **indistinguishable** — both 404 |
| GET | `/api/admin/news` | `news:read` | drafts included |
| GET | `/api/admin/news/:id` | `news:read` | |
| POST | `/api/admin/news` | `news:write` + CSRF | **always creates a draft**; there is no create-and-publish |
| PATCH | `/api/admin/news/:id` | `news:write` + CSRF | |
| PATCH | `/api/admin/news/:id/published` | **`news:publish`** + CSRF | body `{isPublished: boolean}` |
| DELETE | `/api/admin/news/:id` | `news:write` + CSRF | hard delete, returns `{ok:true}` |

Public reads carry the widened throttle (§0.3) because `next build` fires one request per
article concurrently.

### B.3 Wire shapes (`packages/contracts/src/news.ts`)

```ts
NewsListItemSchema = {
  id: uuid,
  slug: string,
  title: string,
  excerpt: string,
  coverKey: string | null,
  publishedAt: ISO datetime,     // NON-nullable here: this shape only describes published posts
  updatedAt: ISO datetime,
  readingMinutes: int >= 1,
}

NewsPostDetailSchema = NewsListItemSchema + {
  body: string,
  relatedCourseSlug: string | null,
  relatedCourseTitle: string | null,
}

NewsListSchema = { posts: NewsListItem[], total: int >= 0 }
```

`GET /api/news` returns `{posts, total}` — **no pagination at all**; the service returns every
published row (`news.service.ts` `listPublic`). Ordering: `orderBy: { publishedAt: 'desc' }`.

Admin shapes: `AdminNewsRowSchema` = `{id, slug, title, status, publishedAt: ISO|null, updatedAt}`,
`AdminNewsDetailSchema` adds `{excerpt, body, coverKey, relatedCourseId}`.
Admin list ordering: `orderBy: { updatedAt: 'desc' }`.

Validation on write:

| Field | Rule |
|---|---|
| `slug` | `z.string().trim().min(2).max(80)` **and** must not contain `/`, `.` or whitespace. Error: «الرابط ما ينفعش يحتوي على مسافة أو نقطة أو شرطة مائلة» |
| `title` | trim, 4..120 |
| `excerpt` | trim, **20..160** (it IS the `<meta name="description">`) |
| `body` | trim, 1..40 000 |
| `coverKey` | trim 1..200, nullable, optional |
| `relatedCourseId` | uuid, nullable, optional |

`NewsPatchSchema = NewsCreateSchema.partial()`.

Errors: duplicate slug → **409** with message `slug_taken` (`assertSlugFree`). Unknown id → 404.

`readingMinutes` — computed **server-side**, so the number in the JSON-LD and the card agree:

```ts
export function readingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));   // 180 wpm, NOT 230 — Arabic reads slower
}
```

`relatedCourse*` is only non-null when the related course's `status === 'published'`.

Publish semantics (`setPublished`): `publishedAt` is filled **only on the first publish** and is
never moved by a later re-publish — it is `datePublished` in JSON-LD and the sort key of the
index.

### B.4 The markdown subset — **exact grammar, must be matched by the Flutter renderer**

Parser: `apps/web/lib/news/markdown.ts`. Renderer: `apps/web/components/news/markdown-body.tsx`.
There is **no markdown library in this repo** and **no `dangerouslySetInnerHTML` anywhere in the
path** — the parser produces a data tree and the renderer emits escaped text nodes, so a body
containing `<script>` renders as the literal characters.

**A Flutter client must not use `flutter_markdown` with default settings**: that would render
tables, images, raw HTML, setext headings, `#` h1, nested lists, task lists, autolinks and
strikethrough — none of which this parser supports, and all of which authors will then start
writing. Port the parser below.

**Block grammar (line-based, in this precedence order):**

| Input | Block |
|---|---|
| blank line | flushes the current paragraph |
| line starting with ` ``` ` | fenced code. `language = rest of the fence line, trimmed, or null`. Consumes until the next line whose trim starts with ` ``` `, **or to end of document if never closed**. |
| `### ` prefix | `heading` level **3**, text = `parseInline(rest.trim())` |
| `## ` prefix | `heading` level **2** |
| `> ` prefix | `quote`, single line only (no multi-line blockquote merging) |
| `^\d+[.)]\s+(.*)$` | ordered list item |
| `^[-*]\s+(.*)$` | unordered list item |
| anything else | accumulated into a paragraph; consecutive lines are joined with a **single space** |

- `#` (h1) is **deliberately not supported** — the page's only `<h1>` is the article title.
- List runs gather only **adjacent items of the same kind**, so a bullet list immediately
  followed by a numbered list stays two lists.
- Nothing else exists: no tables, no images, no HTML, no nested lists, no horizontal rules, no
  italics, no strikethrough, no reference links, no footnotes. Anything unrecognised degrades
  to a paragraph.

**Inline grammar — one regex, one pass:**

```js
/\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g
```

Producing nodes: `{kind:'text'|'code'|'strong'|'link'}`. Note `**bold**` cannot contain `*`,
inline code cannot contain a backtick, and a link href **cannot contain whitespace or `)`**.
There is no `*italic*` and no `__bold__`.

**Link href allowlist** — `safeHref`, reproduce exactly:

```ts
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (href.length === 0) return null;
  if (href.startsWith('//')) return null;                 // protocol-relative leaves the origin
  if (href.startsWith('/')) return href;                  // internal
  if (/^https:\/\/[^\s]+$/i.test(href)) return href;      // https only — NOT http
  if (/^mailto:[^\s]+$/i.test(href)) return href;
  return null;
}
```

A rejected href does **not** drop the text: the node degrades to `{kind:'text', value: linkText}`
— the reader still gets the sentence, just not the link.

**Rendering rules the Flutter widget must match:**

- Internal links (`href.startsWith('/')`) are in-app navigation; external ones open externally.
  (Web sets `rel="noopener noreferrer nofollow ugc" target="_blank"`.)
- Code blocks are rendered `dir="ltr"` **always**, inside an RTL page:
  > "`dir="ltr"` is not decoration. The page is RTL, and code in an RTL container renders with
  > its punctuation reordered — `x = arr[0];` comes out visually mangled and a student copying
  > it gets something that does not run."
  Flutter: wrap code in `Directionality(textDirection: TextDirection.ltr, …)`.
- Inline code gets class `article__code`; block code `<pre class="article__pre"><code
  data-language=…>`.

**Heading anchors and TOC:**

```ts
export function headingId(text: string, index: number): string {
  const base = text.trim()
    .replace(/[#?/\\%]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return base.length > 0 ? `${base}-${index}` : `section-${index}`;
}
```

`index` is the block index in the whole document, not the heading index. `tableOfContents()`
uses the identical call, so the two cannot drift. Arabic ids are fine.
**The TOC renders only when `toc.length >= 3`.**

### B.5 Screen: `/news` (index)

`apps/web/app/(site)/news/page.tsx`. Copy block `copy.news`:

```
eyebrow   '06 / نيوز'
title     'نيوز'
heading   'شرح منهج البرمجة والذكاء الاصطناعي — بكالوريا'          ← the <h1>
subtitle  'شرح كل درس في المنهج، وملخصات الوحدات، وقاموس المصطلحات، ونماذج أسئلة بالإجابات — لأولى وتانية بكالوريا.'
description  (meta, ≤160)
footerLink 'شرح المنهج والدروس'
empty     'لسه مفيش مقالات منشورة.'
readingTime 'قراءة {n} دقيقة'
published 'اتنشر'
updated   'اتعدّل'
backToList 'كل المقالات'
relatedTitle 'الموضوع ده كامل في كورس'
relatedBody  'الكلام اللي فوق ده مقدّمة. الشرح الكامل بالفيديو والتمارين والاختبارات في «{course}».'
relatedCta   'فتح الكورس'
fallbackTitle 'نبدأ من الأول'
fallbackBody  'لو المقالة دي عجبتك، المنهج كامل مرتّب بالصف والمسار — والكورسات كلها مجانية.'
fallbackCta   'الكورسات المتاحة'
listLabel 'قائمة المقالات'
```

Structure: header (eyebrow / `<h1>` heading / lead subtitle), then either
`copy.news.empty` in a `.page-empty` paragraph, or a card grid. Each card:
cover image when `coverKey` is set (**always 1200×630**, the OG size — reserve that box exactly
so the grid does not shift; `alt=""`, decorative because the title follows), title (`<h2>`),
excerpt, and `formatCopy(copy.news.readingTime, {n: String(post.readingMinutes)})`.
Whole card is one link to `/news/{slug}`.

**States**: loading → `news/loading.tsx` skeleton; empty → the one line above; error → the
`(site)` boundary; the web deliberately swallows API failures into an empty list on this route
(`getNewsListOrEmpty`) because it prerenders — a mobile client should show a retry instead.

### B.6 Screen: `/news/[slug]` (article)

Order of elements (`news/[slug]/page.tsx`):

1. back link `copy.news.backToList` = «كل المقالات» → `/news`
2. `<h1>` = `post.title` — the article's **only** h1
3. lead `<p>` = `post.excerpt`
4. meta line: `<time dateTime={publishedAt}>{copy.news.published}</time>` + `' · '` +
   `formatCopy(copy.news.readingTime, {n})`
5. cover, **below the header, not above it** ("above the title it would push the `<h1>` under
   the fold on a phone"), 1200×630, decorative
6. TOC — only when `tableOfContents(blocks).length >= 3`
7. `<MarkdownBody blocks={parseMarkdown(post.body)} />`
8. CTA panel: when `relatedCourseSlug && relatedCourseTitle` → `relatedTitle` /
   `formatCopy(relatedBody, {course: relatedCourseTitle})` / button `relatedCta` →
   `/courses/{relatedCourseSlug}`. Otherwise `fallbackTitle` / `fallbackBody` /
   `fallbackCta` → `/courses`.

**Slug encoding trap** (`apps/web/lib/news.ts`, `newsPostPath`) — a Flutter client hitting the API
directly must do the same: decode first, then encode once.

```ts
export function newsPostPath(slug: string): string {
  let decoded: string;
  try { decoded = decodeURIComponent(slug); } catch { decoded = slug; }
  return `/api/news/${encodeURIComponent(decoded)}`;
}
```

Double-encoding an already-encoded Arabic slug 404s the API while the page still answers 200
with a correct `<title>` — a soft 404 that is nearly invisible.

---

## C. Taxonomy — the Egyptian-curriculum model

### C.1 Prisma models and enums (`apps/api/prisma/schema.prisma:297-560`)

```prisma
enum Region       { urban  lower  upper  frontier }
enum SubjectLevel { normal advanced }
enum Gender       { male   female }
enum SchoolStream { general languages }   // the STUDENT's school. Two values, not three.
```

⚠️ `SchoolStream` has **two** values by design; a *course* carries `forGeneral`/`forLanguages`
and can serve both, but a student attends exactly one school, so «الاتنين» is unspellable here.

```prisma
model Governorate     { code Char(2) @id, nameAr, slug @unique, region Region, sortOrder Int, isActive Boolean @default(true) }
model EducationSystem { id uuid7, slug @unique, nameAr, totalMarks Int, passPercent Decimal(5,2), allowsRetakes Boolean, sortOrder Int }
model AcademicYear    { id uuid7, systemId, year Int, labelAr, badgeAr, sortOrder, @@unique([systemId, year]) }
model Track           { id uuid7, systemId, slug, labelAr, aliases String[], minYear Int @default(2), sortOrder, @@unique([systemId, slug]) }
model TrackFaculty    { id, trackId, nameAr, sortOrder }        // powers "pick your faculty → we name your track"
model Subject         { id uuid7, slug @unique, nameAr, aliases String[] }
model ElectiveGroup   { id, trackId, year Int, labelAr, pickCount Int @default(1), @@unique([trackId, year, labelAr]) }
model SubjectOffering { id uuid7, systemId, year Int, trackId?, subjectId,
                        countsTowardTotal Boolean @default(true), level SubjectLevel?,
                        electiveGroupId?, marks Int @default(100), passPercentOverride Decimal?,
                        sortOrder Int @default(0),
                        @@unique([systemId, year, trackId, subjectId]) }
model StudentProfile  { userId @id, fullName, gender Gender, phone Citext @unique,
                        phoneVerifiedAt?, governorateCode Char(2), schoolName?,
                        schoolStream SchoolStream?, fatherPhone Citext?, motherPhone Citext?,
                        systemId?, year Int?, trackId?, electiveSubjectId?,
                        onboardingCompletedAt?, whatsappOpenedAt?, createdAt, updatedAt }
```

Load-bearing facts:

- `SubjectOffering` is the load-bearing table — a subject is only meaningful scoped by
  `(system, year, track)`. الرياضيات appears in three different roles.
- `StudentProfile.system/year/track/electiveSubject` are **nullable on purpose**: year 1 is
  common/non-specialised across both systems, and a student may legitimately not have chosen.
  A hand-written CHECK `student_profiles_year1_has_no_track` is the DB backstop.
- `StudentProfile.phone` is a **mirror** of `User.phoneNumber`, which is the source of truth
  for sign-in. Both are written in one transaction.
- البكالوريا (600 marks, 70% pass, retakes allowed) and الثانوية العامة (320 marks, 50% pass,
  no retakes) run **in parallel**; one is not a replacement for the other.

### C.2 `GET /api/taxonomy` — the one public read

`apps/api/src/modules/taxonomy/taxonomy.controller.ts` — `@Public()`, widened throttle
(§0.3; the docblock explains at length that the server-side callers all collapse to one IP
bucket in production, which took the site down once).

Response (`packages/contracts/src/taxonomy.ts`):

```ts
Taxonomy = {
  governorates: Array<{
    code: string (length 2),
    nameAr: string,
    slug: string,
    region: 'urban'|'lower'|'upper'|'frontier',
    sortOrder: int,
  }>,
  pinnedGovernorateCodes: string[],           // codes to pin to the top of the picker
  systems: Array<{
    id: string,                               // per-environment uuid7 — NEVER hardcode
    slug: string,                             // 'bacalorya' | 'thanaweya_amma' — STABLE
    nameAr: string,
    totalMarks: int > 0,
    passPercent: number 0..100,               // Decimal in DB, number on the wire
    allowsRetakes: boolean,
    years: Array<{ year: 1|2|3, labelAr: string, badgeAr: string }>,
    tracks: Array<{
      id: string, slug: string, labelAr: string, minYear: int,
      electiveGroups: Array<{
        id: string, year: int, labelAr: string, pickCount: int > 0,
        options: Array<{
          id: string,          // ⚠️ SubjectOffering.id — this is what you submit as electiveSubjectId
          subjectId: string,   // ⚠️ Subject.id — different value, used by the admin course editor
          subjectSlug: string,
          nameAr: string,
        }>
      }>
    }>
  }>
}
```

⚠️ `ElectiveOption.id` vs `.subjectId` is the trap: the onboarding payload wants the **offering
id** (`id`), never `subjectId`.

Server filters/ordering (`taxonomy.service.ts`):
governorates `where isActive: true`, `orderBy sortOrder asc`; systems `orderBy sortOrder asc`;
years `orderBy sortOrder asc`; tracks `orderBy sortOrder asc`; elective options
`orderBy sortOrder asc`. `PINNED_GOVERNORATE_CODES = ['01','21','02']` is a **server constant**
(Cairo, Giza, Alexandria).

Picker order the web builds (`apps/web/lib/profile-options.ts`, `governorateOptions`): pinned
codes first in the order given, then everything else in taxonomy order.

### C.3 The 27 governorates

`apps/api/src/scripts/seed-data/governorates.ts` — official national-ID code order, **never
alphabetical**. Code `88` (خارج الجمهورية) is deliberately absent.

| code | nameAr | slug | region |
|---|---|---|---|
| 01 | القاهرة | cairo | urban |
| 02 | الإسكندرية | alexandria | urban |
| 03 | بورسعيد | port_said | urban |
| 04 | السويس | suez | urban |
| 11 | دمياط | damietta | lower |
| 12 | الدقهلية | dakahlia | lower |
| 13 | الشرقية | sharqia | lower |
| 14 | القليوبية | qalyubia | lower |
| 15 | كفر الشيخ | kafr_el_sheikh | lower |
| 16 | الغربية | gharbia | lower |
| 17 | المنوفية | monufia | lower |
| 18 | البحيرة | beheira | lower |
| 19 | الإسماعيلية | ismailia | lower |
| 21 | الجيزة | giza | upper |
| 22 | بني سويف | beni_suef | upper |
| 23 | الفيوم | faiyum | upper |
| 24 | المنيا | minya | upper |
| 25 | أسيوط | asyut | upper |
| 26 | سوهاج | sohag | upper |
| 27 | قنا | qena | upper |
| 28 | أسوان | aswan | upper |
| 29 | الأقصر | luxor | upper |
| 31 | البحر الأحمر | red_sea | frontier |
| 32 | الوادي الجديد | new_valley | frontier |
| 33 | مطروح | matrouh | frontier |
| 34 | شمال سيناء | north_sinai | frontier |
| 35 | جنوب سيناء | south_sinai | frontier |

Related: `apps/api/src/modules/book-orders/delivery-days.ts` treats `01` and `21` as 3-day
delivery and everything else 4.

**Fetch this list from `/api/taxonomy`; do not bundle it.** `isActive` is admin-editable.

### C.4 Seeded systems, years, tracks, subjects

`apps/api/src/scripts/seed.ts`. ⚠️ The seed runs on **every container boot**
(`docker-entrypoint.sh` step 3) and the year `update:` is unconditional, so a relabel done in
`/admin/taxonomy` survives only until the next restart.

Systems:

| slug | nameAr | totalMarks | passPercent | allowsRetakes | sortOrder |
|---|---|---|---|---|---|
| `bacalorya` | البكالوريا المصرية | 600 | 70 | true | 0 |
| `thanaweya_amma` | الثانوية العامة | 320 | 50 | false | 1 |

Years — **labels are per-system**:

| year | bacalorya `labelAr` / `badgeAr` | thanaweya `labelAr` / `badgeAr` |
|---|---|---|
| 1 | الصف الأول بكالوريا / مرحلة تمهيدية | الصف الأول الثانوي / سنة نقل |
| 2 | الصف الثاني بكالوريا / سنة شهادة | الصف الثاني الثانوي / سنة نقل |
| 3 | الصف الثالث بكالوريا / سنة شهادة | الصف الثالث الثانوي / سنة شهادة |

بكالوريا tracks (4), each with faculties and a 2-option elective group:

| slug | labelAr | electives |
|---|---|---|
| `medicine_life_sciences` | مسار الطب وعلوم الحياة | mathematics, physics |
| `engineering_cs` | مسار الهندسة وعلوم الحاسب | chemistry, **programming_cs** |
| `business` | مسار الأعمال | accounting, business_administration |
| `arts_humanities` | مسار الآداب والفنون | psychology, second_foreign_language |

ثانوية عامة tracks (3): `science_science` علمي علوم, `science_math` علمي رياضة, `literary` أدبي.
These seed **no** elective groups, so `electiveGroups` is `[]` for them — matching the contract.

Subjects (18): `arabic` اللغة العربية, `first_foreign_language` اللغة الأجنبية الأولى,
`second_foreign_language` اللغة الأجنبية الثانية, `egyptian_history` التاريخ المصري,
`mathematics` الرياضيات, `integrated_science` العلوم المتكاملة, `philosophy_logic` الفلسفة والمنطق,
`religious_education` التربية الدينية, `programming_cs` البرمجة وعلوم الحاسب, `physics` الفيزياء,
`chemistry` الكيمياء, `biology` الأحياء, `accounting` المحاسبة,
`business_administration` إدارة الأعمال, `psychology` علم النفس, `economics` الاقتصاد,
`geography` الجغرافيا, `statistics` الإحصاء.

Year-1 offerings (common to both systems): arabic ✓, first_foreign_language ✓,
egyptian_history ✓, mathematics ✓, integrated_science ✓, philosophy_logic ✓,
religious_education ✗ (pass override 70), second_foreign_language ✗, programming_cs ✗
(`counts` = `countsTowardTotal`).

### C.5 How a student's year / track / subjects are actually chosen

**The student is asked ONE question: their year.** Everything else is filled from the taxonomy.

`apps/web/lib/section-defaults.ts`:

```ts
export const FIXED_SYSTEM_SLUG            = 'bacalorya';
export const FIXED_TRACK_SLUG             = 'engineering_cs';
export const FIXED_ELECTIVE_SUBJECT_SLUG  = 'programming_cs';
export const HIGHEST_OFFERED_YEAR         = 2;   // content only goes to year 2 today
const FIRST_TRACKED_YEAR = 2;                     // year 1 has no track
```

- `offeredYearOptions(taxonomy)` = the `bacalorya` system's years filtered to
  `year <= HIGHEST_OFFERED_YEAR`, mapped to `{value: String(year), label: year.labelAr}`.
  **So the picker offers exactly two options today**, labelled from the DB.
- `fixedSectionFor(taxonomy, year)`:
  - year 1 → `{system: 'bacalorya', year}` (no track, no elective)
  - year ≥ 2 → `{system, year, trackId: <engineering_cs track id>, electiveSubjectId: <the
    programming_cs OFFERING id inside that track's elective group for that year>}`
  - taxonomy missing the track/offering → degrade to `{system, year}` rather than throwing.
- Ids are resolved from **slugs at runtime**: `Track.id` and `SubjectOffering.id` are
  per-environment uuid7s. Flutter must do the same lookup — do not hardcode uuids.
- The submit order matters: `{...formValues, ...fixedSectionFor(taxonomy, values.year)}` — the
  fixed three win over anything the form holds.

**Client-side rules** — `refineSection` in `packages/contracts/src/onboarding.ts`, shared by both
`OnboardingSchema` and `StudentSectionSchema`:

| Condition | Issue path | Arabic message |
|---|---|---|
| `year === 1 && trackId !== undefined` | `trackId` | «الصف الأول لا يختار مسارًا بعد» |
| `trackId !== undefined && system === undefined` | `system` | «لازم نحدد النظام الدراسي الأول» |
| `electiveSubjectId !== undefined && !(system==='bacalorya' && year===2)` | `electiveSubjectId` | «المادة الاختيارية غير متاحة في هذه الحالة» |
| `electiveSubjectId !== undefined && trackId === undefined` | `trackId` | «لازم نحدد المسار الأول» |

⚠️ Deliberately **not** a rule any more: "بكالوريا year 2 must carry an elective". A missing
elective now means the taxonomy has no البرمجة offering, which is a data problem, not a user
error.

**Server-side rules (S10)** — `resolveSection` in
`apps/api/src/modules/profile/profile.service.ts`. Zod only proves shape; this re-checks against
real rows and returns **400 BadRequest** with these exact English messages:

| Check | Message |
|---|---|
| `system` slug does not resolve | `system does not match a known education system` |
| track missing **or** `track.systemId !== systemId` | `trackId does not belong to the selected system` |
| offering missing, or `electiveGroupId === null`, or `offering.trackId !== trackId`, or `offering.year !== input.year` | `electiveSubjectId is not one of the available options for the selected track and year` |
| governorate code unknown (onboarding only) | `governorateCode does not match a known governorate` |

**Nothing resets progress on a section change.** From `StudentSectionSchema`'s docblock:
progress lives on the enrollment, per course, and courses carry their own `(year, track)`, so
switching away shows an empty list and switching back shows every number intact.

**Where the year/track are DISPLAYED**: `identityOf(me, taxonomy)` (`apps/web/lib/library.ts`)
resolves the profile's `systemId`/`year` to the taxonomy's `labelAr`. `/profile` used to have a
local three-entry table and printed «الصف الثاني الثانوي» while `/library` printed
«الصف الثاني بكالوريا» — a mobile app must resolve labels through the taxonomy, never map
`1|2|3` to a hardcoded Arabic string.

⚠️ Catalog note that lands here: **the catalog does not filter by year.** Every student sees
every course; `year` is a label, not a gate (`/courses`, `foundationCourses`).

### C.6 Admin taxonomy endpoints

`apps/api/src/modules/admin/taxonomy/admin-taxonomy.controller.ts`, class-level
`@RequirePermission('taxonomy:write')`, with `taxonomy:read` on the GETs.

```
GET    /api/admin/taxonomy/governorates
PATCH  /api/admin/taxonomy/governorates/:code       ← the only "delete": { isActive: false }
GET    /api/admin/taxonomy/systems
PATCH  /api/admin/taxonomy/systems/:id
PATCH  /api/admin/taxonomy/academic-years/:id
GET    /api/admin/taxonomy/tracks
POST   /api/admin/taxonomy/tracks
PATCH  /api/admin/taxonomy/tracks/:id
GET    /api/admin/taxonomy/subjects
POST   /api/admin/taxonomy/subjects
PATCH  /api/admin/taxonomy/subjects/:id
DELETE /api/admin/taxonomy/subjects/:id
GET    /api/admin/taxonomy/subject-offerings
POST   /api/admin/taxonomy/subject-offerings
PATCH  /api/admin/taxonomy/subject-offerings/:id
```

`EducationSystem.slug` and `Track.slug` are immutable — they simply never appear in a patch DTO.

---

## D. Profile & settings

### D.1 `GET /api/profile/me`

`apps/api/src/modules/profile/profile.controller.ts`, `@RequirePermission('profile:read')`.
Anonymous → 401.

Server returns (`ProfileService.getMe`): `{ userId, onboardingCompleted, profile }` where
`profile` is the **whole `student_profiles` row or null**.

Client contract (`packages/contracts/src/profile.ts`) is a `looseObject` — it keeps every key
the API sends and only *names* the ones something reads:

```ts
ProfileMe = {
  userId: string,
  onboardingCompleted: boolean,           // === (onboardingCompletedAt != null)
  profile: null | {
    fullName?: string,
    phone?: string,
    schoolName?: string | null,
    governorateCode?: string,
    year?: int | null,
    systemId?: string | null,
    trackId?: string | null,
    schoolStream?: 'general' | 'languages' | null,
    gender?: 'male' | 'female' | null,
    fatherPhone?: string | null,
    // ...plus every other student_profiles column, untyped
  }
}
```

Every field is optional/nullable *on purpose* so an incomplete profile renders «مش متسجّل»
rather than failing the whole screen. Flutter should model it the same way — a strict codegen'd
model here will break on the first partially-onboarded row.

`onboardingCompleted === false` is the routing signal: send the user to onboarding.
`apps/web/proxy.ts` bounces every protected route until it is true.

### D.2 `PATCH /api/profile/onboarding` — the full profile write

`@RequirePermission('profile:write')`. Body = `OnboardingSchema`
(`packages/contracts/src/onboarding.ts`), **`.strict()`** — an unrecognised key is a **400**, not
a silently stripped field (S11 mass-assignment defence). `userId` is taken from the session and
is never read from the body.

| Field | Type / rule | Required | Error message |
|---|---|---|---|
| `fullName` | trim, 2..120 | ✔ | «الاسم الكامل مطلوب» |
| `gender` | `'male' \| 'female'` | ✔ | UI shows «لازم نحدد النوع» (`copy.onboarding.genderError`) |
| `phone` | `egyptianPhone(...)` → normalised E.164 | ✔ | empty: «رقم الهاتف مطلوب»; invalid: «رقم الهاتف يجب أن يكون رقمًا مصريًا صحيحًا» |
| `governorateCode` | exactly 2 chars | ✔ | «لازم نحدد المحافظة» |
| `schoolName` | trim, 1..200 | ✔ | «اسم المدرسة مطلوب» |
| `schoolStream` | `'general' \| 'languages'` | ✔ | UI: «لازم نحدد نوع مدرستك» |
| `fatherPhone` | `egyptianPhone(...)` | ✔ | «هاتف الأب مطلوب» |
| `system` | `'bacalorya' \| 'thanaweya_amma'` | optional | — |
| `year` | int 1..3 | ✔ | «لازم نحدد الصف الدراسي» |
| `trackId` | string ≥1 | optional | — |
| `electiveSubjectId` | string ≥1 (= `SubjectOffering.id`) | optional | — |

Plus the four `refineSection` rules in §C.5.

`motherPhone` is **not accepted** — the column exists for legacy rows, `.strict()` rejects any
attempt to send one, and the write deliberately **omits** the column (does not null it) so a
number a returning student already gave is not deleted.

**The write is an UPSERT of the whole set.** A field left out of the payload blanks the column.
This is why `/settings/section` renders every field prefilled — see `ProfileForm`'s docblock.

**Phone is pinned after onboarding completes.** `ProfileService.completeOnboarding`:

```
if (existing?.onboardingCompletedAt != null
    && account.phoneNumber != null
    && account.phoneNumber !== input.phone)
  → 400 BadRequest 'phone cannot be changed here'
```

Reasoning (verbatim from the service): the phone is the login identity, `/sign-in/phone-number`
matches it exactly, there is **no OTP** (`sendOTP` throws `OTP_NOT_CONFIGURED`) and no
password-reset-by-phone, so a typo locks the owner out with no route back. It also unions in
unclaimed guest book orders by number.

`onboardingCompletedAt` is set **once** and never rewritten (`existing?.onboardingCompletedAt ?? new Date()`).

The write is one transaction: `users.phoneNumber` **and** `student_profiles` together.
A unique violation on either index (`users_phone_number_key`, `student_profiles_phone_key`) →
**409 Conflict**, message `phone is already registered to another profile`. The two are
deliberately not distinguished. UI shows `copy.onboarding.phoneConflictError` = «رقمك ده متسجّل على حساب تاني».

Response: the full `StudentProfile` row.

### D.3 `PATCH /api/profile/section`

`@RequirePermission('profile:write')`. Body = `StudentSectionSchema`, `.strict()`, **only four
fields**: `system?`, `year` (required, int 1..3), `trackId?`, `electiveSubjectId?`.
Same `refineSection` + same server `resolveSection`.

- No profile row → **404** `no profile to update — complete onboarding first`.
- Writes exactly those four columns and nothing else. "A narrow route cannot clobber what it
  cannot write."
- Authorization matrix rows confirming behaviour (`apps/api/src/test/authorization-matrix.int-spec.ts:581-587`):
  anonymous → 401; student with `{year:1}` → 200; student with `{year:1, fullName:'…'}` → **400**.

### D.4 `POST /api/profile/avatar`

`@RequirePermission('profile:write')` — deliberately **not** `media:write`, which is staff-only.
Multipart, field name `file`, `limits: { fileSize: MAX_AVATAR_BYTES, files: 1 }`.
No file → 400 `no file uploaded`.

Response: `{ image: string }` — the **storage key**, e.g. `ab/<uuid>.webp`.

Server behaviour (`ProfileService.setAvatar`): uploads via `MediaService.uploadAvatar`, writes
the key to `User.image`, then **archives** the previous asset (`updateMany` on
`storageKey = old, archivedAt: null` → sets `archivedAt`) but **only when the old value does not
start with `http`** (a Google URL has no `media_assets` row).

### D.5 `POST /api/profile/whatsapp-opened`

`@RequirePermission('profile:write')`, `@HttpCode(204)`, **no body either way**.
Idempotent: `updateMany({ where: { userId, whatsappOpenedAt: null }, data: { whatsappOpenedAt: new Date() } })`
— second call updates zero rows, and a student with no profile row is a quiet no-op.

It records **the press, not the join**. The only consumer is «رسايل م. أيمن», which skips anyone
who has a timestamp. Call it from the click handler that opens the WhatsApp channel, fire and
forget; it must never surface an error.

### D.6 Screen: `/profile` («بروفايلي»)

`apps/web/app/(app)/profile/page.tsx`. Copy block `copy.profile`.

Header: eyebrow «04 / بروفايلي», `<h1>` «بروفايلي», subtitle
«بياناتك، اللي حصّلته، والأجهزة اللي حسابك مفتوح عليها.»

Five independently-loading sections (five Suspense boundaries on web; five independent loading
states on mobile):

1. **Identity panel** — reads `GET /api/profile/me`, `GET /api/taxonomy` (through a cached
   loader that returns `null` on failure) and the session in parallel.
   - `<AvatarForm>`: 72px avatar, title `photoTitle` «صورتك», hint `photoHint`
     «PNG أو JPG، لحد ٢ ميجا. هنقصّها مربّعة تلقائيًا.», button `photoChange` «تغيير صورتك».
   - A 4-column `<dl>`: `fieldPhone` «رقم الموبايل» (rendered `dir="ltr"`),
     `fieldSchool` «المدرسة», `fieldGovernorate` «المحافظة» (resolved from the taxonomy by
     `governorateCode`), `fieldYear` «الصف» (resolved via `identityOf`).
     Unset value → `fieldNotSet` «مش متسجّل». A `null` taxonomy makes governorate/year print
     «مش متسجّل» rather than erroring.
   - Link `fieldsEdit` «عدّل بياناتك» → `/settings/section`.
2. **Totals** — heading `earnedTitle` «اللي حصّلته», four stat tiles from
   `GET /api/me/dashboard` and `GET /api/me/quizzes`: `statLessons` «دروس خلصتها»
   (completed/total + meter), `statQuizzesPassed` «امتحانات نجحت فيها» (passed/taken),
   `statAverage` «متوسط درجاتك» (`averagePercent ?? copy.profile.noneYet` = «لسه»),
   `statWatchTime` «وقت المذاكرة» (summed from the **first page** of the activity feed only —
   documented limitation; unit suffix `س` when ≥60 minutes else `د`).
3. **Charts** — `chartsTitle` «أرقامك», `chartsSubtitle`. Trend line rendered only when
   `history.series.length > 1`; bars always. Empty: `chartsEmpty`
   «أول اختبار يخلص هتلاقي درجتك هنا مرسومة.»
4. **Activity feed** — `activityTitle` «سجل نشاطك», `activitySubtitle` «كل حاجة عملتها، بالترتيب.»
   Cursor-paginated («أقدم» = `activityMore`). Empty `activityEmpty`, failure `activityFailed`.
5. **Devices** — `devicesTitle` «أجهزتك», `devicesSubtitle`
   «لو فيه جهاز مش بتاعك، اقفله من هنا.» — a client component owning its own fetch to
   `/api/sessions` (sessions/devices spec).

Photo upload failure copy, mapped from the upload-client's `UploadFailure`
(`apps/web/components/profile/avatar-form.tsx`):

```
tooLarge               → copy.profile.photoTooLarge  'الصورة أكبر من ٢ ميجا. صغّرها وجرّب تاني.'
badType | unreadable   → copy.profile.photoWrongType 'ده مش ملف صورة. المطلوب PNG أو JPG.'
anything else          → copy.profile.photoFailed    'مقدرناش نرفع الصورة. نجرّب صورة تانية.'
success                → copy.profile.photoDone      'اتغيّرت صورتك'
in flight              → copy.profile.photoUploading 'بنرفع الصورة…'
```

The picker's `accept` is built from the server allowlist:
`ALLOWED_UPLOAD_EXT.map(e => '.' + e).join(',')` → `.png,.jpg,.jpeg,.webp,.avif,.gif`
— **so the avatar picker is extension-restricted, unlike the screenshot/homework pickers which
use `image/*`** (see §E.4).

### D.7 Screen: `/settings/section` («بياناتك»)

`apps/web/app/(app)/settings/section/page.tsx` + `apps/web/components/settings/profile-form.tsx`.
Copy block `copy.section`.

- Reads `GET /api/taxonomy` (nullable loader) and `GET /api/profile/me` in parallel.
- `me.profile == null` → **redirect to `/onboarding`** (the section PATCH would 404).
- `taxonomy == null` → render the unavailable panel instead of the form:
  `unavailableTitle` «مش قادرين نجيب قايمة الصفوف دلوقتي», `unavailableBody`
  «مشكلة مؤقتة عندنا. صفّك الحالي وكل تقدمك زي ما هما ومحصلّهمش حاجة — نجرّب تاني بعد شوية.»,
  retry `copy.common.retry` = «نحاول تاني» (a hard reload, not a soft nav).
- Header: eyebrow «الإعدادات», `<h1>` `title` «بياناتك», subtitle
  «عدّل أي حاجة فيهم وقت ما تحب — الكورسات اللي تظهرلك بتمشي مع صفّك ومدرستك.»

Form, three groups, nine controls:

| Group | Fields |
|---|---|
| `groupPersonal` «بياناتك الشخصية» | `fullName` (label `copy.onboarding.fullName` «الاسم الكامل», placeholder «الاسم بالكامل», autocomplete `name`); `gender` select (placeholder «اختار», options «ذكر»/«أنثى»); `phone` **read-only** (see below); `fatherPhone` (label `copy.onboarding.fatherPhone` = «رقم تليفون ولي الأمر», placeholder «مثال: 01012345678») |
| `groupSchool` «مدرستك» | `governorateCode` select (placeholder «محافظتك», pinned-first option list); `schoolName` (placeholder «مثال: مدرسة النصر الثانوية»); `schoolStream` select (placeholder «مدرسة عام ولا لغات؟», options `copy.stream.general` = **«عربي»** and `copy.stream.languages` = «لغات» — note the label is «عربي», the wire value is `general`) |
| `groupSection` «صفّك الدراسي» | `year` select (placeholder «اختار صفّك», options from `offeredYearOptions`); `<FixedSectionNote>`; the reassurance panel `keepsProgress` |

- **Phone is `readOnly`, not `disabled`** — it must stay focusable/selectable/copyable and it
  must still be submitted (the upsert writes all columns). Helper text `phoneLocked`:
  «ده رقمك اللي بتدخل بيه، ومش بيتغيّر من هنا. لو محتاج تغيّره كلّمنا على واتساب.»
- `keepsProgress`: «تقدمك محفوظ. ولو الرجوع للصف القديم حصل، هتلاقي كل اللي خلص ودرجاتك زي ما هي.»
- Submit → `PATCH /api/profile/onboarding` with `{...values, ...fixedSectionFor(taxonomy, values.year)}`.
- Errors: HTTP 409 → `copy.onboarding.phoneConflictError` = «رقمك ده متسجّل على حساب تاني»; anything else → `saveFailed`
  «مقدرناش نحفظ التغيير. نحاول تاني.». Button label `save` «حفظ» / `saving` «جارٍ الحفظ…».
- On success the web does `router.refresh()` then `router.push('/library')`.
- Bottom link `back` «رجوع للكورسات» → `/library`.

**Phone normalisation the Flutter form must replicate** (`packages/contracts/src/phone.ts`):

- `toAsciiDigits(value)` runs **per keystroke** so the field shows the digits that will be saved.
  It folds Arabic-Indic `U+0660–0669` and Extended Arabic-Indic (Persian/Urdu) `U+06F0–06F9`
  to ASCII, leaving `+`, spaces and the leading zero untouched:
  ```ts
  value.replace(/[٠-٩۰-۹]/g, d => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  })
  ```
- `normalizeEgyptianPhone(value)` → E.164 (`+201012345678`) or `null`. It parses with
  `libphonenumber-js/core` against **EG metadata only**, and requires `isValid() && country === 'EG'`.
  Accepts `01012345678`; rejects non-Egyptian numbers.
- Storage is always E.164 with the `+`. `wa.me` needs it stripped (§A.3).

---

## E. Media and uploads

### E.1 Every upload path in the product

| Purpose | Endpoint | Auth | Client cap | Server pipeline | Storage key shape | Response |
|---|---|---|---|---|---|---|
| Media library image (covers, home blocks) | `POST /api/media` | `media:write` | `MAX_UPLOAD_BYTES` 8 MiB | `MediaService.upload` | `<2 hex>/<uuid>.webp` | `MediaAsset` |
| Re-crop an existing asset | `POST /api/admin/media/:id/replace` | `media:write` | 8 MiB | `replaceBytes` | new key, **same id** | `MediaAsset` |
| Lesson document | `POST /api/media/documents` | `media:write` | `MAX_DOCUMENT_BYTES` 95 MiB | `DocumentService.upload` | `doc/<2 hex>/<uuid>.{pdf,pptx,docx,xlsx}` | `{storageKey, filename, mime, sizeBytes}` |
| Student avatar | `POST /api/profile/avatar` | `profile:write` | `MAX_AVATAR_BYTES` 2 MiB | `uploadAvatar` (square 512 cover) | `<2 hex>/<uuid>.webp` | `{image}` |
| Payment screenshot | `POST /api/payments/screenshot` | `payment:submit` | 8 MiB | `uploadPrivateImage(_, 'payment-proof')` | `payment-proof/<2 hex>/<uuid>.webp` | `{screenshotKey}` |
| Book-order screenshot | `POST /api/book-orders/screenshot` | `@Public()` + CSRF + throttle | 8 MiB | `uploadPrivateImage(_, 'book-order-proof')` | `book-order-proof/<2 hex>/<uuid>.webp` | `{screenshotKey}` |
| Homework page photo | `POST /api/homework/lessons/:lessonId/images` | `homework:submit` | 8 MiB | `uploadPrivateImage(_, 'hw', {width:1400, quality:64})` | `hw/<2 hex>/<uuid>.webp` | `{storageKey, sizeBytes}` |
| Conversation attachment (**admin only**) | `POST /api/admin/conversations/attachments` | `conversation:reply` | 95 MiB | image *or* document, chosen from the bytes | `msg/<2 hex>/<uuid>.{webp,pdf,pptx,docx,xlsx}` | `MessageAttachmentInput` |
| Voice note (**admin only**) | inbox module | admin | `MAX_VOICE_BYTES` 20 MiB, ≤600 s | `VoiceService` | `msg/…{webm,m4a}` | — |

Every one is `multipart/form-data`, single file, **field name `file`**, and every controller
answers **400 `no file uploaded`** when it is missing.

`limits.fileSize` on the multer interceptor is the first gate (it refuses the body before it is
fully buffered); the service re-checks the same ceiling on the buffer. Over the cap →
**413 PayloadTooLarge**.

`POST /api/homework/lessons/:lessonId/images` checks the **enrolment before the payload** —
"an upload endpoint that only checks it on the next request is a free image host."

### E.2 Server-side gates (`apps/api/src/modules/media/media.service.ts`, `gateAndEncode`)

Four gates, in order:

1. **size** vs the caller's `maxBytes` → 413.
2. **extension allowlist**, taken from `file.originalname.split('.').pop().toLowerCase()`:
   `ALLOWED_UPLOAD_EXT = ['png','jpg','jpeg','webp','avif','gif']` → else **400**
   `file extension is not allowed`.
   ⚠️ This runs **before** the magic-byte sniff, which is why the browser compressor renames the
   file to `.jpg`.
3. **magic-byte sniff** of the buffer against
   `ALLOWED_UPLOAD_MIME = ['image/png','image/jpeg','image/webp','image/avif','image/gif']`
   → else **400** `file contents are not an allowed image type`.
   The uploaded `Content-Type` header is read **nowhere**.
4. **sharp re-encode to WebP** — this is the real control. It destroys polyglots and strips
   every EXIF/GPS block. Parameters:
   - `limitInputPixels: MAX_INPUT_PIXELS` = 50 000 000 (decompression bomb ceiling)
   - `animated: true` for `image/gif | image/webp | image/avif`
   - `.rotate()` (apply EXIF orientation, then discard it) **unless** the file is multi-frame
     *and* `orientation >= 5` — libvips cannot quarter-turn a frame strip and sharp throws
   - avatar: `.resize(512, 512, {fit:'cover'})`, upscaling allowed
   - everything else: `.resize(width ?? 1600, null, {withoutEnlargement: true, fit: 'inside'})`
   - `.webp({ quality: quality ?? 82 })`
   - any throw → **400** `file could not be processed as an image`
5. **UUID key** — the original filename never touches the disk. `filename` is stored for
   display only, truncated to 200 chars.

Stored `height` is `info.pageHeight ?? info.height` (frame height, not the animation strip).

Documents get a different set of compensating controls (no re-encode is possible):
`ALLOWED_DOCUMENT_EXT = ['pdf','pptx','docx','xlsx']`,
`ALLOWED_DOCUMENT_MIME` = the four OOXML/PDF types. Macro-enabled formats (`.pptm`, `.docm`,
`.xlsm`) are **absent by design**. The stored extension comes from the *detected* mime via
`EXT_FOR_MIME`, never from the name. Rejection: **400** `file contents are not an allowed document type`.

`MAX_DOCUMENT_BYTES = 95 * 1024 * 1024` — chosen by **Cloudflare**, not by us: the edge rejects
bodies over 100 MB on Free/Pro *before* they reach the origin, invisibly. 95 leaves room for the
multipart envelope.

**SVG is absent and must stay absent** (A9): an SVG is a script-capable document.

### E.3 Storage key patterns and what they mean for access

`packages/contracts/src/admin/media.ts`:

```
STORAGE_KEY_PATTERN            ^[0-9a-f]{2}\/[0-9a-f-]{36}\.webp$
DOCUMENT_KEY_PATTERN           ^doc\/[0-9a-f]{2}\/[0-9a-f-]{36}\.(?:pdf|pptx|docx|xlsx)$
CONVERSATION_KEY_PATTERN       ^msg\/[0-9a-f]{2}\/[0-9a-f-]{36}\.(?:webp|pdf|pptx|docx|xlsx)$
PAYMENT_PROOF_KEY_PATTERN      ^payment-proof\/[0-9a-f]{2}\/[0-9a-f-]{36}\.webp$
BOOK_ORDER_PROOF_KEY_PATTERN   ^book-order-proof\/[0-9a-f]{2}\/[0-9a-f-]{36}\.webp$
HOMEWORK_KEY_PATTERN           ^hw\/[0-9a-f]{2}\/[0-9a-f-]{36}\.webp$
```

**The prefix IS the access-control boundary.** `GET /media/:prefix/:name` binds exactly **two**
path segments, so every three-segment key (`doc/`, `msg/`, `payment-proof/`,
`book-order-proof/`, `hw/`) is structurally unreachable through the public route, and none of
them has a `media_assets` row so none appears in the admin library.

⚠️ **Flutter cannot render a private-prefix image with a plain `Image.network(mediaUrl(key))`.**
Those bytes are served by the owning module's own authenticated route, not by the media origin.
Whatever the web does for a homework page / payment proof / attachment is what the app must do;
check the owning module's spec.

`MIME_FOR_EXT` maps the extension **we chose** back to a mime:
`webp→image/webp, pdf→application/pdf, pptx/docx/xlsx→the OOXML types, webm→audio/webm, m4a→audio/mp4`.
`mimeForStorageKey(key)` = `webp` → render inline as an image; anything else → render a file card.

### E.4 Public media serving

`GET <mediaOrigin>/media/:prefix/:name` — `@Public()`, no `/api` prefix.
`apps/api/src/modules/media/media.controller.ts`, `serve()`:

```
Content-Type: image/webp                   (always — fixed, produced by us)
Content-Length: <size>
X-Content-Type-Options: nosniff
Content-Disposition: inline; filename="<name>"
Cache-Control: public, max-age=31536000, immutable
Content-Security-Policy: default-src 'none'; sandbox
Cross-Origin-Resource-Policy: cross-origin
Access-Control-Allow-Origin: *
```

Unknown key → 404.

`immutable` + a year is safe because re-cropping mints a **new key** under the same asset id —
which is exactly why `replaceImage` returns the whole parsed asset and not just an ok.

### E.5 The browser-side image compression Flutter must reproduce

`apps/web/lib/image-compress.ts` (shipped 2026-09-08, commit `599dd010`, PR #326).

**Why it exists:** a modern Android screenshot is a 1080×2400 PNG, routinely 3–6 MB; students
were uploading it raw on 4G immediately after paying. Nothing on the platform compressed
anything, and a real share of phone photos exceeded the 8 MB cap — a refusal on the last step
of a paid order. Also fixes iPhone **HEIC**, which is not on the API allowlist at all.

**Constants:**

```ts
const MAX_EDGE = 1600;      // long edge, CSS pixels
const MIME     = 'image/jpeg';
const QUALITY  = 0.82;
```

JPEG and not WebP **on purpose**: `canvas.toBlob` silently falls back to PNG on browsers that
cannot encode WebP, which would turn a 4 MB screenshot into a 6 MB one on exactly the old
devices this is meant to help. Flutter has no such constraint, but the **API allowlist and the
`.jpg` rename are what matter** — keep JPEG unless you also change the rename.

**Algorithm (port this exactly):**

1. `if (!file.type.startsWith('image/')) return file;` — not an image, let the API's allowlist
   give the real answer.
2. `if (file.type === 'image/gif') return file;` — a GIF may be animated and drawing it to a
   canvas keeps frame one only. GIF is on the API allowlist, so it passes through untouched.
3. Decode with EXIF orientation applied: `createImageBitmap(file, { imageOrientation: 'from-image' })`.
   > "load-bearing, not a nicety. A phone photo carries its rotation in EXIF and the raw pixels
   > are sideways; a canvas draws the raw pixels. Without this, re-encoding turns an upright
   > screenshot into a rotated one — and the EXIF that would have corrected it is gone."
   Flutter equivalent: bake the EXIF orientation into the pixels before encoding.
4. `scale = min(1, MAX_EDGE / max(w, h))`; `width = max(1, round(w*scale))`, same for height.
   **Never upscales.**
5. **Fill the canvas with `#ffffff` first**, then draw. A JPEG has no alpha; without a painted
   background anything transparent encodes as **black** — a screenshot with rounded corners or a
   transparent status bar would arrive framed in black bars.
6. Encode JPEG at quality 0.82.
7. `if (!blob || blob.size >= file.size) return file;` — **decline your own result when it is not
   smaller.** Re-encoding an already-small JPEG can grow it, and shipping a bigger file to save
   bandwidth is the one outcome that must never happen.
8. Rename: `IMG_0421.HEIC` → `IMG_0421.jpg`.
   ```ts
   const trimmed = name.replace(/\.[^./\\]+$/, '');
   return `${trimmed === '' ? 'upload' : trimmed}.jpg`;
   ```
   Required because the API checks the **extension allowlist before it sniffs magic bytes**.
9. **Every failure returns the ORIGINAL file, never an exception.** Missing API, unsupported
   codec, `toBlob` returning null, tainted canvas — all fall through untouched. "Compression is
   an optimisation, and an optimisation that can block an upload is worse than no optimisation."

**Where it is applied** (`apps/web/lib/upload-client.ts`, the `compress` parameter — opt-**in**):

| Upload | compressed? |
|---|---|
| `uploadAvatar` | ✔ |
| `uploadPaymentScreenshot` | ✔ |
| `uploadBookOrderScreenshot` | ✔ |
| `uploadHomeworkImage` | ✔ |
| `uploadImage` (media library) | ✘ |
| `replaceImage` | ✘ |
| `uploadDocument` | ✘ |
| `uploadConversationAttachment` | ✘ |

The split is by **who is holding the device**: a student on a phone sending a file the camera
wrote (the picture only has to stay *readable*) versus an admin publishing artwork that gets
rendered large.

⚠️ **Order:** compression runs **before** the size check.

```ts
const payload = compress ? await compressImage(file) : file;
if (payload.size > maxBytes) return { ok: false, reason: 'tooLarge' };
```

Checking first would refuse a 9 MB phone photo that compresses to 400 KB — a refusal the
student cannot act on, on the last step of an order they have already paid for.

⚠️ **Picker `accept`:** because what is uploaded is no longer what the picker returned, the
screenshot and homework pickers use `image/*` (so iOS HEIC is selectable), while the avatar
picker still uses the extension list. Flutter: use a generic image picker for
screenshots/homework, and rely on `compressImage`'s rename + the API allowlist as the gate.

Measured result quoted in the commit: 1080×2400 → 720×1600, 1.82 MB → 401 KB.

### E.6 Upload failure classification and progress

`UploadFailure = 'tooLarge' | 'badType' | 'unreadable' | 'network' | 'failed'`.

```ts
function classify(status: number, body: string): UploadFailure {
  if (status === 413) return 'tooLarge';                 // status BEFORE body: a proxy 413 is HTML
  const message = (JSON.parse(body)?.message ?? '').toLowerCase();   // non-JSON → 'failed'
  if (message.includes('too large')) return 'tooLarge';
  if (message.includes('not allowed') || message.includes('unsupported')) return 'badType';
  if (message.includes('could not be processed') || message.includes('not an allowed document'))
    return 'unreadable';
  return 'failed';
}
```

`network` means the request never completed (offline, DNS, dropped mid-upload) — distinct from a
refusal, because the file may be fine and worth retrying unchanged.
A **2xx whose body does not parse against the contract is a failure**, not a success:
"the caller would otherwise store an undefined storage key."

The web uses `XMLHttpRequest` rather than `fetch` purely for `upload.onprogress` — a 60 MB deck
over a phone connection is a minute of silence otherwise. **Flutter must show upload progress**
(`Dio` `onSendProgress` or equivalent) for the same reason.

⚠️ Historical trap worth not repeating: uploads used to go through a Next Server Action, whose
default `bodySizeLimit` is **1 MB**. Everything between 1 MB and the advertised cap failed
**silently** — no error anywhere. Measured 2026-08-08: 2 KB saved, 515 KB saved, 1 056 KB
nothing happened, 3 MB nothing happened. A mobile client posting straight to the API does not
have this problem, but it must still surface every non-2xx.

### E.7 Admin media library (probably not needed on mobile)

```
GET    /api/admin/media?page=1&perPage=40&includeArchived=false   media:read
       → { rows: MediaAsset[], rowCount: number }   orderBy createdAt desc
PATCH  /api/admin/media/:id      media:write   body { altAr: string(≤200) | null } .strict()
POST   /api/admin/media/:id/archive    media:delete   (soft — bytes are kept)
POST   /api/admin/media/:id/restore    media:delete
GET    /api/admin/media/:id/usage      media:read  → { usedBy: MediaUsageKind[] }
DELETE /api/admin/media/:id            media:delete  → 204, permanent (row AND bytes)
POST   /api/admin/media/:id/replace    media:write   multipart
```

`perPage` is coerced, min 1, max 100, default 40; `page` min 1 default 1.

`MEDIA_USAGE_KINDS = ['brandingLogoLight','brandingLogoDark','brandingFavicon','seoOgImage','homeBlock']`
— there is no FK from `media_assets` anywhere (every reference is a string inside a jsonb blob),
so Postgres cannot refuse a breaking delete; this endpoint is the substitute.

`MediaAsset` wire shape: `{id, storageKey, filename, mime: 'image/webp' (literal), sizeBytes,
width: int|null, height: int|null, altAr: string|null, archivedAt: string|null, createdAt: string}`.

---

## F. Marketing, outreach, campaigns and WhatsApp

### F.1 «رسايل م. أيمن» — outreach (automatic, per-student)

Four reasons the platform speaks first (`packages/contracts/src/outreach/kinds.ts`, mirrored by
the Postgres enum `outreach_kind`):

```
quiz_result       a paper was graded; names the topics to go back to
quiz_nudge        the lesson is finished and its quiz has never been opened
lesson_praise     a lesson with no quiz was completed — nothing is asked for
whatsapp_invite   join the WhatsApp channel. Also rides along on the other three.
```

Settings that govern it (`OutreachSettingsSchema`, `packages/contracts/src/admin/settings.ts`,
section `outreach`, **admin-only — deliberately NOT on `PublicSettingsSchema`**):

| key | type | default | note |
|---|---|---|---|
| `quizResult` | bool | true | |
| `quizNudge` | bool | true | |
| `lessonPraise` | bool | true | |
| `whatsappInvite` | bool | true | |
| `nudgeAfterHours` | int 1..720 | 24 | floor of 1h — shorter reaches a student still on the page |
| `groupInviteEveryDays` | int 3..365 | 21 | ⚠️ key says "group", destination is the **channel**; renaming it breaks the stored `.strict()` row and 500s every page |
| `maxInvitesPerStudent` | int 1..20 | 4 | lifetime cap |
| `maxPerStudentPerDay` | int 1..10 | 2 | across all kinds, enforced in delivery |

Admin read endpoints (`apps/api/src/modules/outreach/admin-outreach.controller.ts`,
`outreach:read`, **read-only by design** — there is deliberately no "send to everyone" button):

```
GET /api/admin/outreach?filter=&page=&perPage=    → ListResponse<OutreachLogRow>
GET /api/admin/outreach/stats                     → OutreachStats
GET /api/admin/outreach/preview                   → OutreachPreview
```

`whatsapp_invite` is skipped for any student with `student_profiles.whatsapp_opened_at` set
(§D.5), and `contact.whatsappGroup` empty means the invitation is simply **not sent** — it never
falls back to `whatsappChannel`, because "a message that says «جروب الواتساب مستنيك» over a link
to a read-only channel is a promise the link cannot keep."

### F.2 Campaigns (bulk WhatsApp)

`apps/api/src/modules/marketing/marketing.controller.ts`, all under `/api/admin/marketing`.
Four separate permissions: `marketing:read`, `marketing:write`, `marketing:send`,
`marketing:device`. All writes `@RequireCsrf()`.

```
GET    device                       marketing:read     ← declared BEFORE :id routes, deliberately
POST   device/link                  marketing:device   → WhatsappDevice (QR pairing)
POST   device/unlink                marketing:device   → {ok:true}
GET    opt-outs                     marketing:read
POST   opt-outs                     marketing:write    body {phone, reason}
DELETE opt-outs/:phone              marketing:write
POST   audience-preview             marketing:write    body {audience, pacing} → AudiencePreview
GET    campaigns                    marketing:read     → CampaignRow[]
POST   campaigns                    marketing:write    → CampaignRow
GET    campaigns/:id                marketing:read     → CampaignDetail
GET    campaigns/:id/recipients?status=  marketing:read  (status ∈ RECIPIENT_STATUSES, else 'all')
PATCH  campaigns/:id                marketing:write
POST   campaigns/:id/start          marketing:send
POST   campaigns/:id/pause          marketing:send
POST   campaigns/:id/cancel         marketing:send
DELETE campaigns/:id                marketing:write
```

Enums live in the Prisma schema: `CampaignStatus`, `CampaignRecipientStatus`; models
`MarketingCampaign`, `MarketingRecipient`, `MarketingOptOut`.

**Inbound relay:** `POST /api/marketing/wa/inbound`
(`whatsapp-inbound.controller.ts`) — `@Public()`, authenticated by the shared secret header
**`x-wa-token`** (env `WA_SERVICE_TOKEN`), body `{phone, text}`. It recognises **only** the stop
word (`isOptOutMessage`, i.e. «قف») and records an opt-out; anything else is acknowledged and
dropped. It is a container-to-container route on the compose network, never a browser route —
which is why it has no rows in the authorization matrix.

### F.3 Verdict for mobile

**The mobile app needs none of §F.** There is no student-facing surface here at all: outreach and
campaigns are outbound WhatsApp, the admin screens are admin screens, and the WhatsApp device
pairing is a QR scan against a sidecar.

The **only** thing the student app must implement from this area is:

1. Read `contact.whatsappChannel` / `contact.whatsapp` / `contact.facebookGroup` /
   `contact.whatsappGroup` from `GET /api/settings/public` and render the buttons (dropping any
   that are null).
2. Build `wa.me` links with `waMeHref` (strip the `+`).
3. **Call `POST /api/profile/whatsapp-opened` (204, fire-and-forget) at the moment the student
   presses the channel link** — otherwise the platform keeps inviting a student who has already
   joined, up to `maxInvitesPerStudent` times.

---

## G. Feature flags, site settings, navigation items

### G.1 Site settings

Storage: one singleton row, `SiteSetting { id Int @id @default(1), data Json, updatedBy, updatedAt }`.
Schema: `SiteSettingsSchema` in `packages/contracts/src/admin/settings.ts`, five sections:
`branding`, `seo`, `contact`, `outreach`, `store` — each `.strict()` and each `.prefault({})`.

⚠️ `.prefault({})`, **never** `.default({})`: Zod 4's `.default()` short-circuits and returns the
literal `{}` without running the inner schema, which would make every property `undefined` while
still typed.

**Public endpoints:**

```
GET /api/settings/branding   @Public()  → BrandingRead
GET /api/settings/public     @Public()  → PublicSettingsRead = { seo: SeoRead, contact: Contact }
```

`BrandingRead`:

```ts
{
  accent: 'amber'|'cyan'|'blue'|'violet'|'magenta'|'slate',   // default 'amber'
  radius: 'sharp'|'default'|'soft',                            // default 'default'
  logoLightAssetId: uuid|null, logoDarkAssetId: uuid|null, faviconAssetId: uuid|null,
  logoLightKey: string|null, logoDarkKey: string|null, faviconKey: string|null,
}
```

The `*Key` fields are **resolved server-side** from the asset ids and are read-only. They exist
because a caller with an id cannot build a URL: `mediaUrl()` takes a storage key
(`<2 hex>/<uuid>.webp`) and the layout was passing `` `${faviconAssetId}.webp` ``, a single path
segment matching no route — every favicon an admin ever chose 404'd, silently.
**Flutter must use `*Key`, never `*AssetId`, to build image URLs.**

There is deliberately **no green and no red** in `ACCENT_SLOTS`: those hues are load-bearing for
quiz correctness. The slot→OKLCH mapping lives in `packages/ui/src/lib/branding.ts`
(`ACCENT_RAMPS`, four steps per theme: solid / solid-hover / low-contrast text / high-contrast)
and is never editable by an admin. Flutter should port `ACCENT_RAMPS` rather than accept colours.

`SeoRead`: `{ titleAr: string(≤70) def '', descriptionAr: string(≤160) def '', ogImageAssetId: uuid|null, ogImageKey: string|null }`.

`Contact` — `.strict()`, every field nullable with default `null`:

| key | validation | used by |
|---|---|---|
| `email` | `z.email()` | privacy page contact line |
| `phone` | E.164 `/^\+[1-9]\d{7,14}$/` | — |
| `whatsapp` | E.164 | footer «كلّمنا», links page, المساعد |
| `facebook`, `youtube`, `telegram`, `instagram`, `tiktok` | **`https://` only** | footer, links |
| `whatsappChannel` | https URL | footer, `/welcome`, dashboard band |
| `whatsappGroup` | https URL | «رسايل م. أيمن» invitation — no fallback |
| `facebookGroup` | https URL | links page |
| `vodafoneCash` | E.164 | ⚠️ **SUPERSEDED, dead.** Nothing reads it. It cannot be deleted from the schema: the object is `.strict()` and a production row already carries the key, so removing the field makes the stored row fail to parse and every page on the site 500s at once. |
| `instapay` | E.164 | the live payment destination for course subscriptions **and** book orders. Deliberately **no fallback to `vodafoneCash`** — the panel is labelled «إنستاباي» and a wallet number under an InstaPay heading sends money to the wrong destination. Empty → the panel says the payment number is not set up. |

`store.shippingCents`: int 0..50 000, default **6 500** (65 EGP). ⚠️ Not on
`PublicSettingsSchema` — the books catalogue response carries the fee itself, and "one number
with two sources is one number that will eventually disagree with itself."

`outreach` is also not public (§F.1).

**Admin:** `GET /api/admin/settings` (`settings:read`) → full `SiteSettings`;
`PATCH /api/admin/settings/:section` (`settings:write`) where `:section` is validated against
`SETTINGS_SECTIONS = ['branding','seo','contact','outreach','store']` **before** it indexes into
`SECTION_SCHEMAS` (prototype-pollution guard). Invalid section → 400
`unknown settings section: <x>`. Invalid payload → **400 with a structured body**:

```json
{ "message": "invalid settings payload", "issues": [{ "path": [...], "message": "..." }] }
```

Merge semantics: the whole blob is re-parsed and only the named section is replaced.

⚠️ Build/cache trap the mobile app inherits nothing of, but which explains web behaviour:
`next build` runs where no API is listening, so `getBranding()`/`getPublicSettingsOrDefaults()`
bake in **defaults** under `cacheLife('minutes')` — for the first minutes after every deploy the
site serves default branding and an empty contact block. `getWhatsappChannelFresh()` opts out of
the cache entirely for exactly this reason (`apps/web/lib/settings.ts`).

**Mobile guidance:** fetch `GET /api/settings/branding` and `GET /api/settings/public` once at
launch, cache with a short TTL, and always ship the same defaults the schemas produce
(`BrandingReadSchema.parse({})`, `PublicSettingsReadSchema.parse({seo:{},contact:{}})`) so an
unreachable API degrades to the default identity rather than to a blank screen.

### G.2 Feature flags

`GET /api/flags` — `@Public()`, `apps/api/src/modules/admin/flags/flags.controller.ts`.
Returns a bare array, `orderBy: { key: 'asc' }`:

```ts
FeatureFlag = { key: string, descriptionAr: string, enabled: boolean, updatedAt: ISO string }
```

Admin: `GET /api/admin/flags` (`flags:read`, identical rows today),
`PATCH /api/admin/flags/:key` (`flags:write`) body `{enabled: boolean}` `.strict()`.
An undeclared key → **404**.

**Declarations live in TypeScript, values live in the DB.**
`FLAG_DECLARATIONS` (`packages/contracts/src/admin/flags.ts`) — the whole current set:

| key | descriptionAr | default |
|---|---|---|
| `catalog.showComingSoon` | إظهار الكورسات اللي لسه مش متاحة | false |
| `quiz.practiceMode` | تفعيل وضع التدريب في الاختبارات | true |
| `quiz.showReviewAfterSubmit` | عرض المراجعة بعد تسليم الاختبار | true |
| `player.trackProgress` | تسجيل تقدم مشاهدة الدروس | true |
| `onboarding.askParentPhones` | السؤال عن أرقام ولي الأمر | true |
| `home.showTestimonials` | إظهار آراء الطلبة في الصفحة الرئيسية | false |
| `sessions.enforceDeviceLimit` | تطبيق حد الأجهزة المسموح بها | false |

Resolution helper, to be ported verbatim:

```ts
export function isEnabled(flags: FeatureFlagList, key: FlagKey): boolean {
  const declaration = FLAG_DECLARATIONS.find(e => e.key === key);
  if (!declaration) return false;                       // undeclared key → OFF
  return flags.find(f => f.key === key)?.enabled ?? declaration.defaultValue;
}
```

Asymmetry that makes deletion safe: a row with no declaration is **ignored entirely**; a
declaration with no row reads as `defaultValue`. `FlagsService.onModuleInit` upserts a row per
declaration on every boot, keeping `descriptionAr` in step but **never** overwriting `enabled`.

⚠️ **Nothing in `apps/web` currently calls `GET /api/flags`.** There is no `getFlags()` loader
(`apps/web/lib/settings.ts` says the tag vocabulary exists but the loader landed with a later
task). Grep confirms the only consumers are the admin flags screen and the API. So *today* these
flags gate nothing on the public site. A Flutter client that starts honouring them will be the
first — verify with the product owner which are actually meant to be live before wiring them.

### G.3 Navigation items

`GET /api/navigation` — `@Public()`. Returns a **two-level tree**:

```ts
NavigationTree = Array< NavigationItem & { children: NavigationItem[] } >
NavigationItem = {
  id: string, parentId: string|null, labelAr: string, href: string,
  icon: string|null, position: int, visibleTo: string[], isPublished: boolean,
}
```

Filter/order: `where { isPublished: true, archivedAt: null }`,
`orderBy [{position:'asc'}, {id:'asc'}]`.

`href` is restricted to site-relative paths on write:
`/^\/[A-Za-z0-9\-._~/?#[\]@!$&'()*+,;=%]*$/` — "an admin-controlled menu that accepts absolute
URLs is an open redirect surface and, with `javascript:`, a stored-XSS one."
`visibleTo` entries must match `/^[a-z-]+:[a-z-]+$/` (they are **permission strings**, not role
names), max 10. `labelAr` 1..60, `icon` ≤40.

Admin: `GET /api/admin/navigation` (`nav:read`), `POST` / `PATCH :id` / `DELETE :id` (archive) /
`POST :id/restore` / `POST /order` (`nav:write`). Reorder body:
`{ parentId: uuid|null, ids: uuid[] 1..200, unique }` — one write for a whole level; a set that
does not match exactly is a **409**, not silent data loss.

⚠️ **Also unused by the public web.** The marketing nav (`site-nav.tsx`) and footer
(`site-footer.tsx`) are **hardcoded**, and the admin sidebar comes from
`apps/web/components/admin/nav-items.ts` (`ADMIN_NAV`, a TypeScript table consumed by the
sidebar, the breadcrumb resolver and the command palette). The student rail is
`apps/web/components/app/student-rail.tsx`.

**Mobile guidance:** hardcode the mobile navigation the way the web hardcodes its own. Do not
build the tab bar out of `/api/navigation` — that table is an unfinished web-menu builder, it is
empty in practice, and its `href`s are web routes with no Flutter counterpart. The student-facing
nav labels to reuse are in `copy.nav`:

```
home 'الرئيسية'          courses 'الكورسات'        about 'عن المنصة'
contact 'التواصل معانا'   login 'تسجيل الدخول'      register 'حساب جديد'
dashboard 'حسابي'        path 'مساري'              essentials 'التأسيس'
books 'الكتب'            playground 'تجربة الكود'   devices 'أجهزتي'
account 'الحساب'         accountMenu 'قائمة الحساب' menuLabel 'القائمة'
logout 'تسجيل الخروج'     loggingOut 'جارٍ الخروج…'  logoutFailed 'مقدرناش نسجّل خروجك. نحاول تاني.'
adminPanel 'لوحة التحكم'  mainNav 'التنقّل الأساسي'   railCourses 'كورساتي'
railCoursesEmpty 'لسه مفيش كورسات'   results 'نتائجي'        profile 'بروفايلي'
railAllCourses 'كل الكورسات'  backToSite 'الموقع الرئيسي'  continueStudying 'نكمّل المذاكرة'
```

⚠️ `menuLabel` «القائمة» is a **visible** word beside the hamburger, not just an `aria-label` —
the docblock records that this audience has explicitly not learned the hamburger convention.
A Flutter app should keep a visible label on any equivalent control.

---

## H. Diagnostics — client error reporting

### H.1 `POST /api/errors`

`apps/api/src/modules/diagnostics/diagnostics.controller.ts`.

- `@Public()` — it **has to be**: the failures most worth knowing about include the ones a
  signed-out visitor hits.
- Deliberately **not** `@RequireCsrf()`.
- Throttle `20 / 60s` per IP.
- `@HttpCode(204)` — no body, and nothing about the response may matter to the caller.
- The session is read **best-effort** (`optionalSession.userOrNull(request).catch(() => null)`),
  so a missing or expired session never turns a report into an error.
- `user-agent` is truncated server-side to 400 chars.

Body (`ErrorReportInputSchema`, `packages/contracts/src/diagnostics.ts`):

```ts
{
  kind: 'server' | 'client' | 'timeout',
  route: string,        // 1..512, MUST start with '/' — a pathname, NEVER a full URL
  message: string,      // 1..1000
  digest?: string,      // ≤200
  stack?: string,       // ≤4000
}
```

⚠️ `route` refuses anything that is not a pathname *specifically* so a query string carrying a
password-reset token or an `?assistant=1` deep link can never be written into the log. The
authorization matrix pins this (`authorization-matrix.int-spec.ts:863`): posting
`route: 'https://x.test/reset?token=secret'` → **400**.

### H.2 Which `kind` to send

`apps/web/lib/report-error.ts`:

```ts
const kind =
  error.digest === UPSTREAM_TIMEOUT_DIGEST ? 'timeout'
  : error.digest                            ? 'server'
  :                                           'client';
```

`UPSTREAM_TIMEOUT_DIGEST = 'AYMAN_UPSTREAM_TIMEOUT'` (`apps/web/lib/api.ts:79`), stamped when a
server-side API call exceeds `SERVER_TIMEOUT_MS = 15_000` (`lib/api.ts:102`).

**Flutter mapping:**

| Situation | `kind` | `digest` |
|---|---|---|
| API call timed out / unreachable | `timeout` | send `AYMAN_UPSTREAM_TIMEOUT` so it groups with the web's timeouts |
| API returned 5xx | `server` | omit, or a stable per-call id |
| Dart exception in widget build / state | `client` | omit |

`route` should be the app's own logical route (`/courses/:slug`, `/quiz/attempt`) — anything
starting with `/` is accepted, and grouping is per-route, so use the **route pattern**, not the
instantiated path with ids, or every student produces a distinct row.

### H.3 Transport rules

From `useErrorReport`'s docblock — reproduce all four:

1. **Nothing may throw and nothing may be awaited.** The caller is an error boundary; the user
   is already looking at a failure and a reporter that fails visibly is the second one.
   Fire-and-forget, swallow every rejection.
2. **`keepalive: true`** so a report survives the tab (app) closing — "a student who gives up and
   closes the tab is the most valuable report there is, and the one most likely to be lost."
   Flutter: persist unsent reports and flush on next launch.
3. **Once per distinct error object**, not once per render. The web keys a `useEffect` on
   `error`; a Flutter equivalent must de-duplicate, or a rebuild loop becomes a report storm.
4. **A stale-deploy error is filed nowhere.** `isStaleDeployError(error)`
   (`apps/web/lib/stale-deploy.ts`) short-circuits before the fetch: a tab older than the deploy
   it is talking to arrives with a fresh action id each time, so it can never group and lands as
   a new row per deploy per open tab. Mobile's equivalent is a version-skew / forced-update
   error — do **not** report those here.

Also keep the local log line (`console.error('[error-boundary]', error)` → `debugPrint`): "the
network call is for the instructor; the console line is for whoever is holding the device."

### H.4 Server-side grouping — why your `route` and `digest` choices matter

`apps/api/src/modules/diagnostics/diagnostics.service.ts`:

```ts
const basis = input.digest
  ? `${input.kind} ${input.route} ${input.digest}`
  : `${input.kind} ${input.route} ${input.message}`;
fingerprint = sha256(basis).hex.slice(0, 32);
```

- The **route is folded in even when a digest exists**, because the web stamps one fixed digest
  on every upstream timeout; grouping on the digest alone would collapse "the dashboard timed
  out" and "the player timed out" into one row.
- The **stack is never** part of the fingerprint — it is minified and its frame offsets shift
  between builds, so including it would make every deploy look like a new fault.
- `upsert` on the unique fingerprint: `occurrences++`, `lastSeenAt = now`, and
  **`resolvedAt = null`** — a repeat re-opens a resolved row. `firstSeenAt` is left alone.
- The most recent stack and user-agent win.

`ErrorReport` model: `id BigInt` (crosses the wire **as a string** — `BigInt` does not survive
`JSON.stringify`), `firstSeenAt`, `lastSeenAt`, `occurrences`, `fingerprint @unique`, `digest?`,
`kind`, `route`, `message`, `stack?`, `userAgent?`, `userId?`, `resolvedAt?`.

Admin side (`apps/api/src/modules/diagnostics/admin-errors.controller.ts`):

```
GET   /api/admin/errors                  diagnostics:read     → ErrorReportList
PATCH /api/admin/errors/:id/resolve      diagnostics:resolve
PATCH /api/admin/errors/:id/reopen       diagnostics:resolve
```

`ErrorReportList = { rows: ErrorReportRow[], total, summary: { open, last24h } }`;
filters `ERROR_REPORT_FILTERS = ['open','resolved','all']`, default `'open'`.
`summary.open` = distinct unresolved failures; `summary.last24h` = occurrences across unresolved
failures in the last 24 h. Both computed server-side because the list is paginated.

### H.5 The blank-page probe (web-only, do not port)

`apps/web/components/site/blank-page-probe.tsx` files a report when the document is laid out,
full of text and painting none of it. **The cause was found** — `splash-cursor.tsx` destroyed its
own WebGL context in cleanup after removing the handler that would have caught the loss, and a
lost context composites opaque over the page. Fixed at source; the probe is vestigial and has no
Flutter equivalent.

There is also `POST /api/security/csp-report` (`security/csp-report.controller.ts`) — browser
CSP violation reports, irrelevant to mobile.

---

## I. Consolidated mobile gap list

Backend or product work that must happen before a Flutter client can do this area properly:

1. **Private media has no documented mobile read path.** `hw/`, `msg/`, `payment-proof/`,
   `book-order-proof/`, `doc/` keys are structurally unreachable through
   `GET /media/:prefix/:name`. Each owning module serves them behind its own auth; the app needs
   an authenticated image loader per prefix (and, for `Image.network`, a way to attach the
   session cookie). Confirm each route with the owning spec before building.
2. **`GET /api/news` is unpaginated** — it returns every published article with `readingMinutes`
   computed from a `body` the server selected but does not send. Fine at today's volume;
   add `page`/`perPage` before the section grows, or the app downloads the whole index each launch.
3. **The markdown subset must be hand-ported.** No off-the-shelf Flutter markdown renderer
   matches it (no tables/images/HTML/h1/nesting/italics; `https:`-and-`mailto:`-only links;
   `**` and `` ` `` cannot nest; unterminated fences run to EOF). Shipping a permissive renderer
   silently changes what authors can publish.
4. **Code blocks must be forced LTR** inside the RTL layout, or copied code will not run.
5. **No public "site content" endpoint fits a mobile home screen.** `/api/home-blocks` describes
   web DOM sections (`hero` with GSAP, `yearTracks` with a WebGL dragon). Either add a
   mobile-shaped block type set, or hardcode the mobile home.
6. **`/api/flags` and `/api/navigation` are dead on the web today.** Nothing reads them. Before
   the app gates any feature on a flag, confirm which of the seven declarations are actually
   maintained — otherwise the app will honour a value the web ignores and the two surfaces will
   disagree.
7. **`contact.vodafoneCash` is a dead field that cannot be deleted**, and `contact.instapay` is
   the live one with **no fallback between them**. The app must read `instapay` and show the
   "payment number not set up" state when it is null — never fall back.
8. **The privacy policy is out of date about payments.** `copy.legal.neverBody` still says
   «المنصة مجانية ومفيش أي مدفوعات فيها أصلاً» while InstaPay/Vodafone Cash flows exist. This must
   be corrected before an app store review reads it, and it must be corrected in `ar.ts` (one
   copy), not restated in Dart.
9. **The privacy policy enumerates the sign-up fields.** If the mobile onboarding collects
   anything the web does not (device id, push token, contacts, photos permission), the policy
   text has to change in the same commit — its own docblocks say so.
10. **Push notifications need a policy + settings home.** `PushSubscription` exists (Web Push)
    and `packages/contracts/src/notifications/push.ts` exists, but there is no FCM/APNs
    registration endpoint and no per-kind mobile notification preference. `OutreachSettings`
    governs WhatsApp, not push.
11. **`POST /api/profile/whatsapp-opened` must be wired on mobile**, or students who joined the
    channel keep getting invited up to `maxInvitesPerStudent` times.
12. **Phone changes have no self-service path on any client.** `completeOnboarding` 400s
    (`phone cannot be changed here`) once onboarding is done; there is no OTP
    (`sendOTP` throws `OTP_NOT_CONFIGURED`). The app must show
    `copy.section.phoneLocked` and route the user to WhatsApp support — do not build an edit
    field. If mobile wants self-service, the backend needs an OTP flow first.
13. **`PATCH /api/profile/onboarding` is a full upsert.** The app must send every field on every
    save or it will blank columns. If mobile wants a partial profile edit, the backend needs a
    genuine partial PATCH — and note the existing precedent that `.partial()` on a schema with
    `.default()`s re-injects the defaults.
14. **Image compression must be reimplemented in Dart**, matching §E.5 exactly: 1600px long
    edge, JPEG q0.82, EXIF baked in, white background fill, decline-if-larger, `.jpg` rename,
    compress **before** the size check, and every failure returns the original file.
15. **Upload progress is required**, and `413`/network must be distinguished (§E.6) — a silent
    upload is the exact complaint the whole upload rework was written to fix.
16. **Taxonomy labels and ids must be resolved at runtime.** `Track.id` and `SubjectOffering.id`
    are per-environment uuid7s; only slugs (`bacalorya`, `engineering_cs`, `programming_cs`) are
    stable. Hardcoding a uuid works locally and breaks in production.
17. **Year labels come from `AcademicYear.labelAr`, per system.** A hardcoded
    `1|2|3 → Arabic ordinal` map is the bug `/profile` already shipped once
    («الصف الثاني الثانوي» vs «الصف الثاني بكالوريا»).
18. **Arabic pluralisation must be ported** (`courseCountLabel`, §A.4): four forms, and 1 and 2
    carry **no numeral**.
19. **Legal pages must be reachable in-app**, and `?from=onboarding`'s "way back" behaviour
    reproduced with a navigation stack rather than a query param.
20. **`route` sent to `/api/errors` must be a route *pattern*.** Sending instantiated paths with
    ids will fragment the fingerprint and make `/admin/errors` unreadable.
21. **`/api/home-blocks`, `/api/flags`, `/api/navigation` sit on the default 10/1s throttle.**
    A mobile client that fetches them per screen will 429. Cache them at launch.
22. **The catalog does not filter by year** — `year` is a label, not a gate. A "my year" mobile
    screen has to filter client-side, exactly as `/years/[year]` does.
