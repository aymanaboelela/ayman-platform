# Plan 6 — Admin Dashboard & Platform Configuration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the founder's headline requirement — **every single thing on the site is controlled from the dashboard**. An admin logs in, sees a role-gated RTL shell, and from there edits students, attempts, grade appeals, the entire taxonomy (including its Arabic labels), the homepage composition, the navigation menu, the branding, the feature flags, and the media library. Every one of those writes is hash-chained into an append-only audit log, and every public read of that configuration comes from a `'use cache'` loader that the admin's own save action invalidates with `updateTag()` so the editor sees their write immediately.

**Architecture:** NestJS owns all configuration state and remains the only writer to Postgres and the sole authorization authority. `apps/web` renders the admin as a route group `(admin)` whose server layout resolves the caller's **permission set** (never their role) from `GET /api/session`. List screens are TanStack Table v8 in fully manual mode, driven by URL state held in one `nuqs` `createSearchParamsCache` per route, so a filtered view is a shareable link. Public-facing configuration (branding, nav, flags, home blocks) is read through cached loaders tagged `settings:<key>`; admin-facing reads of the same data are deliberately **uncached** so an editor never sees a stale form.

**Tech Stack:** `@tanstack/react-table@8.21.3` · `nuqs@2.9.2` · `cmdk@1.1.1` · `sonner@2.0.7` · `react-hook-form@7.83.0` + `@hookform/resolvers@5.5.3` · `@dnd-kit/core@6.3.1` + `@dnd-kit/sortable@10.0.0` · `sharp@0.35.3` · `file-type@22.0.1` · `lucide-react@1.27.0` · Radix primitives · Prisma 7.9.0 · Next.js 16.2.11 (`cacheComponents: true`)

**Spec:** `docs/superpowers/specs/2026-07-25-ayman-platform-design.md` §5.4, §6.7, §7-P6
**Research brief:** `docs/research/2026-07-25-research-brief.md` §4.4, §5.7, §6-P6
**Prerequisites:** Plans 1–5 complete. This plan is build-order items 12–13 and consumes interfaces from every earlier plan — see **Depends on** at the end of this document. Task 11 is hard-blocked on Plan 5.

All versions above were verified against the npm registry on 2026-07-26 and are the current `latest` for every package.

---

## Reconciliation notes (cross-plan pass, 2026-07-26)

Reconciled against Plans 3–5 and 7. `docs/superpowers/plans/README.md` is normative.
**Plan 6 runs after Plans 3, 4 and 5**, so several things its draft claimed to *provide* to them
are in fact provided *to it*. Decisions that changed **this** plan:

1. **`apps/api/src/auth/permissions.ts` is owned by Plan 2.** Task 1 **extends** the catalogue and
   adds `GET /api/session`; it does **not** "replace the body" — doing so would silently revoke
   `course:*`, `section:*`, `lesson:*`, `enrollment:*`, `progress:*` and `quiz:*` from Plans 3–5.
   Task 1's `PERMISSIONS` array and its student-set assertion below have been corrected to the
   full catalogue.
2. **`packages/ui` form primitives come from Plan 3 Task 10.** `Input`, `Textarea`, `Select`
   (native), `Label`, the `Field` family (+ `issuesForPath`), `Checkbox`, `RadioGroup` and `Dialog`
   already exist. **Task 7 is reduced to `Switch`, `DropdownMenu`, `Table` and `Kbd`.** Task 7's
   Field / `issuesForPath` specification is still the canonical one — Plan 3 Task 10 Step 2b
   executes it, in Plan 3's slot, because Plan 5 needs those primitives and Plan 5 runs first.
   Plan 6 does **not** add a Radix `Select`; the native one from Plan 3 is the product's select.
3. **`apps/web/lib/cache-tags.ts` is created by Plan 3 Task 11**, already exporting `tag()`,
   `assertTagBudget()`, `MAX_TAG_LENGTH`, `MAX_TAGS_PER_CALL`, `TAG_COURSES` and `courseTag()`.
   **Task 4 extends that file** with `tags.settings/nav/flags/home` and the cached loaders; it does
   not create it and does not re-write the guard.
4. **The admin shell is `apps/web/app/(admin)/layout.tsx`**, created by Plan 3 Task 11 with the
   `sonner` `<Toaster dir="rtl"/>` mounted. **Task 8 replaces the body of that file**; it does not
   create `app/(admin)/admin/layout.tsx`, which would be a second layout in the same segment tree.
   `components/toaster.tsx` and the `sonner@2.0.7` install also already exist — do not repeat them.
5. **`SortableList` comes from Plan 3 Task 12** (`apps/web/components/admin/sortable-list.tsx`).
   Task 15 imports it. `buildReorderSql` comes from Plan 3 Task 8 and its whitelist union already
   contains `'navigation_items'` and `'home_blocks'`.
6. **Task 11 is screens-only.** Plan 5 owns every quiz, attempt and appeal endpoint. Task 11 no
   longer creates `packages/contracts/src/admin/attempts.ts`, `src/modules/admin/attempts/*`, or a
   second `app/(admin)/admin/appeals/page.tsx`. It builds the `/admin/attempts` DataTable screen
   over Plan 5's `GET /api/admin/attempts`, wires its unlock button to Plan 5's
   `POST /api/admin/attempts/:id/reopen`, and **upgrades** Plan 5's existing appeals page to the
   DataTable + `nuqs` pattern against `GET /api/admin/appeals` and `PATCH /api/admin/appeals/:id`.
   Permissions used: `attempt:read`, `attempt:unlock`, `appeal:read`, `appeal:resolve` — all
   already in the catalogue from Plan 5.
7. **Plan 3's permission names are `course:create` / `course:update` / `course:publish` /
   `course:delete`, `section:write`, `section:reorder`, `lesson:write`, `lesson:reorder`** — not
   `course:write`. This plan's interface list said otherwise and is corrected.
8. **Plan 6 owns `AUDIT_ACTIONS` in full** — including `course:publish`, `course:unpublish`,
   `lesson:update`, `quiz:answer-edit`, `attempt:unlock`, `appeal:resolve` and
   `enrollment:override`. Plans 3–5 do **not** append to it and do **not** call `AuditService`;
   **Task 3 gains a retrofit step** that wires `AuditService.record()` into the mutating services
   those plans created. That is the correct direction — the auditor arrives last and instruments
   what already exists.
9. **Media env vars.** Plan 4 owns `MEDIA_BASE_URL` (api-side) and the `MEDIA_URL_RESOLVER` read
   port. This plan owns the upload pipeline (`MEDIA_STORAGE`, `sharp`, magic bytes) and
   `NEXT_PUBLIC_MEDIA_ORIGIN` (web-side). **They must resolve to the same origin**; Task 13 adds a
   boot assertion that they do, and rebinds `MEDIA_URL_RESOLVER` onto `MediaStorage` rather than
   introducing a second resolver. Plan 3's lesson attachments move onto this pipeline here.
10. **`app.audit_log` REVOKEs are written in this plan's migration** (Constraint 17). Plan 7
    Task 10 **verifies** them and adds the session/statement timeouts; it does not re-issue them.
    Plan 5's `attempt_events` REVOKEs belong to Plan 5's migration, likewise verified by Plan 7.
11. **Copy namespaces owned here:** everything under `copy.admin.*` **except** `admin.common`,
    `admin.nav`, `admin.course`, `admin.section`, `admin.lesson` and `admin.reorder`, which are
    Plan 3's — this plan **appends** entries to `admin.nav` and `admin.common` but never rewrites
    them. Plan 5's quiz-admin strings live under `copy.quizAdmin.*`, outside `copy.admin` entirely,
    so Task 11's screens read `copy.quizAdmin.*` for attempt and appeal labels.
    Full register: Plan 1 `common`/`nav`/`taxonomy` · Plan 2 `auth`/`onboarding`/`settings` ·
    Plan 3 `catalog`/`course`/`admin.{common,nav,course,section,lesson,reorder}` ·
    Plan 4 `player`/`dashboard`/`enrollment` ·
    Plan 5 `quiz`/`quizErrors`/`appeal`/`quizAdmin` ·
    Plan 6 the rest of `admin.*` · Plan 7 `a11y`/`code`/`showpiece`.

---

## Global Constraints

> **Canonical set.** These nine are identical in Plans 3–7 and are restated in
> `docs/superpowers/plans/README.md` § Global Constraints, which is normative: single origin / no
> CORS · ports 3200 web + 3300 api · RTL logical utilities only · no user-facing literals outside
> `packages/contracts` · extensionless relative imports · `@@schema("app")` on every Prisma model ·
> deny-by-default guards with `resource:action` permissions · no gradients / glass / emoji, radius
> ≤ 8px, no dark-mode shadows · **green and red reserved for quiz correctness**. Never
> `$queryRawUnsafe` / `$executeRawUnsafe` — the ESLint `no-restricted-syntax` rule hard-fails both.

Every task's requirements implicitly include this section. Constraints 1–10 are inherited and still binding; 11–18 are new to this plan.

1. **Single origin.** `apps/web` serves `/`, `apps/api` serves `/api`. **Never configure CORS.** The one deliberate exception in this plan is the media origin (Constraint 16), which is a *different* origin on purpose and serves opaque bytes, not JSON.
2. **Ports:** web `3200`, api `3300`. Port 3000 is occupied by an unrelated service on this machine. Media is served from the api origin in dev (Task 12).
3. **RTL is native, not mirrored.** Logical Tailwind utilities only: `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`, `text-end`, `border-s-*`, `border-e-*`. The `ayman/no-physical-direction` ESLint rule sees through `cn()`/`clsx()`, template literals, ternaries, arrays, object keys **and module-level class constants** — a sidebar width constant is not an escape hatch.
4. **No user-facing string literals outside `packages/contracts`.** Every admin label, column header, empty state, toast message, confirmation prompt, and validation message lives in `packages/contracts/src/copy/ar.ts`. `app/dev/*` is exempt; **`app/(admin)/*` is NOT exempt.**
5. **Extensionless relative imports.** `moduleResolution: Bundler` in both apps. Leaf modules in `packages/contracts` that `apps/api` imports for their runtime *value* also need an explicit subpath export in `packages/contracts/package.json` — Node's native ESM loader cannot resolve extensionless barrel re-exports at runtime.
6. **All Prisma models get `@@schema("app")`.** Prisma 7 keeps connection strings out of `schema.prisma`. `prisma generate` does **not** run automatically after `migrate` — run it explicitly.
7. **NestJS guards are the sole authorization authority.** Permissions are `resource:action` strings, never role equality checks. Deny by default. The web layer's checks are UX only and must be expressed against the permission list, never `role === 'admin'`.
8. **Separate DTOs per role**, with `whitelist: true` + `forbidNonWhitelisted: true`. The realistic attack in this plan is not privilege escalation, it is an admin-shaped payload arriving on a student-scoped route, and a student PATCHing `{ role: 'admin' }` onto their own profile.
9. **Design:** no gradients, no glassmorphism, no emoji icons (use `lucide-react`), radius ≤ 8px on cards, no shadows in dark mode, the amber accent used **flat**. **Green and red are reserved for quiz correctness** and must never be decorative — this constrains the branding colour presets (Task 5) and the audit-log outcome chips (Task 17).
10. **Commit after every task.** Explicit `git add <paths>`, conventional commit messages. Never `git add -A` in this plan — the media upload directory and generated Prisma client must not be staged.
11. **TanStack Table is v8.21.3, never v9.** v9 is `9.0.0-beta.*`, a breaking rewrite. ⚠️ **Context7 serves v9 docs for `/tanstack/table` by default** — an agent scaffolding from them will generate code that does not compile. If you fetch docs, pin the v8 version explicitly and sanity-check that `useReactTable` takes `getCoreRowModel` as an option, not a plugin.
12. **Server-side table mode is mandatory** on every admin list: `manualPagination: true`, `manualSorting: true`, `manualFiltering: true`, pass `rowCount`, **omit `getPaginationRowModel`/`getSortedRowModel`/`getFilteredRowModel`**, and **set `getRowId: (row) => row.id`**. Without `getRowId`, selection is index-based and bulk actions silently operate on the wrong records once you are on page 2. (Correction to the research brief's shorthand: `getCoreRowModel()` is still **required** — it is what builds rows at all. The three getters above are the ones to omit.)
13. **URL state is `nuqs`.** One `createSearchParamsCache` per admin list route, exported from a single module shared by the RSC page and its client controls. `shallow: false` on every filter and on `page` (the server must re-render); `throttleMs: 400` on free-text search only.
14. **`cacheTag` limits are real:** 128 tags per call, 256 characters each. **Longer tags are silently skipped with only a console warning** — a silent cache-invalidation hole. All tags go through the `tag()` builder from Task 4, which throws instead.
15. **The admin save path calls `updateTag()`, not `revalidateTag()`.** `updateTag` expires the tag *and* refreshes it for the current request, so the editor reads their own write. `revalidateTag` only marks it stale for the next visitor, which makes the admin look broken.
16. **Media is served from a different origin than the app.** A same-origin HTML upload is same-origin XSS regardless of CSP. In dev this is `http://localhost:3300/media/...` (a different port is a different origin under the same-origin policy). `NEXT_PUBLIC_MEDIA_ORIGIN` is the **third and last** place a host may appear in web code, after `next.config.ts` and `lib/api.ts`.
17. **`audit_log` is INSERT-only for `ayman_runtime`.** `DELETE`, `UPDATE` and `TRUNCATE` are explicitly `REVOKE`d in the migration — the table already inherited them from `ALTER DEFAULT PRIVILEGES`, so a revoke statement is required, not optional.
18. **The colour picker is constrained to token slots.** An editor selects from a fixed enum of accent presets and radius presets. **There is no free-text colour input anywhere in the admin.** The style renderer never interpolates editor-supplied text.

---

## Security Requirements

Each closes a specific attack. These are verified by tests, not by inspection.

| # | Requirement | Attack it closes |
|---|---|---|
| A1 | Every admin route carries `@RequirePermission('<resource>:<action>')`; none checks `role === 'admin'` | Role-equality drift as roles multiply |
| A2 | `getRowId: (row) => row.id` on every table | Bulk action applied to the wrong rows on page ≥ 2 |
| A3 | Sort/filter column names map through a hardcoded object, never string-interpolated | SQL injection via a sort parameter (column names cannot be parameterised) |
| A4 | Separate admin DTOs; role change is its own endpoint, never a field on the profile PATCH | Privilege escalation riding along in a bulk edit |
| A5 | `site_settings` singleton enforced by `CHECK (id = 1)` in Postgres | Sanity's documented failure mode: duplicate settings documents, non-deterministic reads |
| A6 | `audit_log` hash-chained on `prev_hash`, insert serialised by a Postgres advisory lock | Undetectable tampering; forked chains under concurrent writes |
| A7 | `DELETE`/`UPDATE`/`TRUNCATE` on `audit_log` revoked from `ayman_runtime` | An SQLi foothold erasing its own trail |
| A8 | Upload: extension allowlist → magic-byte sniff of the **buffer** → **re-encode through sharp** → UUID key | Polyglot files, EXIF/GPS leakage, `Content-Type`-header spoofing |
| A9 | SVG is rejected outright, including for logos and favicons | SVG is a script-capable document format; no sanitiser is worth trusting here |
| A10 | Media served from a different origin, with `nosniff`, `Content-Disposition`, `sandbox` CSP and a fixed `Content-Type` we produced ourselves | Same-origin XSS via uploaded content |
| A11 | Storage keys are validated against `^[0-9a-f]{2}/[0-9a-f-]{36}\.webp$` **and** path-containment-checked before any disk read | Path traversal out of the media root |
| A12 | `renderBrandingStyle()` output is asserted against a strict declaration regex; inputs are enums, never strings | CSS injection / style-based data exfiltration through the branding form |
| A13 | `EducationSystem.slug` and `Track.slug` are immutable through the taxonomy editor | `OnboardingSchema` hardcodes the system slugs; renaming one silently breaks every future signup |
| A14 | `sharp` runs with `limitInputPixels` set | Decompression-bomb DoS |
| A15 | Every admin mutation writes an audit entry **inside** the same transaction as the change where possible, and always before the response | A successful write with no trail |

---

## File Structure

```
packages/contracts/
├─ src/copy/ar.ts                     + `admin.*` — every admin string in the product
├─ src/admin/settings.ts              SiteSettingsSchema, BrandingSchema, SeoSchema, ContactSchema
├─ src/admin/branding.ts              ACCENT_SLOTS / RADIUS_SLOTS enums (the token-slot contract)
├─ src/admin/students.ts              AdminStudentRowSchema, AdminStudentPatchSchema, ListResponse
├─ src/admin/taxonomy.ts              Taxonomy write schemas (labels editable, slugs immutable)
├─ src/admin/navigation.ts            NavigationItemSchema, ReorderSchema
├─ src/admin/home-blocks.ts           HomeBlockSchema — a discriminated union on `type`
├─ src/admin/media.ts                 MediaAssetSchema, UPLOAD limits + allowlist
├─ src/admin/flags.ts                 FeatureFlagSchema
├─ src/admin/audit.ts                 AuditEntrySchema, AUDIT_ACTIONS
└─ src/admin/index.ts                 barrel (+ subpath exports in package.json)

packages/ui/
├─ src/lib/branding.ts                ACCENT_RAMPS, RADIUS_RAMPS, renderBrandingStyle()
├─ src/lib/branding.test.ts
│  (field / input / textarea / select / label / checkbox / radio-group / dialog
│   come from PLAN 3 Task 10 — verified here, not re-created)
├─ src/components/switch.tsx          Radix Switch
├─ src/components/dropdown-menu.tsx   Radix DropdownMenu — row action menus
├─ src/components/table.tsx           semantic <table> shell with tabular-nums
└─ src/components/kbd.tsx             <kbd> chip — mono, used by the command palette

apps/api/
├─ prisma/schema.prisma               + SiteSetting, FeatureFlag, NavigationItem, HomeBlock,
│                                       MediaAsset, AuditLog
├─ prisma/migrations/*_platform_config/migration.sql   CHECK(id=1), audit_log REVOKEs, seed row
├─ src/auth/permissions.ts            + PERMISSIONS catalogue, permissionsForRole()
├─ src/audit/audit.service.ts         hash chain, advisory-locked insert, verifyChain()
├─ src/audit/audit.service.spec.ts
├─ src/audit/chain.ts                 pure canonicalise() + chainHash() — TDD'd first
├─ src/audit/chain.spec.ts
├─ src/audit/audit.module.ts
├─ src/modules/admin/settings/*       controller + service + DTOs
├─ src/modules/admin/students/*       list/detail/patch/role-change
├─ src/modules/admin/taxonomy/*       CRUD over systems/years/tracks/subjects/governorates
├─ src/modules/admin/flags/*
├─ src/modules/admin/navigation/*
├─ src/modules/admin/home-blocks/*
├─ src/modules/admin/audit/*          read-only audit viewer + chain verification
├─ src/modules/media/media.controller.ts       POST /api/media (admin) + GET /media/:p/:n (public)
├─ src/modules/media/media.service.ts          the upload pipeline
├─ src/modules/media/file-signature.service.ts magic-byte sniffing, isolated behind DI
├─ src/modules/media/storage/media-storage.ts  the interface + MEDIA_STORAGE token
├─ src/modules/media/storage/local-disk.storage.ts
└─ test/file-signature.check.ts       real file-type round-trip, run by tsx (see Task 12)

apps/web/
├─ lib/cache-tags.ts                  (modify — PLAN 3 owns tag()) + tags.settings/nav/flags/home
├─ lib/settings.ts                    'use cache' public loaders (branding, nav, flags, blocks)
├─ lib/admin-api.ts                   authenticated server-side fetch helper for admin routes
├─ lib/session.ts                     getSession() → { id, email, role, permissions[] }
├─ app/layout.tsx                     + <style> branding injection + NuqsAdapter
├─ app/(admin)/layout.tsx             (modify — PLAN 3 created it) permission gate + shell
├─ app/(admin)/admin/page.tsx         overview
├─ app/(admin)/admin/students/*       list + [userId] detail
├─ app/(admin)/admin/attempts/*       attempts screen over PLAN 5's endpoints
├─ app/(admin)/admin/appeals/*        (modify — PLAN 5 created page.tsx) DataTable upgrade
├─ app/(admin)/admin/taxonomy/*       systems/years/tracks/subjects/governorates
├─ app/(admin)/admin/settings/*       branding, seo, contact
├─ app/(admin)/admin/flags/page.tsx
├─ app/(admin)/admin/navigation/page.tsx
├─ app/(admin)/admin/home/page.tsx    homepage composer
├─ app/(admin)/admin/media/page.tsx
├─ app/(admin)/admin/audit/page.tsx
├─ components/admin/app-sidebar.tsx   RTL sidebar (sidebar-07 shape, our tokens)
├─ components/admin/data-table/*      useDataTable, toolbar, pagination, faceted filter, bulk bar
├─ components/admin/command-palette.tsx
├─ components/admin/shortcuts.ts      the single shortcut registry
│  (sortable-list.tsx and toaster.tsx come from PLAN 3 — verified here, not re-created)
└─ components/admin/shortcuts.ts      the single shortcut registry
```

---

## Task 1: Permission catalogue and the session permission set

The whole plan hangs off this. Before any admin route exists, `resource:action` strings must be enumerable, typed and greppable, and the web app must be able to ask "may I" without ever comparing a role.

**Files:**
- Modify: `apps/api/src/auth/permissions.ts`
- Modify: `apps/api/src/auth/permissions.spec.ts` (create if Plan 2 did not)
- Modify: `apps/api/src/auth/decorators/require-permission.decorator.ts`
- Modify: `apps/api/src/auth/session.controller.ts`
- Create: `apps/web/lib/session.ts`

**Interfaces:**
- Consumes: `roleHasPermission(role, permission)` and `AuthGuard` from Plan 2.
- Produces:
  - `PERMISSIONS: readonly Permission[]` and `type Permission = (typeof PERMISSIONS)[number]`
  - `permissionsForRole(role: string): readonly Permission[]`
  - `RequirePermission(permission: Permission)` — now typed, so a typo is a compile error
  - `GET /api/session` → `{ id: string; email: string; role: string; permissions: Permission[] }`
  - `getSession(): Promise<SessionUser | null>` in `apps/web/lib/session.ts`

- [ ] **Step 1: Write the failing test.** Create/extend `apps/api/src/auth/permissions.spec.ts`:

```ts
import { PERMISSIONS, permissionsForRole, roleHasPermission } from './permissions';

describe('permission catalogue', () => {
  it('has no duplicate entries', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it('every entry is resource:action shaped', () => {
    for (const permission of PERMISSIONS) {
      expect(permission).toMatch(/^[a-z][a-z-]*:[a-z][a-z-]*$/);
    }
  });

  it('admin holds every catalogued permission', () => {
    expect(permissionsForRole('admin')).toEqual([...PERMISSIONS]);
  });

  // RECONCILED: the student set is the union of what Plans 2–5 appended. Asserting
  // a shorter list here would pass only by deleting other plans' permissions.
  it('student holds exactly its own set, and never admin:access', () => {
    expect([...permissionsForRole('student')].sort()).toEqual([
      'appeal:create',
      'course:read',
      'enrollment:create',
      'enrollment:read',
      'profile:read',
      'profile:write',
      'progress:read',
      'progress:write',
      'quiz:attempt',
      'quiz:read',
    ]);
    expect(roleHasPermission('student', 'admin:access')).toBe(false);
    expect(roleHasPermission('student', 'settings:write')).toBe(false);
    expect(roleHasPermission('student', 'course:publish')).toBe(false);
    expect(roleHasPermission('student', 'attempt:unlock')).toBe(false);
  });

  // The catalogue must be exhaustive: a @RequirePermission string that is not in
  // PERMISSIONS is a route nobody can ever reach, and it fails silently.
  it('every @RequirePermission argument in the repo is catalogued', () => {
    const used = collectRequirePermissionArguments('apps/api/src');
    expect([...used].filter((p) => !PERMISSIONS.includes(p as Permission))).toEqual([]);
  });

  it('an unknown or missing role holds nothing (fail closed)', () => {
    expect(permissionsForRole('parent')).toEqual([]);
    expect(permissionsForRole(undefined)).toEqual([]);
    expect(roleHasPermission(null, 'course:read')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.**

```bash
pnpm --filter @ayman/api exec jest src/auth/permissions.spec.ts
```
Expected: fails — `PERMISSIONS` and `permissionsForRole` do not exist.

- [ ] **Step 3: Implement.** **Extend** `apps/api/src/auth/permissions.ts` — Plan 2 created it and Plans 3, 4 and 5 have each appended to it. Keep every existing entry and keep `roleHasPermission`'s semantics intact so Plan 2's guard spec stays green. Replacing the file's body would revoke `course:*`, `section:*`, `lesson:*`, `enrollment:*`, `progress:*`, `quiz:*`, `question:*`, `attempt:*`, `appeal:*` and `analytics:read` in one commit, and the only symptom would be 403s in production:

```ts
/**
 * Permissions are `resource:action` strings, checked against a role→permission
 * map — never role equality (Global Constraint 7). `ROLE_PERMISSIONS` below is
 * the *only* place a role name is ever looked up; everywhere else only ever
 * asks "does this role hold this permission?".
 *
 * Each plan APPENDS its own permissions to this catalogue. Plan 6 owns the
 * admin surface; Plans 3–5 add `course:*`, `lesson:*`, `quiz:*`, `question:*`.
 * Keep the list alphabetically grouped by resource so merges are trivial.
 */

export const PERMISSIONS = [
  // student-facing (Plan 2)
  'course:read',
  'profile:read',
  'profile:write',
  // content authoring (Plan 3) — DO NOT DROP
  'course:create',
  'course:update',
  'course:publish',
  'course:delete',
  'section:write',
  'section:reorder',
  'lesson:write',
  'lesson:reorder',
  'enrollment:read',
  'enrollment:create',
  // progress (Plan 4) — DO NOT DROP
  'progress:read',
  'progress:write',
  // quiz (Plan 5) — DO NOT DROP
  'question:read',
  'question:write',
  'quiz:read',
  'quiz:write',
  'quiz:attempt',
  'quiz:grade',
  'attempt:grade',
  'appeal:create',
  'analytics:read',
  // admin shell
  'admin:access',
  // platform configuration (Plan 6)
  'settings:read',
  'settings:write',
  'flags:read',
  'flags:write',
  'nav:read',
  'nav:write',
  'home:read',
  'home:write',
  'media:read',
  'media:write',
  'media:delete',
  'taxonomy:read',
  'taxonomy:write',
  'student:read',
  'student:write',
  'student:role-change',
  'attempt:read',
  'attempt:unlock',
  'appeal:read',
  'appeal:resolve',
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type Role = 'admin' | 'student';

/**
 * `'*'` grants every permission, including ones added after this line was
 * written — that is deliberate. `permissionsForRole` materialises it into the
 * concrete catalogue for the client, which needs a list rather than a wildcard.
 */
const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission> | '*'> = {
  admin: '*',
  // RECONCILED: this is the accumulated set from Plans 2–5. Keep it in sync with
  // the assertion in permissions.spec.ts; shrinking it is a silent regression.
  student: new Set<Permission>([
    'profile:read',      // Plan 2
    'profile:write',     // Plan 2
    'course:read',       // Plan 2
    'enrollment:read',   // Plan 3
    'enrollment:create', // Plan 3
    'progress:read',     // Plan 4
    'progress:write',    // Plan 4
    'quiz:read',         // Plan 5
    'quiz:attempt',      // Plan 5
    'appeal:create',     // Plan 5
  ]),
};

const KNOWN_ROLES = new Set<string>(Object.keys(ROLE_PERMISSIONS));

function isKnownRole(role: string): role is Role {
  return KNOWN_ROLES.has(role);
}

/**
 * Whether `role` grants `permission`. An unrecognised or missing role holds no
 * permissions — fail closed, same principle as the guard's S12 handling.
 */
export function roleHasPermission(role: string | undefined | null, permission: string): boolean {
  if (!role || !isKnownRole(role)) return false;
  const granted = ROLE_PERMISSIONS[role];
  return granted === '*' || granted.has(permission as Permission);
}

/**
 * The concrete permission list for a role. The web app uses this to decide what
 * to *render*; it is never the authorization decision itself — that is always
 * the guard, on the server, per request.
 */
export function permissionsForRole(role: string | undefined | null): readonly Permission[] {
  if (!role || !isKnownRole(role)) return [];
  const granted = ROLE_PERMISSIONS[role];
  if (granted === '*') return PERMISSIONS;
  return PERMISSIONS.filter((permission) => granted.has(permission));
}
```

- [ ] **Step 4: Type the decorator.** In `apps/api/src/auth/decorators/require-permission.decorator.ts`, change the parameter type from `string` to `Permission`:

```ts
import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../permissions';

export const PERMISSION_KEY = 'ayman:permission';

/**
 * Typed on purpose: `@RequirePermission('setings:write')` is now a compile
 * error rather than a route that silently denies everyone forever.
 */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);
```

- [ ] **Step 5: Extend `GET /api/session`.** Rewrite `apps/api/src/auth/session.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from './decorators/current-user.decorator';
import { type Permission, permissionsForRole } from './permissions';

export interface SessionResponse {
  id: string;
  email: string;
  role: string;
  permissions: readonly Permission[];
}

/**
 * No `@Public()` — deliberately undecorated, so it also serves as the live
 * proof that deny-by-default holds for an ordinary route.
 *
 * `permissions` exists so the web app can decide what to RENDER without ever
 * writing `role === 'admin'`. It is not an authorization decision: the guard
 * re-checks on every request, and a client that lies about its own permission
 * list simply gets a 403 from the API it then calls.
 */
@Controller('session')
export class SessionController {
  @Get()
  me(@CurrentUser() user: AuthenticatedUser): SessionResponse {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      permissions: permissionsForRole(user.role),
    };
  }
}
```

- [ ] **Step 6: Add the web-side session reader.** Create `apps/web/lib/session.ts`:

```ts
import { headers } from 'next/headers';
import { z } from 'zod';

const SessionSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string(),
  permissions: z.array(z.string()),
});

export type SessionUser = z.infer<typeof SessionSchema>;

const SERVER_BASE = process.env.API_ORIGIN ?? 'http://localhost:3300';

/**
 * Reads the caller's session from the API, forwarding the incoming cookie.
 * Server Components only — `headers()` makes the caller dynamic, which is
 * correct here: no admin page may ever be prerendered or cached.
 *
 * Returns null on 401 so callers can redirect; any other failure throws,
 * because "the API is down" must not render as "you are logged out".
 */
export async function getSession(): Promise<SessionUser | null> {
  const incoming = await headers();
  const cookie = incoming.get('cookie');

  const response = await fetch(`${SERVER_BASE}/api/session`, {
    headers: cookie ? { cookie, accept: 'application/json' } : { accept: 'application/json' },
    cache: 'no-store',
  });

  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`GET /api/session failed with ${response.status}`);
  }

  return SessionSchema.parse(await response.json());
}

/** UX-level check only. The API guard is the authorization decision. */
export function can(session: SessionUser | null, permission: string): boolean {
  return session?.permissions.includes(permission) ?? false;
}
```

- [ ] **Step 7: Run the tests, confirm green, and verify by hand.**

```bash
pnpm --filter @ayman/api exec jest src/auth
pnpm typecheck
```
Then with `pnpm dev` running, log in as a student in the browser and:
```bash
curl -s http://localhost:3200/api/session -b "<paste the session cookie>" | python3 -m json.tool
```
Expected: `permissions` contains exactly `course:read`, `profile:read`, `profile:write` and **not** `admin:access`.

- [ ] **Step 8: Commit.**

```bash
git add apps/api/src/auth apps/web/lib/session.ts
git commit -m "feat(auth): typed permission catalogue and session permission set"
```

---

## Task 2: Platform-configuration data model

Six tables, one hand-written CHECK, and one hand-written REVOKE. Prisma can express neither of the last two, so both live in the migration SQL and both get proved by a rejected statement.

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_platform_config/migration.sql` (generated, then edited)
- Create: `apps/api/src/modules/admin/admin.constants.ts`

**Interfaces:**
- Produces: Prisma models `SiteSetting`, `FeatureFlag`, `NavigationItem`, `HomeBlock`, `MediaAsset`, `AuditLog`; the singleton row `site_settings(id = 1)`; an `audit_log` on which `ayman_runtime` holds `INSERT` and `SELECT` only.

- [ ] **Step 1: Add the models** to `apps/api/prisma/schema.prisma`:

```prisma
// ── Platform configuration (spec §6.7) ───────────────────────────────────

/// Singleton. `id` is fixed at 1 and enforced by a CHECK constraint in the
/// migration — Sanity's documented failure mode is duplicate settings
/// documents, after which "the settings" is whichever row the query happened
/// to return first. `data` is a jsonb blob validated by SiteSettingsSchema in
/// packages/contracts on the way in and on the way out; keeping it as jsonb
/// means adding a settings field is a schema change in TypeScript, not a
/// migration.
model SiteSetting {
  id        Int      @id @default(1)
  data      Json
  updatedBy String?  @map("updated_by")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("site_settings")
  @@schema("app")
}

/// Flag *declarations* live in TypeScript (typed, greppable). This table holds
/// only the VALUES, so a flag nobody declared is inert rather than dangerous.
model FeatureFlag {
  key           String   @id
  descriptionAr String   @map("description_ar")
  enabled       Boolean  @default(false)
  rollout       Json?
  updatedBy     String?  @map("updated_by")
  updatedAt     DateTime @updatedAt @map("updated_at")

  @@map("feature_flags")
  @@schema("app")
}

/// The menu builder's tree. `position` is an int with an id tie-break, never a
/// CSV sequence column. `visibleTo` holds permission strings, not role names.
model NavigationItem {
  id          String    @id @default(uuid(7))
  parentId    String?   @map("parent_id")
  labelAr     String    @map("label_ar")
  href        String
  icon        String?
  position    Int
  visibleTo   String[]  @default([]) @map("visible_to")
  isPublished Boolean   @default(true) @map("is_published")
  archivedAt  DateTime? @map("archived_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  parent   NavigationItem?  @relation("NavTree", fields: [parentId], references: [id], onDelete: Cascade)
  children NavigationItem[] @relation("NavTree")

  @@index([parentId, position])
  @@map("navigation_items")
  @@schema("app")
}

enum HomeBlockType {
  hero
  courseGrid
  stats
  testimonials
  faq
  cta

  @@schema("app")
}

/// The homepage composer. `props` is validated by the HomeBlockSchema
/// discriminated union (Task 15) — the union discriminant is this `type`
/// column, so a row can never carry props from a different block type.
model HomeBlock {
  id          String        @id @default(uuid(7))
  key         String        @unique
  type        HomeBlockType
  props       Json
  position    Int
  isPublished Boolean       @default(false) @map("is_published")
  archivedAt  DateTime?     @map("archived_at")
  createdAt   DateTime      @default(now()) @map("created_at")
  updatedAt   DateTime      @updatedAt @map("updated_at")

  @@index([position])
  @@map("home_blocks")
  @@schema("app")
}

/// Stores the storage KEY, never a full URL. The URL is reconstructed from
/// MEDIA_ORIGIN at render time, so moving to S3/R2 changes one env var rather
/// than rewriting every row.
model MediaAsset {
  id         String    @id @default(uuid(7))
  storageKey String    @unique @map("storage_key")
  filename   String
  mime       String
  sizeBytes  Int       @map("size_bytes")
  width      Int?
  height     Int?
  altAr      String?   @map("alt_ar")
  uploadedBy String?   @map("uploaded_by")
  archivedAt DateTime? @map("archived_at")
  createdAt  DateTime  @default(now()) @map("created_at")

  @@index([createdAt])
  @@map("media_assets")
  @@schema("app")
}

/// Append-only, hash-chained. `prevHash` is the previous row's `hash`, so any
/// edit or deletion breaks verification from that point forward. INSERT-only
/// for ayman_runtime — the REVOKE lives in the migration.
model AuditLog {
  id             BigInt   @id @default(autoincrement())
  occurredAt     DateTime @default(now()) @map("occurred_at")
  actorUserId    String?  @map("actor_user_id")
  actorIp        String?  @map("actor_ip") @db.Inet
  actorUserAgent String?  @map("actor_user_agent")
  action         String
  resourceType   String   @map("resource_type")
  resourceId     String?  @map("resource_id")
  outcome        String
  metadata       Json?
  requestId      String?  @map("request_id")
  prevHash       String?  @map("prev_hash") @db.Char(64)
  hash           String   @db.Char(64)

  @@index([occurredAt])
  @@index([actorUserId, occurredAt])
  @@index([resourceType, resourceId])
  @@map("audit_log")
  @@schema("app")
}
```

> ⚠️ Check every `@@map` against the table names in the File Structure before generating. Prisma validates none of them — any string is a legal table name, so a typo produces a perfectly valid migration for a table nothing else references.

- [ ] **Step 2: Generate the migration:**

```bash
cd apps/api
pnpm exec prisma migrate dev --name platform_config --create-only
```
`--create-only` because the SQL needs hand edits before it runs.

- [ ] **Step 3: Append the three things Prisma cannot express** to the generated `migration.sql`:

```sql
-- ── A5: the singleton is enforced by the DATABASE, not the UI ─────────────
ALTER TABLE "app"."site_settings"
  ADD CONSTRAINT "site_settings_singleton" CHECK ("id" = 1);

-- Seed the one row so every read is a plain findUnique and never a
-- "create it if it's missing" race between two concurrent admins.
INSERT INTO "app"."site_settings" ("id", "data", "updated_at")
VALUES (1, '{}'::jsonb, now())
ON CONFLICT ("id") DO NOTHING;

-- ── A7: audit_log is INSERT-only for the runtime role ─────────────────────
-- The table already inherited SELECT/INSERT/UPDATE/DELETE from the
-- ALTER DEFAULT PRIVILEGES set up in scripts/db-bootstrap.sql, so an explicit
-- REVOKE is required — omitting it leaves the trail erasable.
REVOKE UPDATE, DELETE, TRUNCATE ON "app"."audit_log" FROM "ayman_runtime";

-- The sequence is still needed for the bigserial id.
GRANT USAGE, SELECT ON SEQUENCE "app"."audit_log_id_seq" TO "ayman_runtime";
```

- [ ] **Step 4: Apply and regenerate.** Prisma 7 does **not** run generate after migrate:

```bash
pnpm exec prisma migrate dev
pnpm exec prisma generate
```

- [ ] **Step 5: Prove both constraints hold.** Connect **as `ayman_runtime`**, not as the owner:

```bash
psql "postgresql://ayman_runtime:dev_runtime_password@localhost:5432/ayman_platform_dev" <<'SQL'
-- must fail: new row violates check constraint "site_settings_singleton"
INSERT INTO app.site_settings (id, data) VALUES (2, '{}'::jsonb);
-- must fail: permission denied for table audit_log
DELETE FROM app.audit_log;
-- must fail: permission denied for table audit_log
UPDATE app.audit_log SET outcome = 'tampered';
-- must SUCCEED: insert is the one thing the runtime role may do
INSERT INTO app.audit_log (action, resource_type, outcome, hash)
VALUES ('probe', 'probe', 'success', repeat('0', 64));
SQL
```
Expected: three errors, then one `INSERT 0 1`. Record the exact error strings in your report — "I believe it is enforced" is not evidence.

- [ ] **Step 6: Clean up the probe row as the owner** (which *can* delete, on purpose — the owner is CI-only and is not what a SQLi foothold reaches):

```bash
psql "postgresql://ayman_owner:dev_owner_password@localhost:5432/ayman_platform_dev" \
  -c "DELETE FROM app.audit_log WHERE action = 'probe';"
```

- [ ] **Step 7: Commit.**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): platform configuration tables with singleton and append-only audit log"
```

---

## Task 3: The hash-chained audit log

Split into a pure module (hashing, canonicalisation) that is trivially testable, and a service (locking, persistence) that is tested against the real database.

**Files:**
- Create: `apps/api/src/audit/chain.ts`, `apps/api/src/audit/chain.spec.ts`
- Create: `apps/api/src/audit/audit.service.ts`, `apps/api/src/audit/audit.service.spec.ts`
- Create: `apps/api/src/audit/audit.module.ts`
- Create: `packages/contracts/src/admin/audit.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService`.
- Produces:
  - `GENESIS_HASH: string` (64 zeros)
  - `canonicalise(value: unknown): string` — stable-key-order JSON
  - `chainHash(prevHash: string, payload: AuditPayload): string`
  - `AuditService.record(entry: AuditInput): Promise<void>`
  - `AuditService.verifyChain(fromId?: bigint): Promise<{ ok: true } | { ok: false; brokenAtId: string }>`
  - `AUDIT_ACTIONS` — the closed list of auditable actions, in `packages/contracts`

- [ ] **Step 1: Write the failing test for the pure module.** Create `apps/api/src/audit/chain.spec.ts`:

```ts
import { GENESIS_HASH, canonicalise, chainHash } from './chain';

const payload = {
  action: 'settings:update',
  resourceType: 'site_settings',
  resourceId: '1',
  outcome: 'success',
  actorUserId: 'user_1',
  occurredAt: '2026-07-26T10:00:00.000Z',
  metadata: { key: 'branding', accent: 'amber' },
};

describe('canonicalise', () => {
  it('is independent of key insertion order', () => {
    expect(canonicalise({ a: 1, b: 2 })).toBe(canonicalise({ b: 2, a: 1 }));
  });

  it('recurses into nested objects', () => {
    expect(canonicalise({ x: { p: 1, q: 2 } })).toBe(canonicalise({ x: { q: 2, p: 1 } }));
  });

  it('preserves array order, which IS meaningful', () => {
    expect(canonicalise([1, 2])).not.toBe(canonicalise([2, 1]));
  });

  it('distinguishes null from undefined-shaped absence', () => {
    expect(canonicalise({ a: null })).not.toBe(canonicalise({}));
  });
});

describe('chainHash', () => {
  it('is deterministic', () => {
    expect(chainHash(GENESIS_HASH, payload)).toBe(chainHash(GENESIS_HASH, payload));
  });

  it('is 64 lowercase hex characters', () => {
    expect(chainHash(GENESIS_HASH, payload)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the previous hash changes — this is what makes it a CHAIN', () => {
    const a = chainHash(GENESIS_HASH, payload);
    const b = chainHash('f'.repeat(64), payload);
    expect(a).not.toBe(b);
  });

  it('changes when any payload field changes', () => {
    const base = chainHash(GENESIS_HASH, payload);
    expect(chainHash(GENESIS_HASH, { ...payload, outcome: 'failure' })).not.toBe(base);
    expect(
      chainHash(GENESIS_HASH, { ...payload, metadata: { key: 'branding', accent: 'cyan' } }),
    ).not.toBe(base);
  });

  it('is unaffected by payload key order', () => {
    const reordered = {
      metadata: payload.metadata,
      occurredAt: payload.occurredAt,
      actorUserId: payload.actorUserId,
      outcome: payload.outcome,
      resourceId: payload.resourceId,
      resourceType: payload.resourceType,
      action: payload.action,
    };
    expect(chainHash(GENESIS_HASH, reordered)).toBe(chainHash(GENESIS_HASH, payload));
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.**

```bash
pnpm --filter @ayman/api exec jest src/audit/chain.spec.ts
```
Expected: `Cannot find module './chain'`.

- [ ] **Step 3: Implement `apps/api/src/audit/chain.ts`.**

```ts
import { createHash } from 'node:crypto';

/** The chain's anchor. Row 1 hashes against this rather than against null. */
export const GENESIS_HASH = '0'.repeat(64);

/**
 * Stable serialisation. `JSON.stringify` preserves *insertion* order, so two
 * logically identical payloads built in different code paths would otherwise
 * hash differently and every verification would fail for no reason.
 *
 * Arrays keep their order — in an audit payload, order is meaning (the id list
 * of a reorder operation, for example).
 */
export function canonicalise(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalise(entryValue)}`);

  return `{${entries.join(',')}}`;
}

/** The fields that participate in the hash. Anything else is not protected. */
export interface AuditPayload {
  occurredAt: string;
  actorUserId: string | null | undefined;
  action: string;
  resourceType: string;
  resourceId: string | null | undefined;
  outcome: string;
  metadata: unknown;
}

/**
 * SHA-256 over `prevHash` followed by the canonical payload. A fast hash is
 * correct here: this is a tamper-evidence chain over non-secret data, not a
 * password. The length-prefix on prevHash removes any concatenation ambiguity.
 */
export function chainHash(prevHash: string, payload: AuditPayload): string {
  return createHash('sha256')
    .update(`${prevHash.length}:${prevHash}`)
    .update(canonicalise(payload))
    .digest('hex');
}
```

- [ ] **Step 4: Run the chain tests, confirm green.**

```bash
pnpm --filter @ayman/api exec jest src/audit/chain.spec.ts
```

- [ ] **Step 5: Add the contract.** Create `packages/contracts/src/admin/audit.ts`:

```ts
import { z } from 'zod';

/**
 * The closed list of auditable actions. Closed on purpose: a free-text action
 * column becomes unqueryable within a month, and the audit viewer's filter
 * needs a finite set.
 *
 * RECONCILED: Plan 6 owns this list IN FULL, including the actions belonging to
 * the content and quiz domains. Plans 3–5 ship before the audit log exists and
 * therefore call nothing; Step 8b below retrofits `AuditService.record()` into
 * the services they created. Adding entries here without wiring the call site
 * is what produces an audit log that looks complete and is not.
 */
export const AUDIT_ACTIONS = [
  // content (Plan 3, instrumented by Step 8b)
  'course:create',
  'course:update',
  'course:publish',
  'course:unpublish',
  'course:delete',
  'section:update',
  'section:reorder',
  'lesson:create',
  'lesson:update',
  'lesson:reorder',
  'lesson:delete',
  'enrollment:override',
  // quiz (Plan 5, instrumented by Step 8b)
  'question:publish',
  'quiz:publish',
  'quiz:answer-edit',
  // platform configuration (Plan 6)
  'settings:update',
  'branding:update',
  'flag:update',
  'nav:create',
  'nav:update',
  'nav:archive',
  'nav:restore',
  'nav:reorder',
  'home-block:create',
  'home-block:update',
  'home-block:archive',
  'home-block:restore',
  'home-block:reorder',
  'home-block:publish',
  'home-block:unpublish',
  'media:upload',
  'media:archive',
  'media:restore',
  'taxonomy:create',
  'taxonomy:update',
  'taxonomy:archive',
  'student:update',
  'student:role-change',
  'attempt:unlock',
  'appeal:resolve',
] as const;

export const AuditActionSchema = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof AuditActionSchema>;

export const AuditOutcomeSchema = z.enum(['success', 'failure', 'denied']);
export type AuditOutcome = z.infer<typeof AuditOutcomeSchema>;

export const AuditEntrySchema = z.object({
  /** BigInt serialised as a decimal string — see the serializer note in Task 17. */
  id: z.string(),
  occurredAt: z.string(),
  actorUserId: z.string().nullable(),
  actorEmail: z.string().nullable(),
  actorIp: z.string().nullable(),
  action: AuditActionSchema,
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  outcome: AuditOutcomeSchema,
  metadata: z.unknown().nullable(),
  prevHash: z.string().nullable(),
  hash: z.string(),
});

export type AuditEntry = z.infer<typeof AuditEntrySchema>;
```

Add the subpath export to `packages/contracts/package.json` (Global Constraint 5 — `apps/api` imports `AuditActionSchema` for its runtime value):

```json
"./admin/audit": "./src/admin/audit.ts"
```

- [ ] **Step 6: Write the failing service test.** Create `apps/api/src/audit/audit.service.spec.ts`. This one runs against the real database — the advisory lock and the ordering guarantee are exactly what a mock would not prove:

```ts
import { Test } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { GENESIS_HASH } from './chain';

describe('AuditService (integration)', () => {
  let service: AuditService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AuditService, PrismaService],
    }).compile();
    service = moduleRef.get(AuditService);
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const input = (action: 'flag:update' | 'settings:update') => ({
    action,
    resourceType: 'test',
    resourceId: 'r1',
    outcome: 'success' as const,
    actorUserId: null,
    actorIp: null,
    actorUserAgent: null,
    requestId: null,
    metadata: { probe: true },
  });

  it('links the first row it writes to the previous tail, and the next to that one', async () => {
    const first = await service.record(input('flag:update'));
    const second = await service.record(input('settings:update'));

    expect(second.prevHash).toBe(first.hash);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('anchors row 1 of an empty table to GENESIS_HASH', async () => {
    const count = await prisma.auditLog.count();
    if (count > 0) {
      // The table is append-only and we cannot truncate as ayman_runtime, so
      // this assertion only runs on a genuinely fresh database.
      expect(GENESIS_HASH).toHaveLength(64);
      return;
    }
    const only = await service.record(input('flag:update'));
    expect(only.prevHash).toBeNull();
  });

  it('verifyChain reports ok over an untampered chain', async () => {
    await expect(service.verifyChain()).resolves.toEqual({ ok: true });
  });

  it('verifyChain detects a tampered row', async () => {
    const row = await service.record(input('flag:update'));
    // Only the OWNER can do this — which is the point: the runtime role cannot,
    // and if someone with owner rights does, verification still catches it.
    await prisma.$executeRaw`
      UPDATE app.audit_log SET metadata = '{"probe":false}'::jsonb WHERE id = ${row.id}
    `;
    await expect(service.verifyChain()).resolves.toEqual({
      ok: false,
      brokenAtId: row.id.toString(),
    });
  });
});
```

> ⚠️ The last test needs `UPDATE` rights, which `ayman_runtime` does not have. Point the test run at `DIRECT_DATABASE_URL` (the owner) via a `.env.test`, or mark that single test `it.skip` in the default run and record in your report that it was executed manually against the owner connection. **Do not weaken the REVOKE to make a test pass.**

- [ ] **Step 7: Run it, confirm it fails, then implement `apps/api/src/audit/audit.service.ts`.**

```ts
import { Injectable, Logger } from '@nestjs/common';
import type { AuditAction, AuditOutcome } from '@ayman/contracts/admin/audit';
import { PrismaService } from '../prisma/prisma.service';
import { chainHash } from './chain';

export interface AuditInput {
  action: AuditAction;
  resourceType: string;
  resourceId: string | null;
  outcome: AuditOutcome;
  actorUserId: string | null;
  actorIp: string | null;
  actorUserAgent: string | null;
  requestId: string | null;
  metadata?: unknown;
}

export interface AuditRow {
  id: bigint;
  prevHash: string | null;
  hash: string;
}

/**
 * A fixed 64-bit key for pg_advisory_xact_lock. Two concurrent admins writing
 * audit entries must serialise on the chain tail, otherwise both read the same
 * `prev` and the chain forks — after which verification fails forever through
 * no fault of anyone. The lock is transaction-scoped, so it releases on commit
 * or rollback without any cleanup path.
 */
const AUDIT_CHAIN_LOCK = 7_260_726n;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput): Promise<AuditRow> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK}::bigint)`;

      const previous = await tx.auditLog.findFirst({
        orderBy: { id: 'desc' },
        select: { hash: true },
      });

      const occurredAt = new Date();
      const prevHash = previous?.hash ?? null;

      const hash = chainHash(prevHash ?? '0'.repeat(64), {
        occurredAt: occurredAt.toISOString(),
        actorUserId: input.actorUserId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        outcome: input.outcome,
        metadata: input.metadata ?? null,
      });

      const created = await tx.auditLog.create({
        data: {
          occurredAt,
          actorUserId: input.actorUserId,
          actorIp: input.actorIp,
          actorUserAgent: input.actorUserAgent,
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          outcome: input.outcome,
          metadata: (input.metadata ?? null) as never,
          requestId: input.requestId,
          prevHash,
          hash,
        },
        select: { id: true, prevHash: true, hash: true },
      });

      return created;
    });
  }

  /**
   * Walks the chain in id order and recomputes every hash. Returns the id of
   * the first row whose stored hash does not match its recomputed one — which
   * is where the tampering (or the deletion) happened.
   *
   * Paged at 500 rows so a large table does not need to fit in memory.
   */
  async verifyChain(): Promise<{ ok: true } | { ok: false; brokenAtId: string }> {
    let cursor: bigint | undefined;
    let expectedPrev: string | null = null;

    for (;;) {
      const page = await this.prisma.auditLog.findMany({
        take: 500,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      });

      if (page.length === 0) return { ok: true };

      for (const row of page) {
        const recomputed = chainHash(row.prevHash ?? '0'.repeat(64), {
          occurredAt: row.occurredAt.toISOString(),
          actorUserId: row.actorUserId,
          action: row.action,
          resourceType: row.resourceType,
          resourceId: row.resourceId,
          outcome: row.outcome,
          metadata: row.metadata ?? null,
        });

        if (recomputed !== row.hash || row.prevHash !== expectedPrev) {
          this.logger.error(`Audit chain broken at id ${row.id}`);
          return { ok: false, brokenAtId: row.id.toString() };
        }

        expectedPrev = row.hash;
      }

      cursor = page[page.length - 1]!.id;
    }
  }
}
```

- [ ] **Step 8: Create the module and register it globally**, since every admin module needs it. `apps/api/src/audit/audit.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * Global because every admin module writes to it and threading an import
 * through nine modules buys nothing. It exposes exactly one provider.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
```

Add `AuditModule` to `apps/api/src/app.module.ts`'s `imports`, immediately after `PrismaModule`.

- [ ] **Step 8b: Retrofit `AuditService.record()` into the Plan 3 and Plan 5 services**

> **RECONCILED — this step is the reason `AUDIT_ACTIONS` carries content and quiz entries.** Plans
> 3–5 shipped before an audit log existed, so their mutating services call nothing. The auditor
> arrives last and instruments what already exists; the alternative — Plans 3–5 depending on a
> Plan 6 service — would be a forward dependency and is rejected.

Inject `AuditService` and add one `record()` call per mutation, **inside the same transaction as the
change wherever the service already has one** (A15). Nothing else about these services changes:

| Service (plan) | Mutation | `action` |
|---|---|---|
| `CourseService` (3) | `create` / `update` / `setStatus` / `delete` | `course:create` · `course:update` · `course:publish` \| `course:unpublish` · `course:delete` |
| `SectionService` (3) | `upsert` / `reorder` | `section:update` · `section:reorder` |
| `LessonService` (3) | `create` / `update` / `reorder` / `delete` | `lesson:create` · `lesson:update` · `lesson:reorder` · `lesson:delete` |
| `EntitlementService` (3) | admin-issued grant | `enrollment:override` |
| `QuestionBankService` (5) | publish a version | `question:publish` |
| `QuizBuilderService` (5) | publish a quiz | `quiz:publish` |
| `AppealsService` (5) | `resolve` with an override | `quiz:answer-edit` + `appeal:resolve` |
| `AttemptAdminService` (5) | `reopen` / `grantExtraTime` / `grantExtraAttempt` | `attempt:unlock` |

Add one integration test that runs an admin through course-create → publish → lesson-update →
appeal-resolve and asserts the audit chain contains exactly those rows, in order, with
`{ ok: true }` from `verifyChain()`. That test is what stops a later refactor from quietly dropping
a `record()` call.

- [ ] **Step 9: Run the full api suite, confirm green.**

```bash
pnpm --filter @ayman/api test
```
Expected: the 105 existing tests still pass, plus the new chain and service tests.

- [ ] **Step 10: Commit.**

```bash
git add apps/api/src/audit apps/api/src/app.module.ts packages/contracts/src/admin/audit.ts packages/contracts/package.json
git commit -m "feat(audit): hash-chained append-only audit log with advisory-locked writes"
```

---

## Task 4: Cache tags, cached loaders, and the `updateTag` save path

Every settings read on the **public** site goes through a `'use cache'` loader. Every settings read in the **admin** deliberately does not. The tag builder makes the 256-character limit a thrown error instead of a silent skip.

> **RECONCILED.** `apps/web/lib/cache-tags.ts` and `cache-tags.test.ts` are **created by Plan 3
> Task 11**, already exporting `tag(...parts)`, `assertTagBudget()`, `MAX_TAG_LENGTH`,
> `MAX_TAGS_PER_CALL`, `TAG_COURSES` and `courseTag()`, with the throw-instead-of-skip guard and its
> test. This task **modifies** that file — adding the `tags.*` vocabulary for settings, navigation,
> flags and home blocks — and does not re-create the builder. Likewise, `sonner`, `react-hook-form`,
> `@hookform/resolvers`, `@dnd-kit/core` and `@dnd-kit/sortable` are already installed in
> `apps/web` by Plans 3 and 5; the install command below is idempotent but the new packages here
> are only `nuqs`, `@tanstack/react-table`, `cmdk` and `lucide-react`.

**Files:**
- Modify: `apps/web/lib/cache-tags.ts`, `apps/web/lib/cache-tags.test.ts` (Plan 3)
- Create: `apps/web/lib/settings.ts`
- Create: `apps/web/lib/admin-api.ts`
- Modify: `apps/web/app/layout.tsx` (NuqsAdapter)
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: Plan 3's `tag()` / `assertTagBudget()`; `GET /api/settings/branding` and `GET /api/settings/public` (Task 5), `GET /api/navigation` (Task 15), `GET /api/flags` (Task 14), `GET /api/home-blocks` (Task 15). Until those land, the loaders will fail at runtime — that is expected and is why Task 4's only test target is the tag vocabulary.
- Produces:
  - `tags.*` builders, layered on Plan 3's `tag()`
  - `getBranding()`, `getPublicSettings()`, `getNavigation()`, `getFlags()`, `getHomeBlocks()` — all `'use cache'`
  - `adminGet<T>(path, schema)`, `adminSend<T>(method, path, body, schema)` — uncached, cookie-forwarding

- [ ] **Step 1: Install the client dependencies.**

```bash
pnpm --filter @ayman/web add nuqs@2.9.2 @tanstack/react-table@8.21.3 cmdk@1.1.1 sonner@2.0.7 \
  react-hook-form@7.83.0 @hookform/resolvers@5.5.3 @dnd-kit/core@6.3.1 @dnd-kit/sortable@10.0.0 \
  lucide-react@1.27.0
pnpm --filter @ayman/ui add @radix-ui/react-select@2.3.7 @radix-ui/react-switch@1.3.7 \
  @radix-ui/react-dialog@1.1.23 @radix-ui/react-dropdown-menu@2.1.24 @radix-ui/react-slot@1.3.3 \
  @radix-ui/react-tooltip@1.2.16 class-variance-authority@0.7.1 lucide-react@1.27.0
```

