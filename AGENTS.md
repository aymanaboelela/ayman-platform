# AGENTS.md

Instructions for coding agents working in this repository (Codex, Claude Code, or
any other). Read this file first. It is the entry point; the detail lives in
[`docs/agents/`](docs/agents/):

| File | Read it when |
|---|---|
| [`docs/agents/architecture.md`](docs/agents/architecture.md) | You need to find where something lives: API modules, web routes, contracts, data model |
| [`docs/agents/operations.md`](docs/agents/operations.md) | CI, deploy, Docker, multi-tenant stacks, production diagnosis |
| [`docs/agents/pitfalls.md`](docs/agents/pitfalls.md) | **Before writing code.** Hard-won lessons: traps that pass every test and still break production |
| [`docs/agents/recipes.md`](docs/agents/recipes.md) | Publishing lectures, quizzes, exams, news through the live API |

[`CLAUDE.md`](CLAUDE.md) holds the same core rules in Egyptian Arabic. Where the
two disagree, CLAUDE.md wins and this file should be fixed.

> ⚠️ `apps/web/app/AGENTS.md/route.ts` is **not** this file. That is a route that
> serves `/AGENTS.md` on the live website, describing the *product* to AI agents
> acting for students. Never make either one serve the other's purpose.

---

## 1. What this is

The learning platform of Eng. Ayman Abo El Ela (م. أيمن أبو العلا): programming and
computer science for the **Egyptian Baccalaureate** (البكالوريا المصرية) and
Thanaweya Amma. Arabic, RTL-first. Live at **aymanaboelela.com**, with paying
students who buy subscriptions and order paper books.

The same codebase also runs **separate stacks for other teachers** (currently
three stacks total: Ayman, Mohamed Sabry, Mohamed Adel). See §4.

**Consequences:**

- Do nothing against production unless explicitly asked in words.
- "It works" is not "it's correct". Do not assume existing behaviour is right.
- Any change to `docker-compose.yml` or `apps/api/docker-entrypoint.sh` executes
  against real databases on the next deploy. Check with
  `git diff origin/main...HEAD --name-only` and call it out if either file is in
  your change.

---

## 2. Stack at a glance

```
apps/web            Next.js 16 (App Router, cacheComponents) · React 19 · Tailwind 4 · port 3200
apps/api            NestJS 11 · Prisma 7 (Postgres 16, schema "app") · Redis 7 · port 3300
packages/contracts  Zod 4 schemas shared by web + api, AND all Arabic UI copy
packages/ui         design tokens (CSS custom properties) + Radix-based components
packages/config     tsconfig/eslint presets + custom eslint rules (RTL, motion)
services/wa         WhatsApp sender sidecar (Baileys), outside the pnpm workspace
apps/mobile         Flutter app — ONLY on branch feat/mobile-app, not on main
```

- Node ≥ 24, pnpm 11 (`packageManager: pnpm@11.17.0`), turbo.
- **Single origin**: site on `/`, API on `/api/*` (Next rewrites `/api/*` to Nest).
  `__Host-` cookies, `SameSite=Strict`, **no CORS anywhere, on purpose**.
- Only the API writes to Postgres. Web reads/writes through the API.
- DB roles: `ayman_owner` (migrations/DDL), `ayman_runtime` (DML only, used at
  runtime), `ayman_readonly`.
- Media is served from a **different origin** (`MEDIA_BASE_URL` ≠ `APP_URL`, the
  API refuses to boot otherwise).

---

## 3. Commands

```bash
pnpm install
psql -d postgres -f scripts/db-bootstrap.sql          # once: roles + schema (dev passwords only)
cp .env.example .env && cp apps/api/.env.example apps/api/.env
pnpm --filter @ayman/api exec prisma migrate deploy
pnpm --filter @ayman/api exec prisma generate
pnpm db:seed
pnpm dev                                               # web 3200 + api 3300 (web needs the api up)

pnpm lint
pnpm typecheck
pnpm test               # turbo: ALL packages incl. contracts/ui/config suites. Run this, not per-app.
pnpm test:integration   # api *.int-spec.ts — real Postgres + Redis (authz matrix lives here)
pnpm test:e2e           # Playwright, production build, ports 3200/3300 must be free
node scripts/check-tenant-env.mjs <env-file>           # preflight for a tenant stack
```

- **Never run `prettier`.** There is no prettier config; it rewrites quotes in
  files you didn't touch. Formatting is eslint's job.
- After pulling `main`, run `prisma generate`. Type errors in files you didn't
  touch (especially naming a Prisma enum value) mean a stale Prisma client.
- `pnpm install` has `verifyDepsBeforeRun: false`; run install explicitly.

---

## 4. Multi-tenant — one codebase, one full stack per teacher

Each teacher gets their own Dokploy app, Postgres, Redis, volumes, domain,
WhatsApp number. Same repo, same branch, same image recipe.

**There is no `tenantId` column in any table, and there will not be one.**
Isolation = no connection string reaches across stacks.

