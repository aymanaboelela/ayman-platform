# Plan 3 — Content & Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The founder can author a course — sections, lessons, YouTube videos, rich text, attachments — reorder 40 lessons with one drag and one write, publish it, and have a student find it through an SSR'd, cached, structured-data-annotated public catalog.

**Architecture:** Prisma models for the content tree live in schema `app` alongside the taxonomy. NestJS owns every write and is the only process that talks to Postgres; `apps/web` reaches it through the same-origin `/api` rewrite. Admin mutations run as Next Server Actions that call the API and then invalidate the exact cache tag they touched. The public catalog is `'use cache'` + per-entity `cacheTag`, so publishing one course does not blow the whole content cache.

**Tech Stack:** `@dnd-kit/core@6.3.1` · `@dnd-kit/sortable@10.0.0` · `@dnd-kit/utilities@3.2.2` · `@dnd-kit/modifiers@9.0.0` · `sanitize-html@2.17.6` (+ `@types/sanitize-html@2.16.1`) · `isomorphic-dompurify@3.19.0` · Next.js 16.2.11 `use cache` / `cacheTag` / `updateTag` · Prisma 7.9.0 · Zod 4.4.3 · react-hook-form 7.83.0

**Spec:** `docs/superpowers/specs/2026-07-25-ayman-platform-design.md` §5.4, §6.3, §6.6, §7-P3
**Research brief:** `docs/research/2026-07-25-research-brief.md` §5.3, §5.6, §6-P3
**Prerequisites:** Plan 1 (foundation) and Plan 2 (auth & onboarding) complete. All versions above verified against the npm registry on 2026-07-26.

---

## Reconciliation notes (cross-plan pass, 2026-07-26)

This plan was reconciled against Plans 4–7. The shared ownership register lives in
`docs/superpowers/plans/README.md` and is normative — where this document and the register
disagree, the register wins. Decisions that changed **this** plan:

1. **Plan 3 owns `Enrollment`, `AccessGrant` and their enums.** Plan 4 Task 2 no longer declares
   them; it only adds `LessonProgress` and back-relations. The models in Task 4 below carry the
   merged field set both plans need (`source`, `progressPercent`, `lastLessonId`, `expiresAt`,
   `completedAt`), so Plan 4 never has to `ALTER TABLE` them.
2. **Admin routes live under the `(admin)` route group** — `apps/web/app/(admin)/admin/**`, never
   a bare `apps/web/app/admin/**`. Plans 5 and 6 both render into `(admin)`; two sibling trees would be a
   Next.js route conflict. **Plan 3 creates `apps/web/app/(admin)/layout.tsx`** (permission gate +
   RTL shell + `sonner` `<Toaster dir="rtl">`); Plan 6 Task 8 replaces its body with the full
   sidebar shell without moving the file.
3. **The cache-tag builder is `apps/web/lib/cache-tags.ts`, created here** — the draft's
   `apps/web/lib/tags.ts` is renamed so Plan 6 extends one file instead of forking a second.
   `tag(...parts)` throws above 256 characters instead of letting Next silently skip the tag.
   `TAG_COURSES` / `courseTag()` remain, implemented **through** `tag()`. Plan 6 Task 4 extends the
   same file with `tags.settings/nav/flags/home` and `assertTagBudget()`.
4. **Task 10 owns the whole `@ayman/ui` form primitive set** — `Input`, `Textarea`, `Select`
   (native), `Label`, the `Field` family (+ `issuesForPath`), `Checkbox`, `RadioGroup`, `Dialog` —
   because Plan 5 Task 16 needs them and Plan 5 runs before Plan 6. Plan 6 Task 7 adds only
   `Switch`, `DropdownMenu`, `Table` and `Kbd` on top.
5. **Task 12 produces the generic `SortableList`** at
   `apps/web/components/admin/sortable-list.tsx`; `sortable-lesson-list.tsx` becomes its first
   consumer. Plan 5 Task 16 (quiz slots) and Plan 6 Task 15 (navigation, home blocks) reuse it.
6. **Task 10 owns the first DOM test harness** for `apps/web` and `packages/ui`
   (`vitest.config.ts` + `jsdom@27.0.0` + `@testing-library/react@16.3.0` +
   `@testing-library/jest-dom@6.9.1` in both packages). Later plans add specs, never a second config.
7. **`apps/api/src/auth/permissions.ts` is owned by Plan 2.** Every later plan **appends** to
   `PERMISSIONS` and to the student set — nobody replaces the file. Plan 2 must export
   `PERMISSIONS`, `type Permission`, `ROLE_PERMISSIONS`, `permissionsForRole()` and
   `roleHasPermission()`. This plan's additions are `course:create`, `course:update`,
   `course:publish`, `course:delete`, `section:write`, `section:reorder`, `lesson:write`,
   `lesson:reorder` (admin-only via `'*'`) and `enrollment:read`, `enrollment:create` (student).
8. **CSRF is one convention:** header `x-csrf-token`, double-submit value read from the
   `__Host-csrf` cookie. Plan 4 must use the same cookie name (its draft said `csrf_token`).
   Plan 2's guard must accept `Sec-Fetch-Site ∈ {same-origin, none}` **and absent**, because
   `apiSend` is called from a Next Server Action, which is a server-to-server request that carries
   neither `Origin` nor `Sec-Fetch-Site`.
9. **Plan 3 owns the enrollment API**: `POST /api/courses/:courseId/enroll` (`enrollment:create`)
   and `GET /api/enrollments` (`enrollment:read`), both in `EntitlementModule`. Plan 4 enriches the
   `GET` response with progress fields; it does not add a second enroll route.
10. **Public catalog pages live in the `(site)` route group** — `app/(site)/courses/**`. Plan 4's
    player lives in `(app)` at `app/(app)/courses/[slug]/lessons/[lessonId]/page.tsx`. The two
    groups never resolve to the same path.
11. **Auditing is retrofitted by Plan 6 Task 3.** This plan does not call `AuditService`; Plan 6
    owns `AUDIT_ACTIONS` in full (including `course:publish`, `course:unpublish`, `lesson:update`)
    and wires the calls into the services created here.
12. **Copy namespaces owned here:** `copy.catalog`, `copy.course`, and the `copy.admin` sub-keys
    `admin.common`, `admin.nav`, `admin.course`, `admin.section`, `admin.lesson`, `admin.reorder`.
    `copy.admin` is a **shared** namespace — Plan 6 appends `admin.title`, `admin.list`,
    `admin.actions`, `admin.shortcuts`, `admin.students`, `admin.taxonomy`, `admin.settings`,
    `admin.branding`, `admin.flags`, `admin.navigation`, `admin.home`, `admin.media`,
    `admin.audit`, and appends further entries to `admin.nav` and `admin.common`. Plan 5's
    quiz-admin strings live under `copy.quizAdmin.*`, outside `copy.admin` entirely.
    Plan 7's E2E specs read `copy.admin.course.{new,title,statusPublished}` and
    `copy.admin.common.{save,publish}` — **`admin.common.publish` must exist**, so add it here.
13. **Version pins.** `sonner@2.0.7` is installed by this plan (Task 11 Step 3), and
    `@dnd-kit/core@6.3.1` + `@dnd-kit/sortable@10.0.0` + `@dnd-kit/utilities@3.2.2` +
    `@dnd-kit/modifiers@9.0.0` by Task 12. Plans 5 and 6 list the same versions in their tech
    stacks and must not re-install or bump them.

---

## Global Constraints

> **Canonical set.** These nine are identical in Plans 3–7 and are restated in
> `docs/superpowers/plans/README.md` § Global Constraints, which is normative: single origin / no
> CORS · ports 3200 web + 3300 api · RTL logical utilities only · no user-facing literals outside
> `packages/contracts` · extensionless relative imports · `@@schema("app")` on every Prisma model ·
> deny-by-default guards with `resource:action` permissions · no gradients / glass / emoji, radius
> ≤ 8px, no dark-mode shadows · **green and red reserved for quiz correctness**. Never
> `$queryRawUnsafe` / `$executeRawUnsafe` — the ESLint `no-restricted-syntax` rule hard-fails both.

Every task's requirements implicitly include this section. Constraints 1–11 are inherited and still binding; 12–20 are new to this plan.

1. **Single origin.** `apps/web` serves `/`, `apps/api` serves `/api`. **Never configure CORS.** Never hardcode `http://localhost:3300` outside `next.config.ts` and `apps/web/lib/api.ts`.
2. **Ports:** web `3200`, api `3300`. Port 3000 is occupied by an unrelated service on this machine.
3. **RTL is native, not mirrored.** Logical Tailwind utilities only — `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`, `text-end`, `border-s-*`, `border-e-*`. The `ayman/no-physical-direction` rule sees through `cn()`/`clsx()`, template literals, ternaries, arrays, object keys **and module-level class constants**, so there is no place to hide an `ml-4`.
4. **No user-facing string literals outside `packages/contracts`.** All Arabic copy lives in `packages/contracts/src/copy/ar.ts`. `app/dev/*` is exempt; `app/(admin)/admin/*` and `app/(site)/*` are **not**.
5. **Extensionless relative imports.** `apps/api` uses `module: Preserve` + `moduleResolution: Bundler` with `noEmit: true`; SWC does the real CommonJS emit.
6. **Every new Prisma model gets `@@schema("app")`.** Prisma 7 keeps connection strings out of `schema.prisma`. `prisma generate` does **not** run automatically after `migrate` — run it explicitly, every time.
7. **NestJS guards are the sole authorization authority.** Permissions are `resource:action` strings, never role equality checks. Deny by default; public routes are explicitly `@Public()`.
8. **Separate DTOs per role, `whitelist: true` + `forbidNonWhitelisted: true`.** The realistic attack is not privilege escalation — it is a student PATCHing `{completed:true}` or `{score:100}`, or an editor PATCHing `{status:'published'}` through the *edit* endpoint instead of the *publish* one.
9. **Design:** no gradients, no glassmorphism, no emoji icons, radius ≤ 8px on cards, no shadows in dark mode, amber (`--a-9`) used **flat**. Green and red are **reserved for quiz correctness** and must never appear as decoration — a published badge is amber or neutral, never green.
10. **Commit after every task**, explicit `git add` paths, conventional messages.
11. **Never `$queryRawUnsafe` / `$executeRawUnsafe`.** The ESLint `no-restricted-syntax` rule hard-fails on both. Tagged-template `$executeRaw` is parameterized and is what this plan uses.
12. **`lesson_videos.external_id` stores the ELEVEN-CHARACTER YouTube id, never a URL.** The URL is parsed, the id extracted with `/^[A-Za-z0-9_-]{11}$/`, and **everything else discarded**. The embed URL is reconstructed server-side as `https://www.youtube-nocookie.com/embed/{id}`. **The user-supplied URL is never fetched — not for metadata, not for validation, not for a thumbnail.** This eliminates the SSRF class rather than filtering it, and a Postgres `CHECK` constraint is the backstop.
13. **Ordering is `position int` with an `id` tie-break.** Never a CSV `sequence` column (Moodle's known wart), never index-based React keys, never array index as identity. Every `orderBy` is `[{ position: 'asc' }, { id: 'asc' }]`.
14. **Reordering N lessons is ONE write of the full ordered id array.** Not N writes, not one write per moved item. The client debounces and sends the whole array; the server rewrites all positions in a single `UPDATE … FROM (VALUES …)`.
15. **Rich text is sanitized on write** with `sanitize-html` against a tight allowlist, forced `rel="noopener noreferrer nofollow"`, and **all `<iframe>` denied** — embeds go through the video-id field, never through HTML. A DOMPurify pass runs again at render.
16. **Entitlement is an `access_grants` object, never a boolean.** Everything is free in v1, but "free" is expressed as a platform-scoped grant row with a validity window — not `if (course.priceCents === 0) return true`. Retrofitting a boolean into a grant object after launch is a data migration across every enrollment.
17. **Reserved-but-unenforced lesson fields ship in the schema and are rejected by the DTOs.** `visible_from`, `visible_to`, `unlocks_after_lesson_id`, `view_limit`, `content_group_id` exist as columns so the later `ALTER TABLE` is not a migration across a large table — but v1 accepts none of them and enforces none of them. Half-enforced access control is worse than none.
18. **Cache tags are per-entity.** `cacheTag('course', \`course:${id}\`)`. ⚠️ `cacheTag` silently skips tags over **256 characters** with only a console warning, and accepts at most **128 tags per call** — which is exactly why the catalog *list* carries one coarse tag instead of one tag per course.
19. **`updateTag()`, not `revalidateTag()`,** in admin server actions, so the editor sees their own write immediately.
20. **No `FAQPage` JSON-LD.** Google removed the documentation on 2026-06-15 and it produces zero rich results. The `Course` "course info" rich result was deprecated in Sept 2025; the supported shape is `ItemList` with **≥3** `Course` items on catalog pages.

---

## File Structure

```
packages/contracts/
├─ src/video.ts                     YouTube id extraction, provider enum, embed/thumb URL builders
├─ src/video.spec.ts                every URL form + every hostile input
├─ src/content.ts                   admin write contracts: course/section/lesson/text/attachment/reorder
├─ src/content.spec.ts              strictness + refinement tests
├─ src/catalog.ts                   public read contracts: list item, detail, section, lesson
├─ src/copy/ar.ts                   + copy.catalog, copy.course, copy.admin
└─ package.json                     + "./video", "./content", "./catalog" subpath exports

apps/api/
├─ prisma/schema.prisma             + Course, CourseSection, Lesson, LessonVideo,
│                                     LessonText, LessonAttachment, Enrollment, AccessGrant
├─ prisma/migrations/*_content/     the generated migration
├─ prisma/migrations/*_content_constraints/  hand-written: DEFERRABLE uniques, CHECKs, partial index
├─ src/common/sanitize/rich-text.ts        sanitize-html allowlist + forced rel
├─ src/common/sanitize/rich-text.spec.ts   XSS corpus
├─ src/modules/content/
│  ├─ content.module.ts
│  ├─ course.service.ts / course.controller.ts / course.service.spec.ts
│  ├─ section.service.ts / section.controller.ts
│  ├─ lesson.service.ts / lesson.controller.ts / lesson.service.spec.ts
│  ├─ reorder.sql.ts                buildReorderSql — the single-statement builder
│  ├─ reorder.sql.spec.ts           proves one statement, N*2+1 params
│  └─ dto/*.dto.ts                  admin-scoped DTOs, one per endpoint
├─ src/modules/catalog/
│  ├─ catalog.module.ts / catalog.service.ts / catalog.controller.ts
│  └─ catalog.service.spec.ts       published-only, no draft leakage
├─ src/modules/entitlement/
│  ├─ entitlement.module.ts / entitlement.service.ts / entitlement.service.spec.ts
│  └─ enrollment.controller.ts
└─ src/auth/permissions.ts          + course:*, section:*, lesson:*, enrollment:*

packages/ui/src/components/
├─ input.tsx / textarea.tsx / select.tsx / label.tsx   form primitives the admin needs

apps/web/
├─ lib/api.ts                       + apiGetOrNull, apiSend (cookie forwarding + CSRF header)
├─ lib/catalog.ts                   'use cache' loaders + the tag vocabulary
├─ lib/seo/jsonld.ts                pure JSON-LD builders
├─ lib/seo/jsonld.test.ts           duration formatting, the ≥3 guard, no FAQPage
├─ components/seo/json-ld.tsx       <script type="application/ld+json"> with < escaped
├─ components/content/rich-text.tsx DOMPurify second pass, server component
├─ components/content/youtube-embed.tsx  reconstructs the embed URL from the id
├─ components/admin/sortable-lesson-list.tsx  @dnd-kit, one debounced write
├─ components/admin/course-form.tsx
├─ app/(site)/courses/page.tsx      catalog list, SSR + use cache
├─ app/(site)/courses/[slug]/page.tsx  course detail + generateMetadata
├─ app/(site)/courses/[slug]/loading.tsx
├─ app/(admin)/layout.tsx
├─ app/(admin)/admin/courses/page.tsx
├─ app/(admin)/admin/courses/[id]/page.tsx
├─ app/(admin)/admin/courses/actions.ts     'use server' — calls the API, then updateTag
├─ app/sitemap.ts
└─ app/robots.ts
```

---

## Task 1: The YouTube id extractor — the SSRF control

This ships first because everything downstream stores its output. There is no code path in this plan that fetches a user-supplied URL; the reason is this function.

**Files:**
- Create: `packages/contracts/src/video.ts`
- Create: `packages/contracts/src/video.spec.ts`
- Modify: `packages/contracts/src/index.ts`, `packages/contracts/package.json`

**Interfaces:**
- Consumes: nothing (only `zod`). `video.ts` deliberately has **no relative imports** so `apps/api` can import `@ayman/contracts/video` at runtime — Node's native ESM loader cannot resolve extensionless relative specifiers, which is why leaf modules stay self-contained.
- Produces:
  - `YOUTUBE_ID_RE: RegExp`
  - `extractYouTubeId(input: string): string | null`
  - `youTubeEmbedUrl(externalId: string, options?: { start?: number }): string`
  - `youTubeThumbnailUrl(externalId: string, quality?: 'hq' | 'maxres'): string`
  - `VideoProviderSchema` (7 members), `type VideoProvider`
  - `LessonVideoInputSchema` — takes `{ provider, url, durationSeconds, posterKey }`, **outputs** `{ provider, externalId, durationSeconds, posterKey }`

- [ ] **Step 1: Write the failing test**

Create `packages/contracts/src/video.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  LessonVideoInputSchema,
  VideoProviderSchema,
  YOUTUBE_ID_RE,
  extractYouTubeId,
  youTubeEmbedUrl,
  youTubeThumbnailUrl,
} from './video';

const ID = 'dQw4w9WgXcQ'; // exactly 11 chars

describe('extractYouTubeId — accepted forms', () => {
  it.each([
    ['watch', `https://www.youtube.com/watch?v=${ID}`],
    ['watch with extra params', `https://www.youtube.com/watch?v=${ID}&list=PLabc&index=2&t=42s`],
    ['watch on m.', `https://m.youtube.com/watch?v=${ID}`],
    ['watch on music.', `https://music.youtube.com/watch?v=${ID}`],
    ['bare youtube.com', `https://youtube.com/watch?v=${ID}`],
    ['youtu.be', `https://youtu.be/${ID}`],
    ['youtu.be with timestamp', `https://youtu.be/${ID}?t=90`],
    ['embed', `https://www.youtube.com/embed/${ID}`],
    ['embed with params', `https://www.youtube.com/embed/${ID}?start=30&rel=0`],
    ['nocookie embed', `https://www.youtube-nocookie.com/embed/${ID}`],
    ['shorts', `https://www.youtube.com/shorts/${ID}`],
    ['live', `https://www.youtube.com/live/${ID}`],
    ['/v/ legacy', `https://www.youtube.com/v/${ID}`],
    ['http not https', `http://www.youtube.com/watch?v=${ID}`],
    ['no scheme', `www.youtube.com/watch?v=${ID}`],
    ['surrounding whitespace', `   https://youtu.be/${ID}   `],
    ['uppercase host', `https://WWW.YouTube.COM/watch?v=${ID}`],
    ['a bare id, already stored', ID],
  ])('extracts the id from %s', (_label, input) => {
    expect(extractYouTubeId(input)).toBe(ID);
  });
});

describe('extractYouTubeId — rejected input', () => {
  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['a lookalike host', `https://youtube.com.evil.example/watch?v=${ID}`],
    ['a subdomain impostor', `https://youtube.com.evil.example/embed/${ID}`],
    ['userinfo smuggling', `https://www.youtube.com@evil.example/watch?v=${ID}`],
    ['an open redirect', `https://evil.example/r?u=https://youtu.be/${ID}`],
    ['a different site entirely', `https://vimeo.com/${ID}`],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html;base64,PHNjcmlwdD4='],
    ['file scheme', 'file:///etc/passwd'],
    ['an internal address', 'http://169.254.169.254/latest/meta-data/'],
    ['localhost', 'http://localhost:3300/api/health'],
    ['a 10-char id', 'https://youtu.be/dQw4w9WgXc'],
    ['a 12-char id', 'https://youtu.be/dQw4w9WgXcQQ'],
    ['an id with a dot', 'https://youtu.be/dQw4w9WgX.Q'],
    ['an id with a slash', 'https://youtu.be/dQw4w9WgX/Q'],
    ['a watch URL with no v', 'https://www.youtube.com/watch?list=PLabc'],
    ['a channel URL', 'https://www.youtube.com/@ayman'],
    ['a path traversal', `https://www.youtube.com/embed/../../${ID}`],
    ['an HTML injection attempt', `<img src=x onerror=alert(1)>${ID}`],
  ])('returns null for %s', (_label, input) => {
    expect(extractYouTubeId(input)).toBeNull();
  });

  it('never returns anything that fails the 11-char regex', () => {
    const corpus = ['https://youtu.be/AAAA', `https://youtu.be/${ID}`, 'nonsense', ID];
    for (const candidate of corpus) {
      const result = extractYouTubeId(candidate);
      if (result !== null) expect(YOUTUBE_ID_RE.test(result)).toBe(true);
    }
  });
});

describe('youTubeEmbedUrl', () => {
  it('reconstructs a nocookie embed URL from the id alone', () => {
    const url = new URL(youTubeEmbedUrl(ID));
    expect(url.origin).toBe('https://www.youtube-nocookie.com');
    expect(url.pathname).toBe(`/embed/${ID}`);
    expect(url.searchParams.get('rel')).toBe('0');
  });

  it('accepts an integer start offset', () => {
    expect(new URL(youTubeEmbedUrl(ID, { start: 90.7 })).searchParams.get('start')).toBe('90');
  });

  it('throws rather than emitting anything derived from a URL', () => {
    expect(() => youTubeEmbedUrl(`https://youtu.be/${ID}`)).toThrow(/11-character/);
    expect(() => youTubeEmbedUrl('../../evil')).toThrow(/11-character/);
  });
});