- [ ] **Step 2: Write the failing test.** Create `apps/web/lib/cache-tags.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_TAGS_PER_CALL, MAX_TAG_LENGTH, assertTagBudget, tag, tags } from './cache-tags';

describe('tag', () => {
  it('joins parts with a colon', () => {
    expect(tag('settings', 'branding')).toBe('settings:branding');
  });

  it('throws rather than letting Next silently skip an over-long tag', () => {
    const long = 'x'.repeat(MAX_TAG_LENGTH);
    expect(() => tag('settings', long)).toThrow(/256/);
  });

  it('accepts a tag exactly at the limit', () => {
    const exact = 'x'.repeat(MAX_TAG_LENGTH);
    expect(tag(exact)).toHaveLength(MAX_TAG_LENGTH);
  });

  it('rejects an empty part, which would produce a double colon', () => {
    expect(() => tag('settings', '')).toThrow();
  });
});

describe('assertTagBudget', () => {
  it('accepts a call at the 128-tag limit', () => {
    expect(() => assertTagBudget(Array.from({ length: MAX_TAGS_PER_CALL }, (_, i) => `t${i}`))).not.toThrow();
  });

  it('throws one over', () => {
    expect(() =>
      assertTagBudget(Array.from({ length: MAX_TAGS_PER_CALL + 1 }, (_, i) => `t${i}`)),
    ).toThrow(/128/);
  });
});

describe('tags', () => {
  it('produces the documented shapes', () => {
    expect(tags.settings('branding')).toBe('settings:branding');
    expect(tags.flags()).toBe('flags');
    expect(tags.nav()).toBe('nav');
    expect(tags.homeBlocks()).toBe('home-blocks');
    expect(tags.media('0191f2a0-1111-7000-8000-000000000000')).toBe(
      'media:0191f2a0-1111-7000-8000-000000000000',
    );
    expect(tags.taxonomy()).toBe('taxonomy');
  });
});
```

- [ ] **Step 3: Run, confirm failing.**

```bash
pnpm --filter @ayman/web exec vitest run lib/cache-tags.test.ts
```

- [ ] **Step 4: Implement `apps/web/lib/cache-tags.ts`.**

```ts
/**
 * Next's `cacheTag` limits are 128 tags per call and 256 characters each.
 * Over-long tags are **silently skipped with only a console warning** — which
 * means a cache entry nobody can ever invalidate. Every tag in this app is
 * built here so that failure mode becomes a thrown error at the call site.
 */
export const MAX_TAG_LENGTH = 256;
export const MAX_TAGS_PER_CALL = 128;

export type SettingsKey = 'branding' | 'seo' | 'contact' | 'features';

export function tag(...parts: Array<string | number>): string {
  for (const part of parts) {
    if (String(part).length === 0) {
      throw new Error('cache tag parts must be non-empty');
    }
  }

  const value = parts.join(':');

  if (value.length > MAX_TAG_LENGTH) {
    throw new Error(
      `cache tag "${value.slice(0, 40)}…" is ${value.length} chars; the limit is ${MAX_TAG_LENGTH} ` +
        'and Next silently skips longer tags',
    );
  }

  return value;
}

export function assertTagBudget(list: readonly string[]): void {
  if (list.length > MAX_TAGS_PER_CALL) {
    throw new Error(`${list.length} tags in one cacheTag call; the limit is ${MAX_TAGS_PER_CALL}`);
  }
}

export const tags = {
  settings: (key: SettingsKey) => tag('settings', key),
  flags: () => tag('flags'),
  nav: () => tag('nav'),
  homeBlocks: () => tag('home-blocks'),
  media: (id: string) => tag('media', id),
  taxonomy: () => tag('taxonomy'),
} as const;
```

- [ ] **Step 5: Confirm the exported names of the Next cache APIs before writing the loaders.** They were `unstable_*` in 15 and stabilised in 16; guessing wrong costs a build:

```bash
grep -oE "export (declare )?(function|const) [A-Za-z_]+" \
  node_modules/next/dist/server/use-cache/*.d.ts node_modules/next/cache.d.ts 2>/dev/null | sort -u
```
Expected to contain `cacheTag`, `cacheLife`, `updateTag`, `revalidateTag`. If the build later errors on the import, fall back to the `unstable_cacheTag as cacheTag` alias form and note it in your report.

- [ ] **Step 6: Write the cached loaders.** Create `apps/web/lib/settings.ts`:

```ts
import { cacheLife, cacheTag } from 'next/cache';
import { BrandingSchema, PublicSettingsSchema, type Branding, type PublicSettings } from '@ayman/contracts/admin/settings';
import { NavigationTreeSchema, type NavigationTree } from '@ayman/contracts/admin/navigation';
import { FeatureFlagListSchema, type FeatureFlagList } from '@ayman/contracts/admin/flags';
import { HomeBlockListSchema, type HomeBlockList } from '@ayman/contracts/admin/home-blocks';
import { tags } from './cache-tags';

const SERVER_BASE = process.env.API_ORIGIN ?? 'http://localhost:3300';

/**
 * ⚠️ A `'use cache'` function may not call `cookies()` or `headers()`. Every
 * endpoint below is therefore `@Public()` on the API and returns only fields
 * that are safe for an anonymous visitor. Admin reads of the same data go
 * through `admin-api.ts` instead, uncached, so an editor never opens a form
 * populated from a stale cache entry.
 */
async function publicJson(path: string): Promise<unknown> {
  const response = await fetch(`${SERVER_BASE}${path}`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`GET ${path} failed with ${response.status}`);
  return response.json();
}

export async function getBranding(): Promise<Branding> {
  'use cache';
  cacheTag(tags.settings('branding'));
  cacheLife('hours');
  return BrandingSchema.parse(await publicJson('/api/settings/branding'));
}

export async function getPublicSettings(): Promise<PublicSettings> {
  'use cache';
  cacheTag(tags.settings('seo'), tags.settings('contact'));
  cacheLife('hours');
  return PublicSettingsSchema.parse(await publicJson('/api/settings/public'));
}

export async function getNavigation(): Promise<NavigationTree> {
  'use cache';
  cacheTag(tags.nav());
  cacheLife('hours');
  return NavigationTreeSchema.parse(await publicJson('/api/navigation'));
}

export async function getFlags(): Promise<FeatureFlagList> {
  'use cache';
  cacheTag(tags.flags());
  cacheLife('minutes');
  return FeatureFlagListSchema.parse(await publicJson('/api/flags'));
}

export async function getHomeBlocks(): Promise<HomeBlockList> {
  'use cache';
  cacheTag(tags.homeBlocks());
  cacheLife('hours');
  return HomeBlockListSchema.parse(await publicJson('/api/home-blocks'));
}
```

- [ ] **Step 7: Write the admin fetch helper.** Create `apps/web/lib/admin-api.ts`:

```ts
import { headers } from 'next/headers';
import type { ZodType } from 'zod';

const SERVER_BASE = process.env.API_ORIGIN ?? 'http://localhost:3300';

/**
 * Server-only, cookie-forwarding, and deliberately `cache: 'no-store'`. Admin
 * screens must always show the current database state; a cached admin read is
 * indistinguishable from a lost write.
 *
 * The API guard re-authorises every one of these calls. This helper carries no
 * authorization logic of its own — it only forwards the session cookie.
 */
async function authHeaders(extra?: HeadersInit): Promise<HeadersInit> {
  const incoming = await headers();
  const cookie = incoming.get('cookie');
  return {
    accept: 'application/json',
    ...(cookie ? { cookie } : {}),
    ...extra,
  };
}

export async function adminGet<T>(path: string, schema: ZodType<T>): Promise<T> {
  const response = await fetch(`${SERVER_BASE}${path}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`GET ${path} failed with ${response.status}`);
  return schema.parse(await response.json());
}

