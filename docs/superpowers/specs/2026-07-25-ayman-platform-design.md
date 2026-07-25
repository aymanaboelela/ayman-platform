# منصة م. أيمن أبو العيلة — Design Spec

**Version 1.0 · 2026-07-25 · Approved by the founder**

Companion research brief: `docs/research/2026-07-25-research-brief.md` (10-agent sweep, 427 tool calls,
benchmarked against the production bundle of منصة بسطتهالك plus Moodle/Canvas/Open edX source).

---

## 1. What we are building

A single-instructor Arabic learning platform for Egyptian secondary students studying
**البرمجة وعلوم الحاسب** under the new **البكالوريا المصرية** system.

Students sign up, complete a short onboarding (governorate + system + year + track), browse
courses, watch YouTube-hosted lessons, take auto-graded quizzes, and review their answers.
An admin dashboard controls **every** piece of the site — content, taxonomy, navigation,
homepage composition, branding, and feature flags.

### Founder decisions (locked)

| Decision | Value | Consequence |
|---|---|---|
| Access model | **Free for everyone, now** | No wallet, no codes, no checkout. But entitlement is still a **grant object**, never a boolean — see §6.6. |
| Scope | **One instructor, one subject** (البرمجة وعلوم الحاسب) | Roles are `admin` / `student` only. Question-bank scope is `global`. No tenancy, no `instructor` role. |
| Language | **Arabic only in v1**, i18n-ready | No `[locale]` segment, no `next-intl`, no hreflang. But **zero user-facing strings in components** — all copy lives in `packages/contracts/copy/ar.ts`. Adding English later is a routing change, not a rewrite. |
| Content protection | **None enforced** | Videos are public YouTube links; DRM would be theater. Telemetry and the session table still ship — enforcement stays behind flags. |
| Mobile app | **Undecided → hedge** | Better Auth `jwt` plugin enabled from day one (JWKS + `/token`). Two lines of config now vs an auth-layer rewrite later. |

### Non-goals for v1

Payments · access codes · wallet · parent dashboard · SMS OTP · essay auto-grading ·
multi-teacher · English UI · ثانوية عامة content · native apps · certificates.

Every one of these is either schema-reserved (§6) or a clean additive change. None requires a migration
of existing rows.

---

## 2. Corrections to the original brief

Three assumptions in the original request are factually wrong and are corrected here.

1. **"منصة بسط" does not exist under that name.** The platform benchmarked is **بسطتهالك
   (bassthalk.com)**. `basata.online` is an unrelated English holding page. Confusable neighbours:
   بسطنهالك (basstnhalk.com), بسطها (basatha.com), بسّط (bassat.online).

2. **"بكالوريا أولى / تانية" is not ministry terminology.** Both systems use
   `الصف الأول الثانوي` / `الصف الثاني الثانوي` / `الصف الثالث الثانوي`. We render the official
   name plus a system-dependent badge (`مرحلة تمهيدية` / `سنة شهادة`). Labels are admin-editable,
   and `tracks.aliases text[]` absorbs press variance for search.

3. **البكالوريا is parallel to الثانوية العامة, not a replacement.** First البكالوريا exams: June 2027.
   Therefore **no grade-3 البكالوريا students exist until 2027/2028**, and grade 2 alone carries
   **~67%** of the final mark (400 of 600). Launch content priority is **grade 2 first, then grade 1**.

---

## 3. Architecture

### 3.1 Topology — single origin (a security decision)

```
                     ┌──────────────────────────────┐
   browser ────────► │  reverse proxy (dev: Next     │
                     │  rewrites; prod: Caddy)       │
                     └───────┬───────────────┬──────┘
                             │ /             │ /api
                     ┌───────▼──────┐ ┌──────▼────────┐
                     │ apps/web     │ │ apps/api      │
                     │ Next.js 16   │ │ NestJS 11     │
                     └──────────────┘ └──────┬────────┘
                                             │
                                  ┌──────────▼──────────┐
                                  │ PostgreSQL 16 (app) │
                                  │ Redis 7 (throttle,  │
                                  │  cacheHandler)      │
                                  └─────────────────────┘
```