describe('youTubeThumbnailUrl', () => {
  it('points at i.ytimg.com, which is the only image host in the CSP', () => {
    expect(youTubeThumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
    expect(youTubeThumbnailUrl(ID, 'maxres')).toBe(`https://i.ytimg.com/vi/${ID}/maxresdefault.jpg`);
  });
});

describe('VideoProviderSchema', () => {
  it('carries all seven providers even though v1 only writes one', () => {
    expect(VideoProviderSchema.options).toEqual([
      'youtube', 'upload', 'vimeo', 'bunny', 'vdocipher', 'ink', 'gumlet',
    ]);
  });
});

describe('LessonVideoInputSchema', () => {
  it('replaces the URL with the id and drops everything else', () => {
    const parsed = LessonVideoInputSchema.parse({
      provider: 'youtube',
      url: `https://www.youtube.com/watch?v=${ID}&list=PLsecret&si=trackingtoken`,
      durationSeconds: 612,
      posterKey: null,
    });
    expect(parsed).toEqual({
      provider: 'youtube',
      externalId: ID,
      durationSeconds: 612,
      posterKey: null,
    });
    expect(JSON.stringify(parsed)).not.toContain('youtube.com');
    expect(JSON.stringify(parsed)).not.toContain('PLsecret');
  });

  it('rejects a URL it cannot reduce to an id', () => {
    const result = LessonVideoInputSchema.safeParse({
      provider: 'youtube',
      url: 'https://evil.example/video',
      durationSeconds: 10,
      posterKey: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects providers that have no implementation yet', () => {
    const result = LessonVideoInputSchema.safeParse({
      provider: 'vimeo',
      url: `https://youtu.be/${ID}`,
      durationSeconds: 10,
      posterKey: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys instead of silently dropping them', () => {
    const result = LessonVideoInputSchema.safeParse({
      provider: 'youtube',
      url: `https://youtu.be/${ID}`,
      durationSeconds: 10,
      posterKey: null,
      externalId: 'ATTACKERSET',
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @ayman/contracts test video
```
Expected: FAIL — `Failed to resolve import "./video"`.

- [ ] **Step 3: Implement `packages/contracts/src/video.ts`**

```ts
import { z } from 'zod';

/**
 * Seven providers, because widening this enum later means an ALTER TYPE plus a
 * migration across every lesson_videos row, and widening it now costs nothing.
 * v1 only ever writes 'youtube' — LessonVideoInputSchema refuses the rest until
 * a real integration exists behind each one.
 */
export const VideoProviderSchema = z.enum([
  'youtube',
  'upload',
  'vimeo',
  'bunny',
  'vdocipher',
  'ink',
  'gumlet',
]);
export type VideoProvider = z.infer<typeof VideoProviderSchema>;

/**
 * A YouTube video id is exactly 11 characters of URL-safe base64. Nothing else
 * is ever stored in `lesson_videos.external_id`, and a Postgres CHECK constraint
 * enforces the same shape at the database level.
 */
export const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Host ALLOWLIST, not a substring match. `youtube.com.evil.example` contains
 * "youtube.com" and is the single most common bypass of a naive check.
 */
const YOUTUBE_HOSTS: ReadonlySet<string> = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'www.youtu.be',
]);

/** Path forms that carry the id as the first segment after the prefix. */
const ID_BEARING_PREFIXES = ['embed', 'shorts', 'live', 'v'] as const;

/**
 * Reduce any YouTube URL to its 11-character id, or return null.
 *
 * SECURITY CONTRACT: this function PARSES and DISCARDS. It never performs a
 * network request, never follows a redirect, never resolves a hostname, and
 * never returns any part of the input other than an id that matches
 * YOUTUBE_ID_RE. That is what makes the SSRF class structurally absent instead
 * of filtered — there is no code path that can be talked into fetching
 * 169.254.169.254 because there is no code path that fetches anything.
 */
export function extractYouTubeId(input: string): string | null {
  const raw = input.trim();
  if (raw.length === 0 || raw.length > 2048) return null;

  // A bare id is the canonical stored form. Accepting it means re-saving a
  // lesson does not force the admin to paste the original URL again.
  if (YOUTUBE_ID_RE.test(raw)) return raw;

  let url: URL;
  try {
    // Only prefix a scheme when the input has no scheme at all. `javascript:`
    // contains ':' but not '://', and prefixing it would produce a URL whose
    // host is "javascript" — which the host allowlist below rejects anyway.
    url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  // `username`/`password` are how `https://www.youtube.com@evil.example/` reads
  // as trustworthy to a human. URL parsing already puts the real host in
  // `hostname`, but rejecting userinfo outright removes the ambiguity.
  if (url.username !== '' || url.password !== '') return null;
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;

  // `pathname` is already normalised by the URL parser, so `/embed/../../x`
  // has collapsed before we see it — the segment split below cannot be walked.
  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);

  let candidate: string | null = null;

  if (url.hostname.toLowerCase().endsWith('youtu.be')) {
    candidate = segments[0] ?? null;
  } else if (segments.length === 1 && segments[0] === 'watch') {
    candidate = url.searchParams.get('v');
  } else if (segments.length === 2 && ID_BEARING_PREFIXES.includes(segments[0] as never)) {
    candidate = segments[1] ?? null;
  }

  if (candidate === null) return null;
  return YOUTUBE_ID_RE.test(candidate) ? candidate : null;
}

/**
 * The ONLY way a YouTube URL is ever produced. It is built from the id, on the
 * server, against a hardcoded origin — never echoed back from stored input.
 * `youtube-nocookie.com` is the privacy-preserving embed host and is the single
 * entry in the CSP's `frame-src`.
 */
export function youTubeEmbedUrl(externalId: string, options?: { start?: number }): string {
  if (!YOUTUBE_ID_RE.test(externalId)) {
    throw new Error(
      'youTubeEmbedUrl requires an 11-character YouTube id, not a URL or any other value',
    );
  }
  const url = new URL(`https://www.youtube-nocookie.com/embed/${externalId}`);
  url.searchParams.set('rel', '0');
  url.searchParams.set('modestbranding', '1');
  url.searchParams.set('playsinline', '1');
  if (typeof options?.start === 'number' && Number.isFinite(options.start) && options.start > 0) {
    url.searchParams.set('start', String(Math.floor(options.start)));
  }
  return url.toString();
}

/** Poster/`VideoObject.thumbnailUrl`. `i.ytimg.com` is the only remote img-src. */
export function youTubeThumbnailUrl(
  externalId: string,
  quality: 'hq' | 'maxres' = 'hq',
): string {
  if (!YOUTUBE_ID_RE.test(externalId)) {
    throw new Error(
      'youTubeThumbnailUrl requires an 11-character YouTube id, not a URL or any other value',
    );
  }
  const file = quality === 'maxres' ? 'maxresdefault.jpg' : 'hqdefault.jpg';
  return `https://i.ytimg.com/vi/${externalId}/${file}`;
}

/**
 * The admin pastes a URL; this schema is where it stops being a URL. The output
 * type has no `url` field at all, so nothing downstream — service, Prisma call,
 * serializer, or template — can accidentally persist or re-emit it.
 */
export const LessonVideoInputSchema = z
  .object({
    provider: VideoProviderSchema,
    url: z.string().min(1).max(2048),
    durationSeconds: z
      .number()
      .int()
      .positive()
      .max(12 * 60 * 60),
    posterKey: z.string().max(255).nullable().default(null),
  })
  .strict()
  .transform((value, ctx) => {
    if (value.provider !== 'youtube') {
      ctx.addIssue({
        code: 'custom',
        message: 'النسخة الحالية بتدعم فيديوهات يوتيوب بس',
        path: ['provider'],
      });
      return z.NEVER;
    }
    const externalId = extractYouTubeId(value.url);
    if (externalId === null) {
      ctx.addIssue({ code: 'custom', message: 'رابط يوتيوب غير صالح', path: ['url'] });
      return z.NEVER;
    }
    return {
      provider: 'youtube' as const,
      externalId,
      durationSeconds: value.durationSeconds,
      posterKey: value.posterKey,
    };
  });

export type LessonVideoInput = z.infer<typeof LessonVideoInputSchema>;
```

- [ ] **Step 4: Export it**

`packages/contracts/src/index.ts` — append:
```ts
export * from './video';
```

`packages/contracts/package.json` — add the subpath so `apps/api` can import the schema **value** at runtime without going through the barrel:
```json
  "exports": {
    ".": "./src/index.ts",
    "./copy": "./src/copy/ar.ts",
    "./onboarding": "./src/onboarding.ts",
    "./video": "./src/video.ts"
  },
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @ayman/contracts test video
```
Expected: PASS — 8 describe blocks, 45 assertions.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/video.ts packages/contracts/src/video.spec.ts \
        packages/contracts/src/index.ts packages/contracts/package.json
git commit -m "feat(contracts): YouTube id extraction — parse and discard, never fetch"
```

---

## Task 2: Rich-text sanitization on write

**Files:**
- Create: `apps/api/src/common/sanitize/rich-text.ts`
- Create: `apps/api/src/common/sanitize/rich-text.spec.ts`
- Modify: `apps/api/package.json`

**Interfaces:**
- Consumes: `sanitize-html@2.17.6`.
- Produces: `sanitizeRichText(input: string): string` and `RICH_TEXT_OPTIONS`. Every path that writes `lesson_texts.body_html` goes through it.

- [ ] **Step 1: Install the dependency**

```bash
pnpm --filter @ayman/api add sanitize-html@2.17.6
pnpm --filter @ayman/api add -D @types/sanitize-html@2.16.1
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/common/sanitize/rich-text.spec.ts`:

```ts
import { sanitizeRichText } from './rich-text';

describe('sanitizeRichText — allowlist', () => {
  it('keeps the tags a lesson actually needs', () => {
    const input =
      '<h2>العنوان</h2><p>نص <strong>مهم</strong> و<em>مائل</em> و<u>تحته خط</u></p>' +
      '<ul><li>عنصر</li></ul><ol><li>عنصر</li></ol>' +
      '<blockquote>اقتباس</blockquote><pre><code>const x = 1;</code></pre><br />';
    const output = sanitizeRichText(input);
    for (const tag of ['h2', 'p', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code']) {
      expect(output).toContain(`<${tag}`);
    }
  });

  it('drops tags outside the allowlist but keeps their text', () => {
    expect(sanitizeRichText('<div><span>نص</span></div>')).toBe('نص');
    expect(sanitizeRichText('<h1>عنوان</h1>')).toBe('عنوان');
  });
});

describe('sanitizeRichText — XSS corpus', () => {
  it.each([
    ['script tag', '<script>alert(1)</script>'],
    ['nested script', '<scr<script>ipt>alert(1)</script>'],
    ['img onerror', '<img src=x onerror="alert(1)">'],
    ['svg onload', '<svg onload="alert(1)"></svg>'],
    ['body onload', '<body onload=alert(1)>'],
    ['style block', '<style>body{background:url(javascript:alert(1))}</style>'],
    ['object', '<object data="data:text/html;base64,PHNjcmlwdD4="></object>'],
    ['embed', '<embed src="evil.swf">'],
    ['form', '<form action="https://evil.example"><input name="p"></form>'],
    ['meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.example">'],
  ])('neutralises %s', (_label, input) => {
    const output = sanitizeRichText(input);
    expect(output).not.toMatch(/<script|<svg|<style|<object|<embed|<form|<meta|<img/i);
    expect(output).not.toMatch(/onerror|onload|javascript:/i);
  });

  it('denies every iframe — embeds go through the video-id field, never through HTML', () => {
    const input =
      '<p>قبل</p><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe><p>بعد</p>';
    const output = sanitizeRichText(input);
    expect(output).not.toContain('<iframe');
    expect(output).not.toContain('youtube.com');
    expect(output).toContain('قبل');
    expect(output).toContain('بعد');
  });

  it('strips the style attribute so an editor cannot inject CSS', () => {
    const output = sanitizeRichText('<p style="position:fixed;inset:0;z-index:9999">نص</p>');
    expect(output).not.toContain('style');
    expect(output).toContain('نص');
  });
});

describe('sanitizeRichText — links', () => {
  it('forces rel="noopener noreferrer nofollow" on every anchor', () => {
    const output = sanitizeRichText('<a href="https://example.com">لينك</a>');
    expect(output).toContain('rel="noopener noreferrer nofollow"');
    expect(output).toContain('target="_blank"');
    expect(output).toContain('href="https://example.com"');
  });

  it('overrides a hostile rel the author supplied', () => {
    const output = sanitizeRichText('<a href="https://example.com" rel="opener">لينك</a>');
    expect(output).toContain('rel="noopener noreferrer nofollow"');
    expect(output).not.toContain('rel="opener"');
  });

  it.each([
    ['javascript', '<a href="javascript:alert(1)">x</a>'],
    ['data', '<a href="data:text/html,<script>alert(1)</script>">x</a>'],
    ['vbscript', '<a href="vbscript:msgbox(1)">x</a>'],
    ['protocol relative', '<a href="//evil.example">x</a>'],
  ])('removes a %s href', (_label, input) => {
    expect(sanitizeRichText(input)).not.toMatch(/href=/);
  });

  it('allows http, https and mailto', () => {
    expect(sanitizeRichText('<a href="http://a.example">x</a>')).toContain('href=');
    expect(sanitizeRichText('<a href="https://a.example">x</a>')).toContain('href=');
    expect(sanitizeRichText('<a href="mailto:a@b.example">x</a>')).toContain('href=');
  });
});

describe('sanitizeRichText — idempotence', () => {
  it('sanitizing twice equals sanitizing once', () => {
    const input = '<p>نص</p><a href="https://a.example">لينك</a><script>alert(1)</script>';
    const once = sanitizeRichText(input);
    expect(sanitizeRichText(once)).toBe(once);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter @ayman/api test rich-text
```
Expected: FAIL — `Cannot find module './rich-text'`.

- [ ] **Step 4: Implement `apps/api/src/common/sanitize/rich-text.ts`**

```ts
import sanitizeHtml from 'sanitize-html';

/**
 * A tight allowlist, deliberately smaller than "what a WYSIWYG can emit".
 * Anything not on this list is discarded, and the burden of proof is on the
 * tag: we add one when a lesson genuinely needs it, not in anticipation.
 *
 * `iframe` is ABSENT and stays absent. Video embeds go through
 * lesson_videos.external_id, which is an 11-character id validated by a regex
 * and a database CHECK. An HTML iframe would be a second, unvalidated embed
 * path — exactly the kind of parallel road that gets forgotten in review.
 */
export const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'em', 'u',
    'ul', 'ol', 'li',
    'h2', 'h3',
    'blockquote', 'code', 'pre',
    'a',
  ],
  // Only anchors carry attributes. No `style`, no `class`, no `id`, no `on*`.
  allowedAttributes: { a: ['href', 'title', 'rel', 'target'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href'],
  // `//evil.example` inherits the page scheme and is a real phishing vector.
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  /**
   * For these tags, drop the CONTENTS too rather than surfacing them as text.
   * Without `iframe` here, `<iframe>fallback</iframe>` would leak "fallback"
   * into the document; without `style`, a stylesheet would render as prose.
   */
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'iframe'],
  enforceHtmlBoundary: true,
  transformTags: {
    /**
     * Forced, not defaulted. An author-supplied `rel="opener"` is overwritten,
     * because `target="_blank"` without `noopener` hands the opened page a
     * `window.opener` handle back into ours. sanitize-html applies scheme and
     * attribute filtering AFTER this transform, so a `javascript:` href that
     * survives to here is still removed.
     */
    a: (_tagName, attribs) => ({
      tagName: 'a',
      attribs: { ...attribs, rel: 'noopener noreferrer nofollow', target: '_blank' },
    }),
  },
};

/**
 * The single write-side sanitizer. Every path that persists lesson_texts.body_html
 * calls this; nothing writes raw editor output. A second DOMPurify pass runs at
 * render (apps/web/components/content/rich-text.tsx) because defence in depth is
 * cheap here and a single sanitizer is a single point of failure.
 */
export function sanitizeRichText(input: string): string {
  return sanitizeHtml(input, RICH_TEXT_OPTIONS);
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @ayman/api test rich-text
```
Expected: PASS — 5 describe blocks, 24 assertions.

If `strips the style attribute` fails because sanitize-html echoes an empty
`style=""`, that means `allowedAttributes` was widened — do not "fix" the test.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/common/sanitize apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): write-side rich text sanitizer with all iframes denied"
```

---

## Task 3: Content schema and migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/*_content/migration.sql` (generated)
- Create: `apps/api/prisma/migrations/*_content_constraints/migration.sql` (hand-written)

**Interfaces:**
- Produces: Prisma models `Course`, `CourseSection`, `Lesson`, `LessonVideo`, `LessonText`, `LessonAttachment` and enums `CourseStatus`, `LessonKind`, `VideoProvider`, `CompletionMode`. Later tasks and Plans 4–6 reference these exact model and field names.

- [ ] **Step 1: Add the enums to `apps/api/prisma/schema.prisma`**

```prisma
enum CourseStatus {
  draft
  published
  archived

  @@schema("app")
}

enum LessonKind {
  video
  quiz
  attachment
  text

  @@schema("app")
}

/// Seven providers even though v1 is YouTube-only. Widening a Postgres enum
/// later is an ALTER TYPE inside a migration that has to coordinate with a
/// deploy; widening it now is one line in a table nobody has written to yet.
enum VideoProvider {
  youtube
  upload
  vimeo
  bunny
  vdocipher
  ink
  gumlet

  @@schema("app")
}

/// The completion rule lives on the LESSON, not on the video or the quiz row —
/// a text lesson can require manual completion, a video lesson can require a
/// grade on its attached quiz, and putting the rule on the payload table would
/// make "how does this lesson complete?" a four-way union at read time.
enum CompletionMode {
  none
  manual
  on_view
  on_grade
  on_pass

  @@schema("app")
}
```

- [ ] **Step 2: Add the `Course` model**

```prisma
/// Courses are scoped by (system, year, track, subject) against the existing
/// taxonomy — the same tuple that identifies a SubjectOffering. The service
/// validates the tuple against subject_offerings on every write, because a
/// syntactically valid subject UUID can still belong to another system.
model Course {
  id           String       @id @default(uuid(7))
  slug         String       @unique @db.Citext
  title        String
  subtitle     String?
  description  String?
  systemId     String       @map("system_id")
  year         Int
  trackId      String?      @map("track_id")
  subjectId    String       @map("subject_id")
  status       CourseStatus @default(draft)
  instructorId String       @map("instructor_id")
  /// The storage KEY, never a full URL — same rule as media_assets (§6.7).
  coverKey     String?      @map("cover_key")
  /// Reserved. v1 is free for everyone and this is always 0. Entitlement is
  /// NEVER derived from it — see AccessGrant. A boolean `isFree` here would be
  /// the exact mistake §6.6 exists to prevent.
  priceCents   Int          @default(0) @map("price_cents")
  position     Int          @default(0)
  publishedAt  DateTime?    @map("published_at")
  createdAt    DateTime     @default(now()) @map("created_at")
  updatedAt    DateTime     @updatedAt @map("updated_at")

  system      EducationSystem @relation(fields: [systemId], references: [id], onDelete: Restrict)
  track       Track?          @relation(fields: [trackId], references: [id], onDelete: Restrict)
  subject     Subject         @relation(fields: [subjectId], references: [id], onDelete: Restrict)
  instructor  User            @relation(fields: [instructorId], references: [id], onDelete: Restrict)
  sections    CourseSection[]
  lessons     Lesson[]
  enrollments Enrollment[]
  grants      AccessGrant[]

  @@index([status, publishedAt])
  @@index([systemId, year, trackId, subjectId])
  @@map("courses")
  @@schema("app")
}
```

- [ ] **Step 3: Add the back-relations to the four existing models**

Prisma requires both sides of every relation. Add exactly these lines:

```prisma
// model EducationSystem — inside the relation block
  courses Course[]

// model Track — inside the relation block
  courses Course[]

// model Subject — inside the relation block
  courses Course[]

// model User — inside the relation block
  courses        Course[]
  enrollments    Enrollment[]
  accessGrants   AccessGrant[]   @relation("AccessGrantSubject")
  grantsIssued   AccessGrant[]   @relation("AccessGrantIssuer")
```

- [ ] **Step 4: Add `CourseSection` and `Lesson`**

```prisma
/// "شهر" / "الترم" / "الباقة" are PRICING concepts and must never appear as
/// content levels. A section is a chapter of a course, nothing else.
model CourseSection {
  id          String   @id @default(uuid(7))
  courseId    String   @map("course_id")
  title       String
  summary     String?
  /// Ordering is position + an id tie-break. Never a CSV sequence column.
  position    Int
  isPublished Boolean  @default(false) @map("is_published")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  course  Course   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  lessons Lesson[]

  // Re-created as DEFERRABLE INITIALLY DEFERRED in the hand-written migration
  // (Step 6). Prisma cannot express deferrability and does not introspect it,
  // so declaring it here keeps `migrate dev` from reporting drift while the
  // real constraint is the deferrable one.
  @@unique([courseId, position], map: "course_sections_course_position_key")
  @@map("course_sections")
  @@schema("app")
}

model Lesson {
  id        String     @id @default(uuid(7))
  /// Denormalised from section.courseId so course-wide queries (lesson counts,
  /// total duration, the sitemap) do not need a join. Written by the service on
  /// create and never accepted from a client.
  courseId  String     @map("course_id")
  sectionId String     @map("section_id")
  title     String
  kind      LessonKind
  position  Int

  isPublished      Boolean @default(false) @map("is_published")
  isFreePreview    Boolean @default(false) @map("is_free_preview")
  estimatedSeconds Int     @default(0) @map("estimated_seconds")

  // ── RESERVED, UNENFORCED IN V1 (Global Constraint 17) ───────────────────
  // These columns exist so the later ALTER TABLE is not a migration across a
  // large, hot table. NOTHING in v1 reads them for an access decision and NO
  // v1 DTO accepts them — LessonCreateDto/LessonUpdateDto reject them with a
  // 400 rather than stripping them, so a half-enforced gate cannot appear by
  // accident. When they are switched on, that is its own plan with its own
  // authorization matrix tests.
  visibleFrom          DateTime? @map("visible_from")
  visibleTo            DateTime? @map("visible_to")
  unlocksAfterLessonId String?   @map("unlocks_after_lesson_id")
  viewLimit            Int?      @map("view_limit")
  /// content_groups is a v1.1 table (shared lesson sets across courses). The
  /// column is reserved WITHOUT a foreign key so the FK can be added later in
  /// one statement against all-NULL data.
  contentGroupId       String?   @map("content_group_id")

  // ── Completion rule ────────────────────────────────────────────────────
  completionMode           CompletionMode @default(manual) @map("completion_mode")
  completionMinViewSeconds Int?           @map("completion_min_view_seconds")
  completionPassGrade      Decimal?       @map("completion_pass_grade") @db.Decimal(6, 3)

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  course       Course             @relation(fields: [courseId], references: [id], onDelete: Cascade)
  section      CourseSection      @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  unlocksAfter Lesson?            @relation("LessonUnlock", fields: [unlocksAfterLessonId], references: [id], onDelete: SetNull)
  unlocks      Lesson[]           @relation("LessonUnlock")
  video        LessonVideo?
  text         LessonText?
  attachments  LessonAttachment[]

  @@unique([sectionId, position], map: "lessons_section_position_key")
  @@index([courseId, isPublished])
  @@map("lessons")
  @@schema("app")
}
```

- [ ] **Step 5: Add the three payload models**

```prisma
/// 1:1 with a lesson. `externalId` is the ELEVEN-CHARACTER provider id — never
/// a URL. A CHECK constraint in the hand-written migration enforces that even
/// against a direct SQL write, so the invariant does not depend on the
/// application layer remembering.
model LessonVideo {
  lessonId        String        @id @map("lesson_id")
  provider        VideoProvider
  externalId      String        @map("external_id")
  durationSeconds Int           @map("duration_seconds")
  posterKey       String?       @map("poster_key")
  captions        Json?
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")

  lesson Lesson @relation(fields: [lessonId], references: [id], onDelete: Cascade)

  @@map("lesson_videos")
  @@schema("app")
}

/// 1:1 with a lesson. `bodyHtml` is ALWAYS sanitize-html output — nothing
/// writes this column without going through sanitizeRichText().
model LessonText {
  lessonId  String   @id @map("lesson_id")
  bodyHtml  String   @map("body_html")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  lesson Lesson @relation(fields: [lessonId], references: [id], onDelete: Cascade)

  @@map("lesson_texts")
  @@schema("app")
}

/// 1:N. `storageKey` is the key, never a URL — signed URLs are minted at read
/// time so a leaked row is not a leaked file.
model LessonAttachment {
  id         String   @id @default(uuid(7))
  lessonId   String   @map("lesson_id")
  storageKey String   @map("storage_key")
  filename   String
  mime       String
  sizeBytes  Int      @map("size_bytes")
  position   Int      @default(0)
  createdAt  DateTime @default(now()) @map("created_at")

  lesson Lesson @relation(fields: [lessonId], references: [id], onDelete: Cascade)

  // No unique constraint here: attachments have no drag-reorder surface in this
  // plan, so ordering is (position, id) with duplicates tolerated. Sections and
  // lessons get the deferrable unique because they DO get reordered.
  @@index([lessonId, position])
  @@map("lesson_attachments")
  @@schema("app")
}
```

- [ ] **Step 6: Run the generated migration**

```bash
pnpm --filter @ayman/api exec prisma migrate dev --name content
pnpm --filter @ayman/api exec prisma generate
```
Expected: a migration under `apps/api/prisma/migrations/` that applies cleanly. `prisma generate` is a separate command in Prisma 7 — it does not run automatically after `migrate`.

- [ ] **Step 7: Add the hand-written constraints migration**

```bash
pnpm --filter @ayman/api exec prisma migrate dev --create-only --name content_constraints
```

Paste this into the generated `migration.sql`:

```sql
-- ── Deferrable ordering constraints ──────────────────────────────────────
-- A non-deferred UNIQUE is checked per row DURING a statement, so a single
-- `UPDATE ... FROM (VALUES ...)` that rewrites every position in a section
-- trips a duplicate-key error partway through even though the FINAL state is
-- valid. DEFERRABLE INITIALLY DEFERRED moves the check to COMMIT, which is
-- what makes "reorder 40 lessons in one write" possible at all.
--
-- Prisma cannot express deferrability and does not introspect it, so the
-- @@unique in schema.prisma keeps drift detection quiet while THIS is the
-- constraint that actually exists.
ALTER TABLE "app"."course_sections"
  DROP CONSTRAINT "course_sections_course_position_key";
ALTER TABLE "app"."course_sections"
  ADD CONSTRAINT "course_sections_course_position_key"
  UNIQUE ("course_id", "position") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "app"."lessons"
  DROP CONSTRAINT "lessons_section_position_key";
ALTER TABLE "app"."lessons"
  ADD CONSTRAINT "lessons_section_position_key"
  UNIQUE ("section_id", "position") DEFERRABLE INITIALLY DEFERRED;

-- ── The SSRF backstop ────────────────────────────────────────────────────
-- external_id may only ever be an 11-character YouTube id. This holds against
-- a direct psql write, a future service that forgets the Zod schema, and a
-- migration that backfills from the wrong column.
ALTER TABLE "app"."lesson_videos"
  ADD CONSTRAINT "lesson_videos_youtube_id_only"
  CHECK ("provider" <> 'youtube' OR "external_id" ~ '^[A-Za-z0-9_-]{11}$');

-- ── Taxonomy coherence ───────────────────────────────────────────────────
-- Mirrors student_profiles_year1_has_no_track: grade 1 is common and
-- non-specialized across both systems, so a grade-1 course cannot have a track.
ALTER TABLE "app"."courses"
  ADD CONSTRAINT "courses_year1_has_no_track"
  CHECK ("year" <> 1 OR "track_id" IS NULL);

ALTER TABLE "app"."courses"
  ADD CONSTRAINT "courses_year_range"
  CHECK ("year" BETWEEN 1 AND 3);

-- A published course must have a published_at. Nothing else can express
-- "published" without also recording when.
ALTER TABLE "app"."courses"
  ADD CONSTRAINT "courses_published_has_timestamp"
  CHECK ("status" <> 'published' OR "published_at" IS NOT NULL);

-- ── Positions are non-negative ───────────────────────────────────────────
ALTER TABLE "app"."course_sections" ADD CONSTRAINT "course_sections_position_nonneg" CHECK ("position" >= 0);
ALTER TABLE "app"."lessons"         ADD CONSTRAINT "lessons_position_nonneg"         CHECK ("position" >= 0);

-- ── A lesson's denormalised course_id must match its section's ───────────
-- The service writes it, but a composite FK makes the invariant structural.
ALTER TABLE "app"."course_sections"
  ADD CONSTRAINT "course_sections_id_course_key" UNIQUE ("id", "course_id");
ALTER TABLE "app"."lessons"
  ADD CONSTRAINT "lessons_section_matches_course"
  FOREIGN KEY ("section_id", "course_id")
  REFERENCES "app"."course_sections" ("id", "course_id")
  ON DELETE CASCADE;
```

Apply it:
```bash
pnpm --filter @ayman/api exec prisma migrate dev
pnpm --filter @ayman/api exec prisma generate
```

- [ ] **Step 8: Prove each constraint actually bites**

```bash
psql "$DIRECT_DATABASE_URL" -c "\d app.lessons" | grep -i deferrable
```
Expected: the `lessons_section_position_key` line reports `DEFERRABLE`.

```bash
psql "$DIRECT_DATABASE_URL" <<'SQL'
BEGIN;
INSERT INTO app.courses (id, slug, title, system_id, year, subject_id, status, instructor_id, created_at, updated_at)
SELECT gen_random_uuid()::text, 'ck-year1-track', 't',
       (SELECT id FROM app.education_systems LIMIT 1), 1,
       (SELECT id FROM app.subjects LIMIT 1), 'draft',
       (SELECT id FROM app.users LIMIT 1), now(), now();
UPDATE app.courses SET track_id = (SELECT id FROM app.tracks LIMIT 1) WHERE slug = 'ck-year1-track';
ROLLBACK;
SQL
```
Expected: `ERROR: new row for relation "courses" violates check constraint "courses_year1_has_no_track"`.

```bash
psql "$DIRECT_DATABASE_URL" -c "
  INSERT INTO app.lesson_videos (lesson_id, provider, external_id, duration_seconds, created_at, updated_at)
  VALUES ('nonexistent', 'youtube', 'https://youtu.be/dQw4w9WgXcQ', 10, now(), now());"
```
Expected: `ERROR: ... violates check constraint "lesson_videos_youtube_id_only"` — the CHECK fires before the foreign key, which is exactly the point: a URL can never land in that column.

```bash
psql "postgresql://ayman_runtime:dev_runtime_password@localhost:5432/ayman_platform_dev" \
  -c "DROP TABLE app.lessons;"
```
Expected: `ERROR: must be owner of table lessons`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): content schema — courses, sections, lessons, video/text/attachment payloads"
```

---

## Task 4: Entitlement — access grants, not a boolean

Everything is free. That is a **row**, not an `if`.

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (add `AccessGrant`, `Enrollment`, their enums)
- Create: `apps/api/prisma/migrations/*_entitlement_constraints/migration.sql`
- Create: `apps/api/src/modules/entitlement/{entitlement.module.ts,entitlement.service.ts,enrollment.controller.ts}`
- Create: `apps/api/src/modules/entitlement/entitlement.service.spec.ts`
- Modify: `apps/api/src/auth/permissions.ts`

**Interfaces:**
- Consumes: `PrismaService`, `@RequirePermission`, `@CurrentUser`.
- Produces:
  - `type CourseAccess = { allowed: true; grantId: string; scope: AccessScope; validUntil: Date | null } | { allowed: false; reason: 'no_grant' | 'expired' | 'not_yet_valid' | 'revoked' | 'course_not_published' }`
  - `EntitlementService.ensurePlatformGrant(userId: string): Promise<AccessGrantRow>`
  - `EntitlementService.resolveCourseAccess(userId: string, courseId: string): Promise<CourseAccess>`
  - `POST /api/courses/:courseId/enroll` → `{ enrollmentId: string; access: CourseAccess }`
  - `GET /api/enrollments` → the caller's own enrollments only

- [ ] **Step 1: Add the models**

```prisma
/// RECONCILED: this is the canonical set. Plan 4's draft used
/// `active|expired|revoked|completed` and Plan 3's used
/// `active|suspended|completed|cancelled`; the union below is what ships, and
/// `@@map` is present on every enum in this block so the raw SQL in Plan 4's
/// heartbeat service can cast to a predictable snake_case type name.
///
/// `status` deliberately stays `active` when a course is finished — only
/// `completedAt` is set. Flipping to `completed` would drop the enrollment out
/// of every `status: 'active'` ownership filter in Plans 4 and 5, i.e.
/// finishing a course would revoke access to it.
enum EnrollmentStatus {
  active
  suspended
  expired
  revoked
  completed

  @@map("enrollment_status")
  @@schema("app")
}

/// How the enrollment came to exist. v1 only ever writes `free`; the rest exist
/// so the access-code and checkout flows are additive later.
enum EnrollmentSource {
  free
  manual
  purchase
  coupon
  code

  @@map("enrollment_source")
  @@schema("app")
}

/// §6.6. Even though everything is free, entitlement is an OBJECT with a scope
/// and a validity window. "Free for everyone" is expressed as one platform-scoped
/// grant per user, created lazily on first enrollment — not as
/// `if (course.priceCents === 0) return true`. Turning a boolean `hasCourse`
/// into this shape after launch is a data migration across every enrollment;
/// shipping the shape now costs one table.
enum AccessScope {
  platform
  course
  subject_teacher
  unassigned

  @@map("access_scope")
  @@schema("app")
}

/// Where the grant came from. RECONCILED: Plan 4's draft called this enum
/// `AccessSource` with `free|manual|purchase|coupon|code|scholarship`. The name
/// `GrantSource` (Plan 3, earliest) wins; the value set below is the union, so
/// Plan 4 never needs an `ALTER TYPE`. v1 only writes `auto_free`.
enum GrantSource {
  auto_free
  admin
  access_code
  purchase
  coupon
  scholarship

  @@map("grant_source")
  @@schema("app")
}

/// Reserved so a scholarship grant is a row, not a schema change. Unused in v1.
enum ScholarshipKind {
  orphans
  financial
  twinz

  @@map("scholarship_kind")
  @@schema("app")
}

model AccessGrant {
  id              String           @id @default(uuid(7))
  userId          String           @map("user_id")
  scope           AccessScope
  courseId        String?          @map("course_id")
  subjectId       String?          @map("subject_id")
  /// Reserved for the `subject_teacher` scope. No FK in v1 — there is exactly
  /// one instructor and adding the FK later is one statement against NULLs.
  instructorId    String?          @map("instructor_id")
  source          GrantSource
  scholarshipKind ScholarshipKind? @map("scholarship_kind")
  validFrom       DateTime         @default(now()) @map("valid_from")
  /// NULL = open-ended. v1 always writes NULL; the column is what makes a
  /// term-limited grant a data change instead of a schema change.
  /// RECONCILED: Plan 4's draft called this `validTo`. `validUntil` wins.
  validUntil      DateTime?        @map("valid_until")
  revokedAt       DateTime?        @map("revoked_at")
  grantedByUserId String?          @map("granted_by_user_id")
  note            String?
  createdAt       DateTime         @default(now()) @map("created_at")

  user      User     @relation("AccessGrantSubject", fields: [userId], references: [id], onDelete: Cascade)
  grantedBy User?    @relation("AccessGrantIssuer", fields: [grantedByUserId], references: [id], onDelete: SetNull)
  course    Course?  @relation(fields: [courseId], references: [id], onDelete: Cascade)
  subject   Subject? @relation(fields: [subjectId], references: [id], onDelete: Cascade)

  @@index([userId, scope])
  @@index([courseId])
  @@map("access_grants")
  @@schema("app")
}

/// RECONCILED — this is the union of Plan 3's and Plan 4's drafts, declared
/// once, here. Plan 4 Task 2 adds ONLY the `progress LessonProgress[]`
/// back-relation to it; it does not re-declare the model and it does not
/// ALTER TABLE it.
///
/// `progressPercent` is DERIVED — completed published lessons ÷ published
/// lessons × 100 — recomputed by Plan 4's `CourseProgressService.recalculate`
/// only on a completion transition, never on a heartbeat. It is 0 until Plan 4
/// lands, which is correct and not a bug.
model Enrollment {
  id              String           @id @default(uuid(7))
  userId          String           @map("user_id")
  courseId        String           @map("course_id")
  source          EnrollmentSource @default(free)
  status          EnrollmentStatus @default(active)
  enrolledAt      DateTime         @default(now()) @map("enrolled_at")
  expiresAt       DateTime?        @map("expires_at")
  completedAt     DateTime?        @map("completed_at")
  progressPercent Decimal          @default(0) @map("progress_percent") @db.Decimal(5, 2)
  /// Powers resume + continue-watching (Plan 4). Written on every lesson open.
  lastLessonId    String?          @map("last_lesson_id")
  createdAt       DateTime         @default(now()) @map("created_at")
  updatedAt       DateTime         @updatedAt @map("updated_at")

  user       User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  course     Course  @relation(fields: [courseId], references: [id], onDelete: Cascade)
  lastLesson Lesson? @relation("EnrollmentLastLesson", fields: [lastLessonId], references: [id], onDelete: SetNull)

  @@unique([userId, courseId])
  @@index([userId, status])
  @@index([courseId, status])
  @@map("enrollments")
  @@schema("app")
}
```

Add the `Lesson` back-relation for the resume pointer (Prisma requires both sides):
```prisma
// model Lesson — inside the relation block
  resumedBy Enrollment[] @relation("EnrollmentLastLesson")
```

Add the `Subject` back-relations too:
```prisma
// model Subject — inside the relation block
  accessGrants AccessGrant[]
```

- [ ] **Step 2: Migrate and add the grant constraints**

```bash
pnpm --filter @ayman/api exec prisma migrate dev --name entitlement
pnpm --filter @ayman/api exec prisma migrate dev --create-only --name entitlement_constraints
```

Paste into the second migration:

```sql
-- A grant's scope determines which target column must be populated. Without
-- this, a `platform` grant carrying a course_id reads as course-scoped to one
-- query and platform-scoped to another.
ALTER TABLE "app"."access_grants"
  ADD CONSTRAINT "access_grants_scope_target" CHECK (
       ("scope" = 'platform'        AND "course_id" IS NULL     AND "subject_id" IS NULL)
    OR ("scope" = 'course'          AND "course_id" IS NOT NULL AND "subject_id" IS NULL)
    OR ("scope" = 'subject_teacher' AND "subject_id" IS NOT NULL AND "course_id" IS NULL)
    OR ("scope" = 'unassigned'      AND "course_id" IS NULL     AND "subject_id" IS NULL)
  );

ALTER TABLE "app"."access_grants"
  ADD CONSTRAINT "access_grants_window_ordered"
  CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from");

-- One live platform grant per user. Postgres treats NULLs as distinct, so this
-- has to be a PARTIAL unique index — a plain UNIQUE(user_id) would also block
-- re-granting after a revoke, which is a legitimate operation.
CREATE UNIQUE INDEX "access_grants_one_live_platform_per_user"
  ON "app"."access_grants" ("user_id")
  WHERE "scope" = 'platform' AND "revoked_at" IS NULL;
```

```bash
pnpm --filter @ayman/api exec prisma migrate dev
pnpm --filter @ayman/api exec prisma generate
```

- [ ] **Step 3: Add the permissions**

`apps/api/src/auth/permissions.ts` — replace the `student` entry and keep `admin: '*'`:

```ts
const ROLE_PERMISSIONS: Record<Role, ReadonlySet<string> | '*'> = {
  admin: '*',
  student: new Set([
    'profile:read',
    'profile:write',
    'course:read',
    'enrollment:read',
    'enrollment:create',
  ]),
};
```

Nothing anywhere gains a role equality check. `course:create`, `course:update`,
`course:publish`, `course:delete`, `section:write`, `section:reorder`,
`lesson:write`, `lesson:reorder` are held only through `admin: '*'`, so adding an
`editor` role later is one entry in this map and zero changes elsewhere.

- [ ] **Step 4: Write the failing test**

Create `apps/api/src/modules/entitlement/entitlement.service.spec.ts`:

```ts
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementService } from './entitlement.service';

// Integration test against the real database. A mock here would only prove the
// mock matches itself, and the partial unique index is half the behaviour.
describe('EntitlementService', () => {
  let prisma: PrismaService;
  let service: EntitlementService;
  let userId: string;
  let courseId: string;
  let otherCourseId: string;

  beforeAll(async () => {
    prisma = new PrismaClient() as unknown as PrismaService;
    await prisma.$connect();
    service = new EntitlementService(prisma);

    const suffix = Date.now().toString(36);
    const user = await prisma.user.create({
      data: { id: `ent-${suffix}`, name: 'طالب', email: `ent-${suffix}@example.com` },
    });
    userId = user.id;

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    const base = {
      systemId: system.id,
      year: 2,
      trackId: null,
      subjectId: subject.id,
      instructorId: user.id,
      title: 'كورس',
    };
    const course = await prisma.course.create({
      data: { ...base, slug: `ent-a-${suffix}`, status: 'published', publishedAt: new Date() },
    });
    const other = await prisma.course.create({ data: { ...base, slug: `ent-b-${suffix}` } });
    courseId = course.id;
    otherCourseId = other.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('denies with a reason object, never a bare false, before any grant exists', async () => {
    const access = await service.resolveCourseAccess(userId, courseId);
    expect(access).toEqual({ allowed: false, reason: 'no_grant' });
  });

  it('expresses "free for everyone" as a platform grant row', async () => {
    const grant = await service.ensurePlatformGrant(userId);
    expect(grant.scope).toBe('platform');
    expect(grant.source).toBe('auto_free');
    expect(grant.courseId).toBeNull();
    expect(grant.validUntil).toBeNull();

    const access = await service.resolveCourseAccess(userId, courseId);
    expect(access).toMatchObject({ allowed: true, scope: 'platform', grantId: grant.id });
  });

  it('is idempotent — a second call returns the same row, not a duplicate', async () => {
    const first = await service.ensurePlatformGrant(userId);
    const second = await service.ensurePlatformGrant(userId);
    expect(second.id).toBe(first.id);

    const live = await prisma.accessGrant.count({
      where: { userId, scope: 'platform', revokedAt: null },
    });
    expect(live).toBe(1);
  });

  it('reports expiry and revocation distinctly, not as a generic denial', async () => {
    const grant = await service.ensurePlatformGrant(userId);

    await prisma.accessGrant.update({
      where: { id: grant.id },
      data: { validFrom: new Date(Date.now() - 20_000), validUntil: new Date(Date.now() - 10_000) },
    });
    expect(await service.resolveCourseAccess(userId, courseId)).toEqual({
      allowed: false,
      reason: 'expired',
    });

    await prisma.accessGrant.update({
      where: { id: grant.id },
      data: { validUntil: null, revokedAt: new Date() },
    });
    expect(await service.resolveCourseAccess(userId, courseId)).toEqual({
      allowed: false,
      reason: 'revoked',
    });

    await prisma.accessGrant.update({ where: { id: grant.id }, data: { revokedAt: null } });
  });

  it('honours a course-scoped grant only for its own course', async () => {
    await prisma.accessGrant.updateMany({
      where: { userId, scope: 'platform' },
      data: { revokedAt: new Date() },
    });
    const scoped = await prisma.accessGrant.create({
      data: { userId, scope: 'course', courseId, source: 'admin' },
    });

    expect(await service.resolveCourseAccess(userId, courseId)).toMatchObject({
      allowed: true,
      scope: 'course',
      grantId: scoped.id,
    });
    expect(await service.resolveCourseAccess(userId, otherCourseId)).toEqual({
      allowed: false,
      reason: 'no_grant',
    });
  });

  it('refuses to grant access to a course that is not published', async () => {
    await service.ensurePlatformGrant(userId);
    expect(await service.resolveCourseAccess(userId, otherCourseId)).toEqual({
      allowed: false,
      reason: 'course_not_published',
    });
  });

  it('lets the database, not the application, decide the duplicate-grant race', async () => {
    await expect(
      prisma.accessGrant.create({ data: { userId, scope: 'platform', source: 'admin' } }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 5: Run it, confirm it fails**

```bash
pnpm --filter @ayman/api test entitlement
```
Expected: FAIL — `Cannot find module './entitlement.service'`.

- [ ] **Step 6: Implement `apps/api/src/modules/entitlement/entitlement.service.ts`**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccessGrant, AccessScope } from '../../generated/prisma/client';

/**
 * The return type is an OBJECT in both directions. A `boolean` here is the seed
 * of every "why can't this student see the course?" support ticket, and it is
 * the shape §6.6 exists to prevent — a denial that cannot say why is a denial
 * nobody can debug, and an approval that cannot say which grant produced it is
 * an approval nobody can audit.
 */
export type CourseAccess =
  | { allowed: true; grantId: string; scope: AccessScope; validUntil: Date | null }
  | {
      allowed: false;
      reason: 'no_grant' | 'not_yet_valid' | 'expired' | 'revoked' | 'course_not_published';
    };

/** Human-readable provenance on the auto-created grant, for the audit trail. */
const FREE_PLATFORM_NOTE = 'auto: v1 is free for every registered student';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

@Injectable()
export class EntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * "Free for everyone" as a row. Created lazily on first enrollment rather
   * than at registration, so the grant's `validFrom` records when the student
   * actually started using the platform.
   */
  async ensurePlatformGrant(userId: string): Promise<AccessGrant> {
    const existing = await this.prisma.accessGrant.findFirst({
      where: { userId, scope: 'platform', revokedAt: null },
    });
    if (existing) return existing;

    try {
      return await this.prisma.accessGrant.create({
        data: { userId, scope: 'platform', source: 'auto_free', note: FREE_PLATFORM_NOTE },
      });
    } catch (error) {
      // Two concurrent first-enrollments race here. The partial unique index is
      // what decides; the loser simply re-reads the winner's row. Catching the
      // violation is correct — checking-then-creating is not atomic.
      if (!isUniqueViolation(error)) throw error;
      return this.prisma.accessGrant.findFirstOrThrow({
        where: { userId, scope: 'platform', revokedAt: null },
      });
    }
  }

  /**
   * Ownership is compiled into the query: `userId` is in the WHERE clause, so
   * there is no fetch-then-check step to forget. The validity window is
   * evaluated in code (not in SQL) purely so the denial can name a reason —
   * the actor scoping is still done by the database.
   */
  async resolveCourseAccess(userId: string, courseId: string): Promise<CourseAccess> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, status: true, subjectId: true },
    });
    if (!course) throw new NotFoundException();
    if (course.status !== 'published') {
      return { allowed: false, reason: 'course_not_published' };
    }

    const grants = await this.prisma.accessGrant.findMany({
      where: {
        userId,
        OR: [
          { scope: 'platform' },
          { scope: 'course', courseId },
          { scope: 'subject_teacher', subjectId: course.subjectId },
        ],
      },
      orderBy: [{ validFrom: 'desc' }, { id: 'desc' }],
      select: { id: true, scope: true, validFrom: true, validUntil: true, revokedAt: true },
    });

    if (grants.length === 0) return { allowed: false, reason: 'no_grant' };

    const now = new Date();
    // Report the most specific failure we saw, in severity order, so the admin
    // UI can say "انتهت صلاحية الاشتراك" rather than "لا يوجد اشتراك".
    let fallback: CourseAccess = { allowed: false, reason: 'no_grant' };

    for (const grant of grants) {
      if (grant.revokedAt !== null) {
        fallback = { allowed: false, reason: 'revoked' };
        continue;
      }
      if (grant.validFrom > now) {
        fallback = { allowed: false, reason: 'not_yet_valid' };
        continue;
      }
      if (grant.validUntil !== null && grant.validUntil <= now) {
        fallback = { allowed: false, reason: 'expired' };
        continue;
      }
      return {
        allowed: true,
        grantId: grant.id,
        scope: grant.scope,
        validUntil: grant.validUntil,
      };
    }

    return fallback;
  }

  /** Enroll, creating the platform grant if this is the student's first course. */
  async enroll(userId: string, courseId: string): Promise<{ enrollmentId: string; access: CourseAccess }> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, status: true },
    });
    if (!course || course.status !== 'published') throw new NotFoundException();

    await this.ensurePlatformGrant(userId);

    const enrollment = await this.prisma.enrollment.upsert({
      where: { userId_courseId: { userId, courseId } },
      create: { userId, courseId },
      update: { status: 'active' },
      select: { id: true },
    });

    return { enrollmentId: enrollment.id, access: await this.resolveCourseAccess(userId, courseId) };
  }

  /** The caller's own enrollments. `userId` comes from the session, never the URL. */
  listOwnEnrollments(userId: string) {
    return this.prisma.enrollment.findMany({
      where: { userId, status: { in: ['active', 'completed'] } },
      orderBy: [{ enrolledAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        course: { select: { id: true, slug: true, title: true, coverKey: true } },
      },
    });
  }
}
```

- [ ] **Step 7: Controller and module**

`apps/api/src/modules/entitlement/enrollment.controller.ts`:
```ts
import { Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { EntitlementService } from './entitlement.service';

@Controller()
export class EnrollmentController {
  constructor(private readonly entitlement: EntitlementService) {}

  /** `user.id` comes from the session. There is no user id in this route at all. */
  @RequirePermission('enrollment:create')
  @Post('courses/:courseId/enroll')
  enroll(@CurrentUser() user: AuthenticatedUser, @Param('courseId') courseId: string) {
    return this.entitlement.enroll(user.id, courseId);
  }

  @RequirePermission('enrollment:read')
  @Get('enrollments')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.entitlement.listOwnEnrollments(user.id);
  }
}
```

`apps/api/src/modules/entitlement/entitlement.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { EnrollmentController } from './enrollment.controller';
import { EntitlementService } from './entitlement.service';