export async function adminSend<T>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body: unknown,
  schema: ZodType<T>,
): Promise<T> {
  const response = await fetch(`${SERVER_BASE}${path}`, {
    method,
    headers: await authHeaders({
      'content-type': 'application/json',
      // S9: the CSRF guard from Plan 2 requires a custom header on every
      // state-changing method. A cross-site form POST cannot set one.
      'x-csrf-token': '1',
    }),
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${method} ${path} failed with ${response.status}: ${detail.slice(0, 200)}`);
  }

  return schema.parse(await response.json());
}
```

- [ ] **Step 8: Mount the nuqs adapter.** In `apps/web/app/layout.tsx`, wrap `{children}` — nuqs needs it for every `useQueryState` in the tree:

```tsx
import { NuqsAdapter } from 'nuqs/adapters/next/app';
// …
      <body>
        <div className="dot-grid" aria-hidden="true" />
        <DotGridSpotlight />
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
```

- [ ] **Step 9: Run the tests and the gates, confirm green.**

```bash
pnpm --filter @ayman/web exec vitest run lib/cache-tags.test.ts
pnpm lint && pnpm typecheck
```

- [ ] **Step 10: Commit.**

```bash
git add apps/web/lib apps/web/app/layout.tsx apps/web/package.json packages/ui/package.json pnpm-lock.yaml
git commit -m "feat(web): cache tag budget guard, cached settings loaders, admin fetch helper"
```

---

## Task 5: Site settings — contracts, service, and the two public endpoints

`site_settings.data` is a jsonb blob. That is only safe because one Zod schema validates it on the way in **and** applies defaults on the way out, so a key that was never written reads as its default rather than as `undefined`.

**Files:**
- Create: `packages/contracts/src/admin/settings.ts`
- Create: `packages/contracts/src/admin/settings.spec.ts`
- Create: `apps/api/src/modules/admin/settings/settings.service.ts` + `.spec.ts`
- Create: `apps/api/src/modules/admin/settings/settings.controller.ts`
- Create: `apps/api/src/modules/admin/settings/settings.dto.ts`
- Create: `apps/api/src/modules/admin/settings/settings.module.ts`
- Modify: `packages/contracts/package.json`, `apps/api/src/app.module.ts`, `packages/contracts/src/copy/ar.ts`

**Interfaces:**
- Consumes: `AuditService.record()`, `PrismaService`, `@RequirePermission`.
- Produces:
  - `SiteSettingsSchema`, `BrandingSchema`, `SeoSchema`, `ContactSchema`, `PublicSettingsSchema`
  - `SETTINGS_SECTIONS = ['branding', 'seo', 'contact'] as const`
  - `GET /api/settings/branding` → `Branding` (public)
  - `GET /api/settings/public` → `PublicSettings` (public)
  - `GET /api/admin/settings` → `SiteSettings` (`settings:read`)
  - `PATCH /api/admin/settings/:section` → `SiteSettings` (`settings:write`)

- [ ] **Step 1: Write the failing contract test.** Create `packages/contracts/src/admin/settings.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BrandingSchema, SiteSettingsSchema, SeoSchema } from './settings';

describe('BrandingSchema', () => {
  it('applies the amber/default token slots when nothing was ever saved', () => {
    const parsed = BrandingSchema.parse({});
    expect(parsed.accent).toBe('amber');
    expect(parsed.radius).toBe('default');
    expect(parsed.logoLightAssetId).toBeNull();
  });

  it('rejects a colour that is not a token slot — there is no free-text colour input', () => {
    expect(BrandingSchema.safeParse({ accent: '#ff0000' }).success).toBe(false);
    expect(BrandingSchema.safeParse({ accent: 'oklch(0.7 0.2 30)' }).success).toBe(false);
    expect(BrandingSchema.safeParse({ accent: 'amber; } body { display: none' }).success).toBe(false);
  });

  it('rejects green and red accents outright — those are reserved for quiz correctness', () => {
    expect(BrandingSchema.safeParse({ accent: 'green' }).success).toBe(false);
    expect(BrandingSchema.safeParse({ accent: 'red' }).success).toBe(false);
  });

  it('rejects a logo reference that is not a uuid', () => {
    expect(BrandingSchema.safeParse({ logoLightAssetId: 'https://evil.example/x.svg' }).success).toBe(
      false,
    );
  });

  it('is strict — an unknown key is a failure, not a silently kept extra', () => {
    expect(BrandingSchema.safeParse({ accent: 'amber', customCss: 'body{}' }).success).toBe(false);
  });
});

describe('SeoSchema', () => {
  it('caps the meta description at 160 characters', () => {
    expect(SeoSchema.safeParse({ descriptionAr: 'ا'.repeat(161) }).success).toBe(false);
    expect(SeoSchema.safeParse({ descriptionAr: 'ا'.repeat(160) }).success).toBe(true);
  });
});

describe('SiteSettingsSchema', () => {
  it('parses an empty blob into a fully defaulted object', () => {
    const parsed = SiteSettingsSchema.parse({});
    expect(parsed.branding.accent).toBe('amber');
    expect(parsed.seo.titleAr).toBe('');
    expect(parsed.contact.whatsapp).toBeNull();
  });
});
```

- [ ] **Step 2: Run, confirm failing.**

```bash
pnpm --filter @ayman/contracts exec vitest run src/admin/settings.spec.ts
```

- [ ] **Step 3: Implement `packages/contracts/src/admin/settings.ts`.**

```ts
import { z } from 'zod';

/**
 * TOKEN SLOTS, not colours. The admin picks one of these; the mapping from a
 * slot to actual OKLCH values lives in packages/ui and is never editable.
 * An editor can therefore never type raw CSS (spec §6.7, Global Constraint 18).
 *
 * There is deliberately no `green` and no `red`: those two hues are load-bearing
 * for quiz correctness and must never become the brand (spec §4.2).
 */
export const ACCENT_SLOTS = ['amber', 'cyan', 'blue', 'violet', 'magenta', 'slate'] as const;
export const AccentSlotSchema = z.enum(ACCENT_SLOTS);
export type AccentSlot = z.infer<typeof AccentSlotSchema>;

/** Radius presets. Every preset keeps the card ceiling at ≤ 8px (spec §4.3). */
export const RADIUS_SLOTS = ['sharp', 'default', 'soft'] as const;
export const RadiusSlotSchema = z.enum(RADIUS_SLOTS);
export type RadiusSlot = z.infer<typeof RadiusSlotSchema>;

/** Media is referenced by asset id, never by URL (spec §6.7). */
const assetId = z.string().uuid().nullable().default(null);

export const BrandingSchema = z
  .object({
    accent: AccentSlotSchema.default('amber'),
    radius: RadiusSlotSchema.default('default'),
    logoLightAssetId: assetId,
    logoDarkAssetId: assetId,
    faviconAssetId: assetId,
  })
  .strict();

export type Branding = z.infer<typeof BrandingSchema>;

export const SeoSchema = z
  .object({
    titleAr: z.string().max(70).default(''),
    descriptionAr: z.string().max(160).default(''),
    ogImageAssetId: assetId,
  })
  .strict();

export type Seo = z.infer<typeof SeoSchema>;

const optionalUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'), { message: 'must be an https:// URL' })
  .nullable()
  .default(null);

export const ContactSchema = z
  .object({
    email: z.string().email().nullable().default(null),
    /** E.164, same convention as student_profiles.phone. */
    phone: z.string().regex(/^\+[1-9]\d{7,14}$/).nullable().default(null),
    whatsapp: z.string().regex(/^\+[1-9]\d{7,14}$/).nullable().default(null),
    facebook: optionalUrl,
    youtube: optionalUrl,
    telegram: optionalUrl,
  })
  .strict();

export type Contact = z.infer<typeof ContactSchema>;

export const SiteSettingsSchema = z
  .object({
    branding: BrandingSchema.default({}),
    seo: SeoSchema.default({}),
    contact: ContactSchema.default({}),
  })
  .strict();

export type SiteSettings = z.infer<typeof SiteSettingsSchema>;

/** What the public site is allowed to read. Branding has its own endpoint. */
export const PublicSettingsSchema = z
  .object({ seo: SeoSchema, contact: ContactSchema })
  .strict();

export type PublicSettings = z.infer<typeof PublicSettingsSchema>;

export const SETTINGS_SECTIONS = ['branding', 'seo', 'contact'] as const;
export const SettingsSectionSchema = z.enum(SETTINGS_SECTIONS);
export type SettingsSection = z.infer<typeof SettingsSectionSchema>;

/** One schema per section, so `PATCH /admin/settings/:section` stays typed. */
export const SECTION_SCHEMAS = {
  branding: BrandingSchema,
  seo: SeoSchema,
  contact: ContactSchema,
} as const;
```

Add to `packages/contracts/package.json`:

```json
"./admin/settings": "./src/admin/settings.ts"
```

- [ ] **Step 4: Run the contract tests, confirm green.**

```bash
pnpm --filter @ayman/contracts test
```

- [ ] **Step 5: Implement the service.** Create `apps/api/src/modules/admin/settings/settings.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import {
  SECTION_SCHEMAS,
  SiteSettingsSchema,
  type PublicSettings,
  type SettingsSection,
  type SiteSettings,
} from '@ayman/contracts/admin/settings';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService, type AuditInput } from '../../../audit/audit.service';

/** The singleton's id. A5 guarantees no other row can exist. */
const SINGLETON_ID = 1;

export type AuditContext = Pick<
  AuditInput,
  'actorUserId' | 'actorIp' | 'actorUserAgent' | 'requestId'
>;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Reads the singleton and parses it through the schema, which fills in every
   * default. A key that was never written therefore reads as its default, not
   * as `undefined` — that is the whole reason jsonb is acceptable here.
   */
  async read(): Promise<SiteSettings> {
    const row = await this.prisma.siteSetting.findUniqueOrThrow({
      where: { id: SINGLETON_ID },
      select: { data: true },
    });
    return SiteSettingsSchema.parse(row.data ?? {});
  }

  async readPublic(): Promise<PublicSettings> {
    const settings = await this.read();
    // Explicit projection, not a delete-the-private-keys pass: a new private
    // field added to SiteSettings must never leak by default.
    return { seo: settings.seo, contact: settings.contact };
  }

  /**
   * Section-scoped write. The section's own schema validates the payload
   * (`.strict()`, so unknown keys are a 400), the rest of the blob is left
   * untouched, and the audit entry is written in the SAME transaction as the
   * update — a successful settings change with no trail is not possible.
   */
  async updateSection(
    section: SettingsSection,
    payload: unknown,
    context: AuditContext,
  ): Promise<SiteSettings> {
    const parsed = SECTION_SCHEMAS[section].parse(payload);

    const next = await this.prisma.$transaction(async (tx) => {
      const row = await tx.siteSetting.findUniqueOrThrow({
        where: { id: SINGLETON_ID },
        select: { data: true },
      });

      const current = SiteSettingsSchema.parse(row.data ?? {});
      const merged = SiteSettingsSchema.parse({ ...current, [section]: parsed });

      await tx.siteSetting.update({
        where: { id: SINGLETON_ID },
        data: { data: merged as never, updatedBy: context.actorUserId },
      });

      return merged;
    });

    await this.audit.record({
      ...context,
      action: section === 'branding' ? 'branding:update' : 'settings:update',
      resourceType: 'site_settings',
      resourceId: String(SINGLETON_ID),
      outcome: 'success',
      metadata: { section, value: parsed },
    });

    return next;
  }
}
```

> **Note on the audit write.** It is issued after the transaction commits, not inside it, because `AuditService.record` opens its own transaction to take the advisory lock — nesting would deadlock against itself. The ordering (change commits, then trail) is the pragmatic choice; the alternative (trail first) logs writes that may not have happened. Task 17's viewer surfaces both.

- [ ] **Step 6: Write the service test.** Create `apps/api/src/modules/admin/settings/settings.service.spec.ts`:

```ts
import { SettingsService } from './settings.service';

const context = {
  actorUserId: 'user_admin',
  actorIp: null,
  actorUserAgent: null,
  requestId: null,
};

function makeService() {
  const stored: { data: unknown } = { data: {} };
  const prisma = {
    siteSetting: {
      findUniqueOrThrow: jest.fn(async () => stored),
      update: jest.fn(async ({ data }: { data: { data: unknown } }) => {
        stored.data = data.data;
        return stored;
      }),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const audit = { record: jest.fn(async () => ({ id: 1n, prevHash: null, hash: 'x' })) };
  return {
    service: new SettingsService(prisma as never, audit as never),
    prisma,
    audit,
    stored,
  };
}

describe('SettingsService', () => {
  it('reads an empty blob as fully defaulted settings', async () => {
    const { service } = makeService();
    await expect(service.read()).resolves.toMatchObject({
      branding: { accent: 'amber', radius: 'default' },
    });
  });

  it('merges one section and leaves the others alone', async () => {
    const { service, stored } = makeService();
    await service.updateSection('branding', { accent: 'cyan' }, context);
    await service.updateSection('seo', { titleAr: 'عنوان' }, context);

    expect(stored.data).toMatchObject({
      branding: { accent: 'cyan' },
      seo: { titleAr: 'عنوان' },
    });
  });

  it('rejects an unknown key rather than storing it', async () => {
    const { service } = makeService();
    await expect(
      service.updateSection('branding', { accent: 'amber', customCss: 'body{}' }, context),
    ).rejects.toThrow();
  });

  it('rejects a raw colour string in the accent slot', async () => {
    const { service } = makeService();
    await expect(
      service.updateSection('branding', { accent: '#ff0000' }, context),
    ).rejects.toThrow();
  });

  it('writes exactly one audit entry per successful section update', async () => {
    const { service, audit } = makeService();
    await service.updateSection('branding', { accent: 'violet' }, context);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0][0]).toMatchObject({
      action: 'branding:update',
      resourceType: 'site_settings',
      outcome: 'success',
    });
  });

  it('writes no audit entry when validation fails', async () => {
    const { service, audit } = makeService();
    await expect(service.updateSection('seo', { titleAr: 'x'.repeat(200) }, context)).rejects.toThrow();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('readPublic never returns branding', async () => {
    const { service } = makeService();
    const result = await service.readPublic();
    expect(Object.keys(result).sort()).toEqual(['contact', 'seo']);
  });
});
```

- [ ] **Step 7: Run it, confirm it fails, then wire the controller.** Create `apps/api/src/modules/admin/settings/settings.dto.ts`:

```ts
import { BrandingSchema, ContactSchema, SeoSchema } from '@ayman/contracts/admin/settings';
import { createZodDto } from 'nestjs-zod';

/**
 * A8/A4: one DTO per section, each `.strict()`, so `forbidNonWhitelisted`
 * semantics come from the schema itself. There is no combined "update all
 * settings" DTO on purpose — a single wide payload is exactly how an unrelated
 * field rides along with a legitimate change.
 */
export class BrandingDto extends createZodDto(BrandingSchema) {}
export class SeoDto extends createZodDto(SeoSchema) {}
export class ContactDto extends createZodDto(ContactSchema) {}
```

Create `apps/api/src/modules/admin/settings/settings.controller.ts`:

```ts
import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import {
  SettingsSectionSchema,
  type Branding,
  type PublicSettings,
  type SettingsSection,
  type SiteSettings,
} from '@ayman/contracts/admin/settings';
import { CurrentUser, type AuthenticatedUser } from '../../../auth/decorators/current-user.decorator';
import { Public } from '../../../auth/decorators/public.decorator';
import { RequirePermission } from '../../../auth/decorators/require-permission.decorator';
import { SettingsService, type AuditContext } from './settings.service';

interface AuditableRequest {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  id?: string;
}

function auditContext(request: AuditableRequest, user: AuthenticatedUser | undefined): AuditContext {
  const agent = request.headers['user-agent'];
  return {
    actorUserId: user?.id ?? null,
    actorIp: request.ip ?? null,
    actorUserAgent: Array.isArray(agent) ? (agent[0] ?? null) : (agent ?? null),
    requestId: typeof request.id === 'string' ? request.id : null,
  };
}

@Controller()
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Public: the root layout needs branding before any user exists. */
  @Public()
  @Get('settings/branding')
  async branding(): Promise<Branding> {
    return (await this.settings.read()).branding;
  }

  /** Public: SEO metadata and the contact block on the public site. */
  @Public()
  @Get('settings/public')
  publicSettings(): Promise<PublicSettings> {
    return this.settings.readPublic();
  }

  @RequirePermission('settings:read')
  @Get('admin/settings')
  all(): Promise<SiteSettings> {
    return this.settings.read();
  }

  /**
   * The section name is validated against the enum before it ever indexes into
   * SECTION_SCHEMAS — an unvalidated path parameter used as an object key is a
   * prototype-pollution shaped bug waiting to happen.
   */
  @RequirePermission('settings:write')
  @Patch('admin/settings/:section')
  update(
    @Param('section') rawSection: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: AuditableRequest,
  ): Promise<SiteSettings> {
    const section: SettingsSection = SettingsSectionSchema.parse(rawSection);
    return this.settings.updateSection(section, body, auditContext(request, user));
  }
}
```

Create `apps/api/src/modules/admin/settings/settings.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
```

Register `SettingsModule` in `apps/api/src/app.module.ts`.

- [ ] **Step 8: Add the copy.** In `packages/contracts/src/copy/ar.ts`, add an `admin` key. Every admin string in the whole plan lands here; start it now so no component ever needs a literal:

```ts
  admin: {
    title: 'لوحة التحكم',
    nav: {
      overview: 'نظرة عامة',
      students: 'الطلبة',
      attempts: 'المحاولات',
      appeals: 'تظلمات الدرجات',
      taxonomy: 'الهيكل الدراسي',
      home: 'الصفحة الرئيسية',
      navigation: 'القوائم',
      branding: 'الهوية البصرية',
      flags: 'خصائص التشغيل',
      media: 'مكتبة الوسائط',
      audit: 'سجل النشاط',
      settings: 'الإعدادات',
    },
    settings: {
      title: 'إعدادات المنصة',
      sectionBranding: 'الهوية البصرية',
      sectionSeo: 'بيانات محركات البحث',
      sectionContact: 'وسائل التواصل',
      accent: 'اللون الأساسي',
      radius: 'حدة الحواف',
      logoLight: 'الشعار — الوضع الفاتح',
      logoDark: 'الشعار — الوضع الداكن',
      favicon: 'أيقونة الموقع',
      seoTitle: 'عنوان الموقع',
      seoDescription: 'وصف الموقع',
      email: 'البريد الإلكتروني',
      phone: 'رقم الهاتف',
      whatsapp: 'واتساب',
      facebook: 'فيسبوك',
      youtube: 'يوتيوب',
      telegram: 'تليجرام',
    },
    actions: {
      save: 'حفظ',
      saving: 'جارٍ الحفظ',
      saved: 'تم الحفظ',
      cancel: 'إلغاء',
      undo: 'تراجع',
      delete: 'حذف',
      archive: 'أرشفة',
      restore: 'استرجاع',
      publish: 'نشر',
      unpublish: 'إلغاء النشر',
      create: 'إضافة',
      edit: 'تعديل',
      confirm: 'تأكيد',
    },
  },
```

Also add `common.undo: 'تراجع'` if it is not already there.

- [ ] **Step 9: Verify end to end.** With `pnpm dev` running:

```bash
curl -s http://localhost:3200/api/settings/branding | python3 -m json.tool
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3200/api/admin/settings
```
Expected: the first returns the defaulted branding object anonymously; the second returns **401**, because deny-by-default plus `settings:read` blocks an anonymous caller.

- [ ] **Step 10: Run the gates and commit.**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add packages/contracts/src/admin/settings.ts packages/contracts/src/admin/settings.spec.ts \
  packages/contracts/src/copy/ar.ts packages/contracts/package.json \
  apps/api/src/modules/admin/settings apps/api/src/app.module.ts
git commit -m "feat(admin): site settings singleton with section-scoped validated writes"
```

---

## Task 6: Branding — token slots, the style renderer, and FOUC-free injection

The editor picks a slot; a hardcoded lookup table turns it into CSS. Editor text never reaches the stylesheet, and the renderer asserts that in its own output.

**Files:**
- Create: `packages/ui/src/lib/branding.ts`, `packages/ui/src/lib/branding.test.ts`
- Modify: `packages/ui/src/index.ts`, `packages/ui/package.json`
- Modify: `apps/web/app/layout.tsx`
- Create: `apps/web/app/(admin)/admin/settings/branding/page.tsx` (form lands in Task 8's shell; the page shell is created here)

**Interfaces:**
- Consumes: `Branding`, `AccentSlot`, `RadiusSlot` from `@ayman/contracts/admin/settings`.
- Produces:
  - `ACCENT_RAMPS: Record<AccentSlot, { light: AccentRamp; dark: AccentRamp }>`
  - `RADIUS_RAMPS: Record<RadiusSlot, { xs: number; sm: number; md: number; lg: number }>`
  - `renderBrandingStyle(branding: Pick<Branding, 'accent' | 'radius'>): string`
  - `mediaUrl(storageKey: string): string`

- [ ] **Step 1: Write the failing test.** Create `packages/ui/src/lib/branding.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ACCENT_RAMPS, RADIUS_RAMPS, renderBrandingStyle } from './branding';

const DECLARATION = /^--[a-z0-9-]+:[a-z0-9(). ,%/#-]+$/;

describe('renderBrandingStyle', () => {
  it('emits only :root and :root[data-theme="dark"] rules', () => {
    const css = renderBrandingStyle({ accent: 'amber', radius: 'default' });
    expect(css).toMatch(/^:root\{[^{}]*\}:root\[data-theme="dark"\]\{[^{}]*\}$/);
  });

  it('every declaration it emits is a safe custom property', () => {
    for (const accent of Object.keys(ACCENT_RAMPS) as Array<keyof typeof ACCENT_RAMPS>) {
      for (const radius of Object.keys(RADIUS_RAMPS) as Array<keyof typeof RADIUS_RAMPS>) {
        const css = renderBrandingStyle({ accent, radius });
        const declarations = css
          .replaceAll(/^[^{]*\{|\}[^{]*\{|\}$/g, ';')
          .split(';')
          .filter(Boolean);
        for (const declaration of declarations) {
          expect(declaration).toMatch(DECLARATION);
        }
      }
    }
  });

  it('contains no character that could terminate the <style> element', () => {
    for (const accent of Object.keys(ACCENT_RAMPS) as Array<keyof typeof ACCENT_RAMPS>) {
      const css = renderBrandingStyle({ accent, radius: 'soft' });
      expect(css).not.toMatch(/[<>]/);
    }
  });

  it('the amber/default pair is a no-op against the shipped tokens', () => {
    const css = renderBrandingStyle({ accent: 'amber', radius: 'default' });
    expect(css).toContain('--a-9:oklch(0.770 0.152 72)');
    expect(css).toContain('--r-lg:8px');
  });

  it('never emits a card radius above the 8px ceiling', () => {
    for (const radius of Object.keys(RADIUS_RAMPS) as Array<keyof typeof RADIUS_RAMPS>) {
      expect(RADIUS_RAMPS[radius].lg).toBeLessThanOrEqual(8);
    }
  });

  it('offers no green or red accent — those are reserved for quiz correctness', () => {
    expect(Object.keys(ACCENT_RAMPS)).not.toContain('green');
    expect(Object.keys(ACCENT_RAMPS)).not.toContain('red');
  });

  it('throws on a slot it does not know rather than emitting undefined into CSS', () => {
    // @ts-expect-error deliberately invalid at runtime — this is the injection path
    expect(() => renderBrandingStyle({ accent: 'evil', radius: 'default' })).toThrow();
  });
});
```

- [ ] **Step 2: Run, confirm failing.**

```bash
pnpm --filter @ayman/ui exec vitest run src/lib/branding.test.ts
```

- [ ] **Step 3: Implement `packages/ui/src/lib/branding.ts`.**

```ts
import type { AccentSlot, RadiusSlot } from '@ayman/contracts/admin/settings';

/** The four accent steps: 9 solid, 10 solid-hover, 11 low-contrast text, 12 high-contrast. */
export type AccentRamp = readonly [string, string, string, string];

/**
 * The entire colour surface an editor can reach. Values are OKLCH triples
 * measured against the same lightness/chroma discipline as the shipped amber:
 * step 9 is the solid fill, 11 is the text-on-background step, and the dark
 * variants sit slightly lighter and less chromatic so they hold contrast on
 * #08090A without glowing.
 *
 * Green and red are absent by design (spec §4.2) — they are load-bearing for
 * quiz correctness and can never be brand colours.
 */
export const ACCENT_RAMPS: Record<AccentSlot, { light: AccentRamp; dark: AccentRamp }> = {
  amber: {
    light: ['oklch(0.770 0.152 72)', 'oklch(0.725 0.155 68)', 'oklch(0.520 0.120 62)', 'oklch(0.300 0.060 60)'],
    dark: ['oklch(0.780 0.150 74)', 'oklch(0.820 0.150 76)', 'oklch(0.845 0.130 78)', 'oklch(0.920 0.090 80)'],
  },
  cyan: {
    light: ['oklch(0.720 0.110 205)', 'oklch(0.675 0.115 203)', 'oklch(0.500 0.090 200)', 'oklch(0.295 0.045 200)'],
    dark: ['oklch(0.760 0.105 205)', 'oklch(0.800 0.105 207)', 'oklch(0.840 0.090 209)', 'oklch(0.920 0.060 211)'],
  },
  blue: {
    light: ['oklch(0.620 0.170 258)', 'oklch(0.575 0.175 257)', 'oklch(0.470 0.140 256)', 'oklch(0.290 0.070 258)'],
    dark: ['oklch(0.680 0.155 258)', 'oklch(0.725 0.150 259)', 'oklch(0.800 0.115 260)', 'oklch(0.910 0.060 261)'],
  },
  violet: {
    light: ['oklch(0.600 0.170 300)', 'oklch(0.555 0.175 299)', 'oklch(0.460 0.140 298)', 'oklch(0.285 0.075 300)'],
    dark: ['oklch(0.670 0.155 300)', 'oklch(0.715 0.150 301)', 'oklch(0.795 0.115 302)', 'oklch(0.910 0.060 303)'],
  },
  magenta: {
    light: ['oklch(0.640 0.170 340)', 'oklch(0.595 0.175 339)', 'oklch(0.490 0.140 338)', 'oklch(0.295 0.075 340)'],
    dark: ['oklch(0.700 0.150 340)', 'oklch(0.745 0.145 341)', 'oklch(0.815 0.110 342)', 'oklch(0.915 0.058 343)'],
  },
  slate: {
    light: ['oklch(0.560 0.020 250)', 'oklch(0.515 0.022 250)', 'oklch(0.430 0.020 250)', 'oklch(0.265 0.014 250)'],
    dark: ['oklch(0.650 0.020 250)', 'oklch(0.700 0.020 250)', 'oklch(0.790 0.016 250)', 'oklch(0.910 0.010 250)'],
  },
};

/**
 * Radius presets, in px. `lg` is the CARD radius and the spec's hard ceiling is
 * 8px — `soft` therefore tops out at 8 rather than continuing the ramp. The
 * test asserts this, so a future preset cannot quietly break it.
 */
export const RADIUS_RAMPS: Record<RadiusSlot, { xs: number; sm: number; md: number; lg: number }> = {
  sharp: { xs: 0, sm: 2, md: 3, lg: 4 },
  default: { xs: 3, sm: 4, md: 6, lg: 8 },
  soft: { xs: 4, sm: 6, md: 8, lg: 8 },
};

/**
 * A12: the renderer asserts its OWN output. Values come from the tables above,
 * so this can only fire if someone adds a ramp entry containing something other
 * than a colour function — which is exactly the mistake worth catching, because
 * this string is injected with dangerouslySetInnerHTML.
 */
const SAFE_DECLARATION = /^--[a-z0-9-]+:[a-z0-9(). ,%/#-]+$/;

function declarations(pairs: Array<[string, string]>): string {
  return pairs
    .map(([property, value]) => {
      const declaration = `${property}:${value}`;
      if (!SAFE_DECLARATION.test(declaration)) {
        throw new Error(`unsafe branding declaration: ${declaration}`);
      }
      return declaration;
    })
    .join(';');
}

/**
 * Produces the inline stylesheet injected into <head> by the root layout.
 * Rendering it server-side from a cached loader means no FOUC and no build
 * step — the alternative (a per-brand compiled stylesheet) needs a deploy for
 * every colour change, which defeats the point of an admin-controlled brand.
 */
export function renderBrandingStyle(branding: { accent: AccentSlot; radius: RadiusSlot }): string {
  const accent = ACCENT_RAMPS[branding.accent];
  const radius = RADIUS_RAMPS[branding.radius];

  if (!accent) throw new Error(`unknown accent slot: ${String(branding.accent)}`);
  if (!radius) throw new Error(`unknown radius slot: ${String(branding.radius)}`);

  const radiusPairs: Array<[string, string]> = [
    ['--r-xs', `${radius.xs}px`],
    ['--r-sm', `${radius.sm}px`],
    ['--r-md', `${radius.md}px`],
    ['--r-lg', `${radius.lg}px`],
  ];

  const ramp = (values: AccentRamp): Array<[string, string]> => [
    ['--a-9', values[0]],
    ['--a-10', values[1]],
    ['--a-11', values[2]],
    ['--a-12', values[3]],
  ];

  const light = declarations([...ramp(accent.light), ...radiusPairs]);
  const dark = declarations(ramp(accent.dark));

  return `:root{${light}}:root[data-theme="dark"]{${dark}}`;
}

/** Media URLs are reconstructed from the key at render time (spec §6.7). */
export function mediaUrl(storageKey: string): string {
  const origin = process.env.NEXT_PUBLIC_MEDIA_ORIGIN ?? 'http://localhost:3300';
  return `${origin}/media/${storageKey}`;
}
```

> ⚠️ The dark-mode override only carries the accent ramp, not the radius: radius is theme-independent, and re-declaring it inside the `[data-theme="dark"]` block would beat the media-query rule in `color.css` for reasons that have nothing to do with theming. The `@media (prefers-color-scheme: dark)` accent override in `packages/ui/src/tokens/color.css` still applies to visitors who never touched the theme toggle — **update that block to reference the same ramp table when you change a preset, or a system-dark visitor sees the old accent.** Add a comment in `color.css` pointing here.

- [ ] **Step 4: Export it.** Add to `packages/ui/src/index.ts`:

```ts
export { ACCENT_RAMPS, RADIUS_RAMPS, renderBrandingStyle, mediaUrl } from './lib/branding';
```
and add `"./branding": "./src/lib/branding.ts"` to `packages/ui/package.json` exports. Add `@ayman/contracts` to `packages/ui`'s dependencies (it now imports the slot types).

- [ ] **Step 5: Run the tests, confirm green.**

```bash
pnpm --filter @ayman/ui test
```

- [ ] **Step 6: Inject it in the root layout.** Modify `apps/web/app/layout.tsx`:

```tsx
import { renderBrandingStyle, mediaUrl } from '@ayman/ui/branding';
import { getBranding } from '@/lib/settings';
// …

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const branding = await getBranding();

  return (
    <html lang="ar" dir="rtl" className={`${plexArabic.variable} ${plexMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/*
          Branding overrides ship inline, from a cached ('use cache' +
          cacheTag('settings:branding')) loader — no FOUC and no build step.
          The string is machine-generated from a fixed lookup table and asserted
          against SAFE_DECLARATION in renderBrandingStyle; no editor-supplied
          text ever reaches it (Global Constraint 18 / A12).
        */}
        <style dangerouslySetInnerHTML={{ __html: renderBrandingStyle(branding) }} />
        {branding.faviconAssetId ? (
          <link rel="icon" href={mediaUrl(`${branding.faviconAssetId}.webp`)} type="image/webp" />
        ) : null}
      </head>
      <body>
        <div className="dot-grid" aria-hidden="true" />
        <DotGridSpotlight />
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
```

> **CSP note.** This inline `<style>` needs `style-src 'unsafe-inline'`, which Next already requires for its own streaming style injection. Do **not** claim the CSP is the control here — it is not. The control is that the string is generated from a closed table and validated by regex before it is emitted. Record that distinction in your report rather than implying a nonce protects it.

- [ ] **Step 7: Verify in a browser.** With `pnpm dev` running, change the accent directly in the database and reload:

```bash
psql "postgresql://ayman_runtime:dev_runtime_password@localhost:5432/ayman_platform_dev" \
  -c "UPDATE app.site_settings SET data = jsonb_set(coalesce(data,'{}'::jsonb), '{branding,accent}', '\"violet\"') WHERE id = 1;"
```
Open `http://localhost:3200/dev/tokens`. Because the loader is cached with `cacheTag('settings:branding')` and nothing has called `updateTag`, the page still shows amber — **that is the correct behaviour and proves the cache is real.** Restart the dev server (or wait out `cacheLife('hours')`) and confirm violet renders in both themes with no flash of amber on first paint. Then set it back to `amber`.

- [ ] **Step 8: Commit.**

```bash
git add packages/ui/src/lib/branding.ts packages/ui/src/lib/branding.test.ts \
  packages/ui/src/index.ts packages/ui/package.json packages/ui/src/tokens/color.css \
  apps/web/app/layout.tsx
git commit -m "feat(ui): token-slot branding renderer injected inline from the cached loader"
```

---

## Task 7: Surface primitives in `packages/ui`

shadcn's `Field` primitives supersede the legacy `Form`/`FormField` wrapper and accept **raw Standard Schema issues**, so one Zod schema drives client and server validation with zero adapter code. They are vendored by hand rather than via `npx shadcn add` because the CLI writes `bg-background`/`text-foreground` token names we do not have, and physical-direction utilities the lint rule rejects.

> **RECONCILED — scope reduced.** `Input`, `Textarea`, `Select` (native), `Label`, the whole `Field`
> family with `issuesForPath()`, `Checkbox`, `RadioGroup` and `Dialog` are **built by Plan 3
> Task 10**, because Plan 5's quiz builder needs them and Plan 5 runs before this plan.
> Steps 1–3 below remain the **canonical specification** for `field.tsx` and `issuesForPath()` —
> Plan 3 Task 10 Step 2b executes them verbatim in Plan 3's slot. When you reach this task, those
> files already exist: **verify them, do not re-create them.**
>
> ```bash
> ls packages/ui/src/components/{field,input,textarea,select,label,checkbox,radio-group,dialog}.tsx
> pnpm --filter @ayman/ui test field
> ```
>
> What this task actually builds is `switch.tsx`, `dropdown-menu.tsx`, `table.tsx` and `kbd.tsx`.
> There is **no Radix `Select`** in this product — Plan 3's native `<select>` is the select, and a
> second one under the same export name would be an import-resolution coin flip.

**Files:**
- Create: `packages/ui/src/components/{switch,dropdown-menu,table,kbd}.tsx`
- Verify (from Plan 3 Task 10): `packages/ui/src/components/{field,input,textarea,select,label,checkbox,radio-group,dialog}.tsx` and `field.test.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes (Plan 3 Task 10): `issuesForPath`, `Field` family, `Input`, `Textarea`, `Select`, `Label`, `Checkbox`, `RadioGroup`, `Dialog`, and the vitest + jsdom harness.
- Produces:
  - `<Switch>`, `<DropdownMenu>` family, `<Table>` family, `<Kbd>`
- Canonical specification (executed in Plan 3 Task 10 Step 2b, verified here):
  - `issuesForPath(issues: readonly StandardSchemaIssue[], name: string): StandardSchemaIssue[]`
  - `<FieldSet>`, `<FieldLegend>`, `<FieldGroup>`, `<Field name>`, `<FieldLabel>`, `<FieldDescription>`, `<FieldError issues>`

- [ ] **Step 1: Write the failing test.** Create `packages/ui/src/components/field.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { issuesForPath } from './field';

describe('issuesForPath', () => {
  it('matches a Zod 4 issue whose path is a PropertyKey array', () => {
    const issues = [{ message: 'مطلوب', path: ['email'] }];
    expect(issuesForPath(issues, 'email')).toHaveLength(1);
    expect(issuesForPath(issues, 'name')).toHaveLength(0);
  });

  it('matches a nested path with dot notation', () => {
    const issues = [{ message: 'مطلوب', path: ['contact', 'email'] }];
    expect(issuesForPath(issues, 'contact.email')).toHaveLength(1);
  });

  it('matches an array index path', () => {
    const issues = [{ message: 'مطلوب', path: ['items', 0, 'label'] }];
    expect(issuesForPath(issues, 'items.0.label')).toHaveLength(1);
  });

  it('accepts the object form of a path segment ({ key })', () => {
    const issues = [{ message: 'مطلوب', path: [{ key: 'contact' }, { key: 'email' }] }];
    expect(issuesForPath(issues, 'contact.email')).toHaveLength(1);
  });

  it('treats an issue with no path as form-level, matching only the empty name', () => {
    const issues = [{ message: 'فشل الحفظ' }];
    expect(issuesForPath(issues, '')).toHaveLength(1);
    expect(issuesForPath(issues, 'email')).toHaveLength(0);
  });

  it('returns every issue for the same field, not just the first', () => {
    const issues = [
      { message: 'قصير جدًا', path: ['phone'] },
      { message: 'صيغة غير صحيحة', path: ['phone'] },
    ];
    expect(issuesForPath(issues, 'phone')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run, confirm failing.**

```bash
pnpm --filter @ayman/ui exec vitest run src/components/field.test.tsx
```

- [ ] **Step 3: Implement `packages/ui/src/components/field.tsx`.**

```tsx
'use client';

import { createContext, useContext, useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * The Standard Schema issue shape. Zod 4 emits `path: PropertyKey[]`; ArkType
 * and Valibot may emit `path: { key: PropertyKey }[]`. Accepting both is the
 * whole reason this component needs no resolver adapter.
 */
export interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>;
}

function pathToName(path: StandardSchemaIssue['path']): string {
  if (!path) return '';
  return path
    .map((segment) =>
      typeof segment === 'object' && segment !== null && 'key' in segment
        ? String(segment.key)
        : String(segment),
    )
    .join('.');
}

/** Every issue whose path names this field. Pure, so it is trivially testable. */
export function issuesForPath(
  issues: readonly StandardSchemaIssue[],
  name: string,
): StandardSchemaIssue[] {
  return issues.filter((issue) => pathToName(issue.path) === name);
}

interface FieldContextValue {
  controlId: string;
  errorId: string;
  descriptionId: string;
  invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

function useFieldContext(component: string): FieldContextValue {
  const context = useContext(FieldContext);
  if (!context) throw new Error(`<${component}> must be rendered inside a <Field>`);
  return context;
}

export function FieldSet({ className, ...props }: ComponentProps<'fieldset'>) {
  return <fieldset className={cn('flex flex-col gap-16 border-0 p-0', className)} {...props} />;
}

export function FieldLegend({ className, ...props }: ComponentProps<'legend'>) {
  return (
    <legend
      className={cn('mb-8 text-[length:var(--fs-title4)] font-[var(--fw-semibold)]', className)}
      {...props}
    />
  );
}

export function FieldGroup({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('grid gap-16 sm:grid-cols-2', className)} {...props} />;
}

export function Field({
  name,
  issues = [],
  className,
  children,
  ...props
}: ComponentProps<'div'> & { name: string; issues?: readonly StandardSchemaIssue[] }) {
  const generatedId = useId();
  const own = issuesForPath(issues, name);

  return (
    <FieldContext.Provider
      value={{
        controlId: `${generatedId}-control`,
        errorId: `${generatedId}-error`,
        descriptionId: `${generatedId}-description`,
        invalid: own.length > 0,
      }}
    >
      <div className={cn('flex flex-col gap-4', className)} {...props}>
        {children}
        <FieldError issues={own} />
      </div>
    </FieldContext.Provider>
  );
}

export function FieldLabel({ className, ...props }: ComponentProps<'label'>) {
  const { controlId } = useFieldContext('FieldLabel');
  return (
    <label
      htmlFor={controlId}
      className={cn('text-[length:var(--fs-text-sm)] font-[var(--fw-medium)]', className)}
      {...props}
    />
  );
}

export function FieldDescription({ className, ...props }: ComponentProps<'p'>) {
  const { descriptionId } = useFieldContext('FieldDescription');
  return (
    <p
      id={descriptionId}
      className={cn('text-[length:var(--fs-text-xs)] text-fg-muted', className)}
      {...props}
    />
  );
}

/**
 * Wires a control into the field: id, aria-invalid, aria-describedby.
 * Consumers spread this onto <Input>, <Select> etc. rather than the components
 * reaching into context themselves, which keeps the primitives context-free.
 */
export function useFieldControlProps(): {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby': string;
} {
  const { controlId, errorId, descriptionId, invalid } = useFieldContext('useFieldControlProps');
  return {
    id: controlId,
    'aria-invalid': invalid,
    'aria-describedby': invalid ? errorId : descriptionId,
  };
}

/**
 * Renders raw Standard Schema issues. `aria-live="polite"` so a screen reader
 * announces a server-returned error without stealing focus. Uses `--err`,
 * which is one of the two reserved semantic colours — an error IS the
 * legitimate use of red (spec §4.2); decoration is not.
 */
export function FieldError({
  issues,
  className,
  ...props
}: ComponentProps<'p'> & { issues: readonly StandardSchemaIssue[] }) {
  const { errorId } = useFieldContext('FieldError');
  if (issues.length === 0) return null;

  return (
    <p
      id={errorId}
      role="alert"
      aria-live="polite"
      className={cn('text-[length:var(--fs-text-xs)] text-err', className)}
      {...props}
    >
      {issues.map((issue) => issue.message).join(' · ')}
    </p>
  );
}
```

- [ ] **Step 4: Run the test, confirm green.**

- [ ] **Step 5: Add `input.tsx`.**

```tsx
'use client';

import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

const CONTROL_BASE =
  'w-full rounded-[var(--r-sm)] border border-line bg-surface-2 px-12 py-8 ' +
  'text-[length:var(--fs-text-base)] text-fg placeholder:text-fg-muted ' +
  'transition-colors duration-[160ms] ' +
  'hover:border-line-strong focus-visible:border-accent ' +
  'aria-[invalid=true]:border-err disabled:opacity-60';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(CONTROL_BASE, 'tabular-nums', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(CONTROL_BASE, 'min-h-[7rem] resize-y', className)} {...props} />;
}
```

> ⚠️ `CONTROL_BASE` is a module-level class constant. The `ayman/no-physical-direction` rule inspects those too — `px-12` is fine (axis, not side), but `pl-12` would fail. This is the exact case the rule was extended for.

- [ ] **Step 6: Add `select.tsx`, `switch.tsx`, `dialog.tsx`, `dropdown-menu.tsx`** as thin Radix wrappers. Three RTL details that are not optional:
  - Every Radix root that renders a portal gets `dir="rtl"` — Radix reads `dir` for arrow-key semantics, and a portal escapes the `<html dir="rtl">` inheritance.
  - `<SelectContent position="popper" sideOffset={4}>` with `align="start"`, never `align="left"`.
  - Chevrons come from `lucide-react` (`ChevronDown`, `ChevronsUpDown`) — never a CSS-mirrored `ChevronRight`, because mirroring also mirrors any glyph inside a composite icon.

```tsx
'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      dir="rtl"
      className={cn(
        'flex w-full items-center justify-between gap-8 rounded-[var(--r-sm)] border border-line',
        'bg-surface-2 px-12 py-8 text-[length:var(--fs-text-base)] text-start',
        'hover:border-line-strong aria-[invalid=true]:border-err',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-4 text-fg-muted" aria-hidden="true" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        dir="rtl"
        position="popper"
        sideOffset={4}
        align="start"
        className={cn(
          'z-50 max-h-64 min-w-[var(--radix-select-trigger-width)] overflow-y-auto',
          'rounded-[var(--r-md)] border border-line bg-surface-2 p-4',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'flex cursor-default items-center gap-8 rounded-[var(--r-xs)] px-8 py-8',
        'text-[length:var(--fs-text-sm)] outline-none',
        'data-[highlighted]:bg-surface-4 data-[state=checked]:text-accent-text',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemIndicator>
        <Check className="size-3.5" aria-hidden="true" />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}
```

- [ ] **Step 7: Add `table.tsx` and `kbd.tsx`.**

```tsx
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/**
 * A semantic table shell. `tabular-nums` on the whole table (spec §4.1): every
 * score, count and date column has to align, and turning it on per-cell is a
 * rule nobody remembers. Horizontal overflow scrolls inside the wrapper so the
 * page body never scrolls sideways.
 */
export function TableWrapper({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('w-full overflow-x-auto rounded-[var(--r-lg)] border border-line', className)}
      {...props}
    />
  );
}

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <table
      className={cn('w-full border-collapse text-[length:var(--fs-text-sm)] tabular-nums', className)}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-line bg-surface-2 px-12 py-8 text-start font-[var(--fw-medium)]',
        'font-mono text-[length:var(--fs-mono-label)] text-fg-muted',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('border-b border-line-subtle px-12 py-8 text-start', className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('hover:bg-surface-2 data-[selected=true]:bg-surface-3', className)} {...props} />;
}
```

```tsx
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/** Mono, hairline, tiny. Used by the command palette to teach its own shortcuts. */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-[1.5rem] items-center justify-center rounded-[var(--r-xs)]',
        'border border-line bg-surface-3 px-4 py-2 font-mono',
        'text-[length:var(--fs-mono-label)] text-fg-muted',
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 8: Export everything** from `packages/ui/src/index.ts`, and add each new file to the `./components/*` subpath (already a wildcard export — verify with `node -e "require.resolve" `-style import in the web app rather than assuming).

- [ ] **Step 9: Run every gate.**

```bash
pnpm --filter @ayman/ui test && pnpm lint && pnpm typecheck
```
`pnpm lint` is the meaningful one here — it is what proves no physical-direction utility slipped into a class constant.

- [ ] **Step 10: Commit.**

```bash
git add packages/ui/src/components packages/ui/src/index.ts packages/ui/package.json
git commit -m "feat(ui): field primitives, RTL Radix wrappers, table and kbd shells"
```

---

## Task 8: The admin shell

Route group, permission gate, RTL sidebar, breadcrumbs. Shape borrowed from shadcn `dashboard-01` + `sidebar-07`; every token, colour and direction utility is ours.

> **RECONCILED.** The admin shell file is `apps/web/app/(admin)/layout.tsx`, **created by Plan 3
> Task 11** with the permission gate and the `sonner` `<Toaster dir="rtl"/>` already mounted. This
> task **replaces the body of that file** with the sidebar shell below. Creating
> `app/(admin)/admin/layout.tsx` instead would leave two layouts wrapping the same segment tree and
> two `<Toaster/>` mounts, which renders every toast twice. `apps/web/components/toaster.tsx` and
> the `sonner@2.0.7` dependency also already exist — verify, do not re-create. `/admin` is already
> in `PROTECTED_PREFIXES` in `proxy.ts` (Plan 3 Task 11 Step 3b); the `proxy.ts` change here is only
> the admin-specific 404-not-403 behaviour.

**Files:**
- Modify: `apps/web/app/(admin)/layout.tsx` (Plan 3) — replace its body
- Create: `apps/web/app/(admin)/admin/page.tsx`, `.../admin/loading.tsx`
- Create: `apps/web/components/admin/app-sidebar.tsx`, `.../admin-header.tsx`, `.../nav-items.ts`
- Verify (Plan 3 Task 11): `apps/web/components/toaster.tsx`
- Modify: `apps/web/proxy.ts`
- Modify: `packages/contracts/src/copy/ar.ts`

**Interfaces:**
- Consumes: `getSession()`, `can()` from `lib/session.ts`; `copy.admin.nav.*` (Plan 3 owns `admin.nav`, this task appends entries to it).
- Produces: `ADMIN_NAV: readonly AdminNavItem[]` where `AdminNavItem = { href: string; labelAr: string; icon: LucideIcon; permission: Permission }`; a layout that 404s (not 403s) for a non-admin.

- [ ] **Step 1: Define the nav table.** Create `apps/web/components/admin/nav-items.ts`:

```ts
import {
  ClipboardList,
  FileImage,
  Flag,
  GraduationCap,
  Home,
  LayoutDashboard,
  ListTree,
  Palette,
  ScrollText,
  Scale,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { copy } from '@ayman/contracts';

export interface AdminNavItem {
  href: string;
  labelAr: string;
  icon: LucideIcon;
  /** Rendered only if the session holds this. The API re-checks regardless. */
  permission: string;
}

/**
 * One table, consumed by the sidebar, the breadcrumb resolver AND the command
 * palette (Task 16). Three copies of this list would drift within a week.
 * Icons are lucide components — never emoji (Global Constraint 9).
 */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: '/admin', labelAr: copy.admin.nav.overview, icon: LayoutDashboard, permission: 'admin:access' },
  { href: '/admin/students', labelAr: copy.admin.nav.students, icon: Users, permission: 'student:read' },
  { href: '/admin/attempts', labelAr: copy.admin.nav.attempts, icon: ClipboardList, permission: 'attempt:read' },
  { href: '/admin/appeals', labelAr: copy.admin.nav.appeals, icon: Scale, permission: 'appeal:read' },
  { href: '/admin/taxonomy', labelAr: copy.admin.nav.taxonomy, icon: GraduationCap, permission: 'taxonomy:read' },
  { href: '/admin/home', labelAr: copy.admin.nav.home, icon: Home, permission: 'home:read' },
  { href: '/admin/navigation', labelAr: copy.admin.nav.navigation, icon: ListTree, permission: 'nav:read' },
  { href: '/admin/settings/branding', labelAr: copy.admin.nav.branding, icon: Palette, permission: 'settings:read' },
  { href: '/admin/flags', labelAr: copy.admin.nav.flags, icon: Flag, permission: 'flags:read' },
  { href: '/admin/media', labelAr: copy.admin.nav.media, icon: FileImage, permission: 'media:read' },
  { href: '/admin/audit', labelAr: copy.admin.nav.audit, icon: ScrollText, permission: 'audit:read' },
];
```

- [ ] **Step 2: Write the layout gate.** Create `apps/web/app/(admin)/admin/layout.tsx`:

```tsx
import { notFound, redirect } from 'next/navigation';
import { AppSidebar } from '@/components/admin/app-sidebar';
import { AdminHeader } from '@/components/admin/admin-header';
import { Toaster } from '@/components/toaster';
import { can, getSession } from '@/lib/session';

/**
 * The admin is never prerendered and never cached: `getSession()` reads
 * headers, which forces this whole subtree dynamic. That is the intent.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session) redirect('/login');

  // notFound(), not a 403 page: a 403 confirms the admin area exists at this
  // path. A student poking at /admin should learn nothing. The API guard is
  // still the real gate — this only decides what gets rendered.
  if (!can(session, 'admin:access')) notFound();

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[var(--admin-sidebar-w)_1fr]">
      <AppSidebar permissions={session.permissions} />
      <div className="flex min-w-0 flex-col">
        <AdminHeader email={session.email} />
        <main className="min-w-0 flex-1 p-16 md:p-24">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
```

Add `--admin-sidebar-w: 260px;` to `packages/ui/src/tokens/space.css`.

- [ ] **Step 3: Build the sidebar.** Create `apps/web/components/admin/app-sidebar.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { ADMIN_NAV } from './nav-items';

/**
 * RTL-native: the sidebar sits at the inline start and its divider is
 * `border-e`. There is no `left`/`right` anywhere — in an RTL document the
 * inline start IS the right-hand edge, and expressing it logically means the
 * same file works unchanged if an English locale ever ships.
 */
export function AppSidebar({ permissions }: { permissions: readonly string[] }) {
  const pathname = usePathname();
  const visible = ADMIN_NAV.filter((item) => permissions.includes(item.permission));

  return (
    <aside className="hidden border-e border-line bg-surface-2 md:block">
      <div className="sticky top-0 flex h-dvh flex-col gap-16 p-16">
        <p className="eyebrow font-mono text-fg-muted">{copy.admin.title}</p>

        <nav aria-label={copy.admin.title}>
          <ul className="flex flex-col gap-2">
            {visible.map((item) => {
              const active =
                item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-8 rounded-[var(--r-sm)] px-12 py-8',
                      'text-[length:var(--fs-text-sm)] transition-colors duration-[160ms]',
                      active
                        ? 'bg-surface-4 text-fg'
                        : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.labelAr}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Build the header** (`admin-header.tsx`) with: a mobile nav trigger (Radix Dialog as a sheet, `side` implemented with `inset-inline-start-0`), a breadcrumb derived from `ADMIN_NAV` + `usePathname()`, the palette trigger showing `⌘K` in a `<Kbd>`, and the signed-in email. Sticky, `bg-surface-1/80`, and `backdrop-blur-[var(--header-blur)]` — this is **the one element** allowed to use `backdrop-blur` (spec §4.7).

- [ ] **Step 5: Add the toaster.** Create `apps/web/components/toaster.tsx`:

```tsx
'use client';

import { Toaster as Sonner } from 'sonner';

/**
 * `dir="rtl"` so the close affordance and the action button land on the
 * correct side. `position="top-center"` because in RTL a corner toast competes
 * with the sidebar for the same optical zone. Sonner already sets
 * aria-live="polite" on its region; do not override it to "assertive" —
 * a save confirmation is not an alert.
 */
export function Toaster() {
  return (
    <Sonner
      dir="rtl"
      position="top-center"
      closeButton
      duration={6000}
      toastOptions={{
        classNames: {
          toast: 'border border-line bg-surface-2 text-fg rounded-[var(--r-md)]',
          actionButton: 'bg-accent text-surface-1 rounded-[var(--r-xs)]',
        },
      }}
    />
  );
}
```

> The 6-second duration is deliberate: an undo toast that vanishes in 4s is not an undo. Task 16 pairs it with a server-side soft delete so undo is a real operation, not a client-side delay.

- [ ] **Step 6: Extend `proxy.ts`.** Add `/admin` to the authenticated matcher from Plan 2 Task 8, so an anonymous visitor is redirected at the edge rather than rendering a layout that then redirects. Do **not** put the permission check here — `proxy.ts` runs before the API call and would need to duplicate the role→permission map.

- [ ] **Step 7: Add `loading.tsx`** as a Server Component skeleton for `/admin`, with varied bar widths (100% / 85% / 60%), `animation-delay: 180ms`, and geometry derived from the same grid as the real overview (spec §4.6).

- [ ] **Step 8: Verify the gate by hand.** With `pnpm dev`:
  1. Log out, visit `http://localhost:3200/admin` → redirected to `/login`.
  2. Log in as a **student**, visit `/admin` → **404**, not 403, not a redirect loop.
  3. Promote yourself to admin and reload → the shell renders, the sidebar shows every item, and the divider is on the **right** edge in RTL:
     ```bash
     psql "postgresql://ayman_owner:dev_owner_password@localhost:5432/ayman_platform_dev" \
       -c "UPDATE app.users SET role = 'admin' WHERE email = '<your test email>';"
     ```
     You must sign out and back in for the new role to appear in the session.
  4. Confirm no horizontal page scroll at 360px width.

- [ ] **Step 9: Commit.**

```bash
git add apps/web/app/\(admin\) apps/web/components/admin apps/web/components/toaster.tsx \
  apps/web/proxy.ts packages/contracts/src/copy/ar.ts packages/ui/src/tokens/space.css
git commit -m "feat(admin): permission-gated RTL admin shell with sidebar, header and toaster"
```

---

## Task 9: The data-table foundation

One hook, one toolbar, one pagination bar, one bulk-action bar — reused by every list screen in the plan. Server-side mode is not a configuration choice here; it is the only mode.

**Files:**
- Create: `apps/web/components/admin/data-table/use-data-table.ts`
- Create: `apps/web/components/admin/data-table/use-data-table.test.ts`
- Create: `apps/web/components/admin/data-table/data-table.tsx`
- Create: `apps/web/components/admin/data-table/data-table-toolbar.tsx`
- Create: `apps/web/components/admin/data-table/data-table-pagination.tsx`
- Create: `apps/web/components/admin/data-table/data-table-bulk-bar.tsx`
- Create: `apps/web/components/admin/data-table/faceted-filter.tsx`
- Create: `packages/contracts/src/admin/list.ts`

**Interfaces:**
- Consumes: `nuqs` parsers, `@tanstack/react-table@8.21.3`.
- Produces:
  - `ListQuerySchema` and `listResponse<T>(schema)` in `@ayman/contracts/admin/list`
  - `useDataTable<TData extends { id: string }>(options): { table: Table<TData> }`
  - `sortFromSearchParams(sort, dir, allowed)` — the hardcoded column map (A3)
  - `<DataTable>`, `<DataTableToolbar>`, `<DataTablePagination>`, `<DataTableBulkBar>`, `<FacetedFilter>`

- [ ] **Step 1: Add the shared list contract.** Create `packages/contracts/src/admin/list.ts`:

```ts
import { z } from 'zod';

export const PAGE_SIZES = [10, 20, 50, 100] as const;

export const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().refine((n) => (PAGE_SIZES as readonly number[]).includes(n)).default(20),
  q: z.string().max(120).default(''),
  dir: z.enum(['asc', 'desc']).default('desc'),
});

export type ListQuery = z.infer<typeof ListQuerySchema>;

/**
 * Every list endpoint returns `{ rows, rowCount }`. `rowCount` is the TOTAL
 * matching the filter, not the page length — TanStack computes `pageCount`
 * from it and gets it wrong in every other shape.
 */
export function listResponse<T extends z.ZodTypeAny>(row: T) {
  return z.object({ rows: z.array(row), rowCount: z.number().int().min(0) });
}

export type ListResponse<T> = { rows: T[]; rowCount: number };
```

Add `"./admin/list": "./src/admin/list.ts"` to `packages/contracts/package.json`.

- [ ] **Step 2: Write the failing test for the sort mapper** — the one piece of pure logic here, and the one that closes A3. Create `apps/web/components/admin/data-table/use-data-table.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sortFromSearchParams, toPrismaOrderBy } from './use-data-table';

const ALLOWED = {
  createdAt: 'createdAt',
  fullName: 'fullName',
  governorate: 'governorateCode',
} as const;

describe('sortFromSearchParams', () => {
  it('maps a known key to its column and keeps the direction', () => {
    expect(sortFromSearchParams('fullName', 'asc', ALLOWED)).toEqual([{ id: 'fullName', desc: false }]);
  });

  it('falls back to the first allowed key when the key is unknown', () => {
    expect(sortFromSearchParams('password', 'asc', ALLOWED)).toEqual([
      { id: 'createdAt', desc: false },
    ]);
  });

  it('never lets an injection string through', () => {
    expect(sortFromSearchParams('id; DROP TABLE app.users --', 'desc', ALLOWED)).toEqual([
      { id: 'createdAt', desc: true },
    ]);
  });
});

describe('toPrismaOrderBy', () => {
  it('resolves through the map, never through the raw parameter', () => {
    expect(toPrismaOrderBy('governorate', 'asc', ALLOWED)).toEqual({ governorateCode: 'asc' });
  });

  it('resolves an unknown key to the default column', () => {
    expect(toPrismaOrderBy('../../etc/passwd', 'desc', ALLOWED)).toEqual({ createdAt: 'desc' });
  });
});
```

- [ ] **Step 3: Run, confirm failing, then implement `use-data-table.ts`.**

```ts
'use client';

import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
  type Table,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';

/**
 * A3: column names cannot be parameterised in SQL, so a sort parameter that
 * reaches the query as a string is an injection vector even through an ORM.
 * Every sortable column resolves through a hardcoded map; anything unknown
 * falls back to the map's FIRST entry rather than throwing, because a stale
 * bookmark should render a list, not a 500.
 */
export function sortFromSearchParams<M extends Record<string, string>>(
  sort: string,
  dir: 'asc' | 'desc',
  allowed: M,
): SortingState {
  const key = Object.hasOwn(allowed, sort) ? sort : Object.keys(allowed)[0]!;
  return [{ id: key, desc: dir === 'desc' }];
}

export function toPrismaOrderBy<M extends Record<string, string>>(
  sort: string,
  dir: 'asc' | 'desc',
  allowed: M,
): Record<string, 'asc' | 'desc'> {
  const key = Object.hasOwn(allowed, sort) ? sort : Object.keys(allowed)[0]!;
  return { [allowed[key]!]: dir };
}

export interface UseDataTableOptions<TData extends { id: string }> {
  data: TData[];
  columns: Array<ColumnDef<TData, unknown>>;
  /** TOTAL rows matching the filter, from the server. Not `data.length`. */
  rowCount: number;
  pageIndex: number;
  pageSize: number;
  sorting: SortingState;
  onPaginationChange: (next: { pageIndex: number; pageSize: number }) => void;
  onSortingChange: (next: SortingState) => void;
}

/**
 * TanStack Table v8.21.3 in fully manual mode.
 *
 * ⚠️ v9 is still beta and a breaking rewrite, and Context7 serves v9 docs for
 * `/tanstack/table` by default. If a generated snippet uses `createTable` or
 * plugin-style row models, it is v9 and will not compile here.
 *
 * The four non-negotiables:
 *   • manualPagination / manualSorting / manualFiltering — the server does all
 *     three, so the table must not re-do them on the current page.
 *   • rowCount passed in — otherwise pageCount is -1 and pagination is dead.
 *   • getPaginationRowModel / getSortedRowModel / getFilteredRowModel OMITTED.
 *     getCoreRowModel is still REQUIRED — it is what builds rows at all.
 *   • getRowId: (row) => row.id — without it, selection keys are ARRAY INDICES,
 *     so selecting row 0 on page 2 and clicking a bulk action operates on the
 *     first row of page 1. It fails silently and only on page ≥ 2.
 */
export function useDataTable<TData extends { id: string }>(
  options: UseDataTableOptions<TData>,
): { table: Table<TData>; rowSelection: RowSelectionState; resetSelection: () => void } {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const pagination = useMemo(
    () => ({ pageIndex: options.pageIndex, pageSize: options.pageSize }),
    [options.pageIndex, options.pageSize],
  );

  const handlePagination: OnChangeFn<typeof pagination> = (updater) => {
    const next = typeof updater === 'function' ? updater(pagination) : updater;
    options.onPaginationChange(next);
  };

  const handleSorting: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === 'function' ? updater(options.sorting) : updater;
    options.onSortingChange(next);
  };

  const table = useReactTable<TData>({
    data: options.data,
    columns: options.columns,
    rowCount: options.rowCount,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    state: { pagination, sorting: options.sorting, rowSelection },
    onPaginationChange: handlePagination,
    onSortingChange: handleSorting,
    onRowSelectionChange: setRowSelection,
  });

  return { table, rowSelection, resetSelection: () => setRowSelection({}) };
}
```

- [ ] **Step 4: Run the tests, confirm green.**

```bash
pnpm --filter @ayman/web exec vitest run components/admin/data-table
```

- [ ] **Step 5: Build `data-table.tsx`** — a presentational component over `table.getHeaderGroups()` / `table.getRowModel()`, using the `packages/ui` table shell. Requirements:
  - `<TableRow data-selected={row.getIsSelected()}>` so selection styling is CSS, not a class ternary.
  - A sortable header is a `<button>` inside the `<th>` with `aria-sort` set to `ascending`/`descending`/`none`.
  - An empty state renders `copy.common.empty` in a single full-width cell, never a blank table.
  - A `loading` prop swaps in `<Skeleton>` rows of the **same geometry**, with widths varied 100% / 85% / 60%.

- [ ] **Step 6: Build the nuqs-backed controls.** The pattern every list route follows, in `data-table-toolbar.tsx`:

```tsx
'use client';

import { useQueryStates } from 'nuqs';
import { Input } from '@ayman/ui/components/input';
import { copy } from '@ayman/contracts';

/**
 * `shallow: false` on every parser below is what makes the SERVER re-render
 * with the new filter — the default (`shallow: true`) updates the URL only,
 * and the list silently never changes. `throttleMs: 400` applies to the
 * free-text box alone; throttling a select produces a laggy dropdown.
 */
export function DataTableToolbar({
  parsers,
  children,
}: {
  parsers: Parameters<typeof useQueryStates>[0];
  children?: React.ReactNode;
}) {
  const [state, setState] = useQueryStates(parsers);

  return (
    <div className="flex flex-wrap items-center gap-8 pb-16">
      <Input
        type="search"
        value={String(state.q ?? '')}
        onChange={(event) => void setState({ q: event.target.value, page: 1 })}
        placeholder={copy.admin.list.searchPlaceholder}
        aria-label={copy.admin.list.searchPlaceholder}
        className="max-w-72"
      />
      {children}
      {Object.values(state).some((value) => Array.isArray(value) && value.length > 0) ? (
        <button
          type="button"
          className="text-[length:var(--fs-text-sm)] text-accent-text underline"
          onClick={() => void setState(null)}
        >
          {copy.admin.list.clearFilters}
        </button>
      ) : null}
    </div>
  );
}
```

> ⚠️ **Every filter change must also reset `page` to 1.** Filtering from page 7 down to three results otherwise renders an empty page 7 and looks like data loss. Do this in the setter, not in a `useEffect`.

- [ ] **Step 7: Build `data-table-pagination.tsx` and `data-table-bulk-bar.tsx`.**
  - Pagination shows `صفحة X من Y` with `tabular-nums`, a page-size `<Select>` from `PAGE_SIZES`, and first/prev/next/last buttons using `ChevronsRight`/`ChevronRight` — in RTL, **"next" points left**, so import `ChevronLeft` for next and `ChevronRight` for previous. Verify visually; this is the single most commonly wrong detail in an RTL table.
  - The bulk bar renders only when `table.getSelectedRowModel().rows.length > 0`, is `position: fixed; inset-inline: 0; bottom: var(--s-24)`, shows the count, and clears selection after a successful action.

- [ ] **Step 8: Add the list copy** to `packages/contracts/src/copy/ar.ts` under `admin.list`: `searchPlaceholder`, `clearFilters`, `selectedCount`, `page`, `of`, `perPage`, `first`, `previous`, `next`, `last`, `noResults`, `selectAll`, `selectRow`.

- [ ] **Step 9: Commit.**

```bash
git add apps/web/components/admin/data-table packages/contracts/src/admin/list.ts \
  packages/contracts/src/copy/ar.ts packages/contracts/package.json
git commit -m "feat(admin): server-side TanStack v8 table foundation with nuqs URL state"
```

---

## Task 10: Students — list, detail, and the isolated role change

The first real consumer of Task 9. Filters by governorate, year and track; the role change is deliberately its own endpoint.

**Files:**
- Create: `packages/contracts/src/admin/students.ts` + `.spec.ts`
- Create: `apps/api/src/modules/admin/students/{students.service.ts,students.service.spec.ts,students.controller.ts,students.dto.ts,students.module.ts}`
- Create: `apps/web/app/(admin)/admin/students/{page.tsx,loading.tsx,search-params.ts,columns.tsx,students-table.tsx}`
- Create: `apps/web/app/(admin)/admin/students/[userId]/page.tsx`
- Create: `apps/web/app/(admin)/admin/students/actions.ts`

**Interfaces:**
- Produces:
  - `GET /api/admin/students` → `ListResponse<AdminStudentRow>` (`student:read`)
  - `GET /api/admin/students/:userId` → `AdminStudentDetail` (`student:read`)
  - `PATCH /api/admin/students/:userId` → `AdminStudentDetail` (`student:write`)
  - `POST /api/admin/students/:userId/role` → `{ role: string }` (`student:role-change`)
  - `studentsSearchParams` + `studentsCache` (nuqs)

- [ ] **Step 1: Write the contract.** Create `packages/contracts/src/admin/students.ts`:

```ts
import { z } from 'zod';
import { GenderSchema } from '../onboarding';

export const AdminStudentRowSchema = z.object({
  /** The table's row id — MUST be present and stable (getRowId). */
  id: z.string(),
  fullName: z.string(),
  email: z.string(),
  phone: z.string(),
  gender: GenderSchema,
  governorateCode: z.string().length(2),
  governorateNameAr: z.string(),
  systemSlug: z.string().nullable(),
  year: z.number().int().nullable(),
  trackLabelAr: z.string().nullable(),
  onboardingCompleted: z.boolean(),
  createdAt: z.string(),
});

export type AdminStudentRow = z.infer<typeof AdminStudentRowSchema>;

export const AdminStudentDetailSchema = AdminStudentRowSchema.extend({
  role: z.string(),
  schoolName: z.string().nullable(),
  fatherPhone: z.string().nullable(),
  motherPhone: z.string().nullable(),
  electiveSubjectNameAr: z.string().nullable(),
});

export type AdminStudentDetail = z.infer<typeof AdminStudentDetailSchema>;

/**
 * A4: the admin-writable field set, and nothing else. `role` is ABSENT on
 * purpose — it has its own endpoint, so a role escalation can never ride along
 * inside a routine profile correction, and its audit entry is unambiguous.
 * `.strict()` makes an unknown key a 400 rather than a silent drop.
 */
export const AdminStudentPatchSchema = z
  .object({
    fullName: z.string().min(2).max(120).optional(),
    schoolName: z.string().max(160).nullable().optional(),
    governorateCode: z.string().length(2).optional(),
    year: z.number().int().min(1).max(3).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'no fields to update' });

export type AdminStudentPatch = z.infer<typeof AdminStudentPatchSchema>;

export const AdminRoleChangeSchema = z
  .object({
    role: z.enum(['admin', 'student']),
    /** Forces the operator to say why; it lands in the audit metadata. */
    reason: z.string().min(8).max(500),
  })
  .strict();

export type AdminRoleChange = z.infer<typeof AdminRoleChangeSchema>;

export const STUDENT_SORT_COLUMNS = {
  createdAt: 'createdAt',
  fullName: 'fullName',
  governorate: 'governorateCode',
} as const;
```

Add `"./admin/students": "./src/admin/students.ts"` to the contracts package exports.

- [ ] **Step 2: Write the failing schema test** asserting: `AdminStudentPatchSchema` rejects `{ role: 'admin' }`, rejects `{ userId: 'x' }`, rejects `{}`, and accepts `{ schoolName: null }`; `AdminRoleChangeSchema` rejects a 3-character reason. Run it, confirm it fails, then confirm green.

- [ ] **Step 3: Implement the service.** `apps/api/src/modules/admin/students/students.service.ts`:

```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  STUDENT_SORT_COLUMNS,
  type AdminRoleChange,
  type AdminStudentDetail,
  type AdminStudentPatch,
  type AdminStudentRow,
} from '@ayman/contracts/admin/students';
import { AuditService } from '../../../audit/audit.service';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuditContext } from '../settings/settings.service';
import { Prisma } from '../../../generated/prisma/client';

export interface StudentListQuery {
  page: number;
  perPage: number;
  q: string;
  governorate: string[];
  year: number[];
  track: string[];
  sort: string;
  dir: 'asc' | 'desc';
}

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: StudentListQuery): Promise<{ rows: AdminStudentRow[]; rowCount: number }> {
    // A3: the sort column resolves through a hardcoded map. `query.sort` never
    // reaches Prisma as a key.
    const sortKey = Object.hasOwn(STUDENT_SORT_COLUMNS, query.sort) ? query.sort : 'createdAt';
    const column = STUDENT_SORT_COLUMNS[sortKey as keyof typeof STUDENT_SORT_COLUMNS];

    const where: Prisma.StudentProfileWhereInput = {
      ...(query.q
        ? {
            OR: [
              { fullName: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q } },
              { user: { email: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(query.governorate.length > 0 ? { governorateCode: { in: query.governorate } } : {}),
      ...(query.year.length > 0 ? { year: { in: query.year } } : {}),
      ...(query.track.length > 0 ? { trackId: { in: query.track } } : {}),
    };

    // Count and page in one round trip. `rowCount` is the TOTAL, not the page.
    const [rowCount, records] = await this.prisma.$transaction([
      this.prisma.studentProfile.count({ where }),
      this.prisma.studentProfile.findMany({
        where,
        orderBy: [{ [column]: query.dir }, { userId: 'asc' }],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        select: {
          userId: true,
          fullName: true,
          phone: true,
          gender: true,
          governorateCode: true,
          year: true,
          onboardingCompletedAt: true,
          createdAt: true,
          user: { select: { email: true } },
          governorate: { select: { nameAr: true } },
          system: { select: { slug: true } },
          track: { select: { labelAr: true } },
        },
      }),
    ]);

    return {
      rowCount,
      rows: records.map((record) => ({
        id: record.userId,
        fullName: record.fullName,
        email: record.user.email,
        phone: record.phone,
        gender: record.gender,
        governorateCode: record.governorateCode,
        governorateNameAr: record.governorate.nameAr,
        systemSlug: record.system?.slug ?? null,
        year: record.year,
        trackLabelAr: record.track?.labelAr ?? null,
        onboardingCompleted: record.onboardingCompletedAt != null,
        createdAt: record.createdAt.toISOString(),
      })),
    };
  }

  async detail(userId: string): Promise<AdminStudentDetail> { /* explicit select, same mapping + role/school/parent phones */ }

  async patch(userId: string, input: AdminStudentPatch, context: AuditContext): Promise<AdminStudentDetail> {
    const existing = await this.prisma.studentProfile.findUnique({
      where: { userId },
      select: { userId: true, year: true, trackId: true },
    });
    if (!existing) throw new NotFoundException();

    // The DB CHECK (year 1 has no track) would reject this anyway, but a 400
    // with a real message beats a 500 wrapping a constraint violation.
    const nextYear = input.year === undefined ? existing.year : input.year;
    if (nextYear === 1 && existing.trackId !== null) {
      throw new BadRequestException('year 1 cannot have a track; clear the track first');
    }

    await this.prisma.studentProfile.update({ where: { userId }, data: input });

    await this.audit.record({
      ...context,
      action: 'student:update',
      resourceType: 'student_profile',
      resourceId: userId,
      outcome: 'success',
      metadata: { changed: input },
    });

    return this.detail(userId);
  }

  /**
   * A4: role changes are their own operation. Two extra guards beyond the
   * permission check, both of which have burned real products:
   *   • an admin cannot demote themselves — that is how you end up with zero
   *     admins and no way back in;
   *   • demoting the last remaining admin is refused for the same reason.
   */
  async changeRole(
    userId: string,
    input: AdminRoleChange,
    actorUserId: string,
    context: AuditContext,
  ): Promise<{ role: string }> {
    if (userId === actorUserId) {
      throw new ForbiddenException('you cannot change your own role');
    }

    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!target) throw new NotFoundException();

    if (target.role === 'admin' && input.role !== 'admin') {
      const admins = await this.prisma.user.count({ where: { role: 'admin' } });
      if (admins <= 1) throw new ForbiddenException('cannot demote the last remaining admin');
    }

    await this.prisma.user.update({ where: { id: userId }, data: { role: input.role } });

    await this.audit.record({
      ...context,
      action: 'student:role-change',
      resourceType: 'user',
      resourceId: userId,
      outcome: 'success',
      metadata: { from: target.role, to: input.role, reason: input.reason },
    });

    return { role: input.role };
  }
}
```

- [ ] **Step 4: Write the service tests** covering: the sort map ignores an unknown `sort`; `rowCount` is the filtered total and not the page length; `patch` rejects a year-1-with-track transition; `changeRole` refuses self-demotion; `changeRole` refuses demoting the last admin; every successful mutation writes exactly one audit entry with the right `action`. Run them red first.

- [ ] **Step 5: Wire the controller** with `@RequirePermission('student:read' | 'student:write' | 'student:role-change')`, `@UsePipes(ZodValidationPipe)` and the DTOs from `AdminStudentPatchSchema` / `AdminRoleChangeSchema`. Query parameters go through a `ZodValidationPipe` on a `StudentListQueryDto` — **never read `req.query` directly**, or the array parameters arrive as a string when there is exactly one value.

- [ ] **Step 6: Create the nuqs cache.** `apps/web/app/(admin)/admin/students/search-params.ts`:

```ts
import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs/server';
import { PAGE_SIZES } from '@ayman/contracts/admin/list';
import { STUDENT_SORT_COLUMNS } from '@ayman/contracts/admin/students';

const SORT_KEYS = Object.keys(STUDENT_SORT_COLUMNS) as Array<keyof typeof STUDENT_SORT_COLUMNS>;

/**
 * ONE definition, imported by both the RSC page (`.parse(await searchParams)`)
 * and the client controls (`useQueryStates(studentsSearchParams)`). Two copies
 * drift the moment a filter is added, and the symptom is a filter that changes
 * the URL and nothing else.
 */
export const studentsSearchParams = {
  page: parseAsInteger.withDefault(1).withOptions({ shallow: false }),
  perPage: parseAsInteger.withDefault(20).withOptions({ shallow: false }),
  // Free text only: throttled so a fast typist does not fire a request per key.
  q: parseAsString.withDefault('').withOptions({ shallow: false, throttleMs: 400 }),
  governorate: parseAsArrayOf(parseAsString).withDefault([]).withOptions({ shallow: false }),
  year: parseAsArrayOf(parseAsInteger).withDefault([]).withOptions({ shallow: false }),
  track: parseAsArrayOf(parseAsString).withDefault([]).withOptions({ shallow: false }),
  sort: parseAsStringLiteral(SORT_KEYS).withDefault('createdAt').withOptions({ shallow: false }),
  dir: parseAsStringLiteral(['asc', 'desc'] as const).withDefault('desc').withOptions({ shallow: false }),
};

export const studentsCache = createSearchParamsCache(studentsSearchParams);
export { PAGE_SIZES };
```

- [ ] **Step 7: Build the page.** `apps/web/app/(admin)/admin/students/page.tsx`:

```tsx
import type { SearchParams } from 'nuqs/server';
import { listResponse } from '@ayman/contracts/admin/list';
import { AdminStudentRowSchema } from '@ayman/contracts/admin/students';
import { adminGet } from '@/lib/admin-api';
import { StudentsTable } from './students-table';
import { studentsCache } from './search-params';

const ResponseSchema = listResponse(AdminStudentRowSchema);

export default async function StudentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // In Next 16 `searchParams` is a Promise; the cache parses the resolved value
  // and makes the same values readable from nested Server Components.
  const query = studentsCache.parse(await searchParams);

  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('perPage', String(query.perPage));
  params.set('sort', query.sort);
  params.set('dir', query.dir);
  if (query.q) params.set('q', query.q);
  for (const code of query.governorate) params.append('governorate', code);
  for (const year of query.year) params.append('year', String(year));
  for (const track of query.track) params.append('track', track);

  const data = await adminGet(`/api/admin/students?${params.toString()}`, ResponseSchema);

  return <StudentsTable rows={data.rows} rowCount={data.rowCount} query={query} />;
}
```

- [ ] **Step 8: Build `students-table.tsx`** as the client component: columns via `ColumnDef<AdminStudentRow>`, a selection checkbox column with `id: 'select'`, faceted filters for governorate / year / track fed by the taxonomy, and `useQueryStates(studentsSearchParams)` for `onPaginationChange` / `onSortingChange`. The detail link is `/admin/students/${row.id}`.

- [ ] **Step 9: Verify the `getRowId` behaviour explicitly.** This is A2 and it cannot be verified by reading code:
  1. Seed or register at least 25 students so there are two pages.
  2. Go to page 2, select the first row, note its name.
  3. Open the browser console and evaluate the selection state — it must be keyed by the student's **user id**, not by `"0"`.
  4. Temporarily delete the `getRowId` line, repeat, and confirm the key becomes `"0"`. **Restore it.** Record both observations in your report.

- [ ] **Step 10: Verify shareability.** Filter by القاهرة + الصف الثاني, copy the URL, open it in a private window logged in as another admin, and confirm the same filtered list renders server-side (view source, not just the DOM).

- [ ] **Step 11: Run every gate and commit.**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add packages/contracts/src/admin/students.ts packages/contracts/src/admin/students.spec.ts \
  packages/contracts/package.json apps/api/src/modules/admin/students \
  apps/api/src/app.module.ts apps/web/app/\(admin\)/admin/students
git commit -m "feat(admin): students list with shareable URL filters and isolated role change"
```

---

## Task 11: Attempts and grade appeals — the screens

The only task in this plan with a hard dependency on another plan. **Read "Interfaces expected from other plans" before starting.** If Plan 5 has not landed, stop after Step 1 and report the blockage rather than stubbing the quiz domain.

> **RECONCILED — this task is screens-only.** Plan 5 owns **every** quiz, attempt and appeal
> endpoint and the services behind them. This task's draft declared a second
> `GET /api/admin/appeals`, a second `POST /api/admin/appeals/:id/resolve`, a second
> `POST /api/admin/attempts/:id/unlock` and a second `app/(admin)/admin/appeals/page.tsx` — two
> controllers on the same paths is a Nest route collision, and two Prisma write paths onto
> `attempt_questions` is a correctness hazard nobody would find until a grade was wrong.
>
> **The API module is deleted from this task.** What this task builds is the `useDataTable` +
> `nuqs` screens over Plan 5's endpoints:
>
> | Screen | Endpoint (Plan 5) | Permission |
> |---|---|---|
> | `/admin/attempts` list | `GET /api/admin/attempts` | `attempt:read` |
> | unlock action | `POST /api/admin/attempts/:id/reopen` | `attempt:unlock` |
> | extra-time action | `POST /api/admin/attempts/:id/extra-time` | `attempt:unlock` |
> | `/admin/appeals` queue | `GET /api/admin/appeals` | `appeal:read` |
> | resolve action | `PATCH /api/admin/appeals/:id` | `appeal:resolve` |
>
> `apps/web/app/(admin)/admin/appeals/page.tsx` was created by Plan 5 Task 19 as a plain list;
> this task **replaces its body** with the DataTable version. Steps 3 and 4 below describe rules
> that Plan 5 already implements and tests — read them as the acceptance criteria you verify in
> Step 7, not as code you write here.

**Files:**
- Create: `packages/contracts/src/admin/attempts.ts` — **row/response schemas only**, no write schemas that duplicate Plan 5's DTOs
- Create: `apps/web/app/(admin)/admin/attempts/{page.tsx,search-params.ts,columns.tsx,attempts-table.tsx}`
- Modify: `apps/web/app/(admin)/admin/appeals/page.tsx` (Plan 5) + create `{search-params.ts,appeals-table.tsx,resolve-dialog.tsx}` beside it

**Interfaces:**
- Consumes (from Plan 5): Prisma models `QuizAttempt`, `AttemptQuestion`, `GradeAppeal`; `AttemptService.recomputeScore(attemptId)`; `AttemptService.reissueToken(attemptId)`; `AttemptAdminService.reopen/grantExtraTime`; `AppealsService.resolve`; and the five endpoints in the table above.
- Consumes (from Plan 3): `copy.quizAdmin.*` is Plan 5's namespace — attempt and appeal labels come from there, not from `copy.admin.*`.
- Produces: `AdminAttemptRowSchema`, `AdminAppealRowSchema`, `AttemptUnlockSchema`, `AppealResolveSchema` in `@ayman/contracts/admin/attempts`, and the two admin screens.

- [ ] **Step 1: Confirm the dependency exists before writing anything else.**

```bash
grep -n "model QuizAttempt\|model GradeAppeal" apps/api/prisma/schema.prisma
grep -rn "admin/attempts\|admin/appeals" apps/api/src/modules/quiz/*.controller.ts
```
If either is missing, **stop**, mark this task blocked in your report, and move to Task 12. Do not invent the quiz schema here — Plan 5 owns it, and two competing definitions is worse than a gap.

- [ ] **Step 2: Write the contract.** `packages/contracts/src/admin/attempts.ts`:

```ts
import { z } from 'zod';

export const ATTEMPT_STATES = ['in_progress', 'submitted', 'graded', 'expired'] as const;

export const AdminAttemptRowSchema = z.object({
  id: z.string(),
  studentUserId: z.string(),
  studentName: z.string(),
  quizId: z.string(),
  quizTitleAr: z.string(),
  attemptNumber: z.number().int().positive(),
  state: z.enum(ATTEMPT_STATES),
  /** 0..1 — the fraction primitive, not a percentage. Rendered as a percent. */
  score: z.number().min(0).max(1).nullable(),
  startedAt: z.string(),
  submittedAt: z.string().nullable(),
  deadlineAt: z.string().nullable(),
});

export type AdminAttemptRow = z.infer<typeof AdminAttemptRowSchema>;

/**
 * Unlocking re-opens a submitted attempt. بسطتهالك's single-attempt-no-undo
 * trap is the biggest support-ticket generator visible in their bundle — this
 * button exists BEFORE launch, not after (spec §6.5).
 */
export const AttemptUnlockSchema = z
  .object({
    reason: z.string().min(8).max(500),
    /** Extends the persisted deadline by N minutes; never recomputed from now. */
    extraMinutes: z.number().int().min(0).max(240).default(0),
  })
  .strict();

export const APPEAL_STATES = ['open', 'accepted', 'rejected'] as const;

export const AdminAppealRowSchema = z.object({
  id: z.string(),
  attemptId: z.string(),
  studentUserId: z.string(),
  studentName: z.string(),
  questionVersionId: z.string(),
  reasonAr: z.string(),
  state: z.enum(APPEAL_STATES),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
  resolutionAr: z.string().nullable(),
});

export type AdminAppealRow = z.infer<typeof AdminAppealRowSchema>;

export const AppealResolveSchema = z
  .object({
    state: z.enum(['accepted', 'rejected']),
    resolutionAr: z.string().min(4).max(1000),
    /**
     * Only meaningful when accepting: the corrected fraction for this question
     * on this attempt. `null` means "accept the appeal but leave the mark" —
     * which is a real outcome (a wording fix that changed nothing).
     */
    overrideFraction: z.number().min(-1).max(1).nullable().default(null),
  })
  .strict();

export type AppealResolve = z.infer<typeof AppealResolveSchema>;
```

Add the subpath export.

- [ ] **Step 3: Verify Plan 5's service rules — do not re-implement them**

The tests below live in `apps/api/src/modules/quiz/{attempt-admin,appeals}.service.spec.ts` and are
Plan 5's. Run them; if any is missing, that is a Plan 5 gap to report, not code to write here:

```ts
describe('AttemptsService.unlock', () => {
  it('refuses an attempt that was never submitted', async () => {
    // in_progress attempts are not locked; unlocking one is a no-op that would
    // silently reset submittedAt and destroy the student's answers.
    await expect(service.unlock('a1', { reason: 'ask by phone', extraMinutes: 0 }, context))
      .rejects.toThrow(/not submitted/i);
  });

  it('EXTENDS the persisted deadline rather than recomputing it from now', async () => {
    const result = await service.unlock('a2', { reason: 'power cut at school', extraMinutes: 30 }, context);
    expect(result.deadlineAt).toBe('2026-07-26T10:30:00.000Z'); // original 10:00 + 30m
  });

  it('writes an attempt:unlock audit entry carrying the reason', async () => {
    await service.unlock('a2', { reason: 'power cut at school', extraMinutes: 30 }, context);
    expect(audit.record.mock.calls[0][0]).toMatchObject({
      action: 'attempt:unlock',
      metadata: { reason: 'power cut at school', extraMinutes: 30 },
    });
  });
});

describe('AppealsService.resolve', () => {
  it('recomputes the attempt score when a fraction override is applied', async () => {
    await service.resolve('ap1', { state: 'accepted', resolutionAr: 'صح', overrideFraction: 1 }, context);
    expect(attempts.recomputeScore).toHaveBeenCalledWith('a1');
  });

  it('does not recompute when the appeal is rejected', async () => {
    await service.resolve('ap1', { state: 'rejected', resolutionAr: 'الإجابة خاطئة', overrideFraction: null }, context);
    expect(attempts.recomputeScore).not.toHaveBeenCalled();
  });

  it('refuses to resolve an appeal that is already resolved', async () => {
    await expect(
      service.resolve('ap-resolved', { state: 'accepted', resolutionAr: 'تم', overrideFraction: null }, context),
    ).rejects.toThrow(/already resolved/i);
  });
});
```

- [ ] **Step 4: The three non-obvious rules Plan 5 implements** — restated here because they are the acceptance criteria for Step 7 and are easy to get wrong:
  - **`deadline_at` is extended, never recomputed** (`new Date(existing.deadlineAt.getTime() + extraMinutes * 60_000)`). Recomputing from `now()` hands a student who appealed a week later a fresh full timer.
  - Unlock sets `submittedAt = null` **and** issues a new `attempt_token`, so a stale tab holding the old token cannot clobber the reopened attempt.
  - Resolving an appeal with an override writes the corrected fraction onto `attempt_questions`, then calls `AttemptService.recomputeScore` — the attempt score is derived, never patched directly.

- [ ] **Step 5: Build the attempts list** with `useDataTable`, filters on `state`, `quizId`, and a date range, and a row action menu (`DropdownMenu`) whose only entry is unlock, behind a confirm `Dialog` that requires the reason before its submit button enables.

- [ ] **Step 6: Build the appeals queue.** Default filter is `state=open` — an appeals screen that opens on "all" is a screen nobody triages. The resolve dialog shows the question, the student's answer, the stored `option_order` snapshot, and the current fraction, then takes the decision + Arabic resolution text.

- [ ] **Step 7: Verify** that resolving an appeal with `overrideFraction: 1` moves the attempt's displayed score, that the audit log has one `appeal:resolve` entry with the resolution text, and that a second resolve attempt on the same appeal returns 409.

- [ ] **Step 8: Commit.**

```bash
git add packages/contracts/src/admin/attempts.ts packages/contracts/package.json \
  'apps/web/app/(admin)/admin/attempts' 'apps/web/app/(admin)/admin/appeals'
git commit -m "feat(admin): attempts list with unlock and a triaged grade-appeal queue over the quiz API"
```

---

## Task 12: The taxonomy editor

Everything in §6.1 becomes admin-editable, **including the Arabic labels** — that is the founder's requirement. Two things stay immutable, and both have a test.

**Files:**
- Create: `packages/contracts/src/admin/taxonomy.ts` + `.spec.ts`
- Create: `apps/api/src/modules/admin/taxonomy/{admin-taxonomy.service.ts,admin-taxonomy.service.spec.ts,admin-taxonomy.controller.ts,admin-taxonomy.dto.ts,admin-taxonomy.module.ts}`
- Create: `apps/web/app/(admin)/admin/taxonomy/{page.tsx,governorates/page.tsx,systems/page.tsx,tracks/page.tsx,subjects/page.tsx,actions.ts}`

**Interfaces:**
- Produces:
  - `PATCH /api/admin/taxonomy/governorates/:code` (`taxonomy:write`)
  - `POST|PATCH /api/admin/taxonomy/tracks[/:id]` (`taxonomy:write`)
  - `POST|PATCH /api/admin/taxonomy/subjects[/:id]`, `.../subject-offerings[/:id]`
  - `PATCH /api/admin/taxonomy/systems/:id` and `.../academic-years/:id` — **label fields only**

- [ ] **Step 1: Write the contract with the immutability rules encoded.** `packages/contracts/src/admin/taxonomy.ts`:

```ts
import { z } from 'zod';

/**
 * A13 — the two immutability rules, and why they exist:
 *
 *  1. `EducationSystem.slug` is hardcoded in OnboardingSchema
 *     (`z.enum(['bacalorya', 'thanaweya_amma'])`). Renaming it here would make
 *     every future onboarding submission fail validation against a system that
 *     no longer answers to that name — and the failure would appear in the
 *     signup form, nowhere near the taxonomy screen that caused it.
 *  2. `Track.slug` participates in `@@unique([systemId, slug])` and is what the
 *     seed idempotency and any future deep link key on.
 *
 * Labels, aliases, sort order, badges and active flags are all freely editable
 * — that is the whole point of the editor. Slugs are identity, not copy.
 */
export const SystemPatchSchema = z
  .object({
    nameAr: z.string().min(2).max(80).optional(),
    totalMarks: z.number().int().positive().max(2000).optional(),
    passPercent: z.number().min(0).max(100).optional(),
    allowsRetakes: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();

export const AcademicYearPatchSchema = z
  .object({
    labelAr: z.string().min(2).max(80).optional(),
    badgeAr: z.string().min(2).max(40).optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();

export const GovernoratePatchSchema = z
  .object({
    nameAr: z.string().min(2).max(80).optional(),
    region: z.enum(['urban', 'lower', 'upper', 'frontier']).optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const slug = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, 'lowercase latin, digits, - and _ only');

export const TrackCreateSchema = z
  .object({
    systemId: z.string().uuid(),
    slug,
    labelAr: z.string().min(2).max(80),
    aliases: z.array(z.string().min(1).max(80)).max(20).default([]),
    minYear: z.number().int().min(1).max(3).default(2),
    sortOrder: z.number().int().default(0),
  })
  .strict();

/** Note the absence of `slug` and `systemId` — both are identity. */
export const TrackPatchSchema = z
  .object({
    labelAr: z.string().min(2).max(80).optional(),
    aliases: z.array(z.string().min(1).max(80)).max(20).optional(),
    minYear: z.number().int().min(1).max(3).optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();

export const SubjectCreateSchema = z
  .object({ slug, nameAr: z.string().min(2).max(80), aliases: z.array(z.string()).max(20).default([]) })
  .strict();

export const SubjectPatchSchema = z
  .object({ nameAr: z.string().min(2).max(80).optional(), aliases: z.array(z.string()).max(20).optional() })
  .strict();

export const SubjectOfferingSchema = z
  .object({
    systemId: z.string().uuid(),
    year: z.number().int().min(1).max(3),
    trackId: z.string().uuid().nullable(),
    subjectId: z.string().uuid(),
    countsTowardTotal: z.boolean().default(true),
    level: z.enum(['normal', 'advanced']).nullable().default(null),
    electiveGroupId: z.string().uuid().nullable().default(null),
    marks: z.number().int().min(0).max(1000).default(100),
    sortOrder: z.number().int().default(0),
  })
  .strict()
  /** Year 1 is common and non-specialized in both systems (spec §5.2). */
  .refine((value) => value.year !== 1 || value.trackId === null, {
    message: 'year 1 offerings cannot be scoped to a track',
    path: ['trackId'],
  });
```

- [ ] **Step 2: Write the failing spec** asserting: `SystemPatchSchema` rejects `{ slug: 'x' }`; `TrackPatchSchema` rejects `{ slug: 'x' }` and `{ systemId: '…' }`; `SubjectOfferingSchema` rejects `{ year: 1, trackId: '<uuid>' }`; `TrackCreateSchema` rejects `slug: 'Bacalorya'` (uppercase) and `slug: 'ba lorya'` (space). Run red, then green.

- [ ] **Step 3: Implement the service.** Every write is followed by an audit entry and the **taxonomy cache tag must be invalidated by the caller** — the API does not know about Next's cache, so the Server Action calls `updateTag(tags.taxonomy())` after a successful response (Task 4's helper).

Three referential rules the service enforces beyond the schema:
  - Deactivating a governorate that is referenced by a `student_profiles` row is allowed (`isActive: false` hides it from the dropdown) — **deleting one is not offered at all**, because `Governorate` is the FK target of every profile. There is no delete endpoint; that is the answer to "how do we remove a governorate".
  - Deleting a `Subject` referenced by a `SubjectOffering` returns **409**, not a 500 wrapping the `onDelete: Restrict` violation. Catch Prisma's `P2003` explicitly.
  - `passPercent` and `totalMarks` edits on `EducationSystem` are audited with both the old and new values, because those two numbers change every student's pass/fail rendering retroactively.

- [ ] **Step 4: Build the four editor screens.** Each is a `DataTable` over the existing taxonomy with inline edit via a `Dialog` + `react-hook-form` + `@hookform/resolvers/zod` against the very same schema the API validates with:

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { TrackPatchSchema } from '@ayman/contracts/admin/taxonomy';
import { Field, FieldError, FieldLabel, FieldSet, useFieldControlProps } from '@ayman/ui/components/field';

type TrackPatch = z.infer<typeof TrackPatchSchema>;

/**
 * ONE schema, two consumers. `issues` below carries the raw Standard Schema
 * issues the server returned, so a server-only rule (e.g. a slug collision)
 * renders on exactly the right field with no adapter code.
 */
export function TrackForm({ defaultValues, serverIssues, onSubmit }: TrackFormProps) {
  const form = useForm<TrackPatch>({
    resolver: zodResolver(TrackPatchSchema),
    defaultValues,
  });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldSet>
        <Field name="labelAr" issues={[...clientIssues(form), ...serverIssues]}>
          <FieldLabel>{copy.admin.taxonomy.trackLabel}</FieldLabel>
          <TrackLabelInput {...form.register('labelAr')} />
        </Field>
      </FieldSet>
    </form>
  );
}
```

> ⚠️ **RHF + discriminated unions.** `@hookform/resolvers` historically drops `.refine()` errors applied *on top of* a `z.discriminatedUnion` (resolvers issue #817). `SubjectOfferingSchema`'s year-1 refinement sits on a plain object, so it is safe — but Task 15's `HomeBlockSchema` **is** a discriminated union. Put per-variant rules **inside each member**, never on the union.

- [ ] **Step 5: Verify the immutability rule end to end.**

```bash
curl -s -X PATCH http://localhost:3200/api/admin/taxonomy/systems/<id> \
  -H 'content-type: application/json' -H 'x-csrf-token: 1' -b "<admin cookie>" \
  -d '{"slug":"bakalorya"}' -w '\n%{http_code}\n'
```
Expected: **400**, with an "unrecognized key" issue naming `slug`. Then rename `nameAr` through the UI and confirm the onboarding form's system dropdown shows the new label while a fresh signup still succeeds — that is the proof that labels are copy and slugs are identity.

- [ ] **Step 6: Verify cache invalidation.** Rename a governorate, then load the public onboarding page in a different browser **without restarting the dev server**. The new label must appear, because the save action called `updateTag(tags.taxonomy())`. If it does not, the action is calling `revalidateTag` — fix it (Global Constraint 15).

- [ ] **Step 7: Commit.**

```bash
git add packages/contracts/src/admin/taxonomy.ts packages/contracts/src/admin/taxonomy.spec.ts \
  packages/contracts/package.json apps/api/src/modules/admin/taxonomy apps/web/app/\(admin\)/admin/taxonomy
git commit -m "feat(admin): taxonomy editor with editable Arabic labels and immutable slugs"
```

---

## Task 13: The media library

Four gates in series, in this order: **extension allowlist → magic-byte sniff of the buffer → re-encode through sharp → UUID key**. Each one exists because the previous one is bypassable on its own.

**Files:**
- Create: `packages/contracts/src/admin/media.ts` + `.spec.ts`
- Create: `apps/api/src/modules/media/{media.service.ts,media.service.spec.ts,media.controller.ts,media.module.ts}`
- Create: `apps/api/src/modules/media/file-signature.service.ts`
- Create: `apps/api/src/modules/media/storage/{media-storage.ts,local-disk.storage.ts,local-disk.storage.spec.ts}`
- Create: `apps/api/test/file-signature.check.ts`
- Modify: `apps/api/src/main.ts`, `apps/api/src/config/env.ts`, `apps/api/.env.example`, `apps/api/.gitignore`, `apps/api/.swcrc`, `apps/api/package.json`
- Create: `apps/web/app/(admin)/admin/media/{page.tsx,upload-form.tsx,actions.ts}`

> **RECONCILED — two media env vars, one origin.** Plan 4 Task 7 already owns `MEDIA_BASE_URL`
> (api-side, in `env.ts`) and the `MEDIA_URL_RESOLVER` port at
> `apps/api/src/common/media/media-url.ts`, which is how lesson posters and attachment links are
> built today. This task owns the **upload** side and the web-side `NEXT_PUBLIC_MEDIA_ORIGIN`.
> Three requirements follow:
>
> 1. `MEDIA_BASE_URL` and `NEXT_PUBLIC_MEDIA_ORIGIN` **must resolve to the same origin**. Add a
>    boot assertion in `env.ts` that fails startup if they disagree — a silent mismatch serves
>    every image from a 404 and nothing in the app notices.
> 2. **Rebind `MEDIA_URL_RESOLVER` onto `MediaStorage`** rather than introducing a second resolver.
>    One provider line; Plan 4's consumers do not change.
> 3. Plan 3's `LessonAttachment.storageKey` and `Course.coverKey` move onto this pipeline here —
>    same key format, same `^[0-9a-f]{2}/[0-9a-f-]{36}\.(webp|pdf)$` validation, same
>    path-containment check (A11). Lesson attachments must **not** get a second upload route.

**Interfaces:**
- Consumes (Plan 4): `MEDIA_URL_RESOLVER`, `MEDIA_BASE_URL`.
- Produces:
  - `interface MediaStorage { put(key, body, contentType): Promise<void>; getStream(key): Promise<Readable>; stat(key): Promise<{ size: number } | null>; delete(key): Promise<void> }` and the `MEDIA_STORAGE` DI token
  - `FileSignatureService.detect(buffer: Buffer): Promise<{ mime: string; ext: string } | null>`
  - `POST /api/media` (multipart, `media:write`) → `MediaAsset`
  - `GET /api/admin/media` → `ListResponse<MediaAsset>` (`media:read`)
  - `POST /api/admin/media/:id/archive` / `.../restore` (`media:delete`)
  - `GET /media/:prefix/:name` — **outside the `/api` prefix**, public, opaque bytes

- [ ] **Step 1: Write the contract.** `packages/contracts/src/admin/media.ts`:

```ts
import { z } from 'zod';

/**
 * The allowlist is by MIME, and it is deliberately short.
 *
 * SVG is absent and must stay absent (A9): an SVG is a script-capable document,
 * not an image. Every "SVG sanitiser" is a moving target against a parser
 * differential, and the payoff — vector logos — is not worth an XSS class.
 * Logos and favicons upload as PNG or WebP.
 *
 * GIF is allowed but is re-encoded to animated WebP like everything else.
 */
export const ALLOWED_UPLOAD_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif'] as const;
export const ALLOWED_UPLOAD_EXT = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif'] as const;

/** Enforced at the app AND (in production) at the reverse proxy. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Decompression-bomb ceiling handed to sharp's limitInputPixels (A14). */
export const MAX_INPUT_PIXELS = 50_000_000;

/** Everything we store is re-encoded to this. One output type, one Content-Type. */
export const OUTPUT_MIME = 'image/webp';
export const OUTPUT_EXT = 'webp';

export const MediaAssetSchema = z.object({
  id: z.string(),
  storageKey: z.string(),
  filename: z.string(),
  mime: z.literal(OUTPUT_MIME),
  sizeBytes: z.number().int().min(0),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  altAr: z.string().nullable(),
  createdAt: z.string(),
});

export type MediaAsset = z.infer<typeof MediaAssetSchema>;

/** A11: the ONLY key shape that may reach the filesystem. */
export const STORAGE_KEY_PATTERN = /^[0-9a-f]{2}\/[0-9a-f-]{36}\.webp$/;

export const MediaPatchSchema = z.object({ altAr: z.string().max(200).nullable() }).strict();
```

- [ ] **Step 2: Isolate `file-type` behind a provider.** `file-type@22` is **ESM-only** (`"type": "module"`, no CJS entry) and `apps/api` compiles to CommonJS via SWC. Confine it to one module reached through a lazily-cached dynamic import, and preserve that import through the build.

Add to `apps/api/.swcrc`:
```json
  "module": {
    "type": "commonjs",
    "ignoreDynamic": true
  }
```
`ignoreDynamic` keeps `import()` as a real dynamic import in the CJS output instead of rewriting it to `require()`. Node 24 executes it natively.

Create `apps/api/src/modules/media/file-signature.service.ts`:

```ts
import { Injectable } from '@nestjs/common';

export interface DetectedType {
  mime: string;
  ext: string;
}

/**
 * Magic-byte detection. Reads the BUFFER — never the Content-Type header,
 * which is attacker-supplied and means nothing.
 *
 * `file-type` v22 is ESM-only and this app is CommonJS, so the import is
 * dynamic and cached. It is behind a Nest provider so every consumer's unit
 * test injects a fake and never touches the real module — the same containment
 * pattern `auth/better-auth.token.ts` uses for the same reason.
 *
 * The real round-trip through `file-type` is covered by
 * `apps/api/test/file-signature.check.ts`, which runs under tsx (native ESM)
 * rather than under Jest's CommonJS loader.
 */
@Injectable()
export class FileSignatureService {
  private loader?: Promise<(buffer: Uint8Array) => Promise<DetectedType | undefined>>;

  private load(): Promise<(buffer: Uint8Array) => Promise<DetectedType | undefined>> {
    this.loader ??= import('file-type').then((module) => module.fileTypeFromBuffer);
    return this.loader;
  }

  async detect(buffer: Buffer): Promise<DetectedType | null> {
    const fileTypeFromBuffer = await this.load();
    const detected = await fileTypeFromBuffer(buffer);
    return detected ? { mime: detected.mime, ext: detected.ext } : null;
  }
}
```

Create `apps/api/test/file-signature.check.ts` — a real assertion script, not a placeholder:

```ts
/**
 * Runs under tsx (native ESM), so it exercises the REAL file-type module.
 * Wired into the api's `test` script; a failure here fails the build.
 */
import assert from 'node:assert/strict';
import { FileSignatureService } from '../src/modules/media/file-signature.service';

const service = new FileSignatureService();

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000', 'hex');
const GIF_HTML_POLYGLOT = Buffer.concat([
  Buffer.from('GIF89a', 'ascii'),
  Buffer.from('<script>alert(1)</script>', 'ascii'),
]);
const HTML = Buffer.from('<!doctype html><script>alert(1)</script>', 'ascii');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>', 'ascii');

const png = await service.detect(PNG);
assert.equal(png?.mime, 'image/png', 'PNG magic bytes must be detected');

const jpeg = await service.detect(JPEG);
assert.equal(jpeg?.mime, 'image/jpeg', 'JPEG magic bytes must be detected');

// A polyglot sniffs as GIF — which is exactly why detection alone is NOT the
// control. The sharp re-encode in MediaService is what destroys the payload.
const polyglot = await service.detect(GIF_HTML_POLYGLOT);
assert.equal(polyglot?.mime, 'image/gif', 'a GIF/HTML polyglot still sniffs as GIF');

assert.equal(await service.detect(HTML), null, 'raw HTML must not sniff as any allowed type');

// file-type does not detect SVG at all (it is text, not a binary container),
// so SVG is rejected by "no detected type", on top of the MIME allowlist.
assert.equal(await service.detect(SVG), null, 'SVG must not produce a detected type');

console.log('file-signature checks passed');
```

Change `apps/api/package.json`'s test script to `"test": "jest && tsx test/file-signature.check.ts"`.

> ⚠️ **Verify the SWC output before moving on.** Build and grep — if the dynamic import was rewritten to `require`, the app will throw `ERR_REQUIRE_ESM` at the first upload:
> ```bash
> pnpm --filter @ayman/api build
> grep -n "file-type" apps/api/dist/modules/media/file-signature.service.js
> ```
> Expected: a literal `import("file-type")`. If you see `require("file-type")`, `ignoreDynamic` did not take effect — fall back to `file-type@16.5.4` (the maintained CommonJS branch, `dist-tag: version-16`, API `FileType.fromBuffer`) and record the swap in your report.

- [ ] **Step 3: Define the storage interface and the local adapter.** `apps/api/src/modules/media/storage/media-storage.ts`:

```ts
import type { Readable } from 'node:stream';

export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

/**
 * The seam that makes S3/R2 a swap rather than a rewrite. Deliberately narrow:
 * no listing, no signed URLs, no metadata — the database is the index, the
 * bucket is a byte store.
 */
export interface MediaStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  getStream(key: string): Promise<Readable>;
  stat(key: string): Promise<{ size: number } | null>;
  delete(key: string): Promise<void>;
}
```

`local-disk.storage.ts`:

```ts
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { STORAGE_KEY_PATTERN } from '@ayman/contracts/admin/media';
import type { MediaStorage } from './media-storage';

/**
 * A11 — two independent checks, because either alone has been bypassed before:
 *   1. the key must match the exact generated shape, and
 *   2. the resolved absolute path must still sit inside the media root.
 * The second catches anything a future key-shape change lets through.
 */
@Injectable()
export class LocalDiskStorage implements MediaStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolveKey(key: string): string {
    if (!STORAGE_KEY_PATTERN.test(key)) {
      throw new Error(`invalid storage key: ${key.slice(0, 64)}`);
    }
    const resolved = path.resolve(this.root, key);
    if (resolved !== this.root && !resolved.startsWith(this.root + path.sep)) {
      throw new Error('storage key escapes the media root');
    }
    return resolved;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const target = this.resolveKey(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body, { flag: 'wx' }); // wx: never overwrite an existing key
  }

  async getStream(key: string): Promise<Readable> {
    return createReadStream(this.resolveKey(key));
  }

  async stat(key: string): Promise<{ size: number } | null> {
    try {
      const info = await stat(this.resolveKey(key));
      return { size: info.size };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }
}
```

- [ ] **Step 4: Write the failing storage test** asserting `resolveKey` rejects `../../etc/passwd`, `..%2f..%2fetc`, `ab/../../x.webp`, `AB/<uuid>.webp` (uppercase prefix), and `ab/<uuid>.svg`; and that `put` refuses to overwrite an existing key. Run red, then green.

- [ ] **Step 5: Implement the pipeline.** `apps/api/src/modules/media/media.service.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, PayloadTooLargeException } from '@nestjs/common';
import sharp from 'sharp';
import {
  ALLOWED_UPLOAD_EXT,
  ALLOWED_UPLOAD_MIME,
  MAX_INPUT_PIXELS,
  MAX_UPLOAD_BYTES,
  OUTPUT_EXT,
  OUTPUT_MIME,
  type MediaAsset,
} from '@ayman/contracts/admin/media';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FileSignatureService } from './file-signature.service';
import { MEDIA_STORAGE, type MediaStorage } from './storage/media-storage';
import type { AuditContext } from '../admin/settings/settings.service';

const ALLOWED_MIME = new Set<string>(ALLOWED_UPLOAD_MIME);
const ALLOWED_EXT = new Set<string>(ALLOWED_UPLOAD_EXT);

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly signature: FileSignatureService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  /**
   * Four gates, in order. Each one is bypassable alone:
   *   1. extension allowlist    — cheap, catches typos, bypassed by renaming
   *   2. magic-byte sniff       — reads the buffer, bypassed by a polyglot
   *   3. sharp RE-ENCODE        — destroys polyglots, strips EXIF/GPS entirely
   *   4. UUID key               — the original filename never touches the disk
   *
   * The uploaded Content-Type header is read NOWHERE in this method.
   */
  async upload(
    file: { originalname: string; buffer: Buffer; size: number },
    context: AuditContext,
  ): Promise<MediaAsset> {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException();
    }

    const extension = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXT.has(extension)) {
      throw new BadRequestException('file extension is not allowed');
    }

    const detected = await this.signature.detect(file.buffer);
    if (!detected || !ALLOWED_MIME.has(detected.mime)) {
      throw new BadRequestException('file contents are not an allowed image type');
    }

    // The re-encode is the real control. A GIF/HTML polyglot sniffs as GIF and
    // passes gate 2; re-encoding it produces a clean WebP with no HTML in it,
    // and drops every EXIF/GPS block in the process.
    const pipeline = sharp(file.buffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
      animated: detected.mime === 'image/gif' || detected.mime === 'image/webp',
      failOn: 'error',
    })
      .rotate() // applies the EXIF orientation, then discards the metadata
      .webp({ quality: 82 });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

    const id = randomUUID();
    const key = `${id.slice(0, 2)}/${id}.${OUTPUT_EXT}`;
    await this.storage.put(key, data, OUTPUT_MIME);

    const asset = await this.prisma.mediaAsset.create({
      data: {
        id,
        storageKey: key,
        // Stored for display only; it is never used to build a path.
        filename: file.originalname.slice(0, 200),
        mime: OUTPUT_MIME,
        sizeBytes: data.byteLength,
        width: info.width,
        height: info.height,
        uploadedBy: context.actorUserId,
      },
    });

    await this.audit.record({
      ...context,
      action: 'media:upload',
      resourceType: 'media_asset',
      resourceId: asset.id,
      outcome: 'success',
      metadata: {
        declaredExtension: extension,
        detectedMime: detected.mime,
        outputBytes: data.byteLength,
      },
    });

    return this.toDto(asset);
  }
}
```

- [ ] **Step 6: Write the failing service tests** with a fake `FileSignatureService` and an in-memory `MediaStorage`:
  - a `.exe` renamed to `.png` is rejected at gate 2 (detector returns `null`)
  - a real PNG buffer whose filename is `x.svg` is rejected at gate 1
  - a 9 MB buffer is rejected with 413 before any sniffing happens
  - the stored key matches `STORAGE_KEY_PATTERN` and contains **none** of the original filename
  - the persisted `mime` is always `image/webp` regardless of the input type
  - exactly one `media:upload` audit entry is written, carrying `detectedMime`
  - **an image carrying GPS EXIF comes out with no EXIF** — assert by re-reading the output with `sharp(output).metadata()` and checking `exif` is `undefined`

- [ ] **Step 7: Serve the bytes from a different origin.** In `apps/api/src/main.ts`, exclude the media route from the global prefix so it does **not** live under `/api` and therefore is **not** proxied by the web app's `/api/:path*` rewrite:

```ts
import { RequestMethod } from '@nestjs/common';
// …
app.setGlobalPrefix('api', {
  // A10: media is served from the API origin (port 3300), which is a different
  // origin from the web app (port 3200) under the same-origin policy. It must
  // NOT sit under /api, because /api is exactly what the web app proxies onto
  // its own origin — which would put attacker-uploaded bytes back on the app
  // origin and undo the whole control.
  exclude: [{ path: 'media/:prefix/:name', method: RequestMethod.GET }],
});
```

The controller:

```ts
@Public()
@Get('media/:prefix/:name')
async serve(
  @Param('prefix') prefix: string,
  @Param('name') name: string,
  @Res() response: Response,
): Promise<void> {
  const key = `${prefix}/${name}`;
  const info = await this.media.statByKey(key); // validates the pattern, 404s otherwise
  if (!info) throw new NotFoundException();

  response.set({
    // We produced these bytes ourselves, so we know the type exactly.
    'Content-Type': OUTPUT_MIME,
    'Content-Length': String(info.size),
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `inline; filename="${name}"`,
    'Cache-Control': 'public, max-age=31536000, immutable',
    // Belt and braces: even if something non-image ever lands here, this
    // policy gives it no script, no styles, no network and no same-origin.
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });

  (await this.media.streamByKey(key)).pipe(response);
}
```

> **Production note, state it plainly in your report:** a different *port* satisfies the same-origin policy but shares the registrable domain, so it does **not** isolate cookies. Before launch, media must move to a distinct hostname (`media.<domain>`) or an object-storage domain. The `NEXT_PUBLIC_MEDIA_ORIGIN` env var is the only change required.

- [ ] **Step 8: Add the env and ignore entries.**
  - `apps/api/src/config/env.ts`: `MEDIA_ROOT: z.string().min(1).default('./.media')` and `MEDIA_MAX_BYTES` (coerced number, default `8388608`).
  - `apps/web`: `NEXT_PUBLIC_MEDIA_ORIGIN` in `.env.example`, default `http://localhost:3300`.
  - `apps/api/.gitignore`: add `.media/`. **The upload directory must never be committed** — this is why Global Constraint 10 forbids `git add -A` in this plan.
  - Register the provider: `{ provide: MEDIA_STORAGE, useFactory: (env) => new LocalDiskStorage(env.MEDIA_ROOT), inject: [ENV] }`.

- [ ] **Step 9: Wire multipart.** Use `@nestjs/platform-express` + `multer` with `memoryStorage()` and `limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 }`. Memory storage on purpose: the buffer never touches the disk before it has been sniffed and re-encoded.

```bash
pnpm --filter @ayman/api add multer@2.2.0 sharp@0.35.3 file-type@22.0.1
pnpm --filter @ayman/api add -D @types/multer@2.2.0
```

- [ ] **Step 10: Build the admin media screen** — a grid of `next/image` thumbnails (`unoptimized` is unnecessary; add the media origin to `next.config.ts`'s `images.remotePatterns`), a drop zone, an alt-text editor, and archive/restore with an undo toast. Archive is a soft delete (`archivedAt`); **the bytes are not removed**, because an asset referenced by a published home block must not 404 the moment someone tidies the library.

- [ ] **Step 11: Verify the four gates by hand.** Record each result:

```bash
# 1. renamed executable → 400
printf 'MZ\x90\x00' > /tmp/evil.png && curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST http://localhost:3300/api/media -b "<admin cookie>" -H 'x-csrf-token: 1' -F file=@/tmp/evil.png

# 2. GIF/HTML polyglot → 201, and the STORED bytes contain no script tag
printf 'GIF89a<script>alert(1)</script>' > /tmp/poly.gif
curl -s -X POST http://localhost:3300/api/media -b "<admin cookie>" -H 'x-csrf-token: 1' -F file=@/tmp/poly.gif
grep -c 'script' apps/api/.media/*/*.webp || echo 'no script bytes in stored output — correct'

# 3. SVG → 400 at the extension gate
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3300/api/media \
  -b "<admin cookie>" -H 'x-csrf-token: 1' -F file=@/tmp/logo.svg

# 4. path traversal on the read path → 404, never a file outside .media
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3300/media/../../../etc/passwd'
```
Expected: `400`, then a `201` whose stored file contains no `script` bytes, then `400`, then `404`.

- [ ] **Step 12: Confirm the media origin is genuinely not proxied.**

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3200/media/<prefix>/<name>.webp
curl -s -I http://localhost:3300/media/<prefix>/<name>.webp | grep -i 'content-type\|x-content-type\|cross-origin'
```
Expected: **404 from port 3200** (the web app does not serve media — this is the control working), and the full header set from port 3300.

- [ ] **Step 13: Commit.**

```bash
git add packages/contracts/src/admin/media.ts packages/contracts/src/admin/media.spec.ts \
  packages/contracts/package.json apps/api/src/modules/media apps/api/test/file-signature.check.ts \
  apps/api/src/main.ts apps/api/src/config/env.ts apps/api/.env.example apps/api/.gitignore \
  apps/api/.swcrc apps/api/package.json apps/web/app/\(admin\)/admin/media apps/web/next.config.ts
git commit -m "feat(media): magic-byte + sharp re-encode upload pipeline served from a separate origin"
```

> ⚠️ Run `git status --short` after committing. A mistyped path in an explicit `git add` list is the one failure mode of Global Constraint 10 — the commit succeeds and a file is quietly left behind.

---

## Task 14: Feature flags

Declarations in TypeScript (typed, greppable), values in the database, read through the same tagged loader as everything else. A flag nobody declared is inert.

**Files:**
- Create: `packages/contracts/src/admin/flags.ts` + `.spec.ts`
- Create: `apps/api/src/modules/admin/flags/{flags.service.ts,flags.service.spec.ts,flags.controller.ts,flags.module.ts}`
- Create: `apps/web/app/(admin)/admin/flags/{page.tsx,flag-switch.tsx,actions.ts}`
- Modify: `apps/api/prisma/seed.ts`

**Interfaces:**
- Produces:
  - `FLAG_DECLARATIONS: readonly FlagDeclaration[]`, `type FlagKey`
  - `GET /api/flags` → `FeatureFlagList` (public, values only)
  - `GET /api/admin/flags` → full rows (`flags:read`)
  - `PATCH /api/admin/flags/:key` → `FeatureFlag` (`flags:write`)
  - `isEnabled(flags: FeatureFlagList, key: FlagKey): boolean`

- [ ] **Step 1: Write the declarations and the contract.** `packages/contracts/src/admin/flags.ts`:

```ts
import { z } from 'zod';

/**
 * Flag DECLARATIONS. The database holds only values, so:
 *   • a flag that exists in the table but not here is ignored entirely, and
 *   • a flag declared here but never written reads as `defaultValue`.
 * That asymmetry is what makes deleting a flag safe — you delete the
 * declaration and the row becomes inert rather than becoming an unknown.
 */
export interface FlagDeclaration {
  key: string;
  descriptionAr: string;
  defaultValue: boolean;
}

export const FLAG_DECLARATIONS = [
  { key: 'catalog.showComingSoon', descriptionAr: 'إظهار الكورسات اللي لسه مش متاحة', defaultValue: false },
  { key: 'quiz.practiceMode', descriptionAr: 'تفعيل وضع التدريب في الاختبارات', defaultValue: true },
  { key: 'quiz.showReviewAfterSubmit', descriptionAr: 'عرض المراجعة بعد تسليم الاختبار', defaultValue: true },
  { key: 'player.trackProgress', descriptionAr: 'تسجيل تقدم مشاهدة الدروس', defaultValue: true },
  { key: 'onboarding.askParentPhones', descriptionAr: 'السؤال عن أرقام ولي الأمر', defaultValue: true },
  { key: 'home.showTestimonials', descriptionAr: 'إظهار آراء الطلبة في الصفحة الرئيسية', defaultValue: false },
  { key: 'sessions.enforceDeviceLimit', descriptionAr: 'تطبيق حد الأجهزة المسموح بها', defaultValue: false },
] as const satisfies readonly FlagDeclaration[];

export type FlagKey = (typeof FLAG_DECLARATIONS)[number]['key'];

export const FeatureFlagSchema = z.object({
  key: z.string(),
  descriptionAr: z.string(),
  enabled: z.boolean(),
  updatedAt: z.string(),
});

export const FeatureFlagListSchema = z.array(FeatureFlagSchema);
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;
export type FeatureFlagList = z.infer<typeof FeatureFlagListSchema>;

export const FeatureFlagPatchSchema = z.object({ enabled: z.boolean() }).strict();

/** Undeclared keys and missing rows both resolve to the declared default. */
export function isEnabled(flags: FeatureFlagList, key: FlagKey): boolean {
  const declaration = FLAG_DECLARATIONS.find((entry) => entry.key === key);
  if (!declaration) return false;
  return flags.find((flag) => flag.key === key)?.enabled ?? declaration.defaultValue;
}
```

- [ ] **Step 2: Write the failing test** for `isEnabled`: a declared flag with no row returns its default; a declared flag with a row returns the row; an **undeclared** key returns `false` even when the table says `true`; and every declaration key is unique. Run red, then implement, then green.

- [ ] **Step 3: Reconcile declarations into the table on boot, not by hand.** In `flags.service.ts`:

```ts
/**
 * Upserts a row for every declaration on module init, so the admin screen
 * always lists the full set and an operator never has to know a key by heart.
 * Rows for undeclared keys are LEFT ALONE — deleting them would destroy the
 * history of a flag someone is mid-way through removing.
 */
async onModuleInit(): Promise<void> {
  for (const declaration of FLAG_DECLARATIONS) {
    await this.prisma.featureFlag.upsert({
      where: { key: declaration.key },
      create: {
        key: declaration.key,
        descriptionAr: declaration.descriptionAr,
        enabled: declaration.defaultValue,
      },
      // Description follows the declaration; `enabled` never does — an operator
      // toggle must survive a deploy.
      update: { descriptionAr: declaration.descriptionAr },
    });
  }
}
```

- [ ] **Step 4: Build the admin screen** — one `Switch` per flag with the Arabic description beside it, an optimistic toggle, and a `sonner` toast on success. The Server Action calls `updateTag(tags.flags())` after the PATCH resolves.

`apps/web/app/(admin)/admin/flags/actions.ts`:

```ts
'use server';

import { updateTag } from 'next/cache';
import { FeatureFlagSchema } from '@ayman/contracts/admin/flags';
import { adminSend } from '@/lib/admin-api';
import { tags } from '@/lib/cache-tags';

export async function setFlag(key: string, enabled: boolean) {
  const flag = await adminSend('PATCH', `/api/admin/flags/${encodeURIComponent(key)}`, { enabled }, FeatureFlagSchema);

  // updateTag, NOT revalidateTag: this expires the tag AND refreshes it for
  // the current request, so the editor's next read is their own write. With
  // revalidateTag the toggle appears not to take effect until a second reload,
  // which is indistinguishable from a bug.
  updateTag(tags.flags());

  return flag;
}
```

- [ ] **Step 5: Verify read-your-own-writes.** Toggle a flag in the admin, then **without reloading**, open the public page that consumes it in another tab. The new value must be live. Then swap `updateTag` for `revalidateTag` temporarily, repeat, and observe the stale read. **Restore `updateTag`** and record both observations — this is the only way to prove Global Constraint 15 rather than assert it.

- [ ] **Step 6: Commit.**

```bash
git add packages/contracts/src/admin/flags.ts packages/contracts/src/admin/flags.spec.ts \
  packages/contracts/package.json apps/api/src/modules/admin/flags apps/web/app/\(admin\)/admin/flags
git commit -m "feat(admin): declared feature flags with database values and read-your-own-writes"
```

---

## Task 15: Navigation builder and homepage composer

Both are ordered lists edited by drag. Both write **once**, debounced, with the full ordered id array — never one request per moved item.

**Files:**
- Create: `packages/contracts/src/admin/navigation.ts`, `packages/contracts/src/admin/home-blocks.ts` (+ specs)
- Create: `apps/api/src/modules/admin/navigation/*`, `apps/api/src/modules/admin/home-blocks/*`
- Verify (Plan 3 Task 12): `apps/web/components/admin/sortable-list.tsx` — **do not re-create it**
- Create: `apps/web/app/(admin)/admin/navigation/{page.tsx,nav-editor.tsx,actions.ts}`
- Create: `apps/web/app/(admin)/admin/home/{page.tsx,block-composer.tsx,block-forms.tsx,actions.ts}`

**Interfaces:**
- Produces:
  - `GET /api/navigation` → `NavigationTree` (public, published + permission-filtered)
  - `POST|PATCH /api/admin/navigation[/:id]`, `POST /api/admin/navigation/order`
  - `GET /api/home-blocks` → `HomeBlockList` (public, published only)
  - `POST|PATCH /api/admin/home-blocks[/:id]`, `POST /api/admin/home-blocks/order`
  - two-level nav ordering and homepage-block ordering, both driven by Plan 3's `<SortableList items onReorder>`

> **RECONCILED.** `SortableList`, `useDebouncedReorder` and the `@dnd-kit` installs come from
> **Plan 3 Task 12**; the server-side `buildReorderSql` comes from **Plan 3 Task 8** and its
> whitelist union already contains `'navigation_items'` and `'home_blocks'`. Step 4 below is
> retained as the canonical specification of the wrapper (Plan 3 Task 12 implements it); when you
> reach this task, verify it and use it.

- [ ] **Step 1: Write the contracts.** `packages/contracts/src/admin/navigation.ts`:

```ts
import { z } from 'zod';

export const NavigationItemSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  labelAr: z.string(),
  href: z.string(),
  icon: z.string().nullable(),
  position: z.number().int(),
  visibleTo: z.array(z.string()),
  isPublished: z.boolean(),
});

export type NavigationItem = z.infer<typeof NavigationItemSchema>;

export const NavigationTreeSchema = z.array(
  NavigationItemSchema.extend({ children: z.array(NavigationItemSchema) }),
);
export type NavigationTree = z.infer<typeof NavigationTreeSchema>;

/**
 * `href` is restricted to site-relative paths. An admin-controlled menu that
 * accepts absolute URLs is an open redirect surface and, with `javascript:`,
 * a stored-XSS one. Off-site links belong in the contact settings block.
 */
const internalHref = z
  .string()
  .min(1)
  .max(200)
  .regex(/^\/[A-Za-z0-9\-._~/?#[\]@!$&'()*+,;=%]*$/, 'must be a site-relative path starting with /');

export const NavigationCreateSchema = z
  .object({
    parentId: z.string().uuid().nullable().default(null),
    labelAr: z.string().min(1).max(60),
    href: internalHref,
    icon: z.string().max(40).nullable().default(null),
    visibleTo: z.array(z.string().regex(/^[a-z-]+:[a-z-]+$/)).max(10).default([]),
    isPublished: z.boolean().default(true),
  })
  .strict();

export const NavigationPatchSchema = NavigationCreateSchema.partial().strict();

/**
 * ONE write for a whole reorder. `ids` is the complete ordered list for a
 * single parent level — the server rejects it if the set does not match
 * exactly, which turns a lost drag into a 409 instead of silent data loss.
 */
export const ReorderSchema = z
  .object({
    parentId: z.string().uuid().nullable(),
    ids: z.array(z.string().uuid()).min(1).max(200),
  })
  .strict()
  .refine((value) => new Set(value.ids).size === value.ids.length, {
    message: 'ids must be unique',
    path: ['ids'],
  });

export type Reorder = z.infer<typeof ReorderSchema>;
```

`packages/contracts/src/admin/home-blocks.ts`:

```ts
import { z } from 'zod';

/**
 * ⚠️ Per-variant rules live INSIDE each member, never as a `.refine()` on the
 * union. @hookform/resolvers drops refinements applied on top of a
 * discriminated union (resolvers #817) — the form would submit with the rule
 * silently unenforced on the client while the server rejected it.
 */
export const HeroPropsSchema = z.object({
  type: z.literal('hero'),
  headlineAr: z.string().min(4).max(120),
  subheadlineAr: z.string().max(240).default(''),
  ctaLabelAr: z.string().max(40).default(''),
  ctaHref: z.string().regex(/^\/[^\s]*$/).default('/courses'),
  imageAssetId: z.string().uuid().nullable().default(null),
});

export const CourseGridPropsSchema = z.object({
  type: z.literal('courseGrid'),
  titleAr: z.string().min(2).max(80),
  /** Empty = "latest N"; explicit ids = a curated row. */
  courseIds: z.array(z.string().uuid()).max(12).default([]),
  limit: z.number().int().min(1).max(12).default(6),
});

export const StatsPropsSchema = z.object({
  type: z.literal('stats'),
  titleAr: z.string().max(80).default(''),
  items: z
    .array(z.object({ labelAr: z.string().min(1).max(40), value: z.string().min(1).max(20) }))
    .min(1)
    .max(4),
});

export const TestimonialsPropsSchema = z.object({
  type: z.literal('testimonials'),
  titleAr: z.string().max(80).default(''),
  items: z
    .array(
      z.object({
        nameAr: z.string().min(2).max(60),
        bodyAr: z.string().min(4).max(400),
        avatarAssetId: z.string().uuid().nullable().default(null),
      }),
    )
    .min(1)
    .max(12),
});

export const FaqPropsSchema = z.object({
  type: z.literal('faq'),
  titleAr: z.string().max(80).default(''),
  items: z.array(z.object({ questionAr: z.string().min(4).max(200), answerAr: z.string().min(4).max(1200) })).min(1).max(20),
});

export const CtaPropsSchema = z.object({
  type: z.literal('cta'),
  headlineAr: z.string().min(4).max(120),
  ctaLabelAr: z.string().min(2).max(40),
  ctaHref: z.string().regex(/^\/[^\s]*$/),
});

export const HomeBlockPropsSchema = z.discriminatedUnion('type', [
  HeroPropsSchema,
  CourseGridPropsSchema,
  StatsPropsSchema,
  TestimonialsPropsSchema,
  FaqPropsSchema,
  CtaPropsSchema,
]);

export type HomeBlockProps = z.infer<typeof HomeBlockPropsSchema>;

export const HomeBlockSchema = z.object({
  id: z.string(),
  key: z.string(),
  position: z.number().int(),
  isPublished: z.boolean(),
  props: HomeBlockPropsSchema,
});

export const HomeBlockListSchema = z.array(HomeBlockSchema);
export type HomeBlock = z.infer<typeof HomeBlockSchema>;
export type HomeBlockList = z.infer<typeof HomeBlockListSchema>;
```

> **Note on FAQ.** The `faq` block renders as ordinary accordion markup. **Do not add `FAQPage` JSON-LD** — Google removed the documentation on 2026-06-15 and it produces zero rich results (spec §5.1).

- [ ] **Step 2: Write the failing contract tests:** the union rejects `{ type: 'hero', items: [] }`; `StatsPropsSchema` rejects 5 items and accepts 4; `NavigationCreateSchema` rejects `href: 'https://evil.example'`, `href: 'javascript:alert(1)'` and `href: 'courses'` (no leading slash); `ReorderSchema` rejects a duplicated id. Run red, implement, green.

- [ ] **Step 3: Implement the reorder endpoint — one write, set-equality checked.**

```ts
/**
 * Spec §5.4: "Reordering 40 lessons is one debounced write of the full ordered
 * id array, not 40 writes." Same rule here.
 *
 * The set-equality check is what makes a single write safe: if another admin
 * added or removed an item since this client loaded, the arrays differ and we
 * 409 instead of writing positions that reference a list that no longer exists.
 */
async reorder(input: Reorder, context: AuditContext): Promise<void> {
  const existing = await this.prisma.navigationItem.findMany({
    where: { parentId: input.parentId, archivedAt: null },
    select: { id: true },
  });

  const currentIds = new Set(existing.map((item) => item.id));
  const sameSize = currentIds.size === input.ids.length;
  const sameMembers = input.ids.every((id) => currentIds.has(id));

  if (!sameSize || !sameMembers) {
    throw new ConflictException('the item list changed; reload and reorder again');
  }

  await this.prisma.$transaction(
    input.ids.map((id, index) =>
      this.prisma.navigationItem.update({ where: { id }, data: { position: index } }),
    ),
  );

  await this.audit.record({
    ...context,
    action: 'nav:reorder',
    resourceType: 'navigation_items',
    resourceId: input.parentId,
    outcome: 'success',
    metadata: { order: input.ids },
  });
}
```

> There is deliberately **no unique index on `position`**. With one, this transaction deadlocks against itself the moment two items swap, and the usual workaround (write negatives first, then rewrite) doubles the writes for no benefit. Ordering ties break on id, exactly as the spec requires.

- [ ] **Step 4: Verify the shared sortable wrapper** built in Plan 3 Task 12 — `apps/web/components/admin/sortable-list.tsx`. Its canonical shape is below; if it differs, reconcile toward Plan 3 and update this document rather than adding a second component:

```tsx
'use client';

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useRef, useState } from 'react';

/**
 * ⚠️ `@dnd-kit/core` + `@dnd-kit/sortable`, NOT `@dnd-kit/react` — the latter
 * is pre-1.0 with an open bug where onDragEnd reports an identical source and
 * target (#1564), which silently no-ops every reorder.
 *
 * Reorder is optimistic locally and persisted ONCE, 600ms after the last drop.
 * Dragging an item through four positions is one request, not four.
 */
const PERSIST_DELAY_MS = 600;

export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
}: {
  items: T[];
  onReorder: (ids: string[]) => Promise<void>;
  renderItem: (item: T) => React.ReactNode;
}) {
  const [order, setOrder] = useState(items);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Server state wins whenever it changes — otherwise a save that the server
  // rejected (409) leaves the UI showing an order that does not exist.
  useEffect(() => setOrder(items), [items]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // Keyboard reordering is not optional: a drag-only list is unusable with a
    // keyboard and fails WCAG 2.1.1 outright.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = order.findIndex((item) => item.id === active.id);
    const to = order.findIndex((item) => item.id === over.id);
    const next = arrayMove(order, from, to);
    setOrder(next);

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void onReorder(next.map((item) => item.id));
    }, PERSIST_DELAY_MS);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-8">
          {order.map((item) => (
            <SortableRow key={item.id} id={item.id}>
              {renderItem(item)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <li
      ref={setNodeRef}
      // transform + opacity only (spec §4.4) — animating width/top forces
      // layout and paint every frame and is worth 30–60ms of INP.
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className="rounded-[var(--r-md)] border border-line bg-surface-2"
      {...attributes}
      {...listeners}
    >
      {children}
    </li>
  );
}
```

- [ ] **Step 5: Build the navigation editor** — a two-level `SortableList` (top level plus children), an add/edit `Dialog` with the `Field` primitives, publish toggles, and archive with an undo toast. `visibleTo` is a multi-select over `PERMISSIONS`, so a menu entry is hidden from anyone lacking the permission the target page requires.

- [ ] **Step 6: Build the homepage composer** — a `SortableList` of blocks, an "add block" menu over the six types, and a per-type form generated from the matching member of the discriminated union. A preview column renders the actual public block components so the composer is WYSIWYG rather than a form over opaque JSON.

- [ ] **Step 7: Wire the cache.** Every mutating action calls `updateTag(tags.nav())` or `updateTag(tags.homeBlocks())`. The **public** loaders (`getNavigation`, `getHomeBlocks`) filter to `isPublished && archivedAt === null` **on the API side** — never in the component, or an unpublished draft ships inside the RSC payload and is readable in view-source.

- [ ] **Step 8: Verify.**
  1. Drag a nav item through three positions in one gesture; confirm in the network panel that **exactly one** `POST /api/admin/navigation/order` fires, 600ms after the drop.
  2. Reorder with the keyboard alone (Tab to a handle, Space, arrows, Space).
  3. Open the same page in two tabs, delete an item in tab A, reorder in tab B → tab B gets a **409** and reverts to the server order rather than silently writing.
  4. Create an unpublished home block; confirm it does **not** appear in `view-source` of `/`.
  5. Try to save a nav item with `href: 'https://evil.example'` → 400.

- [ ] **Step 9: Commit.**

```bash
git add packages/contracts/src/admin/navigation.ts packages/contracts/src/admin/home-blocks.ts \
  packages/contracts/src/admin/navigation.spec.ts packages/contracts/src/admin/home-blocks.spec.ts \
  packages/contracts/package.json apps/api/src/modules/admin/navigation apps/api/src/modules/admin/home-blocks \
  'apps/web/app/(admin)/admin/navigation' 'apps/web/app/(admin)/admin/home'
git commit -m "feat(admin): navigation builder and homepage composer with single-write reordering"
```

---

## Task 16: Command palette, shortcuts, and real undo

The palette renders every entry's shortcut, so it doubles as shortcut training (Linear's pattern). Undo is a server-side restore, not a client-side delay.

**Files:**
- Create: `apps/web/components/admin/shortcuts.ts` + `shortcuts.test.ts`
- Create: `apps/web/components/admin/command-palette.tsx`
- Create: `apps/web/components/admin/use-global-shortcuts.ts`
- Create: `apps/web/lib/undoable.ts` + `undoable.test.ts`
- Modify: `apps/web/components/admin/admin-header.tsx`, `packages/contracts/src/copy/ar.ts`

**Interfaces:**
- Produces:
  - `SHORTCUTS: readonly Shortcut[]` where `Shortcut = { id: string; labelAr: string; combo: Combo; group: 'navigate' | 'act'; href?: string; permission: string }`
  - `formatCombo(combo: Combo, platform: 'mac' | 'other'): string[]`
  - `matchesCombo(event: KeyboardEvent, combo: Combo): boolean`
  - `toastUndoable({ messageAr, undo })` — the destructive-action helper

- [ ] **Step 1: Write the failing shortcut-registry test.** `apps/web/components/admin/shortcuts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SHORTCUTS, formatCombo, matchesCombo } from './shortcuts';

describe('SHORTCUTS registry', () => {
  it('has no duplicate ids', () => {
    expect(new Set(SHORTCUTS.map((s) => s.id)).size).toBe(SHORTCUTS.length);
  });

  it('has no two entries bound to the same combo', () => {
    const keys = SHORTCUTS.map((s) => `${s.combo.mod ? 'mod+' : ''}${s.combo.shift ? 'shift+' : ''}${s.combo.key}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every entry a label and a permission', () => {
    for (const shortcut of SHORTCUTS) {
      expect(shortcut.labelAr.length).toBeGreaterThan(0);
      expect(shortcut.permission).toMatch(/^[a-z-]+:[a-z-]+$/);
    }
  });
});

describe('formatCombo', () => {
  it('renders the mac glyph on mac and the word elsewhere', () => {
    expect(formatCombo({ mod: true, key: 'k' }, 'mac')).toEqual(['⌘', 'K']);
    expect(formatCombo({ mod: true, key: 'k' }, 'other')).toEqual(['Ctrl', 'K']);
  });

  it('includes shift when present', () => {
    expect(formatCombo({ mod: true, shift: true, key: 'p' }, 'mac')).toEqual(['⌘', '⇧', 'P']);
  });
});

describe('matchesCombo', () => {
  const event = (init: Partial<KeyboardEvent>) => init as KeyboardEvent;

  it('accepts metaKey on mac-style events and ctrlKey elsewhere', () => {
    expect(matchesCombo(event({ key: 'k', metaKey: true, ctrlKey: false, shiftKey: false }), { mod: true, key: 'k' })).toBe(true);
    expect(matchesCombo(event({ key: 'k', metaKey: false, ctrlKey: true, shiftKey: false }), { mod: true, key: 'k' })).toBe(true);
  });

  it('is case-insensitive on the key', () => {
    expect(matchesCombo(event({ key: 'K', metaKey: true, ctrlKey: false, shiftKey: false }), { mod: true, key: 'k' })).toBe(true);
  });

  it('rejects when shift is required but absent, and vice versa', () => {
    expect(matchesCombo(event({ key: 'p', metaKey: true, ctrlKey: false, shiftKey: false }), { mod: true, shift: true, key: 'p' })).toBe(false);
    expect(matchesCombo(event({ key: 'k', metaKey: true, ctrlKey: false, shiftKey: true }), { mod: true, key: 'k' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run red, then implement `shortcuts.ts`.**

```ts
import { copy } from '@ayman/contracts';
import { ADMIN_NAV } from './nav-items';

export interface Combo {
  mod?: boolean;
  shift?: boolean;
  key: string;
}

export interface Shortcut {
  id: string;
  labelAr: string;
  combo: Combo;
  group: 'navigate' | 'act';
  href?: string;
  permission: string;
}

/**
 * ONE registry, read by BOTH the palette (which renders each combo in a <Kbd>)
 * and the global key handler (which fires it). Two lists would drift, and the
 * symptom — a palette advertising a shortcut that does nothing — is worse than
 * no shortcut at all.
 */
export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'nav.students', labelAr: copy.admin.nav.students, combo: { mod: true, shift: true, key: 's' }, group: 'navigate', href: '/admin/students', permission: 'student:read' },
  { id: 'nav.attempts', labelAr: copy.admin.nav.attempts, combo: { mod: true, shift: true, key: 'a' }, group: 'navigate', href: '/admin/attempts', permission: 'attempt:read' },
  { id: 'nav.appeals', labelAr: copy.admin.nav.appeals, combo: { mod: true, shift: true, key: 'g' }, group: 'navigate', href: '/admin/appeals', permission: 'appeal:read' },
  { id: 'nav.taxonomy', labelAr: copy.admin.nav.taxonomy, combo: { mod: true, shift: true, key: 't' }, group: 'navigate', href: '/admin/taxonomy', permission: 'taxonomy:read' },
  { id: 'nav.home', labelAr: copy.admin.nav.home, combo: { mod: true, shift: true, key: 'h' }, group: 'navigate', href: '/admin/home', permission: 'home:read' },
  { id: 'nav.media', labelAr: copy.admin.nav.media, combo: { mod: true, shift: true, key: 'm' }, group: 'navigate', href: '/admin/media', permission: 'media:read' },
  { id: 'nav.flags', labelAr: copy.admin.nav.flags, combo: { mod: true, shift: true, key: 'f' }, group: 'navigate', href: '/admin/flags', permission: 'flags:read' },
  { id: 'nav.audit', labelAr: copy.admin.nav.audit, combo: { mod: true, shift: true, key: 'l' }, group: 'navigate', href: '/admin/audit', permission: 'audit:read' },
  { id: 'act.newNavItem', labelAr: copy.admin.shortcuts.newNavItem, combo: { mod: true, shift: true, key: 'n' }, group: 'act', permission: 'nav:write' },
  { id: 'act.upload', labelAr: copy.admin.shortcuts.upload, combo: { mod: true, shift: true, key: 'u' }, group: 'act', permission: 'media:write' },
];

const MAC_GLYPHS: Record<string, string> = { mod: '⌘', shift: '⇧' };
const OTHER_WORDS: Record<string, string> = { mod: 'Ctrl', shift: 'Shift' };

export function formatCombo(combo: Combo, platform: 'mac' | 'other'): string[] {
  const table = platform === 'mac' ? MAC_GLYPHS : OTHER_WORDS;
  const parts: string[] = [];
  if (combo.mod) parts.push(table.mod!);
  if (combo.shift) parts.push(table.shift!);
  parts.push(combo.key.toUpperCase());
  return parts;
}

/**
 * `mod` matches metaKey OR ctrlKey — one registry serves both platforms.
 * Comparison is on `event.key` lowercased, not `event.code`: `code` reports the
 * physical key, so on an Arabic layout the user pressing the key labelled S
 * would fail a `KeyS` comparison.
 */
export function matchesCombo(event: KeyboardEvent, combo: Combo): boolean {
  const modPressed = event.metaKey || event.ctrlKey;
  if (Boolean(combo.mod) !== modPressed) return false;
  if (Boolean(combo.shift) !== event.shiftKey) return false;
  return event.key.toLowerCase() === combo.key.toLowerCase();
}

/** Palette entries a given session may actually use. */
export function visibleShortcuts(permissions: readonly string[]): Shortcut[] {
  return SHORTCUTS.filter((shortcut) => permissions.includes(shortcut.permission));
}

export { ADMIN_NAV };
```

- [ ] **Step 3: Build the palette.** `command-palette.tsx` with `cmdk@1.1.1`:

```tsx
'use client';

import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { copy } from '@ayman/contracts';
import { Kbd } from '@ayman/ui/components/kbd';
import { formatCombo, matchesCombo, visibleShortcuts, type Shortcut } from './shortcuts';

/**
 * Every entry renders its own shortcut, so the palette teaches the shortcuts
 * rather than duplicating them. `dir="rtl"` on the dialog: cmdk renders into a
 * portal, which escapes the <html dir="rtl"> inheritance.
 */
export function CommandPalette({ permissions }: { permissions: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<'mac' | 'other'>('other');
  const router = useRouter();
  const entries = visibleShortcuts(permissions);

  // Read the platform after mount only. Reading navigator during render would
  // produce a hydration mismatch — the server has no navigator and would emit
  // Ctrl for every visitor.
  useEffect(() => {
    setPlatform(/mac|iphone|ipad/i.test(navigator.userAgent) ? 'mac' : 'other');
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (matchesCombo(event, { mod: true, key: 'k' })) {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }

      for (const shortcut of entries) {
        if (matchesCombo(event, shortcut.combo)) {
          event.preventDefault();
          run(shortcut);
          return;
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [entries]);

  function run(shortcut: Shortcut) {
    setOpen(false);
    if (shortcut.href) router.push(shortcut.href);
    else window.dispatchEvent(new CustomEvent('ayman:action', { detail: shortcut.id }));
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      dir="rtl"
      label={copy.admin.shortcuts.paletteLabel}
      className="fixed start-0 end-0 top-24 z-50 mx-auto max-w-xl rounded-[var(--r-lg)] border border-line bg-surface-2"
    >
      <Command.Input
        placeholder={copy.admin.shortcuts.placeholder}
        className="w-full border-b border-line bg-transparent px-16 py-12 text-start outline-none"
      />
      <Command.List className="max-h-80 overflow-y-auto p-8">
        <Command.Empty className="p-16 text-fg-muted">{copy.common.empty}</Command.Empty>

        {(['navigate', 'act'] as const).map((group) => (
          <Command.Group key={group} heading={copy.admin.shortcuts[group]}>
            {entries
              .filter((shortcut) => shortcut.group === group)
              .map((shortcut) => (
                <Command.Item
                  key={shortcut.id}
                  value={shortcut.labelAr}
                  onSelect={() => run(shortcut)}
                  className="flex items-center justify-between gap-8 rounded-[var(--r-sm)] px-12 py-8 data-[selected=true]:bg-surface-4"
                >
                  <span>{shortcut.labelAr}</span>
                  <span className="flex gap-2">
                    {formatCombo(shortcut.combo, platform).map((part) => (
                      <Kbd key={part}>{part}</Kbd>
                    ))}
                  </span>
                </Command.Item>
              ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}
```

- [ ] **Step 4: Implement real undo.** `apps/web/lib/undoable.ts`:

```ts
import { toast } from 'sonner';
import { copy } from '@ayman/contracts';

/**
 * Undo on a reversible destructive action.
 *
 * This is NOT a client-side delay that "cancels" a pending request — that
 * pattern loses the action entirely if the tab closes during the window, and
 * it cannot undo anything once the request has actually left. Instead the
 * destructive action is a SOFT delete (`archivedAt`) that has already
 * committed, and undo is a real restore call. The toast is a shortcut to the
 * restore, not a stay of execution.
 *
 * Consequence: every "delete" in this admin is `archive`, and hard deletion is
 * not offered in the UI at all (Task 13's media library is the reference case).
 */
export async function toastUndoable({
  messageAr,
  perform,
  undo,
}: {
  messageAr: string;
  perform: () => Promise<void>;
  undo: () => Promise<void>;
}): Promise<void> {
  await perform();

  toast(messageAr, {
    duration: 8000,
    action: {
      label: copy.admin.actions.undo,
      onClick: () => {
        void undo().then(
          () => toast.success(copy.admin.actions.undone),
          () => toast.error(copy.common.error),
        );
      },
    },
  });
}
```

- [ ] **Step 5: Write the failing test** for `toastUndoable` with a mocked `sonner`: `perform` runs before the toast appears; the action label is the Arabic undo string; clicking it calls `undo`; a rejecting `undo` shows the error toast and does not throw. Run red, then green.

- [ ] **Step 6: Mount** `<CommandPalette permissions={session.permissions} />` in the admin layout and add a header button showing `⌘ K` in two `<Kbd>` chips.

- [ ] **Step 7: Add the shortcut copy** under `admin.shortcuts` (`paletteLabel`, `placeholder`, `navigate`, `act`, `newNavItem`, `upload`) and `admin.actions.undone`.

- [ ] **Step 8: Verify by hand.** `⌘K` opens and closes; typing Arabic filters; every visible entry shows its combo; `⌘⇧S` navigates to students from anywhere in the admin; the palette shows **no** entry the session lacks the permission for (check by demoting yourself to a role with a narrower set); archiving a media asset shows a toast whose undo genuinely restores it (reload to confirm it is not a client-side illusion).

- [ ] **Step 9: Commit.**

```bash
git add apps/web/components/admin/shortcuts.ts apps/web/components/admin/shortcuts.test.ts \
  apps/web/components/admin/command-palette.tsx apps/web/components/admin/use-global-shortcuts.ts \
  apps/web/lib/undoable.ts apps/web/lib/undoable.test.ts apps/web/components/admin/admin-header.tsx \
  packages/contracts/src/copy/ar.ts
git commit -m "feat(admin): cmdk palette that teaches its shortcuts, and server-backed undo"
```

---

## Task 17: Audit viewer, chain verification, and the closing pass

**Files:**
- Create: `apps/api/src/modules/admin/audit/{audit-read.service.ts,audit-read.controller.ts,audit-read.module.ts}`
- Create: `apps/web/app/(admin)/admin/audit/{page.tsx,search-params.ts,columns.tsx,audit-table.tsx,verify-banner.tsx}`
- Create: `apps/web/e2e/admin.spec.ts`
- Modify: `apps/api/src/main.ts` (BigInt serialisation)

**Interfaces:**
- Produces:
  - `GET /api/admin/audit` → `ListResponse<AuditEntry>` (`audit:read`)
  - `GET /api/admin/audit/verify` → `{ ok: true } | { ok: false; brokenAtId: string }` (`audit:read`)

- [ ] **Step 1: Fix BigInt serialisation before anything else.** `audit_log.id` is a `bigserial`, and `JSON.stringify(1n)` throws `TypeError: Do not know how to serialize a BigInt`. The failure surfaces as a 500 on the first audit list request, which looks like an authorization bug.

Map it explicitly in the read service rather than patching `BigInt.prototype.toJSON` globally — a global prototype patch silently changes every future BigInt response, including ones where a number is expected:

```ts
private toDto(row: AuditLogRow): AuditEntry {
  return {
    // Decimal string, matching AuditEntrySchema.id: z.string(). A JS number
    // would lose precision past 2^53 and there is no reason to spend that risk.
    id: row.id.toString(),
    occurredAt: row.occurredAt.toISOString(),
    // …
  };
}
```

Add a regression test asserting `typeof dto.id === 'string'`.

- [ ] **Step 2: Build the read service and controller.** Filters: `action` (multi, from `AUDIT_ACTIONS`), `resourceType`, `actorUserId`, `outcome`, and a date range. Sorting is **`occurredAt` only, descending, non-configurable** — an append-only chain has exactly one meaningful order, and offering others invites the assumption that the list is re-orderable data.

Join the actor's email for display, but keep `actorUserId` in the payload so filtering stays on the immutable key.

- [ ] **Step 3: Expose chain verification.**

```ts
@RequirePermission('audit:read')
@Get('admin/audit/verify')
verify(): Promise<{ ok: true } | { ok: false; brokenAtId: string }> {
  return this.audit.verifyChain();
}
```

> ⚠️ Route ordering: register `admin/audit/verify` **before** any `admin/audit/:id` route, or Nest matches `verify` as an id. There is no `:id` route in this plan — do not add one without moving `verify` up.

- [ ] **Step 4: Build the viewer.** A `DataTable` over `AuditEntry` with:
  - `occurredAt` in `tabular-nums`, Western digits, `Africa/Cairo`;
  - the actor as email with the user id in mono underneath;
  - `action` as a mono chip;
  - `outcome` as a `Badge` — **`success` is neutral, not green**, and `denied`/`failure` are `warn`, not `err`. Green and red belong to quiz correctness only (Global Constraint 9); an audit row is not a right answer;
  - `metadata` behind a details disclosure rendering pretty-printed JSON in a `<pre>`;
  - `hash` and `prevHash` truncated to 12 characters in mono with the full value in `title`.

- [ ] **Step 5: Build the verification banner.** A Server Component at the top of the page calling `/api/admin/audit/verify`. When `ok`, a single hairline line: "سلسلة السجل سليمة" with the row count. When broken, a `warn`-toned panel naming the first broken id. **Do not auto-verify on every page load once the table is large** — gate it behind a button after 50,000 rows and say so in the empty-state copy.

- [ ] **Step 6: Write the Playwright E2E.** `apps/web/e2e/admin.spec.ts`, covering the flow spec §8 names for the admin:

```ts
import { expect, test } from '@playwright/test';

test.describe('admin dashboard', () => {
  test('a student cannot reach the admin at all', async ({ page }) => {
    await loginAsStudent(page);
    const response = await page.goto('/admin');
    expect(response?.status()).toBe(404);
  });

  test('an admin edits branding and the public site reflects it immediately', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/settings/branding');
    await page.getByRole('combobox', { name: /اللون الأساسي/ }).selectOption('cyan');
    await page.getByRole('button', { name: /حفظ/ }).click();
    await expect(page.getByText(/تم الحفظ/)).toBeVisible();

    // updateTag, not revalidateTag: the public page must be current on the
    // very next request, with no second reload.
    await page.goto('/');
    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--a-9').trim(),
    );
    expect(accent).toContain('205'); // the cyan ramp's hue
  });

  test('a filtered student list is a shareable URL', async ({ page, context }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/students');
    await page.getByLabel(/بحث/).fill('محمد');
    await expect(page).toHaveURL(/q=/);

    const shared = await context.newPage();
    await shared.goto(page.url());
    await expect(shared.getByLabel(/بحث/)).toHaveValue('محمد');
  });

  test('every admin write lands in the audit log with an intact chain', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/audit');
    await expect(page.getByText(/سلسلة السجل سليمة/)).toBeVisible();
    await expect(page.getByText('branding:update').first()).toBeVisible();
  });
});
```

- [ ] **Step 7: Run every gate.**

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @ayman/web exec playwright test e2e/admin.spec.ts
```

- [ ] **Step 8: Run an accessibility pass** on `/admin`, `/admin/students` and `/admin/media` with axe. The three things that will actually fail: a table header button with no accessible name, the drag handle with no keyboard affordance, and the `Switch` rows in `/admin/flags` missing a label association. Fix, do not waive.

- [ ] **Step 9: Verify the complete audit coverage.** Perform one of each auditable action, then:

```bash
psql "postgresql://ayman_readonly:dev_readonly_password@localhost:5432/ayman_platform_dev" \
  -c "SELECT action, count(*) FROM app.audit_log GROUP BY action ORDER BY action;"
```
Every action in `AUDIT_ACTIONS` that this plan implements must have at least one row. Then hit `/api/admin/audit/verify` and confirm `{ ok: true }`.

- [ ] **Step 10: Commit.**

```bash
git add apps/api/src/modules/admin/audit apps/web/app/\(admin\)/admin/audit apps/web/e2e/admin.spec.ts
git commit -m "feat(admin): audit log viewer with chain verification and admin E2E coverage"
```

---

## Definition of done

- [ ] An admin can change **every** item in spec §5.4 from the dashboard: students, attempts, appeals, taxonomy (including Arabic labels), homepage blocks, navigation, branding, feature flags, and media.
- [ ] A student who visits `/admin` gets a **404**; every admin API route returns **403** for them, proven by an authorization-matrix test over route × role.
- [ ] `INSERT INTO app.site_settings (id) VALUES (2)` is rejected by Postgres, with the error string recorded in the report.
- [ ] `DELETE FROM app.audit_log` and `UPDATE app.audit_log` are both rejected for `ayman_runtime`; `INSERT` succeeds.
- [ ] `GET /api/admin/audit/verify` returns `{ ok: true }` after a full pass of admin actions, and returns the correct `brokenAtId` after a deliberate owner-level tamper.
- [ ] Every table sets `getRowId`, verified by observing that selection state on page 2 is keyed by entity id and not by `"0"`.
- [ ] A filtered student list URL, opened in a second browser, renders the same filtered result **server-side** (confirmed in view-source, not just the DOM).
- [ ] Changing a setting in the admin is visible on the public site on the **next request**, with no second reload — proving `updateTag`, not `revalidateTag`.
- [ ] The branding `<style>` output matches the strict declaration regex for all 18 accent × radius combinations, and the colour picker offers no free-text input anywhere.
- [ ] A renamed executable, an SVG, and a 9 MB file are all rejected on upload; a GIF/HTML polyglot is accepted and the **stored** bytes contain no script; an image with GPS EXIF stores with no EXIF.
- [ ] `http://localhost:3200/media/...` returns 404 while `http://localhost:3300/media/...` serves the bytes with `nosniff`, `sandbox` CSP and `Cross-Origin-Resource-Policy`.
- [ ] Dragging a nav item through three positions issues exactly **one** reorder request; a concurrent-edit reorder returns 409 and reverts.
- [ ] The command palette lists every shortcut with its keys, and lists nothing the session lacks permission for.
- [ ] Undo on an archived media asset genuinely restores it after a page reload.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` are green across all five packages, and the Playwright admin spec passes.
- [ ] `git status --short` is clean, and `apps/api/.media/` is untracked.

## Deliberately not in Plan 6

- **Course, section and lesson CRUD** — Plan 3. This plan's homepage `courseGrid` block references course ids but does not create them.
- **Quiz builder, question bank, quiz runner, grading, and every quiz/attempt/appeal endpoint** — Plan 5. Task 11 consumes its models, services and routes; it defines none of them.
- **Analytics, dashboards and item analysis** — the admin overview page is a shell with counts, not a reporting product.
- **Bulk import/export** (CSV of students, QTI question import) — the `{option, fraction}` primitive already makes QTI a serializer rather than a migration, but no importer ships here.
- **S3/R2 storage** — the `MediaStorage` interface exists precisely so this is a provider swap. Only the local-disk adapter is implemented.
- **Presigned direct-to-bucket uploads** — meaningless against local disk. When S3 lands, `ContentType` and `ContentLength` must be constrained **inside the signature**, or the presigned URL is an open unauthenticated upload endpoint.
- **Image resizing / responsive variants / blurhash** — `media_assets` reserves `width`/`height` and the research brief reserves `blurhash`; one canonical WebP is stored for now.
- **A rich-text editor** — every editable string in this plan is plain text with a length cap. When rich text arrives it needs `sanitize-html` on write with all `<iframe>` denied, DOMPurify at render, and a CSP nonce backstop (spec §7-P3).
- **Real-time collaboration or optimistic locking beyond the reorder set-check** — two admins editing the same settings section is last-write-wins, and the audit log is how you find out.
- **Redis-backed `cacheHandler`** — `'use cache'` currently stores in memory and dies with the process. It **must** be configured before a second replica exists, or two replicas serve different settings.
- **Redis-backed throttler storage** — still the in-memory store, still a Plan 1 debt, still blocking a second replica.
- **Admin email notifications and alerting** — A09:2025 is Logging *and Alerting* Failures; the chain is written but nothing pages anyone. Wire token-reuse, lockout and chain-break to a real channel before launch.
- **Quiz, attempt and appeal *endpoints*** — Plan 5 owns every one of them. Task 11 builds screens over them and defines no route, no service and no DTO in the quiz domain.

---

## Depends on

Plan 6 is build-order items 12–13. It runs **after** Plans 3, 4 and 5, so several things earlier
drafts of this document claimed to *provide* to them are in fact provided *to it*. The register in
`docs/superpowers/plans/README.md` is normative; if a name differs, reconcile **towards the earlier
plan** and update this document — do not add a shim.

**Plan 1 — Foundation**
- Workspace, Turborepo, `packages/config` ESLint preset, Prisma 7 wiring, schema `app`, the three Postgres roles
- `PrismaService`, the Zod-validated `env.ts`, the global exception filter
- `packages/ui` tokens, `cn()`, `Button`, `Card`, `CardBody`, `Badge`, `Skeleton`

**Plan 2 — Auth & onboarding**
- `AuthGuard` (`APP_GUARD`), `@Public()`, `@CurrentUser()`, `@RequirePermission()`
- `apps/api/src/auth/permissions.ts` — Task 1 **extends** `PERMISSIONS` / `ROLE_PERMISSIONS`, never replaces them
- `apps/api/src/auth/session.controller.ts`, `apps/web/proxy.ts`, the CSRF guard (`x-csrf-token` + `__Host-csrf`)
- Prisma `User` (`role`, `emailVerified`), `StudentProfile`, `Session`, `SessionDevice`
- `OnboardingSchema` — A13: `EducationSystem.slug` and `Track.slug` are immutable through Task 12 because this schema hardcodes them

**Plan 3 — Content & catalog**
- Prisma `Course` (`id String @default(uuid(7))`, `status`, `slug`, `coverKey`), `CourseSection`, `Lesson`, `LessonAttachment`, `Enrollment`, `AccessGrant`
- Permissions already in the catalogue: `course:create`, `course:update`, `course:publish`, `course:delete`, `section:write`, `section:reorder`, `lesson:write`, `lesson:reorder`, `enrollment:read`, `enrollment:create` — **not** `course:write`
- `GET /api/admin/courses?ids=` → the `courseGrid` block picker's source (Plan 3 Task 6)
- `apps/web/lib/cache-tags.ts`: `tag()`, `assertTagBudget()`, `MAX_TAG_LENGTH`, `MAX_TAGS_PER_CALL` — Task 4 **extends** this file
- `apps/web/app/(admin)/layout.tsx` + `apps/web/components/toaster.tsx` + `sonner@2.0.7` — Task 8 replaces the layout's body
- `apps/web/proxy.ts`'s `PROTECTED_PREFIXES`, already containing `/admin`
- `@ayman/ui`: `Input`, `Textarea`, `Select` (native), `Label`, `Field` family + `issuesForPath`, `Checkbox`, `RadioGroup`, `Dialog` — Task 7 adds only `Switch`, `DropdownMenu`, `Table`, `Kbd`
- `apps/web/components/admin/sortable-list.tsx` → `SortableList`, and `use-debounced-reorder.ts`
- `buildReorderSql(table, scopeColumn, scopeId, orderedIds)` with `'navigation_items'` and `'home_blocks'` in its union
- The vitest + jsdom DOM harness for `apps/web` and `packages/ui`
- Copy sub-namespaces `copy.admin.{common,nav,courses,sections,lessons,reorder}` — this plan appends the rest of `copy.admin.*`

**Plan 4 — Player & progress**
- Prisma `LessonProgress`; `MEDIA_BASE_URL` and the `MEDIA_URL_RESOLVER` port — Task 13 rebinds the port onto `MediaStorage` and asserts `NEXT_PUBLIC_MEDIA_ORIGIN` matches
- Permissions `progress:read`, `progress:write`

**Plan 5 — Quiz engine (Task 11 is hard-blocked on this)**
- Prisma `QuizAttempt`, `AttemptQuestion`, `AttemptEvent`, `GradeAppeal`, `Quiz`, `QuizSlot`, `QuestionVersion`
- `QuizAttempt` fields Task 11 reads: `id`, `userId`, `quizId`, `attemptNumber`, `state`, `score` (0..1 fraction), `startedAt`, `submittedAt`, `deadlineAt`. **`attemptToken` is a write credential and never appears in a list payload.**
- `GradeAppeal` fields: `id`, `attemptId`, `attemptQuestionId`, `questionVersionId`, `reasonAr`, `state`, `resolvedAt`, `resolutionAr`, `resolvedBy`
- Endpoints Task 11 renders over — **Plan 5 owns all of them; Plan 6 defines none**:
  `GET /api/admin/attempts` · `POST /api/admin/attempts/:id/reopen` · `POST /api/admin/attempts/:id/extra-time` ·
  `GET /api/admin/appeals` · `PATCH /api/admin/appeals/:id` · `GET /api/admin/quizzes/:quizId/analytics`
- `AttemptService.recomputeScore(attemptId: string): Promise<number>` and `AttemptService.reissueToken(attemptId: string): Promise<string>` from `apps/api/src/modules/quiz/attempt.service.ts`
- `apps/web/app/(admin)/admin/appeals/page.tsx` (Plan 5 Task 19) — Task 11 replaces its body with the DataTable version
- Permissions already in the catalogue: `question:read`, `question:write`, `quiz:read`, `quiz:write`, `quiz:attempt`, `quiz:grade`, `attempt:grade`, `appeal:create`, `analytics:read`. This plan adds `attempt:read`, `attempt:unlock`, `appeal:read`, `appeal:resolve`, `admin:access` and the platform-configuration set.
- Copy namespace `copy.quizAdmin.*` — Task 11's attempt and appeal labels read from there

**Provided by Plan 6, for Plan 7 to consume**
- `PERMISSIONS` / `Permission` / `permissionsForRole` — the completed catalogue, and `GET /api/session`
- `AuditService.record()` via the global `AuditModule`, `AUDIT_ACTIONS`, and the `app.audit_log` table with its `DELETE`/`UPDATE`/`TRUNCATE` revokes — **Plan 7 Task 10 verifies these; it does not create them**
- `tags.*` on top of Plan 3's `tag()`
- `useDataTable` / `DataTable` / `DataTableToolbar` / `DataTablePagination` / `DataTableBulkBar` / `FacetedFilter`
- `Switch` / `DropdownMenu` / `Table` / `Kbd` in `@ayman/ui`
- `MediaStorage` + `MEDIA_STORAGE`, `renderBrandingStyle` / `mediaUrl` in `@ayman/ui/branding`
- `apps/web/app/(admin)/layout.tsx` in its final shell form, and `ADMIN_NAV`