Serving both from one origin is what makes `__Host-` cookie prefixes, `SameSite=Strict`, and
**zero CORS configuration** possible simultaneously. Split origins would force `__Secure-`,
`SameSite=Lax`, and a credentialed CORS allowlist. **This must be settled before any auth code
is written**, which is why it is stated first.

### 3.2 Monorepo layout

```
apps/web              Next.js 16 — public site, student area, admin dashboard
apps/api              NestJS 11 — the only writer to Postgres
packages/contracts    Zod 4 schemas + generated API client + Arabic copy
packages/ui           design tokens + shadcn primitives
packages/config       eslint / tsconfig / tailwind presets
```

`packages/contracts` is the load-bearing boundary. The quiz question model is a
`z.discriminatedUnion('type', …)` shared verbatim between the admin's react-hook-form and the API's
validation pipe. One schema, two consumers, no drift.

### 3.3 Stack

| Layer | Choice | Version | Note |
|---|---|---|---|
| Runtime | Node.js | 24 LTS | local is 25.9 — pin 24 via `.nvmrc` |
| Package manager | pnpm workspaces + catalogs | 11.17.0 | |
| Orchestrator | Turborepo | 2.10.0 | |
| Language | TypeScript | 5.9.x | **Deviation from research:** it recommended TS 7.0.2, but NestJS's `emitDecoratorMetadata` + Prisma 7 codegen on a go-native compiler is unproven risk on day one. Revisit after v1 ships. |
| DB | PostgreSQL | 16.14 (local) | research said 17; 16 is what's installed and nothing here needs 17 |
| Cache | Redis | 7.x | required for throttler correctness, not optional |
| Backend | NestJS | 11.1.28 | modular monolith, SWC builds, **no CQRS** |
| ORM | Prisma | 7.9.0 + `@prisma/adapter-pg` | ⚠️ must set `moduleFormat="cjs"` and output **inside** `src/` |
| Auth | Better Auth | 1.6.25 + `@thallesp/nestjs-better-auth` | ⚠️ bootstrap Nest with `bodyParser: false`; vendor-pin the community adapter |
| Validation | `nestjs-zod` + Zod | 5.5.0 / 4.4.3 | **never** mixed with class-validator |
| Frontend | Next.js / React | 16.2.11 / 19.2.8 | `cacheComponents: true` from day one |
| Edge logic | `proxy.ts` | — | `middleware.ts` is deprecated in 16 |
| Styling | Tailwind CSS | 4.3.3 | logical utilities only |
| Animation | `motion` | 12.42.2 | `<LazyMotion strict>` → ~20kB not 34kB |
| Tables | TanStack Table | **8.21.3** | ⚠️ not v9 (beta); ⚠️ Context7 serves v9 docs by default |
| Forms | react-hook-form | **7.83.0** | ⚠️ not v8 (beta) |
| DnD | `@dnd-kit/core` + `/sortable` | 6.3.1 / 10.0.0 | ⚠️ not `@dnd-kit/react` (pre-1.0) |
| Hashing | `argon2` | — | Argon2id **m=19456, t=2, p=1** |

**Explicitly rejected:** `framer-motion`, NextAuth v4/v5, Drizzle (still RC after 14 months),
TypeORM, TanStack Table v9, RHF v8, `@dnd-kit/react`, `nprogress`, class-validator, Nx,
repo-wide CQRS, `FAQPage` JSON-LD (Google removed it 2026-06-15).

---

## 4. Design system

**One-line brief: an engineering instrument, rendered in Arabic.** Dark-first, hairline-precise,
monospace-inflected, near-monochrome with a single amber signal. No gradients. No glass. No purple.

### 4.1 Typography

**IBM Plex Sans Arabic + IBM Plex Mono**, self-hosted, variable, OFL-1.1.

These two faces are **metrically identical** — x-height 516, cap-height 698 at 1000upm, measured from
the OS/2 tables. Mixed runs like `استخدم const بدلاً من var` sit on one optical baseline with no
`size-adjust` hack. Every alternative pairing needs a correction factor (Cairo+Geist Mono: 106.0%;
Tajawal+JetBrains: 121.1%). Rejected: Noto Kufi Arabic (asc+desc = 2157/1000upm — blows out every
button), Tajawal (no U+06F0–06F9 coverage).

`@font-face` blocks are scoped by `unicode-range` so a Latin-only run never downloads the Arabic file.