### The one switch

```
TENANT_KEY unset or = "ayman"   →  Ayman's stack, everything exactly as before
TENANT_KEY = anything else      →  inherits NOTHING of Ayman's identity
```

Gates (same API in both): `apps/web/lib/tenant.ts`, `apps/api/src/common/tenant.ts`
→ `TENANT_KEY`, `IS_AYMAN`, `tenantName(fallback)`, `aymanOnly(v)`.

`TENANT_KEY` and `TENANT_DISPLAY_NAME` are inlined at **build time**
(`next.config.ts` → `env`). Changing them needs a **rebuild**, not a restart.

### Three rules that have each been broken before

1. **A literal fallback is not a gate.** `tenantName('أيمن أبو العلا')` still ships
   his name. Read the fallback from the copy table: `tenantName(copy.site.name)`.
2. **A code gate cannot catch a DB row.** The seed runs on **every boot** and the
   stored value beats any code gate. Anything written to a table on a new stack must
   go through `SEEDS_OFFICIAL_SEO` / `TENANT_CONTACT_SEED` in
   `apps/api/src/scripts/seed-data/tenant-contact.ts`.
3. **Closing one leak opens another.** When an image is gated, the fallback that
   replaces it may print his name; when a byline is gated, the heading above it may
   still say «محادثتك مع مهندس أيمن». **After adding any gate, open the screen around it.**

### The guard

`packages/contracts/src/tenant-identity-leak.spec.ts` scans the repo
(`.ts .tsx .mjs .js .css .html .json`) for his name in every spelling (أيمن،
ايمن، Ayman…), his domain, phone, handles and photo filenames. Its allowlists
(`ALLOWED_FILES`, `GATED_AT_POINT_OF_USE`) are **promises that a gate exists**.
One entry was a lie once and every outreach message told students «أنا مهندس أيمن».
If you add an entry, open the file and see the gate with your own eyes.

### Ask "for whom?" before writing a line

Every merge reaches **all three stacks**. Before a bug fix or feature, ask the owner:

> ده لأيمن لوحده، ولا لكل المدرّسين؟ (For Ayman only, or for all teachers?)

| Answer | Correct shape |
|---|---|
| For everyone | Plain code, no gate (the default) |
| Ayman only | `aymanOnly()` or a feature flag defaulting off |
| A specific teacher | Feature flag in `packages/contracts/src/admin/flags.ts` + per-stack setting, or a signed entitlement (`TENANT_ENTITLEMENTS`) |

Shipping an Ayman-only feature ungated = a teacher sees (or pays for, e.g. R2 video
storage) something not theirs. Gating an all-teachers feature to Ayman = a teacher
pays and doesn't get it. **If the answer is unclear, ask.**

### Landing page = preset, not a colour

`branding.landingPreset` in `packages/contracts/src/admin/settings.ts`:
`classic` (default, Ayman's page; **no `=== 'classic'` branch exists in
`(site)/page.tsx`** — it is reached by fall-through so his page never changes by a
byte), `neon`, `board`, `studio`. Non-classic presets are components in
`apps/web/components/site/presets/`, styled in
`apps/web/app/(site)/styles/presets.css` under `[data-preset]`, loaded with
`await import()`. `landingLayout` (`classic|editorial|compact`) is a CSS override
that only applies inside `classic`.

---

## 5. How a fix reaches students

```
fix → PR to main → CI (gitleaks, lint+typecheck, unit, integration, playwright ×4 shards)
    → merge (rebase only) → CI on main → deploy job → each Dokploy stack rebuilds from main HEAD
```

- A fix reaches a stack when **that stack rebuilds**, not when you merge.
- Migrations run per database at container boot. A failing migration breaks one
  stack, not all — by design.
- A green "deploy to production" job proves nothing; a red one doesn't prove
  production is stale. Verify via `/api/health` → `startedAt` and a route/string
  your change introduced. Details in [`operations.md`](docs/agents/operations.md).
- `main` is protected: PR + 5 green required checks, rebase merges only.

---

## 6. Writing code here

**General**
- Comments explain **why**, not what. The repo is heavily commented, specific,
  and often cites the incident that caused the code. Match that density and voice.
- Single quotes in TS/TSX. Plain CSS (no SASS). **No `!important`.**
- Before building a "missing" feature, grep for it: the column, DTO, service and
  readers usually already exist and only the admin control is missing. Check
  `origin/main` (not just your checkout), the dev DB (`\dt app.*`), and
  `docs/superpowers/specs/` + `docs/superpowers/plans/README.md`.

**Copy (all user-facing text)**
- All Arabic copy lives in `packages/contracts/src/copy/` (`ar.ts` student,
  `admin.ts` admin, plus `outreach.ts`, `homework.ts`, `arena.ts`, `mistakes.ts`).
  No Arabic literals inside components.
