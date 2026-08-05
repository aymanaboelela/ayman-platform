# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

منصة أيمن أبو العلا — an Arabic, RTL-native learning platform for Egyptian Bakalorya
computer-science students: catalog, course player, quiz engine, and a full admin dashboard.
The product surface is Arabic-only; the code and comments are English.

## Commands

```bash
pnpm dev                 # web :3200 + api :3300 (the web app will not render without the API —
                         # the root layout reads branding from it)
pnpm build
pnpm lint
pnpm typecheck
pnpm test                # unit suites across all packages (jest for api, vitest elsewhere)
pnpm test:integration    # api only, needs real Postgres + Redis
pnpm test:e2e            # Playwright; starts both servers itself (reuses a running `pnpm dev`)
pnpm db:migrate          # prisma migrate dev
pnpm db:seed             # 27 governorates, both systems, tracks, subjects
pnpm db:studio
```

First-time setup needs **two** env files (root for DB/Redis, `apps/api/.env` for auth + media)
and the three Postgres roles: `psql -d postgres -f scripts/db-bootstrap.sql`. See the README.

### Running one test

Three runners, split strictly by filename so they never fight over a file:

| Suffix | Runner | Where |
|---|---|---|
| `*.spec.ts` | Jest | `apps/api` (unit) |
| `*.int-spec.ts` | Jest, separate config | `apps/api` (needs Postgres + Redis) |
| `*.test.ts(x)` | Vitest | `apps/web`, `packages/*` |
| `*.e2e.ts` (+ two legacy `*.spec.ts`) | Playwright | `apps/web/e2e` |

```bash
pnpm --filter @ayman/api exec jest src/modules/quiz/attempt.service.spec.ts
pnpm --filter @ayman/api exec jest --config jest.integration.config.js src/test/db-hardening.int-spec.ts
pnpm --filter @ayman/web exec vitest run lib/format.test.ts
pnpm --filter @ayman/web exec playwright test e2e/a11y.e2e.ts --project=desktop
```

Both Jest configs are `maxWorkers: 1` deliberately — the specs share one database, and 8 of them
were observed to fail under parallel workers and pass serially. Do not raise it.

Note that `pnpm test` is not dependency-free despite the name: ~28 of the API's unit specs open a
real `prisma.$connect()`, so they need Postgres up. CI provisions one for that job.

## Architecture

```
apps/web            Next.js 16 · App Router · Tailwind 4 · RTL
apps/api            NestJS 11 · Prisma 7 · the only writer to Postgres
packages/contracts  Zod 4 schemas shared by both sides + the entire Arabic string table
packages/ui         design tokens + primitives
packages/config     eslint / tsconfig presets, including two custom rules
```

`apps/web/app` is four route groups: `(site)` marketing, `(app)` student, `(auth)`, `(admin)`.
`app/dev/*` is an internal design-system playground, exempt from several repo-wide rules.

### Invariants — break these and something fails silently

**Single origin.** The browser only ever sees `/` and `/api/*` on one host; `next.config.ts`
rewrites `/api/:path*` to the API. This is what makes `__Host-` cookies, `SameSite=Strict`, and
**zero CORS anywhere** simultaneously possible. Client code must never call the API host directly.
Server-side code (`proxy.ts`, `lib/api-server.ts`) does use `API_ORIGIN` directly — that's fine,
the constraint is about the browser. Splitting the domain is an architecture change, not a config
change.

**Least-privilege database.** `DATABASE_URL` is `ayman_runtime` (DML only, no DDL) and is what the
running app uses; `DIRECT_DATABASE_URL` is `ayman_owner` and is used only by Prisma migrate via
`prisma.config.ts`. Prisma 7 dropped `url`/`directUrl` from the datasource block — connection
strings live in `prisma.config.ts` (CLI) and the adapter in `prisma.service.ts` (runtime).
`$queryRawUnsafe`/`$executeRawUnsafe` are banned by ESLint.

**Authorization is permission-based, never role equality.** `apps/api/src/auth/permissions.ts` is
the only place a role name is looked up; everything else asks `roleHasPermission`. Every new route
gets `@Public()` or `@RequirePermission()` — `src/test/authorization-matrix.int-spec.ts` enumerates
the routes Nest actually registered and fails on any route nobody wrote an expectation for.

**RTL-native, not mirrored.** `ayman/no-physical-direction` rejects `ml-*`, `left-*`, `text-left`
and friends, including inside `cn()`, `clsx()`, and ternaries. Use logical properties (`ms-`, `ps-`,
`start-`, `text-start`).

**No user-facing literal in any component.** All Arabic copy lives in
`packages/contracts/src/copy/ar.ts`. This is what keeps adding English a routing change rather than
a rewrite. E2E tests select by `copy.*` keys for the same reason.