**Three non-negotiable Arabic rules** — each is a silent ship-blocker and the clearest tell of a site
built by someone who does not read the script:

1. **No negative `letter-spacing` on Arabic, ever.** Arabic is a connected script; tracking breaks the
   joins. Enforced globally: `[lang="ar"], [lang="ar"] * { letter-spacing: 0 !important }`, with
   tracking re-enabled only on `.latin, code, kbd, .mono`.
2. **No `line-height: normal`.** The faces produce different line boxes (Plex Arabic asc 1085/desc −415
   vs Plex Mono 1025/−275). Explicit unitless line-heights only; **Arabic body = Latin body + 0.15**.
3. **Never uppercase an Arabic label.** Arabic has no case. Latin eyebrows get
   `uppercase; letter-spacing: .06em`; Arabic eyebrows get `font-weight: 590` and a leading `//` or
   a mono numeral instead.

**Digits: Western (0123) everywhere**, including chrome — this is a programming platform; timers,
scores, marks-out-of-600 and code samples all need them, and mixing systems on one page is worse than
either choice. `font-variant-numeric: tabular-nums` on every table, timer and score.

**Type scale is dual-track** (separate display and text ramps — collapsing them into one geometric
scale is a template tell). Base **15px**, not 16 — denser, more tool-like. Weights **400/510/590/680**,
not 400/500/600/700: individually imperceptible, collectively it reads as custom-cut.

### 4.2 Color

**Radix 12-step semantics expressed in OKLCH, dark-first.** The step number *is* the contract
(1 app bg → 12 high-contrast text), identical variable names across themes, so a theme swap is a class
change with zero remapping.

**Accent: terminal amber** — `--a-9: oklch(0.770 0.152 72)`. The reasoning is structural, not
aesthetic: **green and red are load-bearing for quiz correctness**, so neither can be the brand;
indigo/purple is the AI default and is disqualified. Amber reads as terminal phosphor and collides
with nothing in the product.

Dark base is `#08090A` — near-black with a 2-point blue lean, **not** `#000` (prevents OLED smear).
Depth comes from a **surface ladder plus alpha hairlines**, never shadows: `--shadow-*` resolves to
`0 0 0 transparent` in dark mode. Borders are always alpha (`#FFFFFF12`), never solid — a solid
`#eaeaea` looks wrong on any tinted background.

Semantic colors are semantic-only, never decorative: `--ok` (إجابة صحيحة), `--err` (إجابة خاطئة),
`--warn` (وقت شبه منتهي), `--info`.

### 4.3 Space, radius, layout

Spacing named by pixel value: `2, 4, 8, 12, 16, 20, 24, 32, 48, 64, 80`.

Radius deliberately small — sharp corners read as precision. **Nothing above 8px on a card.**
`--r-full` is for pills only (status chips, avatars).

**Two max-widths, always:** `--w-shell: 1152px` and `--w-prose: 640px`. Text columns are never
full-bleed. A single symmetric max-width for everything is an AI-slop tell.

**RTL is native, not mirrored.** Logical properties exclusively (`margin-inline-start`,
`inset-inline-start`, `border-inline-end`), with an ESLint rule hard-failing `ml-*`, `mr-*`,
`left-*`, `right-*`. Almost no template does genuine RTL-native layout — this is free differentiation.

### 4.4 Motion

Curves from GitHub Primer, durations measured from Linear/Vercel/Stripe.
`--ease-out` is the default for anything entering or exiting; `--ease-in-out` for move/resize;
`--ease-pop` (overshoot 1.1) for popovers.

Rules: **exits are faster than entrances** (120ms vs 200–300ms) · cap everything at 400ms ·
**never `ease-in` on an exit** · animate **only `transform` and `opacity`** (animating
`width/height/top/left/filter` forces layout+paint every frame — worth 30–60ms of INP) ·
`<MotionConfig reducedMotion="user">` on day one, which kills transforms while preserving opacity
fades, plus a global CSS backstop.

### 4.5 The "programming atmosphere" — ordered by cost

1. **Mono as the brand carrier (0kB).** Plex Mono for eyebrows, section numbering (`01 / المحاضرات`),
   durations, mark counts, table headers, `<kbd>`, breadcrumbs. *This* — not code blocks — is what
   produces terminal culture without gimmicks.