@Module({
  controllers: [EnrollmentController],
  providers: [EntitlementService],
  exports: [EntitlementService],
})
export class EntitlementModule {}
```

Register `EntitlementModule` in `apps/api/src/app.module.ts`'s `imports`.

- [ ] **Step 8: Run the tests, confirm green**

```bash
pnpm --filter @ayman/api test entitlement
```
Expected: PASS — 7 tests.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma apps/api/src/modules/entitlement apps/api/src/auth/permissions.ts apps/api/src/app.module.ts
git commit -m "feat(api): access grants and enrollments — entitlement is an object, not a boolean"
```

---

## Task 5: Content and catalog contracts + Arabic copy

**Files:**
- Create: `packages/contracts/src/content.ts`, `packages/contracts/src/content.spec.ts`
- Create: `packages/contracts/src/catalog.ts`
- Modify: `packages/contracts/src/copy/ar.ts`, `packages/contracts/src/index.ts`, `packages/contracts/package.json`

**Interfaces:**
- Consumes: `zod` only. Both files are **self-contained** (no relative imports) so `apps/api` can import `@ayman/contracts/content` and `@ayman/contracts/catalog` as runtime values.
- Produces:
  - Write side: `CourseCreateSchema`, `CourseUpdateSchema`, `CourseStatusPatchSchema`, `SectionCreateSchema`, `SectionUpdateSchema`, `LessonCreateSchema`, `LessonUpdateSchema`, `LessonTextInputSchema`, `LessonAttachmentInputSchema`, `ReorderSchema`
  - Read side: `CatalogCourseSchema`, `CatalogListSchema`, `CatalogCourseDetailSchema`, `CatalogSectionSchema`, `CatalogLessonSchema` + inferred types
  - `copy.catalog`, `copy.course`, `copy.admin`

- [ ] **Step 1: Create `packages/contracts/src/content.ts`**

```ts
import { z } from 'zod';

export const CourseStatusSchema = z.enum(['draft', 'published', 'archived']);
export const LessonKindSchema = z.enum(['video', 'quiz', 'attachment', 'text']);
export const CompletionModeSchema = z.enum(['none', 'manual', 'on_view', 'on_grade', 'on_pass']);

export type CourseStatus = z.infer<typeof CourseStatusSchema>;
export type LessonKind = z.infer<typeof LessonKindSchema>;
export type CompletionMode = z.infer<typeof CompletionModeSchema>;

/**
 * Latin, lowercase, hyphenated. Arabic slugs percent-encode into unreadable
 * URLs that break in every share sheet, so the title is Arabic and the slug is
 * not. Reserved words are rejected so a course can never shadow a route.
 */
const RESERVED_SLUGS = new Set(['new', 'edit', 'admin', 'api', 'dev', 'me', 'sitemap', 'robots']);

export const SlugSchema = z
  .string()
  .min(3)
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'المُعرّف لازم يكون حروف إنجليزي صغيرة وأرقام وشرطات بس')
  .refine((value) => !RESERVED_SLUGS.has(value), 'المُعرّف ده محجوز');

/**
 * The writable surface of a course. `status`, `publishedAt`, `instructorId`,
 * `position` and every timestamp are ABSENT on purpose — publishing is a
 * separate endpoint behind a separate permission, and `.strict()` turns an
 * attempt to smuggle `status: 'published'` through the edit endpoint into a
 * 400 rather than a silent strip.
 */
const courseWritableShape = {
  slug: SlugSchema,
  title: z.string().min(3).max(160),
  subtitle: z.string().max(240).nullable().default(null),
  description: z.string().max(4000).nullable().default(null),
  systemId: z.uuid(),
  year: z.number().int().min(1).max(3),
  trackId: z.uuid().nullable().default(null),
  subjectId: z.uuid(),
  coverKey: z.string().max(255).nullable().default(null),
};

/** Mirrors the courses_year1_has_no_track CHECK so the form fails before the DB does. */
const year1HasNoTrack = (value: { year?: number; trackId?: string | null }): boolean =>
  value.year !== 1 || value.trackId == null;

export const CourseCreateSchema = z
  .object(courseWritableShape)
  .strict()
  .refine(year1HasNoTrack, { message: 'الصف الأول مالوش مسار', path: ['trackId'] });

export const CourseUpdateSchema = z
  .object(courseWritableShape)
  .strict()
  .partial()
  .refine(year1HasNoTrack, { message: 'الصف الأول مالوش مسار', path: ['trackId'] });

/** The ONLY way status changes. Guarded by `course:publish`, not `course:update`. */
export const CourseStatusPatchSchema = z.object({ status: CourseStatusSchema }).strict();

const sectionWritableShape = {
  title: z.string().min(2).max(160),
  summary: z.string().max(1000).nullable().default(null),
  isPublished: z.boolean().default(false),
};

export const SectionCreateSchema = z.object(sectionWritableShape).strict();
export const SectionUpdateSchema = z.object(sectionWritableShape).strict().partial();

/**
 * `position` is absent: the server appends at the end and the reorder endpoint
 * is the only thing that writes positions. A client that could set `position`
 * could also produce two lessons at position 3.
 *
 * `visibleFrom`, `visibleTo`, `unlocksAfterLessonId`, `viewLimit` and
 * `contentGroupId` are absent because v1 does not ENFORCE them (Global
 * Constraint 17). `.strict()` means sending one is a 400 — an admin cannot come
 * away believing they scheduled a lesson that nothing will actually hide.
 */
const lessonWritableShape = {
  title: z.string().min(2).max(200),
  kind: LessonKindSchema,
  isPublished: z.boolean().default(false),
  isFreePreview: z.boolean().default(false),
  estimatedSeconds: z.number().int().min(0).max(24 * 60 * 60).default(0),
  completionMode: CompletionModeSchema.default('manual'),
  completionMinViewSeconds: z.number().int().min(0).nullable().default(null),
  completionPassGrade: z.number().min(0).max(100).nullable().default(null),
};

const completionRuleIsCoherent = (value: {
  completionMode?: CompletionMode;
  completionMinViewSeconds?: number | null;
  completionPassGrade?: number | null;
}): boolean => {
  if (value.completionMode === 'on_view') return value.completionMinViewSeconds != null;
  if (value.completionMode === 'on_grade' || value.completionMode === 'on_pass') {
    return value.completionPassGrade != null;
  }
  return true;
};

export const LessonCreateSchema = z
  .object(lessonWritableShape)
  .strict()
  .refine(completionRuleIsCoherent, {
    message: 'قاعدة إتمام الدرس ناقصة قيمتها',
    path: ['completionMode'],
  });

export const LessonUpdateSchema = z
  .object(lessonWritableShape)
  .strict()
  .partial()
  .refine(completionRuleIsCoherent, {
    message: 'قاعدة إتمام الدرس ناقصة قيمتها',
    path: ['completionMode'],
  });

/** 64 KiB. Larger than any real lesson, small enough that a paste bomb is a 400. */
export const MAX_RICH_TEXT_CHARS = 65_536;

export const LessonTextInputSchema = z
  .object({ bodyHtml: z.string().min(1).max(MAX_RICH_TEXT_CHARS) })
  .strict();

export const LessonAttachmentInputSchema = z
  .object({
    storageKey: z.string().min(1).max(255),
    filename: z.string().min(1).max(255),
    mime: z.string().min(3).max(127),
    sizeBytes: z.number().int().positive().max(200 * 1024 * 1024),
  })
  .strict();

/**
 * The whole ordered array, in one request. Not a `{id, from, to}` delta and not
 * one request per moved row: dragging one lesson from position 1 to position 40
 * changes 40 positions, and 40 requests is 40 chances to interleave with another
 * editor and leave the section in a state neither of them intended.
 */
export const ReorderSchema = z
  .object({
    orderedIds: z
      .array(z.uuid())
      .min(1)
      .max(500)
      .refine((ids) => new Set(ids).size === ids.length, 'فيه عنصر متكرر في الترتيب'),
  })
  .strict();

export type CourseCreateInput = z.infer<typeof CourseCreateSchema>;
export type CourseUpdateInput = z.infer<typeof CourseUpdateSchema>;
export type CourseStatusPatchInput = z.infer<typeof CourseStatusPatchSchema>;
export type SectionCreateInput = z.infer<typeof SectionCreateSchema>;
export type SectionUpdateInput = z.infer<typeof SectionUpdateSchema>;
export type LessonCreateInput = z.infer<typeof LessonCreateSchema>;
export type LessonUpdateInput = z.infer<typeof LessonUpdateSchema>;
export type LessonTextInput = z.infer<typeof LessonTextInputSchema>;
export type LessonAttachmentInput = z.infer<typeof LessonAttachmentInputSchema>;
export type ReorderInput = z.infer<typeof ReorderSchema>;
```

- [ ] **Step 2: Write the failing test**