**Motion is composited and short.** `ayman/no-layout-animation` bans animating layout/paint
properties (`width`, `top`, `filter`, …), bans bare `motion.*` imports (use `<LazyMotion strict>`),
and caps durations at 400ms. Every continuous animation must stop under `prefers-reduced-motion`;
pointer-driven effects are disabled on touch.

**Media is served from a different origin than the app.** The API refuses to boot if
`MEDIA_BASE_URL` and `APP_URL` share an origin, and `GET /media/:prefix/:name` is explicitly
excluded from the `/api` global prefix so the web rewrite cannot pull attacker-uploaded bytes back
onto the app origin. Upload pipeline: extension allowlist → magic-byte sniff → `sharp` re-encode →
UUID key.

**Cache tags come from one builder.** `apps/web/lib/cache-tags.ts` — a tag written as a literal in
two files will diverge, and a mismatched tag fails silently (page serves stale forever). Next
silently skips tags over 256 chars and accepts at most 128 per call; `tag()` throws instead.

**Marketing images go through `<MediaSlot>`** and are registered in `apps/web/lib/brand-assets.ts`.
Unregistered kinds render a designed fallback at the exact final dimensions, so dropping real photos
in later touches one file.

**Agent-discovery paths come from one builder.** `apps/web/lib/agents/discovery.ts` — the same
argument as cache tags, and the same silent failure: a `Link` header, `/.well-known/api-catalog`,
`/llms.txt` and `robots.txt` that disagree about a path produce no error anywhere, just an agent
that follows a relation to a 404 and concludes the capability does not exist. `/openapi.json` is
GENERATED from the Zod contracts (`z.toJSONSchema`), never hand-written, so a field that leaves the
public contract leaves the published description in the same commit. See
`docs/runbooks/agent-discovery.md`.

### Things that surprise people

- `proxy.ts`, not `middleware.ts` — Next 16 renamed it and `middleware.ts` now throws at build.
  It owns the auth redirect matrix, the security headers + Report-Only CSP (split nonce vs.
  static-preserving), and minting the `__Host-csrf` cookie.
- `lib/api.ts` must never import `next/headers`, even transitively — it's reachable from Client
  Components. Cookie-forwarding helpers live in `lib/api-server.ts` instead.
- `cacheComponents: true` is on: dynamic by default, `'use cache'` opt-in. `'use cache'` entries go
  to Redis via `apps/web/cache-handler/redis.js` (the built-in handler is an in-process LRU that
  empties on every deploy).
- Turbo runs in strict env mode. A test that needs an environment variable must have it listed under
  the `test` task in `turbo.json` or it will be `undefined` in CI, with a confusing pg error.
- `pnpm-workspace.yaml` has `verifyDepsBeforeRun: false`, so run `pnpm install` explicitly after
  changing dependencies. Postinstall scripts are opt-in per package in `allowBuilds` — never leave a
  placeholder there, an unresolved entry blocks every pnpm command repo-wide.
- The `sharp: 0.35.3` override exists because Next 16.2.11's optional `sharp: ^0.34.5` pulled in a
  second copy with live libvips CVEs. Re-check it on every Next upgrade and delete it once Next
  moves to `^0.35`.
- Vendored React Bits components live in `apps/web/components/site/vendor/` with a README recording
  every local modification — read it before updating them.
- `apps/web/e2e/a11y.e2e.ts` runs axe over a **hand-maintained** list of public routes. A new public
  route not added there is exactly the one that will regress unnoticed. Same for
  `lib/loading-coverage.test.ts`, which requires a `loading.tsx` beside every product `page.tsx`.

## Deployment

Production (`aymanaboelela.com`) is Dokploy + Docker Compose on a VPS, built inside containers from
`apps/{web,api}/Dockerfile` against Next's `output: 'standalone'`. Merging to `main` deploys
automatically, but only after `gitleaks`, `quality`, `unit`, `integration`, and `e2e` all pass — the
deploy job POSTs to a Dokploy webhook rather than GitHub calling Dokploy directly, precisely so a
red build cannot ship. `deploy/deploy.sh` and the systemd units beside it are **historical and
actively wrong** for the current config (`next start` does not work with `output: 'standalone'`);
`docs/runbooks/deploy.md` is the real procedure.

`.githooks/pre-commit` runs `gitleaks protect --staged`. CI re-scans full history, which is the half
`--no-verify` cannot skip.

## Docs

`docs/superpowers/plans/README.md` is the **ownership register** — where a plan document and that
file disagree about who owns a model, route, component, or copy key, that file wins. Specs are in
`docs/superpowers/specs/`, operational procedures in `docs/runbooks/`.