- Egyptian Arabic, written for secondary-school students and their parents.
- **Never address the student in the masculine.** The platform never asks gender.
  Use first person, inclusive plural, nominal sentences, masdar buttons (حفظ not
  احفظ). Tripwire list: `packages/contracts/src/outreach/compose.spec.ts`.
- Landing copy lives in the **DB** (`app.home_blocks`); editing `ar.ts` only
  changes the seed for fresh databases.
- New copy blocks / helpers go in a **new module**, not as new exports on an
  existing client module (Turbopack module ids outlive deploys; see pitfalls).

**RTL and styling**
- Logical properties only: `ms-/me-/ps-/pe-/start-/end-`, `inset-inline-*`. The
  eslint rule `ayman/no-physical-direction` rejects `ml-`, `left-`, `text-left`…
- Latin or monospace text inside Arabic needs `direction: ltr; unicode-bidi: isolate`.
- Colours only from the token layer (`packages/ui/src/tokens/`).
  `apps/web/lib/css-token-coverage.test.ts` fails the build on an undefined variable.
- `ayman/no-layout-animation`: no animating layout properties, use `m.*` (LazyMotion)
  not `motion.*`, durations ≤ 400 ms. Respect `prefers-reduced-motion`.
- Never name a hand-written class after a Tailwind utility (`ring`, `grid`,
  `table`, `container`, `border`, `truncate`…).

**API**
- Runtime imports from `@ayman/contracts` in the API **must use subpaths**
  (`@ayman/contracts/quiz/mastery`). The root barrel is `import type` only — Node
  can't resolve its extensionless re-exports, so the server won't boot while tsc
  and jest are green. Guard: `apps/api/test/contracts-barrel.check.ts`.
- Every new route needs an authorization row in
  `apps/api/src/test/authorization-matrix.int-spec.ts` (only runs in
  `pnpm test:integration`).
- Validate bodies with `nestjs-zod` DTOs + `ZodValidationPipe` per handler;
  `src/test/body-dto-validation.spec.ts` enforces it.
- Partial PATCH: use `partialWithoutDefaults` from `@ayman/contracts/partial`, never
  `.partial()` (it keeps `.default()` and silently resets fields).
- User ids are better-auth **nanoids**, not UUIDs. Never `z.uuid()` on a user id.
- `audit_log` is INSERT-only, written only via `AuditService`. Never delete audit rows.
- Order by timestamp **plus** `id` tiebreak.
- Raw SQL: `$queryRawUnsafe`/`$executeRawUnsafe` are banned by eslint.

**Web**
- `cacheComponents: true`: everything is dynamic unless `'use cache'`. Reference
  data on hot pages must be cached (bare `apiGet` trips the API rate limiter → 500).
- No Server Actions for uploads (1 MB cap, fails silently). Use `lib/upload-client.ts`.
- Any module with privileged/heavy deps: `import 'server-only'`.
- A browser-side write rendered by another route needs `router.refresh()`.
- Run a real `next build` before calling root-layout/provider changes done.

---

## 7. Testing — what lies to you locally

- The local dev DB is shared, bloated and not clean (huge notifications table,
  thousands of fixture admins, a permanently broken audit hash chain). Two audit
  specs are red locally and green on CI.
- Full suite fails, single suite passes = ordering/contention, not you. **Run the
  failing spec file alone before blaming your change.** If tests time out, try
  `VACUUM (ANALYZE)`.
- The `pre-push` hook can't tell the difference. **The PR's CI (empty DB) is the
  real gate.**
- Specs stub services with `as never`, which hides method renames from tsc. After
  renaming a service method, grep `apps/api/src` for the old name.
- Assert the effect, not the mechanism — several guards were inert while their
  tests stayed green.

---

## 8. Git and workflow

- Commit identity: `Ayman Abo El Ela <142680481+aymanaboelela@users.noreply.github.com>`
  (the repo owner's global git config). Never commit under any other identity and
  never pass `-c user.name/-c user.email`.
- Commit messages and PR titles in this repo are written in Arabic (see `git log`).
- Branch from `origin/main`, ideally in a fresh worktree. Several agent sessions
  often share one checkout: never `git add -A` / `git stash` there; stage explicit
  paths and verify your change is in `HEAD` after committing.
- `pre-commit` runs gitleaks (must be installed). `pre-push` runs lint, typecheck,
  test. Don't `--no-verify` a push you intend to merge.
- Gitleaks in CI scans **all branches' history**; never commit anything
  secret-shaped. The repo is **public**.
- To update a conflicted PR, `git merge origin/main` + normal push (no force-push
  without asking).

---

## 9. Talking to the owner

- The owner reads Egyptian Arabic. Reply in short, direct Arabic, no preamble,
  no recap. Keep English to code and file paths.
- Report results and what broke. Ask only when genuinely blocked, or for the
  "for whom?" question in §4.
- He judges UI as a parent would: colour, imagery, a button on every row, the
  student's own face/name on their home screen. Restrained neutral design reads
  as "unfinished" to him. Performance and polish are non-negotiable.