Create `packages/contracts/src/content.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CourseCreateSchema,
  CourseStatusPatchSchema,
  CourseUpdateSchema,
  LessonCreateSchema,
  ReorderSchema,
  SlugSchema,
} from './content';

const uuid = () => crypto.randomUUID();

const validCourse = () => ({
  slug: 'programming-year-2',
  title: 'البرمجة وعلوم الحاسب — الصف الثاني',
  subtitle: null,
  description: null,
  systemId: uuid(),
  year: 2,
  trackId: uuid(),
  subjectId: uuid(),
  coverKey: null,
});

describe('SlugSchema', () => {
  it.each(['abc', 'programming-year-2', 'a1-b2-c3'])('accepts %s', (value) => {
    expect(SlugSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    'ab',
    'Programming',
    'has space',
    'trailing-',
    '-leading',
    'double--hyphen',
    'برمجة',
    'new',
    'admin',
  ])('rejects %s', (value) => {
    expect(SlugSchema.safeParse(value).success).toBe(false);
  });
});

describe('CourseCreateSchema', () => {
  it('accepts a well-formed course', () => {
    expect(CourseCreateSchema.safeParse(validCourse()).success).toBe(true);
  });

  it('rejects a grade-1 course carrying a track', () => {
    const result = CourseCreateSchema.safeParse({ ...validCourse(), year: 1 });
    expect(result.success).toBe(false);
  });

  it('accepts a grade-1 course with no track', () => {
    const result = CourseCreateSchema.safeParse({ ...validCourse(), year: 1, trackId: null });
    expect(result.success).toBe(true);
  });

  it('REJECTS status rather than stripping it — publishing has its own endpoint', () => {
    const result = CourseCreateSchema.safeParse({ ...validCourse(), status: 'published' });
    expect(result.success).toBe(false);
  });

  it('rejects a smuggled instructorId, publishedAt or id', () => {
    for (const extra of [{ instructorId: uuid() }, { publishedAt: new Date().toISOString() }, { id: uuid() }]) {
      expect(CourseCreateSchema.safeParse({ ...validCourse(), ...extra }).success).toBe(false);
    }
  });
});

describe('CourseUpdateSchema', () => {
  it('stays strict after .partial()', () => {
    expect(CourseUpdateSchema.safeParse({ title: 'جديد' }).success).toBe(true);
    expect(CourseUpdateSchema.safeParse({ status: 'published' }).success).toBe(false);
  });
});

describe('CourseStatusPatchSchema', () => {
  it('takes status and nothing else', () => {
    expect(CourseStatusPatchSchema.safeParse({ status: 'published' }).success).toBe(true);
    expect(CourseStatusPatchSchema.safeParse({ status: 'published', title: 'x' }).success).toBe(false);
    expect(CourseStatusPatchSchema.safeParse({ status: 'live' }).success).toBe(false);
  });
});

describe('LessonCreateSchema', () => {
  const base = { title: 'المحاضرة الأولى', kind: 'video' as const };

  it('defaults completionMode to manual and position is not accepted at all', () => {
    const parsed = LessonCreateSchema.parse(base);
    expect(parsed.completionMode).toBe('manual');
    expect(LessonCreateSchema.safeParse({ ...base, position: 0 }).success).toBe(false);
  });

  it.each(['visibleFrom', 'visibleTo', 'unlocksAfterLessonId', 'viewLimit', 'contentGroupId'])(
    'rejects the reserved-but-unenforced field %s instead of silently ignoring it',
    (field) => {
      const payload = { ...base, [field]: field === 'viewLimit' ? 3 : new Date().toISOString() };
      expect(LessonCreateSchema.safeParse(payload).success).toBe(false);
    },
  );

  it('requires a threshold when completion depends on one', () => {
    expect(LessonCreateSchema.safeParse({ ...base, completionMode: 'on_view' }).success).toBe(false);
    expect(
      LessonCreateSchema.safeParse({ ...base, completionMode: 'on_view', completionMinViewSeconds: 60 })
        .success,
    ).toBe(true);
    expect(LessonCreateSchema.safeParse({ ...base, completionMode: 'on_pass' }).success).toBe(false);
    expect(
      LessonCreateSchema.safeParse({ ...base, completionMode: 'on_pass', completionPassGrade: 70 })
        .success,
    ).toBe(true);
  });
});

describe('ReorderSchema', () => {
  it('accepts a full ordered array', () => {
    const ids = Array.from({ length: 40 }, () => uuid());
    expect(ReorderSchema.safeParse({ orderedIds: ids }).success).toBe(true);
  });

  it('rejects duplicates, empties, and anything alongside orderedIds', () => {
    const id = uuid();
    expect(ReorderSchema.safeParse({ orderedIds: [id, id] }).success).toBe(false);
    expect(ReorderSchema.safeParse({ orderedIds: [] }).success).toBe(false);
    expect(ReorderSchema.safeParse({ orderedIds: [id], sectionId: uuid() }).success).toBe(false);
  });

  it('rejects non-uuid entries', () => {
    expect(ReorderSchema.safeParse({ orderedIds: ['1', '2'] }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run it, confirm it fails, then confirm it passes**

```bash
pnpm --filter @ayman/contracts test content
```
Expected first: FAIL (`Failed to resolve import "./content"`). After Step 1's file exists: PASS — 6 describe blocks.

- [ ] **Step 4: Create `packages/contracts/src/catalog.ts`**

```ts
import { z } from 'zod';

/**
 * The PUBLIC read shapes. Anything absent here is absent from the wire — this
 * file is the allowlist the catalog serializer is tested against, which is why
 * it does not simply mirror the Prisma models. `status`, `priceCents`,
 * `instructorId`, `coverKey`-adjacent internals and every draft row stop here.
 */
export const CatalogLessonSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  kind: z.enum(['video', 'quiz', 'attachment', 'text']),
  estimatedSeconds: z.number().int().min(0),
  isFreePreview: z.boolean(),
  /** Present only for video lessons that are free previews. Never a URL. */
  videoExternalId: z.string().regex(/^[A-Za-z0-9_-]{11}$/).nullable(),
  durationSeconds: z.number().int().min(0).nullable(),
});

export const CatalogSectionSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  summary: z.string().nullable(),
  lessons: z.array(CatalogLessonSchema),
});

export const CatalogCourseSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  systemSlug: z.string(),
  systemNameAr: z.string(),
  year: z.number().int().min(1).max(3),
  trackLabelAr: z.string().nullable(),
  subjectNameAr: z.string(),
  coverKey: z.string().nullable(),
  lessonCount: z.number().int().min(0),
  totalSeconds: z.number().int().min(0),
  publishedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const CatalogCourseDetailSchema = CatalogCourseSchema.extend({
  description: z.string().nullable(),
  sections: z.array(CatalogSectionSchema),
});

export const CatalogListSchema = z.object({
  courses: z.array(CatalogCourseSchema),
  total: z.number().int().min(0),
});

export type CatalogLesson = z.infer<typeof CatalogLessonSchema>;
export type CatalogSection = z.infer<typeof CatalogSectionSchema>;
export type CatalogCourse = z.infer<typeof CatalogCourseSchema>;
export type CatalogCourseDetail = z.infer<typeof CatalogCourseDetailSchema>;
export type CatalogList = z.infer<typeof CatalogListSchema>;
```

- [ ] **Step 5: Add the copy**

`packages/contracts/src/copy/ar.ts` — insert these keys inside the `copy` object, before `} as const`:

```ts
  catalog: {
    eyebrow: '03 / الكورسات',
    title: 'الكورسات',
    subtitle: 'كل محاضرات البرمجة وعلوم الحاسب، مرتبة بالصف والمسار',
    empty: 'مفيش كورسات منشورة لسه',
    lessonCount: 'محاضرة',
    duration: 'المدة',
    minutes: 'دقيقة',
    hours: 'ساعة',
    freePreview: 'معاينة مجانية',
    free: 'مجاني',
    open: 'افتح الكورس',
  },
  course: {
    breadcrumbHome: 'الرئيسية',
    breadcrumbCatalog: 'الكورسات',
    content: 'محتوى الكورس',
    about: 'عن الكورس',
    instructor: 'المُحاضر',
    start: 'ابدأ الكورس',
    continue: 'كمّل الكورس',
    enrolled: 'إنت مشترك في الكورس ده',
    notFound: 'الكورس ده مش موجود',
    lessonKind: {
      video: 'فيديو',
      quiz: 'اختبار',
      attachment: 'مرفق',
      text: 'قراءة',
    },
  },
  admin: {
    nav: {
      dashboard: 'لوحة التحكم',
      content: 'المحتوى',
      courses: 'الكورسات',
    },
    common: {
      create: 'إضافة',
      save: 'حفظ',
      saving: 'جارٍ الحفظ',
      saved: 'اتحفظ',
      saveFailed: 'الحفظ فشل — التغييرات اترجعت زي ما كانت',
      cancel: 'إلغاء',
      delete: 'حذف',
      deleteConfirm: 'متأكد؟ الإجراء ده مش هيترجع.',
      required: 'الحقل ده مطلوب',
    },
    course: {
      listTitle: 'الكورسات',
      new: 'كورس جديد',
      edit: 'تعديل الكورس',
      slug: 'المُعرّف في الرابط',
      slugHint: 'حروف إنجليزي صغيرة وأرقام وشرطات — ده اللي بيظهر في العنوان',
      title: 'اسم الكورس',
      subtitle: 'وصف مختصر',
      description: 'الوصف',
      system: 'النظام الدراسي',
      year: 'الصف الدراسي',
      track: 'المسار',
      trackNoneYear1: 'الصف الأول مالوش مسار',
      subject: 'المادة',
      status: 'الحالة',
      statusDraft: 'مسودة',
      statusPublished: 'منشور',
      statusArchived: 'مؤرشف',
      publish: 'نشر',
      unpublish: 'رجّعه مسودة',
      publishBlocked: 'لازم يكون فيه محاضرة منشورة واحدة على الأقل',
      empty: 'مفيش كورسات لسه',
    },
    section: {
      new: 'قسم جديد',
      title: 'اسم القسم',
      summary: 'نبذة',
      empty: 'مفيش أقسام لسه',
    },
    lesson: {
      new: 'محاضرة جديدة',
      title: 'عنوان المحاضرة',
      kind: 'النوع',
      freePreview: 'معاينة مجانية',
      estimatedSeconds: 'المدة التقديرية بالثواني',
      videoUrl: 'رابط يوتيوب',
      videoUrlHint: 'بناخد كود الفيديو (11 حرف) بس — الباقي بيتشال ومحدش بيفتح الرابط',
      videoUrlInvalid: 'الرابط ده مش رابط يوتيوب صالح',
      durationSeconds: 'مدة الفيديو بالثواني',
      body: 'محتوى الدرس',
      empty: 'مفيش محاضرات في القسم ده',
    },
    reorder: {
      hint: 'اسحب لإعادة الترتيب، أو استخدم زر المسافة والأسهم من الكيبورد',
      handle: 'مقبض السحب',
      pickedUp: 'اتمسكت المحاضرة في الترتيب رقم',
      movedOver: 'بقت في الترتيب رقم',
      dropped: 'اتسابت في الترتيب رقم',
      cancelled: 'اتلغى السحب والترتيب رجع زي ما كان',
    },
  },
```

- [ ] **Step 6: Wire the exports**

`packages/contracts/src/index.ts`:
```ts
export * from './content';
export * from './catalog';
```

`packages/contracts/package.json` exports:
```json
    "./video": "./src/video.ts",
    "./content": "./src/content.ts",
    "./catalog": "./src/catalog.ts"
```

- [ ] **Step 7: Verify and commit**

```bash
pnpm --filter @ayman/contracts test
pnpm --filter @ayman/contracts typecheck
git add packages/contracts
git commit -m "feat(contracts): content write schemas, catalog read schemas, and the Arabic copy for both"
```

---

## Task 6: Admin course CRUD

**Files:**
- Create: `apps/api/src/modules/content/dto/course.dto.ts`
- Create: `apps/api/src/modules/content/course.service.ts`, `course.controller.ts`
- Create: `apps/api/src/modules/content/course.service.spec.ts`
- Create: `apps/api/src/modules/content/content.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `CourseCreateSchema`, `CourseUpdateSchema`, `CourseStatusPatchSchema` from `@ayman/contracts/content`; `PrismaService`.
- Produces:
  - `CourseService.create(actorId, input)`, `.update(id, input)`, `.setStatus(id, status)`, `.remove(id)`, `.list()`, `.findForAdmin(id)`
  - `POST/GET /api/admin/courses`, `GET/PATCH/DELETE /api/admin/courses/:id`, `PATCH /api/admin/courses/:id/status`

- [ ] **Step 1: Create the DTOs**

`apps/api/src/modules/content/dto/course.dto.ts`:
```ts
// Imported from the `/content` subpath, not the package root: index.ts
// re-exports through extensionless relative specifiers, which Node's native
// ESM loader cannot resolve at runtime. content.ts has no relative imports of
// its own, so importing it directly sidesteps the barrel. Same reasoning as
// modules/profile/onboarding.dto.ts.
import {
  CourseCreateSchema,
  CourseStatusPatchSchema,
  CourseUpdateSchema,
} from '@ayman/contracts/content';
import { createZodDto } from 'nestjs-zod';

/**
 * Three DTOs, three permissions, on purpose. `CreateCourseDto` and
 * `UpdateCourseDto` contain no `status` field at all, so the only way to publish
 * is through `SetCourseStatusDto` behind `course:publish` — an editor who may
 * fix a typo cannot also push a half-finished course live by adding one key to
 * a PATCH body. Every schema is `.strict()`, so the attempt is a 400, not a
 * silent strip.
 */
export class CreateCourseDto extends createZodDto(CourseCreateSchema) {}
export class UpdateCourseDto extends createZodDto(CourseUpdateSchema) {}
export class SetCourseStatusDto extends createZodDto(CourseStatusPatchSchema) {}
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/modules/content/course.service.spec.ts`:

```ts
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseService } from './course.service';

describe('CourseService', () => {
  let prisma: PrismaService;
  let service: CourseService;
  let adminId: string;
  let systemId: string;
  let trackId: string;
  let subjectId: string;
  let suffix: string;

  beforeAll(async () => {
    prisma = new PrismaClient() as unknown as PrismaService;
    await prisma.$connect();
    service = new CourseService(prisma);

    suffix = Date.now().toString(36);
    const admin = await prisma.user.create({
      data: { id: `crs-${suffix}`, name: 'أيمن', email: `crs-${suffix}@example.com`, role: 'admin' },
    });
    adminId = admin.id;

    // A real offering, so the tuple validation has something legitimate to pass.
    const offering = await prisma.subjectOffering.findFirstOrThrow({
      where: { trackId: { not: null }, year: 2 },
      select: { systemId: true, trackId: true, subjectId: true },
    });
    systemId = offering.systemId;
    trackId = offering.trackId as string;
    subjectId = offering.subjectId;
  });

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { instructorId: adminId } });
    await prisma.user.delete({ where: { id: adminId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const input = (overrides: Record<string, unknown> = {}) => ({
    slug: `course-${suffix}-${Math.random().toString(36).slice(2, 8)}`,
    title: 'البرمجة وعلوم الحاسب',
    subtitle: null,
    description: null,
    systemId,
    year: 2,
    trackId,
    subjectId,
    coverKey: null,
    ...overrides,
  });

  it('creates a draft and stamps the instructor from the session, not the body', async () => {
    const course = await service.create(adminId, input());
    expect(course.status).toBe('draft');
    expect(course.publishedAt).toBeNull();
    expect(course.instructorId).toBe(adminId);
    expect(course.position).toBe(0);
  });

  it('rejects a (system, year, track, subject) tuple with no matching offering', async () => {
    const otherSubject = await prisma.subject.findFirstOrThrow({ where: { id: { not: subjectId } } });
    await expect(
      service.create(adminId, input({ subjectId: otherSubject.id, year: 3 })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a grade-1 course carrying a track, at the service layer too', async () => {
    await expect(service.create(adminId, input({ year: 1 }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('turns a duplicate slug into a 409, not a 500', async () => {
    const slug = `dup-${suffix}`;
    await service.create(adminId, input({ slug }));
    await expect(service.create(adminId, input({ slug }))).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses to publish a course with no published lesson', async () => {
    const course = await service.create(adminId, input());
    await expect(service.setStatus(course.id, 'published')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('stamps publishedAt once and never moves it on republish', async () => {
    const course = await service.create(adminId, input());
    const section = await prisma.courseSection.create({
      data: { courseId: course.id, title: 'قسم', position: 0, isPublished: true },
    });
    await prisma.lesson.create({
      data: {
        courseId: course.id,
        sectionId: section.id,
        title: 'محاضرة',
        kind: 'text',
        position: 0,
        isPublished: true,
      },
    });

    const published = await service.setStatus(course.id, 'published');
    expect(published.status).toBe('published');
    expect(published.publishedAt).toBeInstanceOf(Date);

    await service.setStatus(course.id, 'draft');
    const republished = await service.setStatus(course.id, 'published');
    expect(republished.publishedAt?.getTime()).toBe(published.publishedAt?.getTime());
  });

  it('never lets update() change status, even if the object somehow carries one', async () => {
    const course = await service.create(adminId, input());
    // Simulates a caller that bypassed the DTO — the service must not spread.
    await service.update(course.id, { title: 'اسم جديد', status: 'published' } as never);
    const after = await prisma.course.findUniqueOrThrow({ where: { id: course.id } });
    expect(after.title).toBe('اسم جديد');
    expect(after.status).toBe('draft');
  });

  it('404s on an unknown id rather than returning null', async () => {
    await expect(service.findForAdmin(crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

```bash
pnpm --filter @ayman/api test course.service
```
Expected: FAIL — `Cannot find module './course.service'`.

- [ ] **Step 4: Implement `apps/api/src/modules/content/course.service.ts`**

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CourseCreateInput, CourseUpdateInput, CourseStatus } from '@ayman/contracts/content';
import { PrismaService } from '../../prisma/prisma.service';
import type { Course } from '../../generated/prisma/client';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

@Injectable()
export class CourseService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * S10-equivalent: re-validate the taxonomy tuple against the DATABASE, not
   * just the Zod schema. A client can submit four syntactically valid UUIDs
   * that name a subject belonging to another system — Zod cannot know that and
   * the foreign keys individually cannot either, because each id exists.
   */
  private async assertOfferingExists(input: {
    systemId: string;
    year: number;
    trackId: string | null;
    subjectId: string;
  }): Promise<void> {
    if (input.year === 1 && input.trackId !== null) {
      throw new BadRequestException('grade 1 courses cannot carry a track');
    }
    const offering = await this.prisma.subjectOffering.findFirst({
      where: {
        systemId: input.systemId,
        year: input.year,
        trackId: input.trackId,
        subjectId: input.subjectId,
      },
      select: { id: true },
    });
    if (!offering) {
      throw new BadRequestException(
        'no subject offering exists for this (system, year, track, subject)',
      );
    }
  }

  async create(actorId: string, input: CourseCreateInput): Promise<Course> {
    await this.assertOfferingExists(input);

    // Named fields only. Never `data: input` — a spread is how a field that was
    // added to the schema for internal use ends up client-writable six months
    // later without anyone noticing.
    try {
      return await this.prisma.course.create({
        data: {
          slug: input.slug,
          title: input.title,
          subtitle: input.subtitle,
          description: input.description,
          systemId: input.systemId,
          year: input.year,
          trackId: input.trackId,
          subjectId: input.subjectId,
          coverKey: input.coverKey,
          instructorId: actorId,
          status: 'draft',
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('slug already in use');
      throw error;
    }
  }

  async update(id: string, input: CourseUpdateInput): Promise<Course> {
    const current = await this.prisma.course.findUnique({
      where: { id },
      select: { systemId: true, year: true, trackId: true, subjectId: true },
    });
    if (!current) throw new NotFoundException();

    // Any change to the taxonomy tuple re-validates the WHOLE tuple, because
    // changing one component can invalidate a combination that was previously
    // legal.
    const next = {
      systemId: input.systemId ?? current.systemId,
      year: input.year ?? current.year,
      trackId: input.trackId === undefined ? current.trackId : input.trackId,
      subjectId: input.subjectId ?? current.subjectId,
    };
    await this.assertOfferingExists(next);

    try {
      return await this.prisma.course.update({
        where: { id },
        // Explicit field list. `status`, `publishedAt`, `instructorId` and
        // `position` are structurally unreachable from here.
        data: {
          ...(input.slug !== undefined && { slug: input.slug }),
          ...(input.title !== undefined && { title: input.title }),
          ...(input.subtitle !== undefined && { subtitle: input.subtitle }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.coverKey !== undefined && { coverKey: input.coverKey }),
          systemId: next.systemId,
          year: next.year,
          trackId: next.trackId,
          subjectId: next.subjectId,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('slug already in use');
      throw error;
    }
  }

  /**
   * The only writer of `status`. Publishing an empty course is the most common
   * way a catalog page ships broken, so it is refused here rather than caught
   * in review.
   */
  async setStatus(id: string, status: CourseStatus): Promise<Course> {
    const course = await this.prisma.course.findUnique({
      where: { id },
      select: { id: true, publishedAt: true },
    });
    if (!course) throw new NotFoundException();

    if (status === 'published') {
      const publishedLessons = await this.prisma.lesson.count({
        where: { courseId: id, isPublished: true, section: { isPublished: true } },
      });
      if (publishedLessons === 0) {
        throw new BadRequestException('a course needs at least one published lesson to go live');
      }
    }

    return this.prisma.course.update({
      where: { id },
      data: {
        status,
        // Set once. `publishedAt` is the course's birthday, not its last
        // deploy — the sitemap's <lastmod> uses updatedAt for that.
        publishedAt: status === 'published' ? (course.publishedAt ?? new Date()) : course.publishedAt,
      },
    });
  }

  async remove(id: string): Promise<{ id: string }> {
    const course = await this.prisma.course.findUnique({ where: { id }, select: { status: true } });
    if (!course) throw new NotFoundException();
    if (course.status === 'published') {
      throw new BadRequestException('unpublish before deleting');
    }
    await this.prisma.course.delete({ where: { id } });
    return { id };
  }

  list() {
    return this.prisma.course.findMany({
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        year: true,
        publishedAt: true,
        updatedAt: true,
        system: { select: { nameAr: true } },
        track: { select: { labelAr: true } },
        subject: { select: { nameAr: true } },
        _count: { select: { lessons: true } },
      },
    });
  }

  async findForAdmin(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        title: true,
        subtitle: true,
        description: true,
        systemId: true,
        year: true,
        trackId: true,
        subjectId: true,
        coverKey: true,
        status: true,
        publishedAt: true,
        sections: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            title: true,
            summary: true,
            position: true,
            isPublished: true,
            lessons: {
              orderBy: [{ position: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                title: true,
                kind: true,
                position: true,
                isPublished: true,
                isFreePreview: true,
                estimatedSeconds: true,
                video: { select: { externalId: true, durationSeconds: true } },
              },
            },
          },
        },
      },
    });
    if (!course) throw new NotFoundException();
    return course;
  }
}
```

- [ ] **Step 5: Controller and module**

`apps/api/src/modules/content/course.controller.ts`:
```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { CourseService } from './course.service';
import { CreateCourseDto, SetCourseStatusDto, UpdateCourseDto } from './dto/course.dto';

@Controller('admin/courses')
@UsePipes(ZodValidationPipe)
export class CourseController {
  constructor(private readonly courses: CourseService) {}

  /**
   * RECONCILED: `?ids=a,b,c` is required by Plan 6 Task 15's homepage
   * `courseGrid` block picker, which resolves the ids stored in a home block
   * back to `{ id, title, status }` rows. It is a filter on this endpoint, not
   * a second endpoint — `ids` is parsed by the DTO as a bounded (max 64) array
   * of uuids, never interpolated into SQL.
   */
  @RequirePermission('course:read')
  @Get()
  list(@Query() query: ListCoursesDto) {
    return this.courses.list(query);
  }

  @RequirePermission('course:read')
  @Get(':id')
  one(@Param('id') id: string) {
    return this.courses.findForAdmin(id);
  }

  @RequirePermission('course:create')
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateCourseDto) {
    return this.courses.create(user.id, body);
  }

  @RequirePermission('course:update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateCourseDto) {
    return this.courses.update(id, body);
  }

  /** Separate route, separate permission. This is the whole point of Task 6. */
  @RequirePermission('course:publish')
  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() body: SetCourseStatusDto) {
    return this.courses.setStatus(id, body.status);
  }

  @RequirePermission('course:delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.courses.remove(id);
  }
}
```

`apps/api/src/modules/content/content.module.ts` (sections/lessons are added in Task 7):
```ts
import { Module } from '@nestjs/common';
import { CourseController } from './course.controller';
import { CourseService } from './course.service';

@Module({
  controllers: [CourseController],
  providers: [CourseService],
  exports: [CourseService],
})
export class ContentModule {}
```

Register `ContentModule` in `apps/api/src/app.module.ts`.

- [ ] **Step 6: Run the tests, confirm green**

```bash
pnpm --filter @ayman/api test course.service
```
Expected: PASS — 8 tests.

- [ ] **Step 7: Verify the permission split by hand**

With the API running and an admin session cookie in `/tmp/admin.txt`:
```bash
curl -s -o /dev/null -w '%{http_code}\n' -b /tmp/admin.txt \
  -X PATCH http://localhost:3300/api/admin/courses/<id> \
  -H 'content-type: application/json' -d '{"status":"published"}'
```
Expected: `400` — `UpdateCourseDto` rejects the unknown key. Not `200`, and not a
silent no-op.

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST http://localhost:3300/api/admin/courses \
  -H 'content-type: application/json' -d '{}'
```
Expected: `401` — deny by default, with no session.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/content apps/api/src/app.module.ts
git commit -m "feat(api): admin course CRUD with taxonomy re-validation and a separate publish permission"
```

---

## Task 7: Sections, lessons, and the kind-specific payloads

**Files:**
- Create: `apps/api/src/modules/content/dto/{section.dto.ts,lesson.dto.ts}`
- Create: `apps/api/src/modules/content/{section.service.ts,section.controller.ts}`
- Create: `apps/api/src/modules/content/{lesson.service.ts,lesson.controller.ts}`
- Create: `apps/api/src/modules/content/lesson.service.spec.ts`
- Modify: `apps/api/src/modules/content/content.module.ts`

**Interfaces:**
- Consumes: `LessonVideoInputSchema` from `@ayman/contracts/video`; `SectionCreateSchema`, `LessonCreateSchema`, `LessonTextInputSchema`, `LessonAttachmentInputSchema` from `@ayman/contracts/content`; `sanitizeRichText`.
- Produces:
  - `POST /api/admin/courses/:courseId/sections`, `PATCH|DELETE /api/admin/sections/:id`
  - `POST /api/admin/sections/:sectionId/lessons`, `PATCH|DELETE /api/admin/lessons/:id`
  - `PUT|DELETE /api/admin/lessons/:id/video`
  - `PUT /api/admin/lessons/:id/text`
  - `POST /api/admin/lessons/:id/attachments`, `DELETE /api/admin/attachments/:id`

- [ ] **Step 1: Create the DTOs**

`apps/api/src/modules/content/dto/section.dto.ts`:
```ts
import { SectionCreateSchema, SectionUpdateSchema } from '@ayman/contracts/content';
import { createZodDto } from 'nestjs-zod';

export class CreateSectionDto extends createZodDto(SectionCreateSchema) {}
export class UpdateSectionDto extends createZodDto(SectionUpdateSchema) {}
```

