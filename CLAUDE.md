# CLAUDE.md

Read this file first. `README.md` tells you how to run the project; this file
tells you **what breaks if you don't know it**. The full agent guide is
[`AGENTS.md`](AGENTS.md) plus [`docs/agents/`](docs/agents/).

**Language:** the owner writes prompts in Arabic. **Reply, write docs, comments,
commit messages and PRs in English.** Only user-facing product copy stays in
Egyptian Arabic (see §7).

Section numbers are stable: code comments cite them (`CLAUDE.md §2`, `§7`, …).
Don't renumber.

---

## 1. This platform is live, with real money

The platform of Eng. Ayman Abo El Ela: programming and computer science for the
Egyptian Baccalaureate. Students pay for subscriptions and order books, and the
live site is [aymanaboelela.com](https://aymanaboelela.com).

**That means:**

- Do nothing against production unless explicitly asked in words.
- Any change to `docker-compose.yml` or `apps/api/docker-entrypoint.sh` executes
  against the real database on the next deploy. Check with
  `git diff origin/main...HEAD --name-only` that neither file is in your change,
  and if one is, say so explicitly.
- "Working" doesn't mean "correct". Future reviews should not assume that what
  works is right.

---

## 2. Multi-tenant: another teacher on the same code

The shape: **one full stack per teacher**. Its own Dokploy app, Postgres,
Redis, volumes, domain, WhatsApp number. One codebase, one repo, one branch.

**There is no `tenantId` column in any table, and there never will be.** The
isolation is that no connection string reaches from one stack to another. Not
"hard", **impossible**.

### The one key

```
TENANT_KEY unset or = ayman   →  Ayman's stack, everything exactly as it was
TENANT_KEY = anything else    →  inherits nothing at all
```

The gates:

| | |
|---|---|
| `apps/web/lib/tenant.ts` | `TENANT_KEY` · `IS_AYMAN` · `tenantName(fallback)` · `aymanOnly(v)` |
| `apps/api/src/common/tenant.ts` | the same three, for the server |

`tenantName(fallback)` returns the fallback on his stack, and
`TENANT_DISPLAY_NAME` (or «المنصة») on any other stack.

### ⚠️ Three rules that were broken before

**1. A literal fallback is not a gate.** `tenantName('أيمن أبو العلا')` still
ships his name in the code, and the spec catches it. Read the fallback from the
copy table: `tenantName(copy.site.name)`.

**2. A code gate can't catch a database row.** The `seed` runs on every boot,
and it used to write his contact details into `site_settings.contact` and then
his name into `site_settings.seo`. The stored value **wins** over any code
gate. Anything written to a table on a new stack must go through
`SEEDS_OFFICIAL_SEO` / `TENANT_CONTACT_SEED` in
`apps/api/src/scripts/seed-data/tenant-contact.ts`.

**3. Closing one leak opens another.** When `getBrandAsset` blocked his photos,
what appeared in their place was the fallback, and it printed his name. When
the chat byline was gated, the panel heading above it stayed «محادثتك مع مهندس
أيمن» ("your chat with Eng. Ayman"), so the screen contradicted itself.
**After any gate, open the screen around it.**

### The guard

`packages/contracts/src/tenant-identity-leak.spec.ts` walks the whole repo, all
extensions (`.ts .tsx .mjs .js .css .html .json`), and catches the name in every
spelling («أيمن», «ايمن» without hamza, «Ayman») plus image paths and accounts.

It has an allowlist, and every entry in it is **a promise that a gate exists**.
One entry was a lie: `copy/outreach.ts` was listed as gated and wasn't, so one
in every eight messages told the student «أنا مهندس أيمن» ("I'm Eng. Ayman").
**If you add an entry, open the file and see the gate with your own eyes.**

### The landing page: a preset, not a colour

`landingPreset` in `packages/contracts/src/admin/settings.ts`:

- **`classic`**: the default. Ayman's page, on the exact same code path.
  **There is no `=== 'classic'` branch in `page.tsx` at all.** It is reached by
  fall-through, so not a single byte changes for him.
- **`neon`**: "the terminal". A page that never opens up, sections labelled like
  code comments, cards as code windows, monospace numbers.
- **`board`**: "the board". Solid blocks, everything centred, big year tiles.
- **`studio`**: the newest preset.

The non-classic presets are components in `apps/web/components/site/presets/`,
styled in `apps/web/app/(site)/styles/presets.css` scoped under `[data-preset]`,
and loaded with `await import()` so their modules are never evaluated while his
page renders.

`landingLayout` (`classic|editorial|compact`) still exists and works **inside**
`classic`. It is a CSS override, not a different page.

---

> Adding a teacher from the dashboard, subjects and a teacher's landing look:
> see [`docs/teachers-platform.md`](docs/teachers-platform.md).

## 3. One bug fix reaches everyone

This is why this shape was chosen. One codebase, one image recipe:

```
fix a bug  →  PR to main  →  CI  →  merge
                                      ↓
                    every stack rebuilds from the same commit
```

**What you need to know:**

- **A fix arrives when the stack deploys, not when you merge.** Each Dokploy app
  builds its own copy. If autoDeploy is off on one of them, it stays on the old
  code without anyone noticing.
- **`TENANT_DISPLAY_NAME` and `TENANT_KEY` are set at build time**
  (`next.config.ts` → `env`), so changing them needs a **rebuild**, not a
  restart.
- **Migrations run on each database separately** at boot. A failing migration
  means one broken stack, not all of them. That is intended.

### ⚠️ Ask "for whom?" before writing a line

The code is shared, so any change **reaches all three stacks** as soon as it
ships. That isn't always the intent.

**Before starting any bug fix or new feature, ask the platform owner:**

> Is this for Ayman only, or for all teachers?

The answer changes the work itself, not just the intent:

| Answer | Correct shape |
|---|---|
| **For everyone** | Plain code with no gate. This is the default |
| **Ayman only** | `aymanOnly()` or a feature flag off by default (`apps/web/lib/tenant.ts` · `apps/api/src/common/tenant.ts`) |
| **A specific teacher** | Feature flag in `packages/contracts/src/admin/flags.ts` + a per-stack setting |

**Why it matters:** something built for Ayman that ships to all three ungated =
a teacher sees a feature that isn't theirs, or pays its cost (like uploading
video to R2). Something built for everyone and gated to Ayman by mistake = a
teacher pays a subscription and doesn't get what they paid for.