2. **Hairline dot-grid backdrop (0kB).** Two offset `radial-gradient` layers at ~2% alpha on a 24px
   grid, with a `mask-image` spotlight tracking the cursor via two CSS custom properties updated on
   `pointermove`. Fixed, `pointer-events: none`, behind everything.
3. **Inline code ≠ code block.** Different radius, size, and border treatment for each.
4. **0.5px hairlines on retina.** One media query; the highest "someone cared" signal available.
5. **Custom `::selection`** via `color-mix(in oklch, var(--a-9), transparent 72%)`.
6. **Tokenized focus ring** — 2px, 2px offset, `--a-9`, with `:focus:not(:focus-visible){outline:none}`.
7. **Terminal-chrome panels** for "how it works" and empty states. Never for lesson content.
8. **Shiki server-highlighted code with an animated `clip-path` reveal (~9kB client).** Shiki runs in
   an async Server Component → zero client JS for the highlighter and real code text in the SSR HTML
   for crawlers. A tiny client component sweeps a `clip-path` over the already-highlighted markup.
   **Never per-character `setState`** — that is one render + reconcile every ~40ms and a documented
   INP killer. `min-height` fixed so the reveal never grows the container.
9. **One WebGL moment (~30–75kB)** — a single shader plane in a fixed layer behind the hero,
   `pointer-events: none`, frozen under reduced motion. Not react-three-fiber.
10. **One 3D object (~200kB), below the fold, desktop-only, postered.** The conversion data is
    unambiguous: LCP <1s → 4.4% conversion, 4s+ → **1.7%**. So: never in the hero. Gated on
    `useReducedMotion()` **and** `matchMedia('(min-width:1024px)')` so mobile never downloads the
    three.js chunk. Static WebP poster reserves the exact box (CLS = 0). Deep-import drei — the barrel
    is 484kB gzip.

### 4.6 Loading and skeletons

Skeletons help **only** between 400ms and 3s of real load. Below 200ms they flash; above 3s they read
as broken. Users perceive them as 9–12% faster than spinners at identical load times.

- Skeleton geometry derives from the **same layout primitives** as the real component, so the swap is
  invisible.
- **Vary text-bar widths (100% / 85% / 60%)** — uniform bars are the single biggest "cheap" tell.
- Shimmer via `transform: translateX()` on a gradient overlay over 1.8s. **Never
  `background-position`** (repaints the whole element).
- `animation-delay: 180ms` so fast loads never flash.
- `loading.tsx` must be a **Server Component** so the skeleton is in the SSR'd HTML.
- ⚠️ `loading.tsx` wraps `page.js`, `not-found.js` and *nested* layouts — but **not** the
  same-segment `layout.js`. A `cookies()` call in that layout is the #1 reason a `loading.tsx`
  appears not to work.
- Route progress: `@bprogress/next` (6.5kB). `nprogress` is unmaintained since 2015.

### 4.7 Hard ban list — the "AI-built website" cluster

None of these ships: purple/indigo gradients · emoji as icons · glassmorphism
(`backdrop-blur` is reserved for exactly one element, the sticky header) · the three-up feature-card
grid · radius > 8px on cards · scroll-triggered fade-in on every section (**one** orchestrated moment
per page, maximum) · colored left-border stripes · centered hero + vague headline + two CTAs · Inter
as the only typeface · one symmetric max-width · mirrored-LTR with physical margins ·
**`opacity: 0` entrance animations on above-the-fold LCP content** (Motion SSRs `opacity: 0` into the
HTML — crawlable but invisible until hydration, which directly tanks LCP; the hero animates `y`/`scale`
only) · uppercased Arabic labels · negative tracking on Arabic · shadows in dark mode.

---

## 5. Product surfaces

### 5.1 Public site
Home (admin-composed blocks) · course catalog · course detail · free-preview lesson · about ·
contact · auth pages. Fully SSR'd, `'use cache'`-tagged, JSON-LD (`Organization`, `ItemList` +
`Course`, `VideoObject`, `BreadcrumbList`), `sitemap.ts`, `robots.ts`.

> `FAQPage` JSON-LD is deliberately omitted — Google removed the documentation on 2026-06-15 and it
> produces zero rich results. The `Course` "course info" rich result was deprecated Sept 2025; the
> supported shape is `ItemList` with ≥3 `Course` items on catalog pages.