`apps/api/src/modules/content/dto/lesson.dto.ts`:
```ts
import {
  LessonAttachmentInputSchema,
  LessonCreateSchema,
  LessonTextInputSchema,
  LessonUpdateSchema,
  ReorderSchema,
} from '@ayman/contracts/content';
import { LessonVideoInputSchema } from '@ayman/contracts/video';
import { createZodDto } from 'nestjs-zod';

export class CreateLessonDto extends createZodDto(LessonCreateSchema) {}
export class UpdateLessonDto extends createZodDto(LessonUpdateSchema) {}
/**
 * The DTO's INPUT type has `url`; its OUTPUT type has `externalId` and no `url`
 * at all. By the time the controller's `@Body()` is typed, the URL no longer
 * exists as a value the service could accidentally persist.
 */
export class SetLessonVideoDto extends createZodDto(LessonVideoInputSchema) {}
export class SetLessonTextDto extends createZodDto(LessonTextInputSchema) {}
export class AddAttachmentDto extends createZodDto(LessonAttachmentInputSchema) {}
export class ReorderDto extends createZodDto(ReorderSchema) {}
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/modules/content/lesson.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LessonService } from './lesson.service';

describe('LessonService', () => {
  let prisma: PrismaService;
  let service: LessonService;
  let courseId: string;
  let sectionId: string;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaClient() as unknown as PrismaService;
    await prisma.$connect();
    service = new LessonService(prisma);

    const suffix = Date.now().toString(36);
    const user = await prisma.user.create({
      data: { id: `les-${suffix}`, name: 'أيمن', email: `les-${suffix}@example.com`, role: 'admin' },
    });
    userId = user.id;
    const offering = await prisma.subjectOffering.findFirstOrThrow({ where: { year: 2 } });
    const course = await prisma.course.create({
      data: {
        slug: `les-${suffix}`,
        title: 'كورس',
        systemId: offering.systemId,
        year: 2,
        trackId: offering.trackId,
        subjectId: offering.subjectId,
        instructorId: user.id,
      },
    });
    courseId = course.id;
    const section = await prisma.courseSection.create({
      data: { courseId, title: 'قسم', position: 0 },
    });
    sectionId = section.id;
  });

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { instructorId: userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('appends new lessons at the end and denormalises courseId from the section', async () => {
    const a = await service.create(sectionId, { title: 'أ', kind: 'text', isPublished: false, isFreePreview: false, estimatedSeconds: 0, completionMode: 'manual', completionMinViewSeconds: null, completionPassGrade: null });
    const b = await service.create(sectionId, { title: 'ب', kind: 'text', isPublished: false, isFreePreview: false, estimatedSeconds: 0, completionMode: 'manual', completionMinViewSeconds: null, completionPassGrade: null });
    expect(a.position).toBe(0);
    expect(b.position).toBe(1);
    expect(b.courseId).toBe(courseId);
  });

  it('stores only the 11-character id for a video, never the URL', async () => {
    const lesson = await service.create(sectionId, { title: 'فيديو', kind: 'video', isPublished: false, isFreePreview: false, estimatedSeconds: 0, completionMode: 'manual', completionMinViewSeconds: null, completionPassGrade: null });
    const video = await service.setVideo(lesson.id, {
      provider: 'youtube',
      externalId: 'dQw4w9WgXcQ',
      durationSeconds: 300,
      posterKey: null,
    });
    expect(video.externalId).toBe('dQw4w9WgXcQ');
    expect(video.externalId).not.toContain('http');

    const raw = await prisma.$queryRaw<Array<{ external_id: string }>>`
      SELECT "external_id" FROM "app"."lesson_videos" WHERE "lesson_id" = ${lesson.id}
    `;
    expect(raw[0]?.external_id).toBe('dQw4w9WgXcQ');
  });

  it('is refused by Postgres if a URL is ever passed through', async () => {
    const lesson = await service.create(sectionId, { title: 'فيديو٢', kind: 'video', isPublished: false, isFreePreview: false, estimatedSeconds: 0, completionMode: 'manual', completionMinViewSeconds: null, completionPassGrade: null });
    await expect(
      service.setVideo(lesson.id, {
        provider: 'youtube',
        externalId: 'https://youtu.be/dQw4w9WgXcQ' as never,
        durationSeconds: 10,
        posterKey: null,
      }),
    ).rejects.toThrow();
  });

  it('sanitizes rich text on WRITE, so the stored row is already safe', async () => {
    const lesson = await service.create(sectionId, { title: 'نص', kind: 'text', isPublished: false, isFreePreview: false, estimatedSeconds: 0, completionMode: 'manual', completionMinViewSeconds: null, completionPassGrade: null });
    const stored = await service.setText(lesson.id, {
      bodyHtml:
        '<p>مرحبا</p><script>alert(1)</script><iframe src="https://evil.example"></iframe>' +
        '<a href="https://example.com">لينك</a>',
    });
    expect(stored.bodyHtml).not.toContain('<script');
    expect(stored.bodyHtml).not.toContain('<iframe');
    expect(stored.bodyHtml).toContain('rel="noopener noreferrer nofollow"');
    expect(stored.bodyHtml).toContain('مرحبا');
  });

  it('refuses a payload whose kind does not match the lesson', async () => {
    const lesson = await service.create(sectionId, { title: 'نص٢', kind: 'text', isPublished: false, isFreePreview: false, estimatedSeconds: 0, completionMode: 'manual', completionMinViewSeconds: null, completionPassGrade: null });
    await expect(
      service.setVideo(lesson.id, {
        provider: 'youtube',
        externalId: 'dQw4w9WgXcQ',
        durationSeconds: 10,
        posterKey: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('closes the gap left by a deletion so positions stay contiguous', async () => {
    const section = await prisma.courseSection.create({
      data: { courseId, title: 'قسم٢', position: 1 },
    });
    const made = [];
    for (const title of ['1', '2', '3']) {
      made.push(
        await service.create(section.id, { title, kind: 'text', isPublished: false, isFreePreview: false, estimatedSeconds: 0, completionMode: 'manual', completionMinViewSeconds: null, completionPassGrade: null }),
      );
    }
    await service.remove(made[1]!.id);
    const remaining = await prisma.lesson.findMany({
      where: { sectionId: section.id },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { title: true, position: true },
    });
    expect(remaining).toEqual([
      { title: '1', position: 0 },
      { title: '3', position: 1 },
    ]);
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

```bash
pnpm --filter @ayman/api test lesson.service
```
Expected: FAIL — `Cannot find module './lesson.service'`.

- [ ] **Step 4: Implement `apps/api/src/modules/content/section.service.ts`**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type { SectionCreateInput, SectionUpdateInput } from '@ayman/contracts/content';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SectionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Appends. Positions are contiguous from 0 and only the reorder endpoint rewrites them. */
  async create(courseId: string, input: SectionCreateInput) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!course) throw new NotFoundException();

    const last = await this.prisma.courseSection.findFirst({
      where: { courseId },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
      select: { position: true },
    });

    return this.prisma.courseSection.create({
      data: {
        courseId,
        title: input.title,
        summary: input.summary,
        isPublished: input.isPublished,
        position: last === null ? 0 : last.position + 1,
      },
    });
  }

  async update(id: string, input: SectionUpdateInput) {
    const section = await this.prisma.courseSection.findUnique({ where: { id }, select: { id: true } });
    if (!section) throw new NotFoundException();
    return this.prisma.courseSection.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.summary !== undefined && { summary: input.summary }),
        ...(input.isPublished !== undefined && { isPublished: input.isPublished }),
      },
    });
  }

  /**
   * Deleting closes the gap in the same transaction. Leaving holes "because the
   * order still reads correctly" is how a section ends up at position 47 with
   * six siblings, and every later reorder diff becomes unreadable.
   */
  async remove(id: string): Promise<{ id: string }> {
    const section = await this.prisma.courseSection.findUnique({
      where: { id },
      select: { id: true, courseId: true, position: true },
    });
    if (!section) throw new NotFoundException();

    await this.prisma.$transaction([
      this.prisma.courseSection.delete({ where: { id } }),
      this.prisma.courseSection.updateMany({
        where: { courseId: section.courseId, position: { gt: section.position } },
        data: { position: { decrement: 1 } },
      }),
    ]);
    return { id };
  }
}
```