**If the answer isn't clear, ask.** A guess here costs another release across
three stacks.

---

## 4. Local development: the things that waste time

### The local database is not clean

It is a real cohort (thousands of students), plus years of accumulated test
data:

- **14 million notification rows**, 4.6 GB. Any `count`/`findMany` without
  `userId` becomes a 13.8-second sequential scan, and Jest's ceiling is 5
  seconds. **`VACUUM (ANALYZE)` brings it from 2091 ms to 2.09 ms.** If tests
  fail with timeouts, try that before anything else.
- **2,656 users with the admin role.** A notification goes to every admin, so
  that's 2,656 rows per event.
- **The `audit_log` hash chain is broken beyond repair.**
  `UPDATE app.audit_log SET outcome = 'tampered'` (in the test that is supposed
  to be **rejected**) actually ran back when the role still had UPDATE, and it
  hit **135,603 rows**. The values are gone. That is why
  `verifyChain({ fromId })` exists: the test verifies the rows it wrote, not
  the whole table.

### The full suite fails, a single suite passes

`maxWorkers: 1` is set, so it isn't contention. It's **ordering**: one suite
leaves rows behind and the next one trips over them. `book-orders` and
`payments` pass 277/277 alone and fail in the full run.

**Before blaming your change:** run the failing suite alone. If it passes, it
isn't you.

**The `pre-push` hook fails on this** and can't tell the difference. The PR is
the real gate: CI runs on an empty database.

### Quick reference

```bash
# tests: run the whole workspace, not per-app
pnpm test

# type check after any pull from main — the Prisma client goes stale
pnpm --filter @ayman/api exec prisma generate
```

**Don't run `prettier`.** There is no prettier config in the repo, so it flips
the quotes in files you didn't touch.

---

## 5. Deploying

Steps: [`docs/runbooks/new-tenant.md`](docs/runbooks/new-tenant.md).
Template: [`deploy/tenant.env.example`](deploy/tenant.env.example).
Check: `node scripts/check-tenant-env.mjs <file>`.

**Every teacher needs two different domains**: `APP_URL` and `MEDIA_ORIGIN`.
The API refuses to start if both share an origin, **and an API container that
isn't up means Traefik answers 404 for the whole domain**, not just the API.