### 5.2 Onboarding — 9 fields, one screen, three steps

```
Step 1 · من إنت        full_name · gender · phone (required, unique, E.164)
Step 2 · مكانك         governorate (27 options) · school_name (optional)
Step 3 · دراستك        system · year · track* · elective_subject*
Optional, re-prompted at day 7:   father_phone · mother_phone
```

**Conditional logic, non-negotiable:**
- `track` is **hidden and null when `year = 1`** — grade 1 is common and non-specialized across both
  systems. Enforced in the DB: `CHECK (year IS NULL OR year <> 1 OR track_id IS NULL)`.
- `system = بكالوريا` → the **four** مسارات. `system = ثانوية عامة` → the three شعب.
- `elective_subject` appears only when `system = بكالوريا AND year = 2`, and its two options depend on
  `track`.
- `system` and `track` are **nullable** — a grade-1 student legitimately has not chosen yet.
  Re-prompt at promotion.

Parent phones are collected even though the parent dashboard is v1.1: they are the highest-ROI field
on the form and unlock the strongest retention lever in this market later.

### 5.3 Student area
Dashboard (continue-watching, progress, recent scores) · course player (video + attachments +
notes) · quiz runner · results & review · profile · **أجهزتي** (session list with self-service revoke).

### 5.4 Admin dashboard
Content (courses → sections → lessons, drag-reorder) · quiz builder · question bank ·
students · attempts & grade appeals · taxonomy editor (systems/years/tracks/subjects/governorates) ·
homepage block composer · navigation builder · branding · feature flags · media library · audit log.

Patterns: TanStack Table v8 in `manualPagination/Sorting/Filtering` mode with `getRowId` set
(without it, selection is index-based and bulk actions silently break on page 2) · `nuqs` for URL
state so filtered views are shareable · `cmdk` palette that renders each entry's shortcut so it
doubles as shortcut training · `sonner` toasts with undo on reversible destructive actions ·
shadcn `Field` primitives (which supersede the legacy `Form`/`FormField` wrapper and accept raw
Standard Schema issues, so one Zod schema drives client *and* server validation with zero adapter
code).

**Reordering 40 lessons is one debounced write of the full ordered id array, not 40 writes.**

---

## 6. Data model

Postgres, schema `app` (not `public`). UUIDv7 primary keys — index-friendly and non-enumerable, but
**never** the access control.

### 6.1 Taxonomy
`governorates` (27 rows, seeded in official national-ID code order — **not alphabetical**;
القاهرة/الجيزة/الإسكندرية pinned to the top of the dropdown) · `education_systems`
(bacalorya 600/70%, thanaweya_amma 320/50%) · `academic_years` · `tracks` (+ `aliases text[]`) ·
`track_faculties` (powers an "اختار كليتك، نقولك مسارك" reverse funnel) · `subjects` ·
`subject_offerings` · `elective_groups`.

`subject_offerings` is load-bearing: **الرياضيات appears in three different roles** (grade-1 core,
grade-2 elective for medicine, grade-3 subject for engineering *and* business), so a subject is only
meaningful scoped by `(system, year, track)`. A global `subjects.is_counted` flag would be wrong.

### 6.2 Identity
Better Auth owns `user`, `session`, `account`, `verification`. We own `student_profiles`
(phone `citext UNIQUE NOT NULL`, governorate, school, parent phones, system/year/track/elective — all
nullable where §5.2 says so).