- [ ] **Step 5: Implement `apps/api/src/modules/content/lesson.service.ts`**

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  LessonAttachmentInput,
  LessonCreateInput,
  LessonTextInput,
  LessonUpdateInput,
} from '@ayman/contracts/content';
import type { LessonVideoInput } from '@ayman/contracts/video';
import { sanitizeRichText } from '../../common/sanitize/rich-text';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LessonService {
  constructor(private readonly prisma: PrismaService) {}

  async create(sectionId: string, input: LessonCreateInput) {
    // courseId is read from the section, never accepted from the client. The
    // composite FK (lessons_section_matches_course) makes a mismatch impossible
    // at the database level too.
    const section = await this.prisma.courseSection.findUnique({
      where: { id: sectionId },
      select: { id: true, courseId: true },
    });
    if (!section) throw new NotFoundException();

    const last = await this.prisma.lesson.findFirst({
      where: { sectionId },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
      select: { position: true },
    });

    return this.prisma.lesson.create({
      data: {
        sectionId,
        courseId: section.courseId,
        title: input.title,
        kind: input.kind,
        isPublished: input.isPublished,
        isFreePreview: input.isFreePreview,
        estimatedSeconds: input.estimatedSeconds,
        completionMode: input.completionMode,
        completionMinViewSeconds: input.completionMinViewSeconds,
        completionPassGrade: input.completionPassGrade,
        position: last === null ? 0 : last.position + 1,
      },
    });
  }

  async update(id: string, input: LessonUpdateInput) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id }, select: { id: true } });
    if (!lesson) throw new NotFoundException();
    return this.prisma.lesson.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.kind !== undefined && { kind: input.kind }),
        ...(input.isPublished !== undefined && { isPublished: input.isPublished }),
        ...(input.isFreePreview !== undefined && { isFreePreview: input.isFreePreview }),
        ...(input.estimatedSeconds !== undefined && { estimatedSeconds: input.estimatedSeconds }),
        ...(input.completionMode !== undefined && { completionMode: input.completionMode }),
        ...(input.completionMinViewSeconds !== undefined && {
          completionMinViewSeconds: input.completionMinViewSeconds,
        }),
        ...(input.completionPassGrade !== undefined && {
          completionPassGrade: input.completionPassGrade,
        }),
      },
    });
  }

  private async assertKind(lessonId: string, kind: 'video' | 'text' | 'attachment') {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, kind: true },
    });
    if (!lesson) throw new NotFoundException();
    if (lesson.kind !== kind) {
      throw new BadRequestException(`lesson ${lessonId} is a ${lesson.kind} lesson, not ${kind}`);
    }
    return lesson;
  }

  /**
   * `input.externalId` is already an 11-character id — LessonVideoInputSchema
   * transformed the URL away before this method could see it. Nothing here
   * parses, reconstructs, or fetches anything.
   */
  async setVideo(lessonId: string, input: LessonVideoInput) {
    await this.assertKind(lessonId, 'video');
    return this.prisma.lessonVideo.upsert({
      where: { lessonId },
      create: {
        lessonId,
        provider: input.provider,
        externalId: input.externalId,
        durationSeconds: input.durationSeconds,
        posterKey: input.posterKey,
      },
      update: {
        provider: input.provider,
        externalId: input.externalId,
        durationSeconds: input.durationSeconds,
        posterKey: input.posterKey,
      },
    });
  }

  async removeVideo(lessonId: string): Promise<{ lessonId: string }> {
    await this.assertKind(lessonId, 'video');
    await this.prisma.lessonVideo.delete({ where: { lessonId } }).catch(() => undefined);
    return { lessonId };
  }

  /** Sanitized on WRITE. The stored row is safe even if a future renderer is not. */
  async setText(lessonId: string, input: LessonTextInput) {
    await this.assertKind(lessonId, 'text');
    const bodyHtml = sanitizeRichText(input.bodyHtml);
    return this.prisma.lessonText.upsert({
      where: { lessonId },
      create: { lessonId, bodyHtml },
      update: { bodyHtml },
    });
  }

  async addAttachment(lessonId: string, input: LessonAttachmentInput) {
    await this.assertKind(lessonId, 'attachment');
    const last = await this.prisma.lessonAttachment.findFirst({
      where: { lessonId },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
      select: { position: true },
    });
    return this.prisma.lessonAttachment.create({
      data: {
        lessonId,
        storageKey: input.storageKey,
        filename: input.filename,
        mime: input.mime,
        sizeBytes: input.sizeBytes,
        position: last === null ? 0 : last.position + 1,
      },
    });
  }

  async removeAttachment(id: string): Promise<{ id: string }> {
    const attachment = await this.prisma.lessonAttachment.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!attachment) throw new NotFoundException();
    await this.prisma.lessonAttachment.delete({ where: { id } });
    return { id };
  }

  async remove(id: string): Promise<{ id: string }> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      select: { id: true, sectionId: true, position: true },
    });
    if (!lesson) throw new NotFoundException();

    await this.prisma.$transaction([
      this.prisma.lesson.delete({ where: { id } }),
      this.prisma.lesson.updateMany({
        where: { sectionId: lesson.sectionId, position: { gt: lesson.position } },
        data: { position: { decrement: 1 } },
      }),
    ]);
    return { id };
  }
}
```

- [ ] **Step 6: Controllers**

`apps/api/src/modules/content/section.controller.ts`:
```ts
import { Body, Controller, Delete, Param, Patch, Post, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { SectionService } from './section.service';
import { CreateSectionDto, UpdateSectionDto } from './dto/section.dto';

@Controller('admin')
@UsePipes(ZodValidationPipe)
export class SectionController {
  constructor(private readonly sections: SectionService) {}

  @RequirePermission('section:write')
  @Post('courses/:courseId/sections')
  create(@Param('courseId') courseId: string, @Body() body: CreateSectionDto) {
    return this.sections.create(courseId, body);
  }

  @RequirePermission('section:write')
  @Patch('sections/:id')
  update(@Param('id') id: string, @Body() body: UpdateSectionDto) {
    return this.sections.update(id, body);
  }

  @RequirePermission('section:write')
  @Delete('sections/:id')
  remove(@Param('id') id: string) {
    return this.sections.remove(id);
  }
}
```

`apps/api/src/modules/content/lesson.controller.ts`:
```ts
import { Body, Controller, Delete, Param, Patch, Post, Put, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { LessonService } from './lesson.service';
import {
  AddAttachmentDto,
  CreateLessonDto,
  SetLessonTextDto,
  SetLessonVideoDto,
  UpdateLessonDto,
} from './dto/lesson.dto';

@Controller('admin')
@UsePipes(ZodValidationPipe)
export class LessonController {
  constructor(private readonly lessons: LessonService) {}

  @RequirePermission('lesson:write')
  @Post('sections/:sectionId/lessons')
  create(@Param('sectionId') sectionId: string, @Body() body: CreateLessonDto) {
    return this.lessons.create(sectionId, body);
  }

  @RequirePermission('lesson:write')
  @Patch('lessons/:id')
  update(@Param('id') id: string, @Body() body: UpdateLessonDto) {
    return this.lessons.update(id, body);
  }

  @RequirePermission('lesson:write')
  @Delete('lessons/:id')
  remove(@Param('id') id: string) {
    return this.lessons.remove(id);
  }

  /** The body arrives as `{provider, url, ...}` and lands here as `{provider, externalId, ...}`. */
  @RequirePermission('lesson:write')
  @Put('lessons/:id/video')
  setVideo(@Param('id') id: string, @Body() body: SetLessonVideoDto) {
    return this.lessons.setVideo(id, body);
  }

  @RequirePermission('lesson:write')
  @Delete('lessons/:id/video')
  removeVideo(@Param('id') id: string) {
    return this.lessons.removeVideo(id);
  }

  @RequirePermission('lesson:write')
  @Put('lessons/:id/text')
  setText(@Param('id') id: string, @Body() body: SetLessonTextDto) {
    return this.lessons.setText(id, body);
  }

  @RequirePermission('lesson:write')
  @Post('lessons/:id/attachments')
  addAttachment(@Param('id') id: string, @Body() body: AddAttachmentDto) {
    return this.lessons.addAttachment(id, body);
  }

  @RequirePermission('lesson:write')
  @Delete('attachments/:id')
  removeAttachment(@Param('id') id: string) {
    return this.lessons.removeAttachment(id);
  }
}
```

Add all four classes to `content.module.ts`'s `controllers` / `providers` / `exports`.

- [ ] **Step 7: Run the tests, confirm green**

```bash
pnpm --filter @ayman/api test lesson.service
```
Expected: PASS — 6 tests.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/content
git commit -m "feat(api): section and lesson CRUD with kind-scoped video/text/attachment payloads"
```

---

## Task 8: Reorder — one write for the whole ordered array

**Files:**
- Create: `apps/api/src/modules/content/reorder.sql.ts`
- Create: `apps/api/src/modules/content/reorder.sql.spec.ts`
- Modify: `apps/api/src/modules/content/{section.service.ts,lesson.service.ts,section.controller.ts,lesson.controller.ts}`
- Create: `apps/api/src/modules/content/reorder.service.spec.ts`

**Interfaces:**
- Consumes: `ReorderSchema`.
- Produces:
  - ```ts
    // apps/api/src/modules/content/reorder.sql.ts
    // RECONCILED: the union types below are OPEN — later plans APPEND their table
    // and scope column rather than writing a second builder. Plan 5 Task 15 adds
    // `'quiz_slots'` / `'quiz_id'`; Plan 6 Task 15 adds `'navigation_items'` and
    // `'home_blocks'` with scope `'parent_id'` / `'id'`. The whitelist union is
    // the SQL-injection control (A3) — column names cannot be parameterised, so
    // they must never be interpolated from a request.
    export function buildReorderSql(
      table: 'lessons' | 'course_sections' | 'quiz_slots' | 'navigation_items' | 'home_blocks',
      scopeColumn: 'section_id' | 'course_id' | 'quiz_id' | 'parent_id',
      scopeId: string,
      orderedIds: readonly string[],
    ): Prisma.Sql;
    ```
  - `LessonService.reorder(sectionId, orderedIds)` and `SectionService.reorder(courseId, orderedIds)`
  - `PATCH /api/admin/sections/:sectionId/lessons/order`, `PATCH /api/admin/courses/:courseId/sections/order`

- [ ] **Step 1: Write the failing test for the SQL builder**

Create `apps/api/src/modules/content/reorder.sql.spec.ts`:

```ts
import { buildReorderSql } from './reorder.sql';

describe('buildReorderSql', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

  it('emits exactly ONE statement for 40 lessons', () => {
    const sql = buildReorderSql('lessons', 'section_id', 'sec-1', ids(40));
    expect((sql.text.match(/\bUPDATE\b/gi) ?? []).length).toBe(1);
    expect(sql.text).not.toContain(';');
  });

  it('parameterises every id and index — nothing is interpolated', () => {
    const sql = buildReorderSql('lessons', 'section_id', 'sec-1', ids(40));
    // 40 ids + 40 positions + 1 scope id
    expect(sql.values).toHaveLength(81);
    expect(sql.values[0]).toBe('id-0');
    expect(sql.values[1]).toBe(0);
    expect(sql.values.at(-1)).toBe('sec-1');
    for (const id of ids(40)) expect(sql.text).not.toContain(id);
  });

  it('scopes the UPDATE to the parent, so a foreign id cannot be moved', () => {
    const sql = buildReorderSql('lessons', 'section_id', 'sec-1', ids(3));
    expect(sql.text).toContain('"section_id" = $');
  });

  it('targets the app schema explicitly', () => {
    expect(buildReorderSql('lessons', 'section_id', 's', ids(1)).text).toContain('"app"."lessons"');
    expect(buildReorderSql('course_sections', 'course_id', 'c', ids(1)).text).toContain(
      '"app"."course_sections"',
    );
  });

  it('refuses an empty array rather than emitting VALUES ()', () => {
    expect(() => buildReorderSql('lessons', 'section_id', 's', [])).toThrow(/empty/i);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
pnpm --filter @ayman/api test reorder.sql
```
Expected: FAIL — `Cannot find module './reorder.sql'`.

- [ ] **Step 3: Implement `apps/api/src/modules/content/reorder.sql.ts`**

```ts
import { Prisma } from '../../generated/prisma/client';

type ReorderTable = 'lessons' | 'course_sections';
type ScopeColumn = 'section_id' | 'course_id';

/**
 * ONE statement that rewrites every position in the scope.
 *
 * Reordering 40 lessons is 40 position changes. Sending 40 UPDATEs — or worse,
 * 40 HTTP requests — is 40 chances to interleave with a second editor and 40
 * round trips of latency for one drag. `UPDATE ... FROM (VALUES ...)` does the
 * whole thing in a single pass, and because the unique constraint on
 * (section_id, position) is DEFERRABLE INITIALLY DEFERRED, the intermediate
 * duplicate positions inside the statement are legal — only the state at COMMIT
 * has to be unique.
 *
 * `Prisma.sql` is a tagged template: every value below becomes a bound
 * parameter, never string-interpolated SQL. `$executeRawUnsafe` is banned by the
 * `no-restricted-syntax` ESLint rule and is not needed for any of this.
 */
export function buildReorderSql(
  table: ReorderTable,
  scopeColumn: ScopeColumn,
  scopeId: string,
  orderedIds: readonly string[],
): Prisma.Sql {
  if (orderedIds.length === 0) {
    throw new Error('buildReorderSql received an empty orderedIds array');
  }

  // The table and column names come from the two union types above, never from
  // a request. Identifiers cannot be parameterised in Postgres, which is exactly
  // why they are constrained to a closed set at the type level.
  const target =
    table === 'lessons' ? Prisma.sql`"app"."lessons"` : Prisma.sql`"app"."course_sections"`;
  const scope =
    scopeColumn === 'section_id' ? Prisma.sql`"section_id"` : Prisma.sql`"course_id"`;

  // Explicit casts: a bare `$1` inside VALUES leaves Postgres unable to infer
  // the column type and it errors with "could not determine data type".
  const rows = Prisma.join(
    orderedIds.map((id, index) => Prisma.sql`(${id}::text, ${index}::int)`),
  );

  return Prisma.sql`
    UPDATE ${target} AS t
    SET "position" = v.position, "updated_at" = now()
    FROM (VALUES ${rows}) AS v(id, position)
    WHERE t."id" = v.id AND t.${scope} = ${scopeId}::text
  `;
}
```

- [ ] **Step 4: Add the service methods**

Append to `LessonService`:

```ts
  /**
   * The client sends the FULL ordered array, debounced. The server verifies the
   * submitted set is exactly the section's current set — no additions, no
   * removals, no ids borrowed from another section — and then rewrites every
   * position in one statement.
   *
   * The set check is what stops the interesting attack: a PATCH whose array
   * contains 39 of this section's lessons plus one from a course the caller
   * cannot see would otherwise silently re-parent nothing but reveal, through
   * the row count, that the foreign id exists.
   */
  async reorder(sectionId: string, orderedIds: string[]): Promise<{ updated: number }> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.lesson.findMany({
        where: { sectionId },
        select: { id: true },
      });
      const currentIds = new Set(current.map((lesson) => lesson.id));

      if (orderedIds.length !== currentIds.size) {
        throw new BadRequestException('the ordered array must contain every lesson in the section');
      }
      for (const id of orderedIds) {
        if (!currentIds.has(id)) {
          throw new BadRequestException('the ordered array contains an id from another section');
        }
      }

      const updated = await tx.$executeRaw(
        buildReorderSql('lessons', 'section_id', sectionId, orderedIds),
      );
      if (updated !== orderedIds.length) {
        // Cannot happen given the set check above — but if it ever does, the
        // transaction rolls back rather than leaving a partial order.
        throw new BadRequestException('reorder touched an unexpected number of rows');
      }
      return { updated };
    });
  }
```

Add the mirrored `SectionService.reorder(courseId, orderedIds)` using
`buildReorderSql('course_sections', 'course_id', courseId, orderedIds)` and
`tx.courseSection.findMany({ where: { courseId } })`.

Both files need:
```ts
import { buildReorderSql } from './reorder.sql';
```

- [ ] **Step 5: Add the routes**

In `LessonController`:
```ts
  @RequirePermission('lesson:reorder')
  @Patch('sections/:sectionId/lessons/order')
  reorder(@Param('sectionId') sectionId: string, @Body() body: ReorderDto) {
    return this.lessons.reorder(sectionId, body.orderedIds);
  }
```

In `SectionController`:
```ts
  @RequirePermission('section:reorder')
  @Patch('courses/:courseId/sections/order')
  reorder(@Param('courseId') courseId: string, @Body() body: ReorderDto) {
    return this.sections.reorder(courseId, body.orderedIds);
  }
```

⚠️ Nest matches routes in declaration order. `sections/:sectionId/lessons/order`
must be declared **before** any `sections/:sectionId/lessons/:id`-shaped route,
or `order` is captured as an id. There is no such route in this plan; if one is
added later, it goes after.

- [ ] **Step 6: Write the integration test**

Create `apps/api/src/modules/content/reorder.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LessonService } from './lesson.service';

describe('LessonService.reorder', () => {
  let prisma: PrismaService;
  let service: LessonService;
  let sectionId: string;
  let otherSectionId: string;
  let userId: string;
  let ids: string[];

  beforeAll(async () => {
    prisma = new PrismaClient() as unknown as PrismaService;
    await prisma.$connect();
    service = new LessonService(prisma);

    const suffix = Date.now().toString(36);
    const user = await prisma.user.create({
      data: { id: `ro-${suffix}`, name: 'أ', email: `ro-${suffix}@example.com`, role: 'admin' },
    });
    userId = user.id;
    const offering = await prisma.subjectOffering.findFirstOrThrow({ where: { year: 2 } });
    const course = await prisma.course.create({
      data: {
        slug: `ro-${suffix}`,
        title: 'كورس',
        systemId: offering.systemId,
        year: 2,
        trackId: offering.trackId,
        subjectId: offering.subjectId,
        instructorId: user.id,
      },
    });
    const section = await prisma.courseSection.create({
      data: { courseId: course.id, title: 'قسم', position: 0 },
    });
    const other = await prisma.courseSection.create({
      data: { courseId: course.id, title: 'قسم آخر', position: 1 },
    });
    sectionId = section.id;
    otherSectionId = other.id;

    ids = [];
    for (let i = 0; i < 40; i += 1) {
      const lesson = await prisma.lesson.create({
        data: {
          courseId: course.id,
          sectionId,
          title: `محاضرة ${i}`,
          kind: 'text',
          position: i,
        },
      });
      ids.push(lesson.id);
    }
    await prisma.lesson.create({
      data: { courseId: course.id, sectionId: otherSectionId, title: 'غريبة', kind: 'text', position: 0 },
    });
  });

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { instructorId: userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('moves the last lesson to the front and renumbers all 40 contiguously', async () => {
    const moved = [ids[39]!, ...ids.slice(0, 39)];
    const result = await service.reorder(sectionId, moved);
    expect(result.updated).toBe(40);

    const after = await prisma.lesson.findMany({
      where: { sectionId },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { id: true, position: true },
    });
    expect(after.map((l) => l.id)).toEqual(moved);
    expect(after.map((l) => l.position)).toEqual(Array.from({ length: 40 }, (_, i) => i));
  });

  it('is reversible and leaves no gaps', async () => {
    await service.reorder(sectionId, ids);
    const positions = (
      await prisma.lesson.findMany({ where: { sectionId }, select: { position: true } })
    ).map((l) => l.position);
    expect(new Set(positions).size).toBe(40);
    expect(Math.min(...positions)).toBe(0);
    expect(Math.max(...positions)).toBe(39);
  });

  it('rejects a partial array', async () => {
    await expect(service.reorder(sectionId, ids.slice(0, 39))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an id belonging to another section', async () => {
    const foreign = await prisma.lesson.findFirstOrThrow({ where: { sectionId: otherSectionId } });
    await expect(
      service.reorder(sectionId, [foreign.id, ...ids.slice(0, 39)]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('leaves the original order intact after a rejected reorder', async () => {
    await service.reorder(sectionId, ids).catch(() => undefined);
    await expect(service.reorder(sectionId, ids.slice(0, 10))).rejects.toThrow();
    const after = await prisma.lesson.findMany({
      where: { sectionId },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    expect(after.map((l) => l.id)).toEqual(ids);
  });
});
```

- [ ] **Step 7: Run everything, confirm green**

```bash
pnpm --filter @ayman/api test reorder
```
Expected: PASS — 5 builder tests + 5 integration tests.

If the integration test fails with `duplicate key value violates unique
constraint "lessons_section_position_key"`, the DEFERRABLE constraint from Task 3
Step 7 did not apply. Fix the constraint — do **not** work around it by
renumbering in two passes or by dropping the constraint.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/content
git commit -m "feat(api): reorder sections and lessons in a single parameterised UPDATE"
```

---

## Task 9: Public catalog API

**Files:**
- Create: `apps/api/src/modules/catalog/{catalog.service.ts,catalog.controller.ts,catalog.module.ts}`
- Create: `apps/api/src/modules/catalog/catalog.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `CatalogListSchema`, `CatalogCourseDetailSchema` from `@ayman/contracts/catalog`.
- Produces:
  - `GET /api/catalog/courses` → `CatalogList` (public)
  - `GET /api/catalog/courses/:slug` → `CatalogCourseDetail` (public, 404 for drafts)
  - `CatalogService.list()`, `CatalogService.findBySlug(slug)`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/catalog/catalog.service.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { CatalogCourseDetailSchema, CatalogListSchema } from '@ayman/contracts/catalog';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from './catalog.service';

describe('CatalogService', () => {
  let prisma: PrismaService;
  let service: CatalogService;
  let userId: string;
  let publishedSlug: string;
  let draftSlug: string;

  beforeAll(async () => {
    prisma = new PrismaClient() as unknown as PrismaService;
    await prisma.$connect();
    service = new CatalogService(prisma);

    const suffix = Date.now().toString(36);
    const user = await prisma.user.create({
      data: { id: `cat-${suffix}`, name: 'أ', email: `cat-${suffix}@example.com`, role: 'admin' },
    });
    userId = user.id;
    const offering = await prisma.subjectOffering.findFirstOrThrow({ where: { year: 2 } });
    const base = {
      systemId: offering.systemId,
      year: 2,
      trackId: offering.trackId,
      subjectId: offering.subjectId,
      instructorId: user.id,
      title: 'البرمجة وعلوم الحاسب',
      description: 'وصف',
    };

    publishedSlug = `cat-pub-${suffix}`;
    draftSlug = `cat-draft-${suffix}`;

    const published = await prisma.course.create({
      data: { ...base, slug: publishedSlug, status: 'published', publishedAt: new Date() },
    });
    await prisma.course.create({ data: { ...base, slug: draftSlug } });

    const visible = await prisma.courseSection.create({
      data: { courseId: published.id, title: 'قسم منشور', position: 0, isPublished: true },
    });
    const hidden = await prisma.courseSection.create({
      data: { courseId: published.id, title: 'قسم مخفي', position: 1, isPublished: false },
    });

    const preview = await prisma.lesson.create({
      data: {
        courseId: published.id,
        sectionId: visible.id,
        title: 'مقدمة',
        kind: 'video',
        position: 0,
        isPublished: true,
        isFreePreview: true,
        estimatedSeconds: 300,
      },
    });
    await prisma.lessonVideo.create({
      data: {
        lessonId: preview.id,
        provider: 'youtube',
        externalId: 'dQw4w9WgXcQ',
        durationSeconds: 300,
      },
    });

    const paid = await prisma.lesson.create({
      data: {
        courseId: published.id,
        sectionId: visible.id,
        title: 'الدرس الأول',
        kind: 'video',
        position: 1,
        isPublished: true,
        isFreePreview: false,
        estimatedSeconds: 600,
      },
    });
    await prisma.lessonVideo.create({
      data: { lessonId: paid.id, provider: 'youtube', externalId: 'aBcDeFgHiJk', durationSeconds: 600 },
    });

    await prisma.lesson.create({
      data: {
        courseId: published.id,
        sectionId: visible.id,
        title: 'مسودة درس',
        kind: 'text',
        position: 2,
        isPublished: false,
      },
    });
    await prisma.lesson.create({
      data: {
        courseId: published.id,
        sectionId: hidden.id,
        title: 'درس في قسم مخفي',
        kind: 'text',
        position: 0,
        isPublished: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { instructorId: userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('matches the shared contract exactly', async () => {
    expect(() => CatalogListSchema.parse(await service.list())).not.toThrow();
    expect(() =>
      CatalogCourseDetailSchema.parse(await service.findBySlug(publishedSlug)),
    ).not.toThrow();
  });

  it('never lists a draft course', async () => {
    const { courses } = await service.list();
    expect(courses.some((c) => c.slug === publishedSlug)).toBe(true);
    expect(courses.some((c) => c.slug === draftSlug)).toBe(false);
  });

  it('404s a draft by slug — a 403 would confirm it exists', async () => {
    await expect(service.findBySlug(draftSlug)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.findBySlug('does-not-exist')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hides unpublished sections and unpublished lessons', async () => {
    const detail = await service.findBySlug(publishedSlug);
    expect(detail.sections).toHaveLength(1);
    expect(detail.sections[0]?.title).toBe('قسم منشور');
    const titles = detail.sections[0]?.lessons.map((l) => l.title) ?? [];
    expect(titles).toEqual(['مقدمة', 'الدرس الأول']);
  });

  it('exposes the video id ONLY for free-preview lessons', async () => {
    const detail = await service.findBySlug(publishedSlug);
    const lessons = detail.sections[0]?.lessons ?? [];
    expect(lessons[0]?.videoExternalId).toBe('dQw4w9WgXcQ');
    expect(lessons[1]?.videoExternalId).toBeNull();
    // Durations are safe to publish — they drive the "المدة" chip.
    expect(lessons[1]?.durationSeconds).toBe(600);
  });

  it('leaks no internal field in the serialized payload', async () => {
    const raw = JSON.stringify(await service.findBySlug(publishedSlug));
    for (const forbidden of [
      'priceCents',
      'instructorId',
      'status',
      'visibleFrom',
      'visibleTo',
      'unlocksAfterLessonId',
      'viewLimit',
      'contentGroupId',
      'completionPassGrade',
      'bodyHtml',
    ]) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it('counts and sums only the lessons a visitor can actually see', async () => {
    const { courses } = await service.list();
    const course = courses.find((c) => c.slug === publishedSlug);
    expect(course?.lessonCount).toBe(2);
    expect(course?.totalSeconds).toBe(900);
  });

  it('orders by position with an id tie-break, never by insertion', async () => {
    const detail = await service.findBySlug(publishedSlug);
    const lessons = detail.sections[0]?.lessons ?? [];
    expect(lessons.map((l) => l.title)).toEqual(['مقدمة', 'الدرس الأول']);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
pnpm --filter @ayman/api test catalog
```
Expected: FAIL — `Cannot find module './catalog.service'`.

- [ ] **Step 3: Implement `apps/api/src/modules/catalog/catalog.service.ts`**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type { CatalogCourseDetail, CatalogList } from '@ayman/contracts/catalog';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * "Published" is a THREE-level condition: the course, its section, and the
 * lesson each have to be published. Checking only the course is how a
 * half-finished chapter ends up on a public page.
 */
const PUBLISHED_LESSON = {
  isPublished: true,
  section: { isPublished: true },
} as const;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Explicit `select`, never `include`. `include` returns every scalar on the
   * model, which means adding a column to `courses` silently adds it to the
   * public API — the exact mechanism by which internal fields leak.
   */
  async list(): Promise<CatalogList> {
    const rows = await this.prisma.course.findMany({
      where: { status: 'published' },
      orderBy: [{ position: 'asc' }, { publishedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        subtitle: true,
        year: true,
        coverKey: true,
        publishedAt: true,
        updatedAt: true,
        system: { select: { slug: true, nameAr: true } },
        track: { select: { labelAr: true } },
        subject: { select: { nameAr: true } },
        lessons: {
          where: PUBLISHED_LESSON,
          select: { estimatedSeconds: true, video: { select: { durationSeconds: true } } },
        },
      },
    });

    const courses = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      subtitle: row.subtitle,
      systemSlug: row.system.slug,
      systemNameAr: row.system.nameAr,
      year: row.year,
      trackLabelAr: row.track?.labelAr ?? null,
      subjectNameAr: row.subject.nameAr,
      coverKey: row.coverKey,
      lessonCount: row.lessons.length,
      // The video's real duration wins; estimatedSeconds is the fallback for
      // text and attachment lessons that have no duration of their own.
      totalSeconds: row.lessons.reduce(
        (sum, lesson) => sum + (lesson.video?.durationSeconds ?? lesson.estimatedSeconds),
        0,
      ),
      // publishedAt is non-null for published courses — the
      // courses_published_has_timestamp CHECK guarantees it.
      publishedAt: (row.publishedAt as Date).toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));

    return { courses, total: courses.length };
  }

  async findBySlug(slug: string): Promise<CatalogCourseDetail> {
    const row = await this.prisma.course.findFirst({
      // Compiled into the query, not checked after the fetch. A draft is
      // NOT FOUND, not FORBIDDEN — 403 confirms the slug exists and turns the
      // catalog into an oracle for unreleased course names.
      where: { slug, status: 'published' },
      select: {
        id: true,
        slug: true,
        title: true,
        subtitle: true,
        description: true,
        year: true,
        coverKey: true,
        publishedAt: true,
        updatedAt: true,
        system: { select: { slug: true, nameAr: true } },
        track: { select: { labelAr: true } },
        subject: { select: { nameAr: true } },
        sections: {
          where: { isPublished: true },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            title: true,
            summary: true,
            lessons: {
              where: { isPublished: true },
              orderBy: [{ position: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                title: true,
                kind: true,
                estimatedSeconds: true,
                isFreePreview: true,
                video: { select: { externalId: true, durationSeconds: true } },
              },
            },
          },
        },
      },
    });

    if (!row) throw new NotFoundException();

    const lessons = row.sections.flatMap((section) => section.lessons);

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      subtitle: row.subtitle,
      description: row.description,
      systemSlug: row.system.slug,
      systemNameAr: row.system.nameAr,
      year: row.year,
      trackLabelAr: row.track?.labelAr ?? null,
      subjectNameAr: row.subject.nameAr,
      coverKey: row.coverKey,
      lessonCount: lessons.length,
      totalSeconds: lessons.reduce(
        (sum, lesson) => sum + (lesson.video?.durationSeconds ?? lesson.estimatedSeconds),
        0,
      ),
      publishedAt: (row.publishedAt as Date).toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      sections: row.sections.map((section) => ({
        id: section.id,
        title: section.title,
        summary: section.summary,
        lessons: section.lessons.map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          kind: lesson.kind,
          estimatedSeconds: lesson.estimatedSeconds,
          isFreePreview: lesson.isFreePreview,
          // The id is published ONLY for free previews. Everything else gets
          // null, so an anonymous visitor cannot assemble the whole course from
          // the catalog JSON. Duration stays, because it is on the page anyway.
          videoExternalId: lesson.isFreePreview ? (lesson.video?.externalId ?? null) : null,
          durationSeconds: lesson.video?.durationSeconds ?? null,
        })),
      })),
    };
  }
}
```

- [ ] **Step 4: Controller and module**

`apps/api/src/modules/catalog/catalog.controller.ts`:
```ts
import { Controller, Get, Param } from '@nestjs/common';
import type { CatalogCourseDetail, CatalogList } from '@ayman/contracts/catalog';
import { Public } from '../../auth/decorators/public.decorator';
import { CatalogService } from './catalog.service';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  /** Public: the catalog has to be crawlable and readable before signup. */
  @Public()
  @Get('courses')
  list(): Promise<CatalogList> {
    return this.catalog.list();
  }

  @Public()
  @Get('courses/:slug')
  one(@Param('slug') slug: string): Promise<CatalogCourseDetail> {
    return this.catalog.findBySlug(slug);
  }
}
```

`apps/api/src/modules/catalog/catalog.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
```

Register `CatalogModule` in `apps/api/src/app.module.ts`.

- [ ] **Step 5: Run the tests, confirm green**

```bash
pnpm --filter @ayman/api test catalog
```
Expected: PASS — 8 tests.

- [ ] **Step 6: Verify anonymously**

```bash
curl -s http://localhost:3300/api/catalog/courses | head -c 300
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3300/api/catalog/courses/<draft-slug>
```
Expected: JSON with no cookie sent; `404` for the draft.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/catalog apps/api/src/app.module.ts
git commit -m "feat(api): public catalog endpoints with published-only, select-not-include serialization"
```

---

## Task 10: Form primitives, the DOM test harness, and the authenticated fetch helper

The admin dashboard needs the form primitive set Plan 1 did not build, the first
DOM test harness in `apps/web` and `packages/ui`, and a way to make
authenticated, CSRF-satisfying writes from a Server Action.

> **Reconciled scope.** This task owns the **whole** `@ayman/ui` form primitive
> set, not just three components, because Plan 5 Task 16 (the quiz builder)
> needs `Field`, `Dialog`, `Checkbox` and `RadioGroup` and Plan 5 runs before
> Plan 6. Plan 6 Task 7 then adds only `Switch`, `DropdownMenu`, `Table` and
> `Kbd` on top of what ships here. Nothing in Plan 5 or Plan 6 re-creates
> `input.tsx`, `textarea.tsx`, `select.tsx`, `label.tsx`, `field.tsx`,
> `checkbox.tsx`, `radio-group.tsx` or `dialog.tsx`.

**Files:**
- Create: `packages/ui/src/components/{input.tsx,textarea.tsx,select.tsx,label.tsx,field.tsx,checkbox.tsx,radio-group.tsx,dialog.tsx}`
- Create: `packages/ui/src/components/input.test.tsx`, `packages/ui/src/components/field.test.tsx`
- Create: `packages/ui/vitest.config.ts`, `apps/web/vitest.config.ts`
- Modify: `packages/ui/src/index.ts`, `packages/ui/package.json`, `apps/web/package.json`
- Modify: `apps/web/lib/api.ts`

**Interfaces:**
- Produces:
  - `Input`, `Textarea`, `Select` (native `<select>`), `Label`, `Checkbox`, `RadioGroup`/`RadioGroupItem`, `Dialog` family — all from `@ayman/ui`
  - the `Field` family — `FieldSet`, `FieldLegend`, `FieldGroup`, `Field`, `FieldLabel`, `FieldDescription`, `FieldError` — plus
    `issuesForPath(issues: readonly StandardSchemaIssue[], name: string): StandardSchemaIssue[]`
  - `apiGetOrNull`, `apiSend` from `@/lib/api`
  - the vitest + jsdom harness for `apps/web` and `packages/ui`
- Consumes: the session cookie and CSRF header convention established in Plan 2 Task 8.

- [ ] **Step 0: Stand up the DOM test harness — this repo has none yet**

`packages/contracts` and `apps/api` already have test runners; `apps/web` and
`packages/ui` do not, and every later plan assumes they do. Whichever plan lands
first owns this, and that is this one.

```bash
pnpm --filter @ayman/web add -D vitest jsdom@27.0.0 @testing-library/react@16.3.0 \
  @testing-library/jest-dom@6.9.1 @vitejs/plugin-react
pnpm --filter @ayman/ui add -D vitest jsdom@27.0.0 @testing-library/react@16.3.0 \
  @testing-library/jest-dom@6.9.1 @vitejs/plugin-react
```

Add an identical `vitest.config.ts` to both packages with
`test.environment: 'jsdom'`, `test.setupFiles: ['./vitest.setup.ts']` (which
imports `@testing-library/jest-dom/vitest`), and
`test.include: ['**/*.test.{ts,tsx}']`. **`*.test.ts`, never `*.spec.ts`** —
Plan 7 Task 14 reserves `*.e2e.ts` for Playwright and `apps/api` reserves
`*.spec.ts` for Jest, so the three runners never fight over a file.

Wire `"test": "vitest run"` into both `package.json` files so Turborepo's `test`
task picks them up.

- [ ] **Step 1: Create the primitives**

`packages/ui/src/components/input.tsx`:
```tsx
import * as React from 'react';
import { cn } from '../lib/cn';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

/**
 * Hairline border, 6px radius, amber focus ring from the token. No shadow —
 * depth comes from the surface ladder, and `--shadow-*` is transparent in dark
 * mode anyway. Logical padding only.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'block w-full rounded-[var(--r-sm)] border border-line bg-surface-2 px-3 py-2',
        'text-fg placeholder:text-fg-muted',
        'transition-colors duration-150 ease-out',
        'focus-visible:border-accent',
        'disabled:cursor-not-allowed disabled:opacity-60',
        invalid && 'border-err',
        className,
      )}
      {...props}
    />
  );
});
```

`packages/ui/src/components/textarea.tsx` — identical treatment with
`React.TextareaHTMLAttributes<HTMLTextAreaElement>`, `min-h-32`, and
`field-sizing-content` so it grows with the text.

`packages/ui/src/components/select.tsx`:
```tsx
import * as React from 'react';
import { cn } from '../lib/cn';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
};

/**
 * A native <select>. RTL, keyboard behaviour, and mobile pickers are all
 * correct for free, and a custom listbox would be ~8kB of JS to reimplement
 * them worse. The admin taxonomy dropdowns are the only selects in this plan.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'block w-full rounded-[var(--r-sm)] border border-line bg-surface-2 px-3 py-2',
        'text-fg transition-colors duration-150 ease-out',
        'focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-60',
        invalid && 'border-err',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
```

`packages/ui/src/components/label.tsx`:
```tsx
import * as React from 'react';
import { cn } from '../lib/cn';

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  /** Renders the required marker. Never uppercase — Arabic has no case. */
  required?: boolean;
};

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { className, required, children, ...props },
  ref,
) {
  return (
    <label
      ref={ref}
      className={cn('mb-1.5 block text-[length:var(--fs-text-sm)] font-medium text-fg', className)}
      {...props}
    >
      {children}
      {required ? (
        <span aria-hidden="true" className="ms-1 text-accent-text">
          *
        </span>
      ) : null}
    </label>
  );
});
```

⚠️ `ms-1`, not `ml-1`. The lint rule reads through the ternary.

- [ ] **Step 2: Test the one piece with behaviour**

`packages/ui/src/components/input.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from './input';
import { Label } from './label';

describe('Input', () => {
  it('sets aria-invalid only when invalid', () => {
    const { rerender } = render(<Input aria-label="حقل" />);
    expect(screen.getByLabelText('حقل')).not.toHaveAttribute('aria-invalid');
    rerender(<Input aria-label="حقل" invalid />);
    expect(screen.getByLabelText('حقل')).toHaveAttribute('aria-invalid', 'true');
  });

  it('uses no physical-direction utility', () => {
    const { container } = render(<Label required>اسم</Label>);
    const classes = container.querySelector('span')?.className ?? '';
    expect(classes).toContain('ms-1');
    expect(classes).not.toMatch(/\bml-|\bmr-/);
  });
});
```

The harness this test runs on is the one added in Step 0.

- [ ] **Step 2b: Vendor the `Field` family, `Checkbox`, `RadioGroup` and `Dialog`**

These are the primitives Plan 5's quiz builder and Plan 6's admin forms both
need. They are vendored by hand rather than through `npx shadcn add`, because
the CLI writes `bg-background` / `text-foreground` token names we do not have and
physical-direction utilities the lint rule rejects.

The **canonical implementation, the `issuesForPath()` contract and its test are
specified verbatim in Plan 6 Task 7, Steps 1–3**. Execute that specification
*here*, in Plan 3's slot — Plan 6 Task 7 is then reduced to `Switch`,
`DropdownMenu`, `Table` and `Kbd`. Nothing about Plan 6's spec changes; only
where it runs does.

Required exports, exactly:

```ts
// packages/ui/src/components/field.tsx
export function issuesForPath(
  issues: readonly StandardSchemaIssue[],
  name: string,
): StandardSchemaIssue[];
export const FieldSet, FieldLegend, FieldGroup, Field, FieldLabel, FieldDescription, FieldError;
```

`Checkbox` and `RadioGroup`/`RadioGroupItem` are Radix-backed
(`@radix-ui/react-checkbox@1.3.4`, `@radix-ui/react-radio-group@1.3.9`) because
the quiz runner needs a controlled, keyboard-correct, RTL-native group and the
native controls cannot be styled to the token set without `appearance: none`
hacks. `Dialog` wraps `@radix-ui/react-dialog@1.1.23` and is the single confirm
prompt in the product — Plan 5's submit confirmation and Plan 6's destructive
confirmations both use it.

⚠️ `Field` renders `dir="rtl"` inheritance only; it must never set a physical
`text-left`/`text-right`. `FieldError` renders `--err` red **because a form error
is not quiz correctness** — this is the one sanctioned non-quiz use of `--err`,
and it is documented here so the design constraint is not read as forbidding it.

- [ ] **Step 3: Export them**

`packages/ui/src/index.ts` — append:
```ts
export { Input, type InputProps } from './components/input';
export { Textarea, type TextareaProps } from './components/textarea';
export { Select, type SelectProps } from './components/select';
export { Label, type LabelProps } from './components/label';
export { Checkbox, type CheckboxProps } from './components/checkbox';
export { RadioGroup, RadioGroupItem } from './components/radio-group';
export {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogClose,
} from './components/dialog';
export {
  issuesForPath, FieldSet, FieldLegend, FieldGroup, Field,
  FieldLabel, FieldDescription, FieldError,
} from './components/field';
```

- [ ] **Step 4: Extend `apps/web/lib/api.ts`**

Append to the existing file:

```ts
import { cookies } from 'next/headers';
import type { ZodType } from 'zod';

/**
 * 404 is a legitimate answer for a course slug, so it must not be an exception —
 * `notFound()` in a page needs `null`, not a thrown Error it has to string-match.
 */
export async function apiGetOrNull<T>(
  path: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<T | null> {
  const response = await fetch(resolve(path), {
    ...init,
    headers: { accept: 'application/json', ...init?.headers },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET ${path} failed with ${response.status}`);
  return schema.parse(await response.json());
}

/**
 * Authenticated, state-changing calls from Server Actions.
 *
 * Two things are load-bearing here:
 *  1. The session cookie is forwarded explicitly. A Server Action runs on the
 *     Node server, which has no ambient cookie jar — omitting this is why an
 *     admin action returns 401 while the same request works from the browser.
 *  2. `x-csrf-token` is sent because Plan 2's guard requires a custom header on
 *     every state-changing method. This request carries NO `Origin` and NO
 *     `Sec-Fetch-Site` (it is server-to-server), so that guard must treat an
 *     ABSENT Sec-Fetch-Site as acceptable — `same-origin` or `none`, per the
 *     research brief §6 P5-19. Reconcile this with Plan 2 before shipping.
 */
export async function apiSend<T>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  schema: ZodType<T>,
  body?: unknown,
): Promise<T> {
  const cookieStore = await cookies();
  const response = await fetch(resolve(path), {
    method,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-csrf-token': cookieStore.get('__Host-csrf')?.value ?? 'server-action',
      cookie: cookieStore.toString(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

  if (!response.ok) {
    // The API's message is safe to surface — the global exception filter
    // already strips stack traces and connection strings.
    const detail = await response.text();
    throw new Error(`${method} ${path} failed with ${response.status}: ${detail.slice(0, 300)}`);
  }

  return schema.parse(await response.json());
}
```

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @ayman/ui test
pnpm lint
git add packages/ui apps/web/lib/api.ts
git commit -m "feat(ui): input, textarea, select and label primitives; authenticated apiSend helper"
```

---

## Task 11: Admin course list, editor, and the server actions

**Files:**
- Create: `apps/web/app/(admin)/layout.tsx`
- Create: `apps/web/app/(admin)/admin/courses/page.tsx`
- Create: `apps/web/app/(admin)/admin/courses/[id]/page.tsx`
- Create: `apps/web/app/(admin)/admin/courses/actions.ts`
- Create: `apps/web/components/admin/course-form.tsx`
- Create: `apps/web/lib/cache-tags.ts`

**Interfaces:**
- Consumes: `apiSend`, `apiGet`, `copy.admin`, `TaxonomySchema`, `CourseCreateSchema`.
- Produces: the tag vocabulary (`TAG_COURSES`, `courseTag`) that Task 13's loaders and Task 15's invalidation both import, and the server actions `createCourseAction`, `updateCourseAction`, `setCourseStatusAction`, `reorderLessonsAction`.

- [ ] **Step 1: Create the tag vocabulary**

`apps/web/lib/cache-tags.ts`:
```ts
/**
 * ONE definition of every cache tag, imported by both the `'use cache'` loaders
 * and the server actions that invalidate them. A tag written as a string
 * literal in two files is a tag that will diverge, and a mismatched tag fails
 * SILENTLY — the page just serves stale forever with no error anywhere.
 *
 * ⚠️ `cacheTag` skips any tag over 256 characters with only a console warning,
 * and accepts at most 128 tags per call. `course:<uuid>` is 43 characters, and
 * the catalog LIST deliberately carries the single coarse tag rather than one
 * tag per course — 200 published courses would silently blow the 128 limit.
 *
 * `tag()` is the ONLY sanctioned way to build a tag anywhere in `apps/web`.
 * It throws on an over-long tag rather than letting Next skip it, which turns a
 * silent cache-invalidation hole into a build-time failure. Plan 6 Task 4
 * extends THIS file with `tags.settings/nav/flags/home`; it does not create a
 * second builder.
 */
export const MAX_TAG_LENGTH = 256;
export const MAX_TAGS_PER_CALL = 128;

export function tag(...parts: readonly string[]): string {
  const value = parts.join(':');
  if (value.length > MAX_TAG_LENGTH) {
    throw new Error(`cache tag exceeds ${MAX_TAG_LENGTH} characters and would be silently skipped: ${value.slice(0, 64)}…`);
  }
  return value;
}

export function assertTagBudget(values: readonly string[]): void {
  if (values.length > MAX_TAGS_PER_CALL) {
    throw new Error(`cacheTag accepts at most ${MAX_TAGS_PER_CALL} tags per call, got ${values.length}`);
  }
}

export const TAG_COURSES = tag('course');

/** Per-entity tag, so editing one course does not invalidate the other 40. */
export const courseTag = (courseId: string): string => tag('course', courseId);
```

Also create `apps/web/lib/cache-tags.test.ts` asserting that `tag()` joins with a colon, that a
257-character tag **throws** rather than returning, and that `assertTagBudget` throws at 129 tags.
It runs on the vitest + jsdom harness stood up in **Task 10, Step 0**.

- [ ] **Step 2: Write the server actions**

`apps/web/app/(admin)/admin/courses/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  CourseCreateSchema,
  CourseStatusPatchSchema,
  CourseUpdateSchema,
  ReorderSchema,
} from '@ayman/contracts';
import { apiSend } from '@/lib/api';
import { TAG_COURSES, courseTag } from '@/lib/cache-tags';

/** The API's course row, as much of it as the admin UI needs back. */
const CourseRowSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  status: z.enum(['draft', 'published', 'archived']),
});

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function createCourseAction(formData: FormData): Promise<never> {
  const parsed = CourseCreateSchema.parse({
    slug: formData.get('slug'),
    title: formData.get('title'),
    subtitle: (formData.get('subtitle') as string) || null,
    description: (formData.get('description') as string) || null,
    systemId: formData.get('systemId'),
    year: Number(formData.get('year')),
    trackId: (formData.get('trackId') as string) || null,
    subjectId: formData.get('subjectId'),
    coverKey: null,
  });

  const course = await apiSend('POST', '/api/admin/courses', CourseRowSchema, parsed);

  // A new draft is not in the public catalog, so no cache tag changes — only
  // the admin list, which is not cached.
  revalidatePath('/admin/courses');
  redirect(`/admin/courses/${course.id}`);
}

export async function updateCourseAction(
  courseId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const parsed = CourseUpdateSchema.parse({
      slug: formData.get('slug'),
      title: formData.get('title'),
      subtitle: (formData.get('subtitle') as string) || null,
      description: (formData.get('description') as string) || null,
      systemId: formData.get('systemId'),
      year: Number(formData.get('year')),
      trackId: (formData.get('trackId') as string) || null,
      subjectId: formData.get('subjectId'),
    });

    await apiSend('PATCH', `/api/admin/courses/${courseId}`, CourseRowSchema, parsed);

    // Per-entity ONLY. Editing a title must not evict the other 40 courses.
    // updateTag (not revalidateTag) so the editor's next read is their own write.
    updateTag(courseTag(courseId));
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function setCourseStatusAction(
  courseId: string,
  status: 'draft' | 'published' | 'archived',
): Promise<ActionResult> {
  try {
    const body = CourseStatusPatchSchema.parse({ status });
    await apiSend('PATCH', `/api/admin/courses/${courseId}/status`, CourseRowSchema, body);

    // Publishing changes LIST MEMBERSHIP, so the coarse tag has to go too —
    // this is the one operation that legitimately invalidates the catalog.
    updateTag(courseTag(courseId));
    updateTag(TAG_COURSES);
    revalidatePath('/admin/courses');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/** Called once per drag session, after the client-side debounce settles. */
export async function reorderLessonsAction(
  courseId: string,
  sectionId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  try {
    const body = ReorderSchema.parse({ orderedIds });
    await apiSend(
      'PATCH',
      `/api/admin/sections/${sectionId}/lessons/order`,
      z.object({ updated: z.number().int() }),
      body,
    );
    updateTag(courseTag(courseId));
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}
```

- [ ] **Step 3: Build the admin shell**

`apps/web/app/(admin)/layout.tsx` — the **one** admin shell in the product. Plans 5
and 6 render into it and neither creates a second one; Plan 6 Task 8 replaces the
body of *this file* with the full sidebar + command-palette shell, keeping the
path and the `<Toaster/>` mount.

```tsx
import Link from 'next/link';
import { copy } from '@ayman/contracts';
import { Toaster } from '@/components/toaster';

/**
 * `proxy.ts` (Plan 2 Task 8, matcher extended in Step 3b below) is what actually
 * keeps non-admins out of /admin. This layout renders chrome; it is not a
 * security boundary, and the API's deny-by-default guard is the real one
 * regardless of what the UI shows.
 *
 * The `sonner` <Toaster/> is mounted HERE, once, because Plan 5's quiz builder
 * and Plan 6's every-save-is-a-toast surfaces both assume exactly one mount in
 * the admin tree. Two mounts render every toast twice.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[var(--w-shell)] gap-8 px-6 py-10">
      <nav aria-label={copy.admin.nav.dashboard} className="w-48 shrink-0">
        <p className="eyebrow mb-3">{copy.admin.nav.content}</p>
        <ul className="space-y-1">
          <li>
            <Link
              href="/admin/courses"
              className="block rounded-[var(--r-sm)] px-3 py-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              {copy.admin.nav.courses}
            </Link>
          </li>
        </ul>
      </nav>
      <main className="min-w-0 flex-1">{children}</main>
      <Toaster />
    </div>
  );
}
```

`apps/web/components/toaster.tsx` is a two-line client component wrapping
`sonner`'s `<Toaster dir="rtl" position="bottom-center" />`. Install
`sonner@2.0.7` here (`pnpm --filter @ayman/web add sonner@2.0.7`) — Plan 5 and
Plan 6 both list it in their tech stacks and neither installs it a second time.

- [ ] **Step 3b: Extend the `proxy.ts` protected matcher to `/admin`**

Plan 2 Task 8 listed `/dashboard`, `/onboarding`, `/settings`. Add `/admin` and,
so that later plans stop editing a regex, refactor the list into a single
exported constant that every later plan appends to:

```ts
// apps/web/proxy.ts
export const PROTECTED_PREFIXES = [
  '/dashboard',   // Plan 2
  '/onboarding',  // Plan 2
  '/settings',    // Plan 2
  '/admin',       // Plan 3  ← added here
  // Plan 4 appends '/courses/:slug/lessons'; Plan 5 appends '/quizzes'
] as const;
```

Plan 7 Task 11 Step 1 extracts the redirect body of this file into
`apps/web/lib/auth/route-guard.ts` as
`resolveRedirect(request: NextRequest): URL | null` — keep the logic in one
function so that extraction stays a move, not a rewrite.

- [ ] **Step 4: Build the course list page**

`apps/web/app/(admin)/admin/courses/page.tsx`:
```tsx
import Link from 'next/link';
import { z } from 'zod';
import { Badge, Card, CardBody } from '@ayman/ui';
import { copy } from '@ayman/contracts';
import { apiGet } from '@/lib/api';

const AdminCourseListSchema = z.array(
  z.object({
    id: z.uuid(),
    slug: z.string(),
    title: z.string(),
    status: z.enum(['draft', 'published', 'archived']),
    year: z.number().int(),
    system: z.object({ nameAr: z.string() }),
    track: z.object({ labelAr: z.string() }).nullable(),
    subject: z.object({ nameAr: z.string() }),
    _count: z.object({ lessons: z.number().int() }),
  }),
);

const STATUS_LABEL = {
  draft: copy.admin.course.statusDraft,
  published: copy.admin.course.statusPublished,
  archived: copy.admin.course.statusArchived,
} as const;

/**
 * Not cached. The admin list must always reflect the last write — a stale
 * dashboard is how an editor publishes the same course twice.
 */
export default async function AdminCoursesPage() {
  const courses = await apiGet('/api/admin/courses', AdminCourseListSchema);

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold">
          {copy.admin.course.listTitle}
        </h1>
        <Link
          href="/admin/courses/new"
          className="rounded-[var(--r-sm)] bg-accent px-4 py-2 font-medium text-[var(--n-1)]"
        >
          {copy.admin.course.new}
        </Link>
      </div>

      {courses.length === 0 ? (
        <p className="text-fg-muted">{copy.admin.course.empty}</p>
      ) : (
        <ul className="space-y-3">
          {courses.map((course) => (
            <li key={course.id}>
              <Card>
                <CardBody className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/courses/${course.id}`}
                      className="block truncate font-medium text-fg"
                    >
                      {course.title}
                    </Link>
                    <p className="mono mt-1 text-[length:var(--fs-mono-label)] text-fg-muted">
                      {course.slug} · {course.system.nameAr} · {course.year} ·{' '}
                      {course.subject.nameAr} · {course._count.lessons}{' '}
                      {copy.catalog.lessonCount}
                    </p>
                  </div>
                  {/* Amber for published, neutral otherwise. Green is reserved
                      for quiz correctness and never used decoratively. */}
                  <Badge tone={course.status === 'published' ? 'accent' : 'neutral'}>
                    {STATUS_LABEL[course.status]}
                  </Badge>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
```

- [ ] **Step 5: Build the course form**

`apps/web/components/admin/course-form.tsx` — a client component driven by the
shared schema, with the conditional track logic mirroring onboarding:

```tsx
'use client';

import { useState } from 'react';
import type { Taxonomy } from '@ayman/contracts';
import { copy } from '@ayman/contracts';
import { Button, Input, Label, Select, Textarea } from '@ayman/ui';

type Props = {
  taxonomy: Taxonomy;
  subjects: ReadonlyArray<{ id: string; nameAr: string }>;
  defaults?: {
    slug: string;
    title: string;
    subtitle: string | null;
    description: string | null;
    systemId: string;
    year: number;
    trackId: string | null;
    subjectId: string;
  };
  action: (formData: FormData) => void | Promise<void>;
};

export function CourseForm({ taxonomy, subjects, defaults, action }: Props) {
  const [systemId, setSystemId] = useState(defaults?.systemId ?? taxonomy.systems[0]?.id ?? '');
  const [year, setYear] = useState(defaults?.year ?? 2);

  const system = taxonomy.systems.find((candidate) => candidate.id === systemId);
  // Grade 1 is common and non-specialized in BOTH systems, so the field is
  // HIDDEN — not disabled — and no value is submitted for it at all. A disabled
  // field with a stale value is exactly how a year-1 course acquires a track.
  const showTrack = year !== 1;

  return (
    <form action={action} className="max-w-[var(--w-prose)] space-y-5">
      <div>
        <Label htmlFor="title" required>
          {copy.admin.course.title}
        </Label>
        <Input id="title" name="title" defaultValue={defaults?.title} required />
      </div>

      <div>
        <Label htmlFor="slug" required>
          {copy.admin.course.slug}
        </Label>
        <Input id="slug" name="slug" defaultValue={defaults?.slug} dir="ltr" required />
        <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
          {copy.admin.course.slugHint}
        </p>
      </div>

      <div>
        <Label htmlFor="subtitle">{copy.admin.course.subtitle}</Label>
        <Input id="subtitle" name="subtitle" defaultValue={defaults?.subtitle ?? ''} />
      </div>

      <div>
        <Label htmlFor="description">{copy.admin.course.description}</Label>
        <Textarea id="description" name="description" defaultValue={defaults?.description ?? ''} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="systemId" required>
            {copy.admin.course.system}
          </Label>
          <Select
            id="systemId"
            name="systemId"
            value={systemId}
            onChange={(event) => setSystemId(event.target.value)}
          >
            {taxonomy.systems.map((option) => (
              <option key={option.id} value={option.id}>
                {option.nameAr}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="year" required>
            {copy.admin.course.year}
          </Label>
          <Select
            id="year"
            name="year"
            value={String(year)}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {(system?.years ?? []).map((option) => (
              <option key={option.year} value={String(option.year)}>
                {option.labelAr}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {showTrack ? (
        <div>
          <Label htmlFor="trackId">{copy.admin.course.track}</Label>
          <Select id="trackId" name="trackId" defaultValue={defaults?.trackId ?? ''}>
            <option value="">—</option>
            {(system?.tracks ?? []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.labelAr}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
          {copy.admin.course.trackNoneYear1}
        </p>
      )}

      <div>
        <Label htmlFor="subjectId" required>
          {copy.admin.course.subject}
        </Label>
        <Select id="subjectId" name="subjectId" defaultValue={defaults?.subjectId}>
          {subjects.map((option) => (
            <option key={option.id} value={option.id}>
              {option.nameAr}
            </option>
          ))}
        </Select>
      </div>

      <Button type="submit">{copy.admin.common.save}</Button>
    </form>
  );
}
```

- [ ] **Step 6: Wire the editor page**

`apps/web/app/(admin)/admin/courses/[id]/page.tsx` fetches
`GET /api/admin/courses/:id` and `GET /api/taxonomy`, renders `<CourseForm>`
bound to `updateCourseAction.bind(null, id)`, renders a publish/unpublish button
bound to `setCourseStatusAction`, and renders the section list with
`<SortableLessonList>` (Task 12) per section.

- [ ] **Step 7: Verify in a browser**

```bash
pnpm dev
open http://localhost:3200/admin/courses
```
Check by hand, and record what you saw:
- Creating a course lands on its editor page and the API stamped `status: draft`.
- Switching the year to `الصف الأول الثانوي` **removes** the track field from
  the DOM (inspect it — `hidden` or `disabled` is a fail).
- Submitting with a duplicate slug shows a failure, not a 500 page.
- `pnpm lint` reports zero `ayman/no-physical-direction` violations.

- [ ] **Step 8: Commit**

```bash
git add 'apps/web/app/(admin)' apps/web/components/admin apps/web/lib/cache-tags.ts
git commit -m "feat(web): admin course list, editor form, and cache-tagged server actions"
```

---

## Task 12: Drag-reorder with @dnd-kit — one debounced write

> **Reconciled scope.** The `@dnd-kit` wrapper produced here is **generic**, not
> lesson-specific, because Plan 5 Task 16 reorders quiz slots and Plan 6 Task 15
> reorders navigation items and homepage blocks with the same "one drag, one
> write of the whole ordered id array" contract. Neither of them scaffolds a
> second wrapper.

**Files:**
- Create: `apps/web/components/admin/sortable-list.tsx` — the **generic** wrapper
- Create: `apps/web/components/admin/sortable-lesson-list.tsx` — its first consumer
- Create: `apps/web/components/admin/use-debounced-reorder.ts`
- Create: `apps/web/components/admin/use-debounced-reorder.test.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: `reorderLessonsAction` from Task 11; the DOM test harness from Task 10 Step 0.
- Produces:
  - ```ts
    // apps/web/components/admin/sortable-list.tsx
    export interface SortableListProps<T extends { id: string }> {
      items: readonly T[];
      /** Fired ONCE per settled drag with the FULL ordered id array. */
      onReorder: (orderedIds: string[]) => void;
      renderItem: (item: T, handleProps: SortableHandleProps) => React.ReactNode;
      /** Debounce before `onReorder` fires. Default 600. */
      delayMs?: number;
      disabled?: boolean;
    }
    export function SortableList<T extends { id: string }>(props: SortableListProps<T>): React.ReactElement;
    ```
  - `<SortableLessonList courseId sectionId lessons />` — `SortableList` bound to `reorderLessonsAction`
  - `useDebouncedReorder({ initial, onCommit, delayMs })` → `{ items, onDragEnd, status, flush }`

- [ ] **Step 1: Install**

```bash
pnpm --filter @ayman/web add @dnd-kit/core@6.3.1 @dnd-kit/sortable@10.0.0 \
  @dnd-kit/utilities@3.2.2 @dnd-kit/modifiers@9.0.0
```

⚠️ **Not `@dnd-kit/react`.** It is pre-1.0 and carries open ordering bugs
(#1564: identical source and target reported in `onDragEnd`), which in a
reorder UI means silent no-op drags that the user has to discover by reloading.

- [ ] **Step 2: Write the failing test for the debounce hook**

The hook is where the "one write" guarantee actually lives, and it is pure
enough to test without a DOM drag simulation.

`apps/web/components/admin/use-debounced-reorder.test.ts`:
```ts
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedReorder } from './use-debounced-reorder';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `l${i}`);

describe('useDebouncedReorder', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('collapses many rapid drags into ONE commit', async () => {
    const onCommit = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() =>
      useDebouncedReorder({ initial: ids(40), onCommit, delayMs: 600 }),
    );

    for (let i = 0; i < 10; i += 1) {
      act(() => result.current.move(39 - i, 0));
    }
    expect(onCommit).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]?.[0]).toHaveLength(40);
  });

  it('sends the FULL ordered array, not a delta', async () => {
    const onCommit = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() =>
      useDebouncedReorder({ initial: ids(5), onCommit, delayMs: 100 }),
    );

    act(() => result.current.move(4, 0));
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(onCommit).toHaveBeenCalledWith(['l4', 'l0', 'l1', 'l2', 'l3']);
  });

  it('reverts to the last committed order when the write fails', async () => {
    const onCommit = vi.fn().mockResolvedValue({ ok: false, message: 'boom' });
    const { result } = renderHook(() =>
      useDebouncedReorder({ initial: ids(3), onCommit, delayMs: 10 }),
    );

    act(() => result.current.move(2, 0));
    expect(result.current.items).toEqual(['l2', 'l0', 'l1']);

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    expect(result.current.items).toEqual(['l0', 'l1', 'l2']);
    expect(result.current.status).toBe('error');
  });

  it('does not commit when the order is unchanged', async () => {
    const onCommit = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() =>
      useDebouncedReorder({ initial: ids(3), onCommit, delayMs: 10 }),
    );

    act(() => result.current.move(1, 1));
    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('flushes a pending write on unmount so a navigation cannot drop it', async () => {
    const onCommit = vi.fn().mockResolvedValue({ ok: true });
    const { result, unmount } = renderHook(() =>
      useDebouncedReorder({ initial: ids(3), onCommit, delayMs: 5000 }),
    );

    act(() => result.current.move(2, 0));
    unmount();

    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

```bash
pnpm --filter @ayman/web test use-debounced-reorder
```
Expected: FAIL — cannot resolve `./use-debounced-reorder`.

- [ ] **Step 4: Implement the hook**

`apps/web/components/admin/use-debounced-reorder.ts`:
```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type ReorderStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

type CommitResult = { ok: true } | { ok: false; message: string };

type Options = {
  initial: string[];
  onCommit: (orderedIds: string[]) => Promise<CommitResult>;
  delayMs?: number;
};

function arrayMove(list: readonly string[], from: number, to: number): string[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}

/**
 * Optimistic local order + one debounced write of the WHOLE array.
 *
 * Dragging one lesson across a 40-item list changes 40 positions. The naive
 * implementations are (a) one request per position — 40 requests, 40 chances to
 * interleave with another editor; or (b) one request per drag — which fires
 * again on every intermediate drop while the user is still arranging. This does
 * neither: local state updates instantly, and exactly one PATCH carrying the
 * final array leaves the browser once the user stops.
 */
export function useDebouncedReorder({ initial, onCommit, delayMs = 600 }: Options) {
  const [items, setItems] = useState<string[]>(initial);
  const [status, setStatus] = useState<ReorderStatus>('idle');

  // The last order the SERVER acknowledged. Reverting to anything else after a
  // failure would show the user an order that does not exist anywhere.
  const committedRef = useRef<string[]>(initial);
  const pendingRef = useRef<string[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending === null) return;

    setStatus('saving');
    void onCommitRef.current(pending).then((result) => {
      if (result.ok) {
        committedRef.current = pending;
        setStatus('saved');
      } else {
        // Revert. Leaving the optimistic order on screen after a rejected write
        // is how an editor believes they saved something they did not.
        setItems(committedRef.current);
        setStatus('error');
      }
    });
  }, []);

  const move = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      setItems((current) => {
        const next = arrayMove(current, from, to);
        pendingRef.current = next;
        setStatus('pending');
        if (timerRef.current !== null) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(flush, delayMs);
        return next;
      });
    },
    [delayMs, flush],
  );

  // A pending reorder must survive navigating away from the page. React runs
  // this cleanup on unmount, which covers client-side navigation; beforeunload
  // covers a hard reload or tab close.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pendingRef.current !== null) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      flush();
    };
  }, [flush]);

  return { items, status, move, flush };
}
```

- [ ] **Step 5: Run the test, confirm green**

```bash
pnpm --filter @ayman/web test use-debounced-reorder
```
Expected: PASS — 5 tests.

- [ ] **Step 6: Build the sortable list**

`apps/web/components/admin/sortable-lesson-list.tsx`:
```tsx
'use client';

import { useId } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { reorderLessonsAction } from '@/app/(admin)/admin/courses/actions';
import { useDebouncedReorder } from './use-debounced-reorder';

type Lesson = { id: string; title: string; kind: 'video' | 'quiz' | 'attachment' | 'text' };

type Props = { courseId: string; sectionId: string; lessons: Lesson[] };

const STATUS_LABEL = {
  idle: '',
  pending: copy.admin.common.saving,
  saving: copy.admin.common.saving,
  saved: copy.admin.common.saved,
  error: copy.admin.common.saveFailed,
} as const;

function SortableRow({ lesson }: { lesson: Lesson }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lesson.id,
  });

  return (
    <li
      ref={setNodeRef}
      // transform + opacity only. Animating height or inset would force layout
      // and paint on every frame of the drag.
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-3 rounded-[var(--r-sm)] border border-line bg-surface-2 px-3 py-2',
        isDragging && 'relative z-10 opacity-80',
      )}
    >
      <button
        type="button"
        aria-label={copy.admin.reorder.handle}
        className="cursor-grab rounded-[var(--r-xs)] px-2 py-1 text-fg-muted focus-visible:outline-2"
        {...attributes}
        {...listeners}
      >
        {/* Two hairline bars, not an emoji. */}
        <span aria-hidden="true" className="block h-px w-4 bg-current" />
        <span aria-hidden="true" className="mt-1 block h-px w-4 bg-current" />
      </button>
      <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
      <span className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
        {copy.course.lessonKind[lesson.kind]}
      </span>
    </li>
  );
}

export function SortableLessonList({ courseId, sectionId, lessons }: Props) {
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));

  const { items, status, move } = useDebouncedReorder({
    initial: lessons.map((lesson) => lesson.id),
    onCommit: (orderedIds) => reorderLessonsAction(courseId, sectionId, orderedIds),
  });

  const sensors = useSensors(
    // 8px of travel before a drag starts, so clicking the handle still works.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // Keyboard reordering is not optional — a mouse-only reorder UI is a WCAG
    // 2.1.1 failure and locks out anyone using a keyboard or switch device.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // dnd-kit's built-in announcements are English. Overriding them keeps the
  // screen-reader experience Arabic and keeps every string in contracts.
  const announcements: Announcements = {
    onDragStart: ({ active }) => `${copy.admin.reorder.pickedUp} ${items.indexOf(String(active.id)) + 1}`,
    onDragOver: ({ over }) =>
      over ? `${copy.admin.reorder.movedOver} ${items.indexOf(String(over.id)) + 1}` : undefined,
    onDragEnd: ({ over }) =>
      over ? `${copy.admin.reorder.dropped} ${items.indexOf(String(over.id)) + 1}` : undefined,
    onDragCancel: () => copy.admin.reorder.cancelled,
  };

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    move(items.indexOf(String(active.id)), items.indexOf(String(over.id)));
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{copy.admin.reorder.hint}</p>
        <p
          aria-live="polite"
          className={cn(
            'mono text-[length:var(--fs-mono-label)]',
            status === 'error' ? 'text-err' : 'text-fg-muted',
          )}
        >
          {STATUS_LABEL[status]}
        </p>
      </div>

      <DndContext
        // Explicit id: dnd-kit generates one otherwise, and a server/client
        // mismatch produces a hydration warning on every admin page load.
        id={useId()}
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        accessibility={{ announcements }}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {items.map((id) => {
              const lesson = byId.get(id);
              // key is the LESSON ID, never the array index — an index key makes
              // React reuse the wrong DOM node on every reorder.
              return lesson ? <SortableRow key={id} lesson={lesson} /> : null;
            })}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
```

Note: `status === 'error'` is the **one** place `text-err` appears outside quiz
correctness, and it is a genuine error state, not decoration.

- [ ] **Step 7: Verify in a browser and in the network tab**

```bash
pnpm dev
```
On a section with 40 lessons:
- Drag the last lesson to the top. The list reorders instantly.
- **Open the network tab and count the requests.** Expected: exactly **one**
  `PATCH .../lessons/order` about 600ms after you let go — not 40, not one per
  intermediate position. Record the count in your report.
- Perform five drags in quick succession. Expected: still one request.
- Tab to the drag handle, press Space, press ArrowDown three times, press Space.
  The lesson moves and the screen reader announces the Arabic position.
- Stop the API (`kill` the api process), drag again, and confirm the list snaps
  back to the previous order and shows `الحفظ فشل — التغييرات اترجعت زي ما كانت`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/admin apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): dnd-kit lesson reorder — optimistic, keyboard-accessible, one debounced write"
```

---

## Task 13: Public catalog and course detail, cached per entity

**Files:**
- Create: `apps/web/lib/catalog.ts`
- Create: `apps/web/components/content/{rich-text.tsx,youtube-embed.tsx}`
- Create: `apps/web/app/(site)/courses/page.tsx`
- Create: `apps/web/app/(site)/courses/loading.tsx`
- Create: `apps/web/app/(site)/courses/[slug]/page.tsx`
- Create: `apps/web/app/(site)/courses/[slug]/loading.tsx`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: `GET /api/catalog/courses`, `GET /api/catalog/courses/:slug`, `TAG_COURSES`, `courseTag`, `youTubeEmbedUrl`.
- Produces: `getCatalog(): Promise<CatalogList>` and `getCourse(slug): Promise<CatalogCourseDetail | null>` — both `'use cache'`, both tagged; `<RichText html />`, `<YouTubeEmbed externalId title />`.

- [ ] **Step 1: Install the render-side sanitizer**

```bash
pnpm --filter @ayman/web add isomorphic-dompurify@3.19.0
```

It runs in a **Server Component**, so jsdom stays on the server and the client
bundle gains nothing.

- [ ] **Step 2: Write the cached loaders**

`apps/web/lib/catalog.ts`:
```ts
import { cacheLife, cacheTag } from 'next/cache';
import { CatalogCourseDetailSchema, CatalogListSchema } from '@ayman/contracts';
import type { CatalogCourseDetail, CatalogList } from '@ayman/contracts';
import { apiGet, apiGetOrNull } from '@/lib/api';
import { TAG_COURSES, courseTag } from '@/lib/cache-tags';

/**
 * ⚠️ With `cacheComponents: true`, `fetch` is NOT cached by default and blocks
 * rendering. Every call into Nest from a Server Component is live unless it is
 * inside a `'use cache'` function — which is what these two are for.
 */
export async function getCatalog(): Promise<CatalogList> {
  'use cache';
  cacheLife('hours');
  // ONE coarse tag. Tagging each course individually would put 128+ tags on a
  // single cacheTag call once the catalog grows, and the excess is dropped with
  // only a console warning — a silent correctness bug. The list changes only
  // when a course is published or unpublished, and that operation invalidates
  // this tag deliberately.
  cacheTag(TAG_COURSES);
  return apiGet('/api/catalog/courses', CatalogListSchema);
}

export async function getCourse(slug: string): Promise<CatalogCourseDetail | null> {
  'use cache';
  cacheLife('hours');
  cacheTag(TAG_COURSES);

  const course = await apiGetOrNull(
    `/api/catalog/courses/${encodeURIComponent(slug)}`,
    CatalogCourseDetailSchema,
  );

  // The per-entity tag is only knowable AFTER the fetch, because the route is
  // keyed by slug and the tag is keyed by id. `cacheTag` may be called at any
  // point during the cached function's execution, including after an await —
  // this is the supported way to tag on data you just loaded.
  if (course) cacheTag(courseTag(course.id));

  return course;
}
```

- [ ] **Step 3: The render-side sanitizer and the embed**

`apps/web/components/content/rich-text.tsx`:
```tsx
import DOMPurify from 'isomorphic-dompurify';

/**
 * The SECOND sanitization pass. The first ran on write (apps/api), so the row
 * in Postgres is already clean — this exists because a single sanitizer is a
 * single point of failure, and because rows written before a future allowlist
 * change would otherwise render under the old rules.
 *
 * This is a Server Component: DOMPurify and its jsdom dependency never reach
 * the browser, and the sanitized markup is in the SSR'd HTML for crawlers.
 */
export function RichText({ html, className }: { html: string; className?: string }) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u',
      'ul', 'ol', 'li',
      'h2', 'h3',
      'blockquote', 'code', 'pre',
      'a',
    ],
    ALLOWED_ATTR: ['href', 'title', 'rel', 'target'],
    // Belt and braces: even if the tag list above ever widens, these stay out.
    FORBID_TAGS: ['iframe', 'script', 'style', 'object', 'embed', 'form'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  });

  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}
```

`apps/web/components/content/youtube-embed.tsx`:
```tsx
import { youTubeEmbedUrl, youTubeThumbnailUrl } from '@ayman/contracts';

/**
 * The URL is BUILT from the stored id, here, at render time. It is never read
 * from the database and never echoed from a request, so there is no value a
 * user could have supplied that ends up in `src`.
 *
 * `youtube-nocookie.com` is the single entry in the CSP's `frame-src`, and
 * `i.ytimg.com` the only remote host in `img-src`.
 */
export function YouTubeEmbed({ externalId, title }: { externalId: string; title: string }) {
  return (
    <div className="relative w-full overflow-hidden rounded-[var(--r-md)] border border-line">
      {/* 16:9 without a wrapper hack, and the box is reserved before load so
          CLS stays at 0. */}
      <div className="aspect-video">
        <iframe
          className="h-full w-full"
          src={youTubeEmbedUrl(externalId)}
          title={title}
          loading="lazy"
          // The poster is what the browser paints before the iframe resolves.
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <link rel="preload" as="image" href={youTubeThumbnailUrl(externalId)} />
    </div>
  );
}
```

- [ ] **Step 4: The catalog list page**

`apps/web/app/(site)/courses/page.tsx`:
```tsx
import Link from 'next/link';
import { Badge, Card, CardBody, CardHeader, CardTitle } from '@ayman/ui';
import { copy } from '@ayman/contracts';
import { getCatalog } from '@/lib/catalog';

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  return hours > 0
    ? `${hours} ${copy.catalog.hours} ${minutes} ${copy.catalog.minutes}`
    : `${minutes} ${copy.catalog.minutes}`;
}

export default async function CoursesPage() {
  const { courses } = await getCatalog();

  return (
    <main className="mx-auto max-w-[var(--w-shell)] px-6 py-16">
      <p className="eyebrow mb-2">{copy.catalog.eyebrow}</p>
      <h1 className="mb-2 text-[length:var(--fs-title-1)] font-semibold">{copy.catalog.title}</h1>
      <p className="mb-10 max-w-[var(--w-prose)] text-fg-muted">{copy.catalog.subtitle}</p>

      {courses.length === 0 ? (
        <p className="text-fg-muted">{copy.catalog.empty}</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {courses.map((course) => (
            <li key={course.id}>
              <Card>
                <CardHeader className="flex items-start justify-between gap-3">
                  <CardTitle>
                    <Link href={`/courses/${course.slug}`} className="text-fg">
                      {course.title}
                    </Link>
                  </CardTitle>
                  <Badge tone="accent">{copy.catalog.free}</Badge>
                </CardHeader>
                <CardBody className="space-y-3">
                  {course.subtitle ? <p className="text-fg-muted">{course.subtitle}</p> : null}
                  <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
                    {course.systemNameAr} · {course.subjectNameAr}
                    {course.trackLabelAr ? ` · ${course.trackLabelAr}` : ''}
                  </p>
                  <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted tabular-nums">
                    {course.lessonCount} {copy.catalog.lessonCount} ·{' '}
                    {formatDuration(course.totalSeconds)}
                  </p>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 5: The course detail page**

`apps/web/app/(site)/courses/[slug]/page.tsx` — server component that:
1. `const course = await getCourse(slug); if (!course) notFound();`
2. renders the breadcrumb, title, `<RichText html={course.description}>` when
   present, and the section/lesson outline with `<Badge>` for free previews;
3. renders `<YouTubeEmbed>` for the first free-preview video lesson, if any;
4. renders the JSON-LD blocks from Task 14.

- [ ] **Step 6: Skeletons**

Both `loading.tsx` files are **Server Components** so the skeleton is in the
SSR'd HTML. Text bar widths vary (100% / 85% / 60%) — uniform bars are the
single biggest "cheap skeleton" tell — and `animation-delay: 180ms` means a fast
load never flashes one.

⚠️ `loading.tsx` wraps `page.js` and *nested* layouts, but **not** the
same-segment `layout.js`. If `app/(site)/layout.tsx` ever calls `cookies()`, the
skeleton will appear not to work — that is the #1 cause and it is not a bug in
the skeleton.

- [ ] **Step 7: Verify the caching behaves as designed**

```bash
pnpm dev
curl -s http://localhost:3200/courses > /dev/null
```
Then, with the API's pino log visible, reload `/courses` three times.
Expected: **one** `GET /api/catalog/courses` in the API log, not three — the
`'use cache'` boundary is holding.

Edit a published course's title through `/admin/courses/<id>` and reload
`/courses/<slug>`: the new title appears immediately (`updateTag` gives the
editor read-your-own-writes), while `/courses` still shows the cached list until
the course is re-published — which is the intended per-entity split, not a bug.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/catalog.ts apps/web/components/content apps/web/app/\(site\) apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): public catalog and course detail, cached per entity with a DOMPurify render pass"
```

---

## Task 14: SEO — metadata, sitemap, robots, JSON-LD

**Files:**
- Create: `apps/web/lib/seo/jsonld.ts`
- Create: `apps/web/lib/seo/jsonld.test.ts`
- Create: `apps/web/components/seo/json-ld.tsx`
- Create: `apps/web/app/sitemap.ts`, `apps/web/app/robots.ts`
- Modify: `apps/web/app/(site)/courses/page.tsx`, `apps/web/app/(site)/courses/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getCatalog`, `getCourse`, `youTubeEmbedUrl`, `youTubeThumbnailUrl`.
- Produces: `secondsToIso8601Duration`, `organizationJsonLd`, `courseListJsonLd`, `courseJsonLd`, `videoObjectJsonLd`, `breadcrumbJsonLd`, `<JsonLd data />`, `sitemap()`, `robots()`, and `generateMetadata` on the course route.

- [ ] **Step 1: Write the failing test**

`apps/web/lib/seo/jsonld.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  breadcrumbJsonLd,
  courseJsonLd,
  courseListJsonLd,
  organizationJsonLd,
  secondsToIso8601Duration,
  videoObjectJsonLd,
} from './jsonld';

const course = (overrides = {}) => ({
  id: '0192f000-0000-7000-8000-000000000001',
  slug: 'programming-year-2',
  title: 'البرمجة وعلوم الحاسب',
  subtitle: 'الصف الثاني الثانوي',
  description: 'وصف الكورس',
  systemNameAr: 'البكالوريا المصرية',
  subjectNameAr: 'البرمجة وعلوم الحاسب',
  trackLabelAr: 'الهندسة وعلوم الحاسب',
  year: 2,
  lessonCount: 12,
  totalSeconds: 7200,
  publishedAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  ...overrides,
});

describe('secondsToIso8601Duration', () => {
  it.each([
    [0, 'PT0S'],
    [1, 'PT1S'],
    [59, 'PT59S'],
    [60, 'PT1M'],
    [90, 'PT1M30S'],
    [3600, 'PT1H'],
    [3661, 'PT1H1M1S'],
    [7200, 'PT2H'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(secondsToIso8601Duration(seconds)).toBe(expected);
  });
});

describe('courseListJsonLd', () => {
  it('returns null below three items — Google needs ≥3 for the list rich result', () => {
    expect(courseListJsonLd([course()])).toBeNull();
    expect(courseListJsonLd([course(), course({ slug: 'b' })])).toBeNull();
  });

  it('emits an ItemList of Course items at three or more', () => {
    const data = courseListJsonLd([
      course(),
      course({ slug: 'b', id: 'b' }),
      course({ slug: 'c', id: 'c' }),
    ]);
    expect(data?.['@type']).toBe('ItemList');
    expect(data?.itemListElement).toHaveLength(3);
    expect(data?.itemListElement[0]?.item['@type']).toBe('Course');
    expect(data?.itemListElement[0]?.position).toBe(1);
  });
});

describe('courseJsonLd', () => {
  it('marks the course free and Arabic, with an absolute URL', () => {
    const data = courseJsonLd(course());
    expect(data['@type']).toBe('Course');
    expect(data.inLanguage).toBe('ar');
    expect(data.isAccessibleForFree).toBe(true);
    expect(data.offers?.price).toBe('0');
    expect(data.url).toMatch(/^https?:\/\/.+\/courses\/programming-year-2$/);
    expect(data.provider?.['@type']).toBe('Organization');
  });
});

describe('videoObjectJsonLd', () => {
  it('uses the reconstructed nocookie embed and an ISO-8601 duration', () => {
    const data = videoObjectJsonLd({
      externalId: 'dQw4w9WgXcQ',
      name: 'المقدمة',
      description: 'وصف',
      durationSeconds: 305,
      uploadDate: '2026-07-01T00:00:00.000Z',
    });
    expect(data.embedUrl).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(data.thumbnailUrl).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(data.duration).toBe('PT5M5S');
  });
});

describe('breadcrumbJsonLd', () => {
  it('numbers positions from 1 and absolutises every item', () => {
    const data = breadcrumbJsonLd([
      { name: 'الرئيسية', path: '/' },
      { name: 'الكورسات', path: '/courses' },
    ]);
    expect(data.itemListElement[0]?.position).toBe(1);
    expect(data.itemListElement[1]?.item).toMatch(/\/courses$/);
  });
});

describe('the whole JSON-LD surface', () => {
  it('never emits FAQPage — Google removed the docs 2026-06-15, zero rich results', () => {
    const everything = JSON.stringify([
      organizationJsonLd(),
      courseListJsonLd([course(), course({ slug: 'b' }), course({ slug: 'c' })]),
      courseJsonLd(course()),
      breadcrumbJsonLd([{ name: 'الرئيسية', path: '/' }]),
    ]);
    expect(everything).not.toContain('FAQPage');
    expect(everything).not.toContain('Question');
  });
});
```

- [ ] **Step 2: Run it, confirm it fails, then implement**

```bash
pnpm --filter @ayman/web test jsonld
```
Expected: FAIL — cannot resolve `./jsonld`.

`apps/web/lib/seo/jsonld.ts`:
```ts
import { copy, youTubeEmbedUrl, youTubeThumbnailUrl } from '@ayman/contracts';
import type { CatalogCourse } from '@ayman/contracts';

/**
 * The site origin. Nothing else in the app is host-aware, so switching to a real
 * domain is one environment variable.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3200').replace(
  /\/$/,
  '',
);

const absolute = (path: string): string => `${SITE_URL}${path}`;

/** `PT1H1M1S`. Zero is `PT0S`, not the empty `PT`, which validators reject. */
export function secondsToIso8601Duration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds === 0) return 'PT0S';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `PT${hours > 0 ? `${hours}H` : ''}${minutes > 0 ? `${minutes}M` : ''}${
    rest > 0 ? `${rest}S` : ''
  }`;
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: copy.site.name,
    url: SITE_URL,
    description: copy.site.tagline,
  } as const;
}

export function courseJsonLd(course: CatalogCourse) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: course.title,
    description: course.subtitle ?? copy.site.tagline,
    url: absolute(`/courses/${course.slug}`),
    inLanguage: 'ar',
    isAccessibleForFree: true,
    educationalLevel: `${course.systemNameAr} — ${course.year}`,
    about: course.subjectNameAr,
    provider: { '@type': 'Organization', name: copy.site.name, url: SITE_URL },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EGP', category: 'Free' },
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: 'online',
      courseWorkload: secondsToIso8601Duration(course.totalSeconds),
    },
  };
}

/**
 * ⚠️ The `Course` "course info" rich result was DEPRECATED in Sept 2025. The
 * shape Google still supports on a catalog page is an `ItemList` carrying at
 * least THREE `Course` items — below three it produces nothing, so emitting a
 * one-item list is pure page weight. Returning null is the honest behaviour.
 */
export function courseListJsonLd(courses: readonly CatalogCourse[]) {
  if (courses.length < 3) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: courses.map((course, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: courseJsonLd(course),
    })),
  };
}

export function videoObjectJsonLd(video: {
  externalId: string;
  name: string;
  description: string;
  durationSeconds: number;
  uploadDate: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: video.name,
    description: video.description,
    // Built from the id, server-side. Same rule as the player.
    embedUrl: youTubeEmbedUrl(video.externalId),
    thumbnailUrl: youTubeThumbnailUrl(video.externalId),
    duration: secondsToIso8601Duration(video.durationSeconds),
    uploadDate: video.uploadDate,
    inLanguage: 'ar',
  };
}

export function breadcrumbJsonLd(trail: ReadonlyArray<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: absolute(entry.path),
    })),
  };
}

// NOT PRESENT AND NOT TO BE ADDED: FAQPage. Google removed the documentation on
// 2026-06-15 and it produces zero rich results for a site like this one. The
// test above fails if it ever reappears.
```

- [ ] **Step 3: The JSON-LD component**

`apps/web/components/seo/json-ld.tsx`:
```tsx
/**
 * `</script>` inside a JSON string closes the surrounding tag and everything
 * after it becomes markup. Escaping `<` is the standard fix and is not optional.
 *
 * ⚠️ Under a NONCE-based CSP this inline script needs the nonce. The public
 * catalog deliberately runs a HASH-based policy (nonces disable static
 * optimization and PPR), so it is fine here — but if `/courses` is ever moved
 * behind the authenticated matcher in proxy.ts, this breaks silently and the
 * structured data disappears from the rendered page.
 */
export function JsonLd({ data }: { data: unknown }) {
  if (data === null || data === undefined) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
```

- [ ] **Step 4: `generateMetadata` on the course route**

In `apps/web/app/(site)/courses/[slug]/page.tsx`:
```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { copy } from '@ayman/contracts';
import { getCourse } from '@/lib/catalog';
import { SITE_URL } from '@/lib/seo/jsonld';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const course = await getCourse(slug);
  if (!course) return { title: copy.course.notFound };

  const description = course.subtitle ?? course.description ?? copy.site.tagline;

  return {
    title: course.title,
    description,
    // Relative canonicals resolve against metadataBase; setting it absolutely
    // here keeps the value correct even when the page is rendered from a
    // background revalidation with no request context.
    alternates: { canonical: `${SITE_URL}/courses/${course.slug}` },
    openGraph: {
      type: 'website',
      locale: 'ar_EG',
      title: course.title,
      description,
      url: `${SITE_URL}/courses/${course.slug}`,
      siteName: copy.site.name,
    },
  };
}
```

Render the structured data inside the page body:
```tsx
      <JsonLd data={courseJsonLd(course)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: copy.course.breadcrumbHome, path: '/' },
          { name: copy.course.breadcrumbCatalog, path: '/courses' },
          { name: course.title, path: `/courses/${course.slug}` },
        ])}
      />
      {preview && preview.videoExternalId ? (
        <JsonLd
          data={videoObjectJsonLd({
            externalId: preview.videoExternalId,
            name: preview.title,
            description: course.subtitle ?? course.title,
            durationSeconds: preview.durationSeconds ?? preview.estimatedSeconds,
            uploadDate: course.publishedAt,
          })}
        />
      ) : null}
```

On `/courses`, render `<JsonLd data={courseListJsonLd(courses)} />` — it returns
`null` under three courses and the component renders nothing.

Add `<JsonLd data={organizationJsonLd()} />` to `app/layout.tsx`.

- [ ] **Step 5: sitemap and robots**

`apps/web/app/sitemap.ts`:
```ts
import type { MetadataRoute } from 'next';
import { getCatalog } from '@/lib/catalog';
import { SITE_URL } from '@/lib/seo/jsonld';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { courses } = await getCatalog();

  return [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/courses`, changeFrequency: 'daily', priority: 0.9 },
    // Only published courses are in getCatalog(), so a draft can never be
    // announced here — which is the usual way an unreleased URL leaks.
    ...courses.map((course) => ({
      url: `${SITE_URL}/courses/${course.slug}`,
      // updatedAt, not publishedAt: <lastmod> means "last modified".
      lastModified: new Date(course.updatedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
```

`apps/web/app/robots.ts`:
```ts
import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo/jsonld';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // robots.txt is a crawling hint, NOT an access control — every one of
        // these is also protected by proxy.ts and the API's deny-by-default
        // guard. Listing them here only keeps them out of the index.
        disallow: ['/admin', '/dashboard', '/onboarding', '/settings', '/api/', '/dev/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
```

- [ ] **Step 6: Run the tests and validate the output**

```bash
pnpm --filter @ayman/web test jsonld
```
Expected: PASS — 6 describe blocks.

```bash
curl -s http://localhost:3200/robots.txt
curl -s http://localhost:3200/sitemap.xml | head -20
curl -s http://localhost:3200/courses/<slug> | grep -o 'application/ld+json' | wc -l
```
Expected: robots lists the disallows and the sitemap URL; the sitemap contains
one `<url>` per published course and none for drafts; the course page carries 3
or 4 JSON-LD blocks (Organization, Course, BreadcrumbList, and VideoObject when
a free preview exists).

Paste the rendered `<script type="application/ld+json">` payloads into
`https://validator.schema.org` and record: zero errors. Do not claim it validates
without doing this.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/seo apps/web/components/seo apps/web/app/sitemap.ts apps/web/app/robots.ts apps/web/app/\(site\)
git commit -m "feat(web): metadata, sitemap, robots, and Organization/ItemList/Course/VideoObject/Breadcrumb JSON-LD"
```

---

## Task 15: End-to-end proof — author, publish, appear

This task exists to prove the whole loop: admin write → NestJS → Postgres →
cache invalidation → SSR'd public page → structured data.

**Files:**
- Modify: `apps/web/app/(admin)/admin/courses/[id]/page.tsx` (publish control + blocked-state message)
- Create: `docs/verification/2026-07-26-plan-3-e2e.md` (the recorded run)

**Interfaces:**
- Consumes: everything above.
- Produces: a recorded verification pass, not new code.

- [ ] **Step 1: Wire the publish control**

The button calls `setCourseStatusAction(courseId, 'published')`. When the API
returns 400 because the course has no published lesson, surface
`copy.admin.course.publishBlocked` — not the raw API string, and not a silent
failure.

- [ ] **Step 2: Run the loop by hand and record each observation**

With `pnpm dev` running, log in as the admin and do this in order. Write the
actual observed result next to each line in the verification doc; "should work"
is not an observation.

1. Create a course. → Lands on the editor, `status: draft`.
2. Visit `/courses`. → The new course is **absent**.
3. Add a section, then four lessons: one `video`, one `text`, one `attachment`,
   one `quiz`.
4. On the video lesson, paste
   `https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxxxx&si=track`.
   → Then read the row back:
   ```bash
   psql "$DIRECT_DATABASE_URL" -c \
     "SELECT external_id FROM app.lesson_videos ORDER BY created_at DESC LIMIT 1;"
   ```
   Expected: `dQw4w9WgXcQ` — 11 characters, no `list`, no `si`, no host.
5. On the text lesson, paste
   `<p>مرحبا</p><script>alert(1)</script><iframe src="https://evil.example"></iframe><a href="https://example.com">لينك</a>`.
   → Read `app.lesson_texts.body_html` back. Expected: no `<script`, no
   `<iframe`, and the anchor carries `rel="noopener noreferrer nofollow"`.
6. Drag the fourth lesson to the top. → **One** `PATCH .../lessons/order` in the
   network tab. Record the count.
7. Publish the course while every lesson is still unpublished. → Blocked with
   `لازم يكون فيه محاضرة منشورة واحدة على الأقل`.
8. Publish the section and lessons, then publish the course. → Succeeds.
9. Reload `/courses`. → The course appears **immediately** (the publish action
   called `updateTag(TAG_COURSES)`).
10. Open `/courses/<slug>` in a logged-out private window. → Renders. View
    source: the lesson titles and the sanitized description are in the **SSR'd
    HTML**, not injected by client JS.
11. `curl -s http://localhost:3200/sitemap.xml | grep <slug>` → present.
12. Unpublish the course, reload `/courses`. → Gone immediately.
    `curl -s -o /dev/null -w '%{http_code}' http://localhost:3200/courses/<slug>`
    → `404`, not 403.
13. As a logged-in **student**, `POST /api/courses/<id>/enroll`. → 200, and
    ```bash
    psql "$DIRECT_DATABASE_URL" -c \
      "SELECT scope, source, valid_until FROM app.access_grants ORDER BY created_at DESC LIMIT 1;"
    ```
    shows `platform | auto_free | NULL`. Free is a **row**.
14. As that same student, `PATCH /api/admin/courses/<id>` → `403`.
    `PATCH /api/admin/courses/<id>/status` → `403`.
    `GET /api/catalog/courses` → `200` (public).

- [ ] **Step 3: Full gate**

```bash
pnpm lint && pnpm typecheck && pnpm test
```
Expected: green across `@ayman/config`, `@ayman/contracts`, `@ayman/ui`,
`@ayman/web`, `@ayman/api`. Report the total test count.

- [ ] **Step 4: Commit**

```bash
git add 'apps/web/app/(admin)' docs/verification
git commit -m "test: end-to-end verification of authoring, publishing, and catalog invalidation"
```

---

## Definition of done

- [ ] Pasting any YouTube URL form stores exactly 11 characters, verified by reading the column back with `psql`.
- [ ] A hostile URL (`youtube.com.evil.example`, `https://www.youtube.com@evil.example`, `javascript:`, `http://169.254.169.254/`) is rejected by the schema, and **no request is ever made to a user-supplied URL** anywhere in the codebase — verified by `grep -rn "fetch(" apps/api/src` returning nothing that takes a stored or submitted URL.
- [ ] `INSERT`ing a URL into `lesson_videos.external_id` with raw SQL is rejected by Postgres.
- [ ] `<iframe>`, `<script>`, `on*` handlers and `style` attributes never survive a lesson-text write, proven against the XSS corpus.
- [ ] Reordering 40 lessons produces **exactly one** HTTP request and **exactly one** `UPDATE` — counted in the network tab and asserted structurally in `reorder.sql.spec.ts`.
- [ ] Reordering is fully operable from the keyboard, with Arabic screen-reader announcements.
- [ ] A rejected reorder leaves the previous order intact in the database and on screen.
- [ ] `GET /api/catalog/courses` never contains a draft course; `GET /api/catalog/courses/:slug` returns **404** (not 403) for one.
- [ ] The public payload contains none of `priceCents`, `instructorId`, `status`, `visibleFrom`, `visibleTo`, `unlocksAfterLessonId`, `viewLimit`, `contentGroupId`, `completionPassGrade`, `bodyHtml`.
- [ ] A video id is exposed **only** for free-preview lessons.
- [ ] Sending `{status:'published'}` to `PATCH /api/admin/courses/:id` returns **400**, not 200 and not a silent strip. Publishing requires `course:publish`.
- [ ] Sending any reserved lesson field (`visibleFrom`, `viewLimit`, …) returns **400**.
- [ ] A course with zero published lessons cannot be published.
- [ ] `publishedAt` is stamped once and does not move on republish.
- [ ] Editing a course title invalidates **only** that course's tag; publishing invalidates the list tag too — observed, not assumed.
- [ ] Three reloads of `/courses` produce **one** API call in the pino log.
- [ ] Entitlement is an `access_grants` row with `scope='platform'`, `source='auto_free'`; `resolveCourseAccess` returns an object with a `reason` on denial, and there is no boolean entitlement anywhere.
- [ ] Only one live platform grant per user can exist, enforced by the partial unique index.
- [ ] `/sitemap.xml` lists every published course and no draft; `/robots.txt` disallows `/admin`, `/dashboard`, `/api/`, `/dev/`.
- [ ] JSON-LD validates with zero errors at validator.schema.org; `ItemList` appears only at ≥3 courses; **no `FAQPage` anywhere**, asserted by a test.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` green; zero `ayman/no-physical-direction` violations; zero user-facing Arabic literals outside `packages/contracts`.
- [ ] No shadows in dark mode, no radius above 8px on a card, no gradients, no emoji icons, and green/red appear only for genuine error state — never as decoration.

## Deliberately not in this plan

**Plan 4 (course player & progress):** the lesson player route, `lesson_progress`, `subject_attempts`, the 10-second heartbeat with server-side accumulation, the dual completion rule (`max_position_seconds ≥ 0.95 × duration` **and** `watched_seconds ≥ 0.70 × duration`), the manual "أنهيت الدرس · التالي" button, and the continue-watching dashboard. The `completion_mode` / `completion_min_view_seconds` / `completion_pass_grade` columns ship here **unread** so Plan 4 is a service, not a migration.

**Plans 5–6 (question bank, quiz builder, runner, grading, review):** `quizzes`, `quiz_slots`, `quiz_pools`, `quiz_attempts`, `attempt_questions`, `attempt_events`, `grade_appeals`, the four Moodle grading algorithms, and the answer-leakage contract test. `LessonKind.quiz` exists here as a lesson type with no payload table — attaching `quizzes` 1:1 to a lesson is additive.

**Deferred within content:** file uploads (the `storageKey`/`coverKey` columns exist, but the presigned-PUT flow, the `file-type` magic-byte check, the `sharp` re-encode and the separate serving origin are their own plan); the `media_assets` table; `content_groups` (the FK column is reserved and stays NULL); WYSIWYG rich-text editing (v1 accepts HTML directly — the sanitizer is what makes that safe, and a Tiptap/Lexical integration changes nothing server-side); attachment reordering UI; course-level drag-reorder on `/admin/courses`; TanStack Table for the admin list; `nuqs` URL state; `cmdk` and `sonner`.

**Deferred entitlement:** access codes, wallet, checkout, `subject_teacher`-scoped grants in the UI, grant expiry jobs, and the admin grant editor. The scope enum, the validity window and the source enum all ship here so every one of those is a controller, not a migration.

**Not enforced by design:** `visible_from`, `visible_to`, `unlocks_after_lesson_id`, `view_limit`, `content_group_id`. The columns exist; nothing reads them; the DTOs reject them. Switching any of them on is its own plan with its own authorization-matrix tests, because a scheduling gate that is 90% implemented is worse than one that is 0% implemented.

**Also not here:** Redis-backed `cacheHandler` (`'use cache'` currently uses in-memory storage and dies with the process — required before a second replica), the Redis throttler storage adapter, the CSP hash pipeline for the public catalog, `@bprogress/next` route progress, motion, the WebGL moment, and the 3D object.

---

## Depends on

Plan 3 is build-order items 7–8. It is the **first** plan in the content half and produces more than
it consumes. The register in `docs/superpowers/plans/README.md` is normative.

**Plan 1 — Foundation** (`2026-07-25-plan-1-foundation.md`)
- Workspace, Turborepo task graph, `packages/config` ESLint preset including `ayman/no-physical-direction`
- `packages/ui` tokens + `cn()` + `Badge`, `Card`, `CardBody`, `Button`
- `packages/contracts` with `copy` (`copy.common`, `copy.nav`, `copy.taxonomy`) and the taxonomy schemas
- Prisma 7 wiring (`provider = "prisma-client"`, `moduleFormat = "cjs"`, output inside `apps/api/src/`), schema `app`, the three Postgres roles, and the taxonomy models `EducationSystem`, `AcademicYear`, `Track`, `Subject`, `SubjectOffering`, `Governorate`
- `PrismaService`, the Zod-validated `env.ts`, the global exception filter, `ThrottlerModule.forRoot`
- `apps/web/lib/api.ts` with `apiGet`, and the same-origin `/api` rewrite in `next.config.ts`

**Plan 2 — Auth & onboarding** (`2026-07-26-plan-2-auth-onboarding.md`)
- Prisma `User` (with `role`, `emailVerified`), `Session`, `Account`, `Verification`, `StudentProfile`
- `AuthGuard` as `APP_GUARD`, `@Public()`, `@CurrentUser()` → `AuthenticatedUser` exposing **`id` and `role`**, `@RequirePermission()`
- `apps/api/src/auth/permissions.ts` exporting `PERMISSIONS`, `type Permission`, `ROLE_PERMISSIONS`, `permissionsForRole()`, `roleHasPermission()` — **Plan 3 appends, never replaces**
- The CSRF guard: header `x-csrf-token` required on state-changing methods, plus `Origin` / `Sec-Fetch-Site` validation. **It must accept `Sec-Fetch-Site ∈ {same-origin, none}` *and absent*** — `apiSend` is called from a Next Server Action, a server-to-server request that carries neither header. It must also publish whether the token *value* is verified or presence suffices; Plan 3 sends the `__Host-csrf` cookie value.
- `apps/web/proxy.ts` with the redirect logic. Plan 3 Task 11 Step 3b adds `/admin` to `PROTECTED_PREFIXES`.
- `react-hook-form@7.83.0` + `@hookform/resolvers@5.5.3` installed in `apps/web`
- `copy.auth.*`, `copy.onboarding.*`, `copy.settings.*`

**Nothing in Plan 3 depends on Plans 4–7.** Auditing (`AuditService.record`), the data-table
foundation, the media upload pipeline and Redis-backed throttling all arrive later and are
retrofitted onto the services created here; none of them is required for Plan 3's definition of done.