The site and the API must be on **the same origin** (`x.com` and `x.com/api/*`).
Cookies use the `__Host-` prefix and there is no CORS configured anywhere, on
purpose.

⚠️ **The check is not a full copy of the runtime contract.** Someone once filled
the template exactly per the runbook, the check said "OK — safe to deploy", and
the API refused to start. If you add a required variable in
`apps/api/src/config/env.ts`, add it to the template **and to the check**.

### ⚠️ Isolation is only logical: the physical server is shared

§2 says "no connection between stacks, impossible". That's true at the database
and code level. **It is not true at the CPU level**: the three stacks
(Ayman/Sabry/Adel) run on the same single physical VPS (4 cores), so one stack
taking all the CPU = all three go down together, even though no line of code
connects them.

**It actually happened (2026-10-04)**: the server was down for hours, load
average hit 66 on 4 cores, and Hostinger capped the CPU automatically (and
blocked manual unlocking for 7 days after the first use). The two real causes:

1. **256 zombie processes.** The healthcheck exec (`node -e fetch(...)`) runs
   every few seconds inside every container, and ffmpeg is spawned from inside
   `api`. Without a real init process (a PID 1 that calls `wait()`), those child
   processes stay zombies. The fix: `init: true` on `api`/`web`/`wa` in
   `docker-compose.yml`.
2. **ffmpeg ran with `-threads 0`** (every core) to convert one video. Measured
   directly: 130–170% CPU from a single encode. The fix: `threads: 2` in
   `upload-pipeline.ts` (half the cores of the reference server).

**The right diagnosis during a collapse.** `docker ps` alone isn't enough; you
need to know who is eating the CPU and which container it belongs to:

```bash
uptime                                  # load average — far above the core count means this
ps aux --sort=-%cpu | head -15          # who is actually eating the CPU
cat /proc/<PID>/cgroup | head -1        # gives you the container (docker-<id>.scope)
docker ps -a --format "table {{.Names}}\t{{.Status}}"  # match the id to the name
```

A container that stays "unhealthy" doesn't mean it will recover by itself.
`docker restart` can refuse ("did not receive an exit event") if the process
inside is truly stuck. Then use `docker kill -s SIGKILL <name>` followed by
`docker start <name>`. If things get really bad and many containers are down
together, **a full `reboot` of the server is faster and safer** than chasing
each container. We tried it and it worked.

See: [`docs/agents/operations.md`](docs/agents/operations.md) §1.

---

## 6. Things you'll run into that will waste your day

| Symptom | Cause |
|---|---|
| The whole site is 404 | The API container isn't up. The Logs tab opens on the container that never started |
| **All three sites down together** | The physical server itself is choking. Use `ps aux --sort=-%cpu`, not just `docker ps`. See §5 |
| A page loads strangely/stale locally | An old service worker on the same port. Clear it from DevTools |
| Tests fail with timeouts | The database is bloated. Run `VACUUM (ANALYZE)` |
| Type errors in files you didn't touch | Stale Prisma client. Run `prisma generate` |
| `pnpm install` in a worktree takes 30 minutes | `cp -Rc` the `node_modules` (free on APFS) and fix the `@ayman/*` links by hand |
| The landing page is empty after a migration | The fallback is keyed on an **empty** table, so one row turns it off |
| «اتبعت» ("sent") in a WhatsApp campaign | Doesn't mean "delivered". Look for `nack` |

---

## 7. Writing

- **Comments explain "why"**, not "what". The repo's comments are dense and
  specific, so match their density and voice. New comments, docs, commit
  messages and PR descriptions are in **English**.
- **All product copy is Egyptian Arabic**, written for secondary-school
  students and their parents. It lives in `packages/contracts/src/copy/`, never
  inline in components.
- **Never address the student in the masculine.** The platform never asks boy
  or girl, so the copy doesn't assume. (The word list is in
  `packages/contracts/src/outreach/compose.spec.ts`.)
- Single quotes in TS/TSX. Plain CSS, no SASS. No `!important`.
- RTL: `inset-inline-*`, not `left/right`. Any Latin or monospace text inside
  Arabic needs `direction: ltr; unicode-bidi: isolate` or it flips.
- Colours only from the token layer. `lib/css-token-coverage.test.ts` fails the
  build on any undefined variable.