### 6.3 Content
```
courses → course_sections → lessons(kind ∈ video|quiz|attachment|text)
                              ├── lesson_videos    1:1
                              ├── lesson_attachments 1:N
                              ├── lesson_texts     1:1
                              └── quizzes          1:1
```
"شهر" / "الترم" / "الباقة" are **pricing** concepts, never content levels. Ordering is `position int`
with an id tie-break — never a CSV `sequence` column (Moodle's known wart), never index-based keys.

Reserved on `lessons` even though v1 does not enforce them, because retrofitting is brutal:
`visible_from`, `visible_to`, `unlocks_after_lesson_id`, `view_limit`, `content_group_id`.

`lesson_videos.provider` is an enum of seven providers even though v1 is YouTube-only, and
**`external_id` stores the 11-char id, never a URL** — see §7.

### 6.4 Question bank (versioned)
`question_categories` → `question_bank_entries` → `question_versions` → `question_options`.

Scoring primitive is `{option, fraction}` — a numeric weight in 0..1 that **may be negative** — not a
boolean `is_correct`. This makes the schema **QTI-shaped by construction**: partial credit and
per-option negative marking come free, and a future QTI import/export is a serializer, not a
migration.

Question types: `mcq_single`, `mcq_multi`, `true_false`, `short_answer`, `essay`.
Essay is manually graded in v1 (keyword auto-grading is v1.1).

### 6.5 Quizzes and attempts
`quizzes` · `quiz_slots` · `quiz_pools` · `quiz_attempts` · `attempt_questions` ·
`attempt_events` (append-only) · `grade_appeals`.

**Hybrid storage rationale:** one *mutable* row per question (Canvas's query simplicity) **plus** an
append-only event log (Moodle's auditability). Moodle's pure event-log + EAV replay is the #1 source
of its quiz performance complaints; Canvas's pure blob loses history. We take both halves.

**Snapshots are non-negotiable.** `attempt_questions` stores `question_version_id` and
`option_order int[]` captured at attempt creation. Without the version snapshot, editing a question
corrupts the review of every past attempt. Without the order snapshot, resume-after-disconnect
reshuffles the paper.

**`deadline_at` is persisted at attempt start and never recomputed.** An instructor editing the time
limit must not break in-flight attempts.

**Grading algorithms, ported verbatim from Moodle:**
- MCQ single / true-false → `fraction = chosenOption.fraction`
- MCQ multi → `clamp(Σ fraction of ticked options, 0, 1)` — the clamp at 0 prevents sub-zero questions
- Short answer → first matching pattern wins; `*` → `.*`, everything else escaped, anchored,
  NFC-normalised on both sides
- Fraction → state: `< 0.000001` wrong, `> 0.999999` right, else partial (keep the float epsilon)

**Two modes.** `practice` (unlimited attempts, instant per-question feedback) and `graded` (attempt
limit, timer, gated review). Default is practice. بسطتهالك's single-attempt-no-undo trap is the
biggest support-ticket generator visible in their bundle — we ship confirm-before-submit with an
unanswered count, plus the admin unlock button **before** launch, not after.

`review_options` is a 4-window × 7-flag matrix resolved **server-side**, with disallowed fields
**stripped in the serializer**. Never send `isCorrect` and hide it in CSS.

### 6.6 Enrollment, entitlement, progress
`enrollments` · `access_grants` · `lesson_progress` · `subject_attempts`.

Even though everything is free, entitlement is an `access_grants` **object** with
`scope ∈ {platform, course, subject_teacher, unassigned}` and a validity window. Retrofitting a
boolean `has_course` into a grant object after launch is a data migration across every enrollment;
shipping the shape now costs nothing.

`subject_attempts` exists because a student can simultaneously be "studying grade 3" and "retaking a
grade-2 subject" — البكالوريا allows grade-2 subjects to be improved up to 4× across two years with
**highest score winning**. A one-row-per-subject progress schema breaks on this.

**Video completion requires both** `max_position_seconds ≥ 0.95 × duration` **and**
`watched_seconds ≥ 0.70 × duration`. Position-only is trivially defeated by dragging the scrubber.
The client posts heartbeats every 10s (`{position, delta}`) and **the server accumulates** — a
client-sent percentage is never trusted. A manual "أنهيت الدرس · التالي" button always exists too.

### 6.7 Platform configuration
`site_settings` (singleton enforced by `CHECK (id = 1)` **in the database** — Sanity's documented
failure mode is duplicate settings documents) · `feature_flags` · `navigation_items` ·
`home_blocks` · `media_assets` (stores the **key**, never a full URL) · `audit_log` (hash-chained,
INSERT-only) · `sessions_devices`.

Every settings loader is `'use cache'` + `cacheTag('settings:<key>')`. The admin save action calls
**`updateTag()`**, not `revalidateTag()`, so the editor sees their own write immediately. Per-entity
tags (`cacheTag('course', id)`) so publishing one course does not blow the whole content cache.
⚠️ `cacheTag` silently skips tags over 256 chars with only a console warning.

Branding renders as an inline `<style>:root{…}</style>` in the root layout from the tagged loader —
no FOUC, no build step. **The admin color picker is constrained to token slots; an editor can never
type raw CSS.**

---

## 7. Security

Mapped to OWASP Top 10:2025, ordered by importance. Implementation-level detail lives in the research
brief §6; this is the contract.

**P0 — settled before auth code exists**
- Single origin (§3.1) → `__Host-` prefix, `SameSite=Strict`, no CORS.
- Argon2id at **m=19456 (19 MiB), t=2, p=1**.
- Better Auth owns sessions; **NestJS guards remain the sole authorization authority**.

**P1 — authorization (A01, the #1 category)**
- Deny-by-default guard on every route. Ownership checks are compiled into the repository query
  (`WHERE id = $1 AND enrollments.user_id = $2`), never applied after the fetch.
- Permissions are `resource:action` strings (`course:publish`, `quiz:grade`), **never role equality
  checks**.
- `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` with **separate DTOs per role**.
  The realistic attack here is not privilege escalation — it is a student PATCHing
  `{completed: true}` or `{score: 100}` onto their own row.

**P2 — quiz integrity**
- Correct answers never leave the server before submission. Enforced in **three layers**: an explicit
  Prisma `select` (never `include`), a `@Exclude()` serializer, and a **contract test** that fetches a
  quiz as a learner and asserts the raw JSON contains no `fraction`, `isCorrect`, or `feedback` key.
- Server-side grading from fresh DB reads · persisted `deadline_at` · `attempt_token` required on
  every write (kills stale-tab clobber) · reject any submission where `submitted_at IS NOT NULL`
  (replay-for-a-better-score).
- **No proctoring theater.** Browser lockdown is unenforceable against a second device; the real
  answer, if stakes ever rise, is large randomized banks plus item analytics.

**P3 — injection and SSRF**
- **YouTube URLs are parsed and discarded, never fetched.** Regex-extract the 11-char id
  (`/^[A-Za-z0-9_-]{11}$/`) from the known host forms, store **only the id**, and reconstruct
  server-side as `https://www.youtube-nocookie.com/embed/{id}`. This eliminates the SSRF class rather
  than filtering it.
- Rich text: `sanitize-html` on write with a tight allowlist, forced `rel="noopener noreferrer
  nofollow"`, **all `<iframe>` denied** (embeds go through the video-id field, never through HTML),
  DOMPurify second pass at render, CSP nonce as the backstop.
- ESLint `no-restricted-syntax` hard-failing on `$queryRawUnsafe` / `$executeRawUnsafe`. Sort
  parameters map through a hardcoded object — column names cannot be parameterized.

**P4 — abuse**
- Redis-backed `@nestjs/throttler` (the default in-memory store silently multiplies limits by replica
  count). Login limited **on `email + IP` jointly** — IP-only lets one school's NAT lock itself out;
  account-only lets a botnet lock out a victim.
- ⚠️ `trust proxy` must be a hop count or proxy IP, **never `true`** — otherwise a client spoofs
  `X-Forwarded-For` and becomes un-throttleable.
- Progressive delay, not hard lockout. Run Argon2 against a **dummy hash** when the account doesn't
  exist so timing doesn't enumerate, and return an **identical** error for unknown-user /
  wrong-password / locked — a distinct "account locked" message is itself an existence oracle.

**P5 — headers**
- Nonce-based CSP **disables static optimization, ISR and PPR**, so it is applied via the `proxy.ts`
  matcher **only** to authenticated routes; the public catalog gets a hash-based CSP and stays cached.
- ⚠️ `'strict-dynamic'` makes browsers **ignore host allowlists in `script-src`** — adding a domain
  there is a no-op.
- **Ship `Content-Security-Policy-Report-Only` with a report endpoint for 1–2 weeks first.** A strict
  CSP deployed blind will break the app.
- CSRF in three layers: `SameSite=Strict` (defence-in-depth only — OWASP now discourages relying on
  it), a required `X-CSRF-Token` header enforced by a guard on all state-changing methods (forcing a
  preflight a cross-site form POST cannot satisfy), and server-side `Origin`/`Sec-Fetch-Site`
  validation.

**P6 — data layer**
- **Three Postgres roles.** `app_owner` (DDL/migrations, CI only) · `app_runtime` (DML only, **no
  DDL**, so SQLi cannot `CREATE FUNCTION`) · `app_readonly`. `DELETE` on `audit_log` is **revoked**
  from `app_runtime`. `REVOKE ALL ON SCHEMA public FROM PUBLIC`.
- Uploads: extension allowlist → magic-byte check via `file-type` (reads the buffer, not the
  `Content-Type` header) → **re-encode every image through `sharp`** (destroys polyglots, strips
  EXIF/GPS) → UUID key. Served from a different origin than the app — a same-origin HTML upload is
  same-origin XSS regardless of CSP.
- Config validated by a Zod schema **at boot**, so a missing signing key crashes at startup rather
  than signing with `undefined`. `gitleaks` as a pre-commit hook **and** a required CI check
  (pre-commit alone is bypassed with `--no-verify`).
- OAuth: always pass `algorithms: [...]` explicitly, never let the library read `alg` from the token.
  Key users on `(provider, provider_sub)`, **never on email** (mutable). **Reject auto-linking when
  `email_verified` is false** — that is a full account-takeover primitive.
- Refresh-token rotation per RFC 9700 §4.14.2 with reuse detection → revoke the whole family. Include
  a **~10s grace window** where the immediate predecessor returns the same successor, or two
  concurrent tabs race and self-revoke.
- **Fail closed.** An ORM error or failed JWKS fetch denies; it never allows.

**Apple Sign In operational note:** the `client_secret` is a **generated, expiring ES256 JWT**
(max 6 months), not a static env var — the provider must regenerate it at ~5 months. Apple returns
the user's name and email **only on the very first authorization**; persist immediately or it is gone
forever. **Apple does not support `http://localhost`**, so Apple login cannot be tested until a
staging HTTPS domain exists. Google and email/password work locally from day one.

---

## 8. Testing

- **Contract tests** on the quiz serializer (no answer leakage) — the single highest-value test here.
- Unit tests on the four grading algorithms against Moodle's own fixtures, including the float-epsilon
  boundaries and the multi-choice clamp at 0.
- Integration tests per NestJS module against a real Postgres (Testcontainers), not mocks.
- Authorization matrix tests: for each protected route × each role × owner/non-owner, assert the
  expected status. This is the test that actually catches IDOR.
- Playwright E2E on the three flows that matter: signup → onboarding → first lesson; quiz attempt →
  submit → review; admin creates a course → publishes → a student sees it.
- Visual: light and dark screenshots of the token gallery; an axe pass on every public route.

## 9. Local development

Ports: web **3200**, api **3300** (3000 is occupied by another service on this machine).
Postgres 16.14 is already running locally; Redis will be added via Homebrew.
No Docker on this machine — the stack runs natively.

Everything is local. No domain, no deployment. Domain and server config are a single environment
change when the founder provides them: `APP_URL`, `NEXT_PUBLIC_APP_URL`, `DATABASE_URL`, and the
OAuth redirect URIs. Nothing else is host-aware.

---

## 10. Build order

1. Monorepo + tooling + CI gates (lint, typecheck, gitleaks, the RTL ESLint rule)
2. Design system package: tokens, fonts, theme, primitives, and a `/dev/tokens` gallery page
3. Prisma schema + migrations + taxonomy seed (27 governorates, systems, years, tracks, subjects)
4. NestJS foundation: config validation, Prisma module, logging, throttler, error filter
5. Auth: Better Auth in Nest, email/password + Google (+ Apple wiring, untestable until HTTPS), guards,
   permissions, session/device table
6. Onboarding flow (API + UI) with the conditional taxonomy logic
7. Content CRUD + admin course/section/lesson management with drag-reorder
8. Public catalog + course detail + SEO/JSON-LD
9. Course player + progress heartbeats + completion rules
10. Question bank + quiz builder (the largest single piece)
11. Quiz runner + server-side grading + review
12. Admin: students, attempts, grade appeals, analytics
13. Site settings, feature flags, navigation, homepage blocks, branding
14. Motion, the WebGL moment, the one 3D object, skeleton pass
15. Security hardening pass: CSP report-only, Postgres roles, audit log, the authorization matrix tests
