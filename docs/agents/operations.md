# Operations: CI, deploy, stacks, production diagnosis

The repo is public. Nothing here names a credential, an IP address or a panel
id, and nothing you add should either.

---

## 1. Topology

- **One VPS (4 cores)** runs every stack under **Dokploy**, behind Traefik and Cloudflare.
  Three stacks run today: aymanaboelela.com, engmohamedsabry.com and mr-mohammedadel.com.
- Each stack is one compose project built from `docker-compose.yml`:
  - `postgres:16-alpine` (volume `pgdata`, no published port).
  - `redis:7-alpine` (no persistence, `maxmemory` + `volatile-lru`, every key has a TTL).
  - `api` (3300, media volume, ffmpeg inside).
  - `web` (3200, Next standalone).
  - `wa` (3400, WhatsApp sidecar, default network only).
  - `api`, `web` and `wa` all have `init: true`.
- **Isolation is logical, not physical.** No connection string crosses stacks, but they
  share one CPU. If one stack eats the CPU, all three go down.
- Dokploy owns Traefik routing. Do not hand-write Traefik labels in compose. Containers
  join the external `dokploy-network`, and the api has the alias `${TENANT_KEY}-api`.
- The origin firewall only admits Cloudflare ranges, so **every tenant domain must be
  proxied (orange cloud)**. `CF-Connecting-IP` is trustworthy only because of that firewall.
- Each tenant's `video.<domain>` host needs a Cloudflare **Cache Rule**: eligible for
  cache, edge TTL 1 month, ignore origin cache-control. Cloudflare treats `.ts`/`.m3u8`
  as dynamic otherwise. Nothing in the repo creates this rule.
- The maintenance page lives outside Dokploy (`deploy/maintenance/` plus a Traefik
  dynamic file, installed with `install.sh`). Add every new tenant domain to its Host rule.
- `deploy/deploy.sh`, `deploy/*.service` and `deploy/Caddyfile` are **dead**, left over
  from the pre-Docker systemd setup. Do not follow them.

### The 2026-10-04 outage (why `init: true` and ffmpeg `threads: 2` exist)

Load hit 66 on 4 cores and Hostinger capped the CPU. There were two causes:

1. **256 zombie processes.** Healthcheck `node -e fetch(...)` execs and ffmpeg children
   had no real PID 1 to reap them. The fix was `init: true`.
2. **ffmpeg `-threads 0`** used every core for a single encode. The fix was `threads: 2`
   in `upload-pipeline.ts`. Encodes run one at a time under `nice`.

How to diagnose during a collapse:

```bash
uptime                                   # load ≫ cores?
ps aux --sort=-%cpu | head -15           # who is actually eating CPU
cat /proc/<PID>/cgroup | head -1         # → docker-<id>.scope
docker ps -a --format "table {{.Names}}\t{{.Status}}"
```

- An unhealthy container may refuse `docker restart`. Use `docker kill -s SIGKILL`, then
  `docker start`.
- If many containers are down, a full `reboot` is faster than chasing each one.
- After a reboot, look for an `Exited` web container: a container stopped before the
  reboot does not come back on its own.
- Three stacks booting together under a CPU cap can take about 20 minutes.
- For bot floods, count IPs from the api log:
  `docker logs --since 10m <api> | grep -o '"cf-connecting-ip":"[^"]*"' | sort | uniq -c | sort -rn`.
  Block them at the Cloudflare edge.

---

## 2. CI (`.github/workflows/ci.yml`)

Jobs:

- `gitleaks`: scans the whole history of **all branches**.
- `quality` (lint + typecheck): also checks that `check-tenant-env` *rejects* the
  unedited template.
- `unit`: Postgres service, `db-bootstrap.sql`, migrate, seed, `pnpm test`, then the wa
  `node --test` suite.
- `integration`: Postgres + Redis, `pnpm test:integration`.
- `e2e`: Playwright in 4 shards. They take roughly **5 / 21 / 4 / 18 minutes**, because
  `--shard` splits by file and not by duration. It runs on PRs, on `main`, nightly and on
  dispatch. `e2e-gate` (the "playwright" required check) aggregates the shards.
- `images`: builds the api, web and wa images. It does **not** run on PRs, so dispatch it
  by hand for Dockerfile or build changes.
- `deploy` ("deploy to production"): runs only on `main`. It needs every job above.

Other workflows:

- `rerun.yml`: auto-reruns failed jobs once on a `main` push. It often wins
  `gh run list --limit 1`, so filter with `--workflow CI`.
- `uptime.yml`: every 10 minutes it checks public paths and that main's head reached
  production.
- `backup-check.yml`: nightly, it checks the R2 backups for age, size and that the newest
  file is a real `PGDMP` header.

Rules of thumb:

- **A red e2e on `main` makes `deploy` show as *skipped*, not failed.** Merged is not
  shipped. Check `gh run list --branch main --workflow CI`.
- Before blaming a merge for a flaky test, check whether the same test:line failed on
  earlier `main` runs. Playwright retries, so "1 flaky" still shows green.
- `mergeStateStatus == BEHIND` explains "5 of 5 required checks expected". Fix it with
  `gh pr update-branch N --rebase`. Gate on `gh pr view --json mergeStateStatus`, not on
  `gh pr checks`.
- `gh pr merge` can print a local worktree error *after* merging. Confirm with
  `git log origin/main`.
- A Playwright shard running past about 25 minutes is usually stuck on apt. Inspect the
  steps with `gh api repos/<o>/<r>/actions/jobs/<id>`, then cancel and run
  `gh run rerun --failed`.

---

## 3. Deploy

What the deploy job does:

1. Fingerprints the currently served build.
2. POSTs a Dokploy webhook for Ayman's stack and for each tenant URL in
   `DOKPLOY_TENANT_DEPLOY_URLS`.
3. Polls for up to about 15 minutes until production serves the new build.
4. Smoke-tests the result.

**Dokploy also autodeploys on push by itself**, independently of the job. It always
builds **`main` HEAD**, not the SHA that fired it.

Facts that keep fooling people:

- The webhook answers `200 {"message":"Compose deployed successfully"}` in under a second.
  That means *queued*, not *built*. The real rebuild takes about **8–10 minutes** on the
  VPS. "Slow CI" is this VPS build, not GitHub Actions.
- **A green deploy job proves nothing.** A red one does not mean production is stale
  either: autodeploy may already have shipped, or a back-to-back merge got built under
  the previous job.
- **A negative probe within the first ~10 minutes is not evidence.** Say "not yet", not
  "failed".
- `{"message":"Branch Not Match"}` with a 301 means the stack's configured branch moved.
  Press Redeploy in Dokploy, then fix the branch setting.
- `curl: (28)` to the panel from the runner is GitHub egress, and it is usually transient.
- If the webhook is accepted but nothing builds, suspect the build being OOM-killed on the
  VPS (the old containers keep serving) or Dokploy EMFILE. Read the deployment row's
  error in the Deployments tab. That tab is the only honest source; the deploy key's
  `last_used` lags.

How to verify a deploy:

1. Record `GET /api/health` → `startedAt` **before**, then poll it. A change means a new
   API container, which is also a migrated one.
2. Probe a route the merge added: `401` means the new API, a `Cannot GET` 404 means the
   old one.
3. For web-only changes, grep the live JS/CSS chunks for a string or class the change
   introduced. Anchor on exact markup (`href="…"`), not a bare URL that JSON-LD may
   already contain.
4. Never probe strings inside dialogs or behind auth; curl gets the login page. Send a
   browser `User-Agent`, because Cloudflare answers script UAs with 403 / `error code: 1010`.

The deploy window self-heals. For a few minutes after a swap, these look like bugs and
are not:

- An empty `/courses` or `/news` page: the build baked an empty fallback because the API
  is unreachable during `docker build`.
- Cloudflare-cached 404s on new media.

Re-measure after about 10 minutes, or add a cache-busting query.

### Migrations
- They run at boot inside the **new** image (`docker-entrypoint.sh`). There is a single
  `api` replica and the container is recreated, not rolled, so a destructive migration can
  ship with the code that stopped reading the column. That stops being safe the moment
  the api gains replicas or rolling updates.
- Prove a migration on dev inside `BEGIN; SET LOCAL search_path TO app, public; … ROLLBACK;`.
- Put a new enum value and its first use in **separate** migrations.
- A data migration into `home_blocks` must be guarded with `WHERE EXISTS (…)`. The web
  serves default landing blocks only while the table is empty, so one inserted row wipes
  the default landing page on a fresh DB.
- Seed-controlled reference data: change `seed.ts` **and** add a migration with the same
  values.
- A privilege set in a migration is not the privilege the running system has: the
  entrypoint re-grants on every boot. Any REVOKE that matters must come after the last
  GRANT in the entrypoint, or be backed by a trigger.

---

## 4. Env and new tenants

- Steps: `docs/runbooks/new-tenant.md`. Template: `deploy/tenant.env.example`.
  Preflight: `node scripts/check-tenant-env.mjs <file> [--first-deploy]`.
- **The preflight is not a full copy of the boot contract.** If you add a required var in
  `apps/api/src/config/env.ts`, add it to the template **and** the preflight
  (`packages/contracts/src/check-tenant-env.spec.ts` pins it).
- Every tenant needs **two different origins**, `APP_URL` and `MEDIA_ORIGIN`/`MEDIA_BASE_URL`.
  The API refuses to boot if they share an origin.
- If the API container is not up, Traefik returns a plain-text `404 page not found` (19
  bytes) for the **whole domain**, not just `/api`. Read the `api` container log; the
  default Logs tab opens on the container that never started.
- Compose `${VAR:-}` passes `""`, and Zod `.default()` does not fire for `""`, so the API
  crashes at boot. A compose `${X:-default}` also overrides `env.ts` defaults. Change
  both together.
- A variable in the compose `.env` that is not named in the service's `environment:` block
  never reaches the container.
- **The Docker build cache once served Ayman's identity on another tenant.** `TENANT_KEY`
  must appear in the `RUN … next build` command text. Verify a new tenant after a full
  stop/start, and compare section lists, not just the title.
- Tenant video upload needs:
  - a dedicated R2 bucket on a custom domain, with a token scoped to that bucket only;
  - `VIDEO_MIRROR_FROM_YOUTUBE=false`;
  - a signed `TENANT_ENTITLEMENTS` that includes `video.upload`.

  The entitlement **expires**, and upload silently turns off when it does.
- Turnstile keys are both-or-neither. A secret without a site key fails every sign-up.
- Branding changes are cached in Redis (`next:cache:*`) and in process. Wipe the keys with
  a Lua `EVAL` (`xargs redis-cli DEL` silently deletes nothing), **then** restart web.

---

## 5. Backups

- Configured **in the Dokploy panel**, not in the repo:
  - nightly `pg_dump` (keep 30);
  - nightly tar of the media volume (keep 7);
  - destination: Cloudflare R2.

  Dokploy runs on UTC.
- Dokploy's `Backup done ✅` line prints even for zero-byte dumps.
  `scripts/check-r2-backups.py` is the real check.
- Stack environment variables are **not** in any backup. See `docs/runbooks/backups.md`.

---

## 6. Diagnosing production from data

- Postgres isn't exposed. One-off fixes are run by the owner in the Dokploy terminal of
  the `api` container, as a Prisma one-liner (`require("./dist/generated/prisma/client")`,
  `@prisma/adapter-pg`, `DIRECT_DATABASE_URL`). Ask; don't assume access.
- `/api/admin/errors` misses Nest 500s, and `/api/admin/audit` records successes only.
- Next server errors show as an opaque digest in the browser. The real error is in the
  `web` container stdout (`grep "failed with"`).
- The admin API rate-limits at about 60 GETs. Pace at about 10 per 30 seconds with backoff.
  Bulk POSTs hit 429 after about 20, so sleep about 1.5 s between them.
- "Wrong number" reports: run the competing queries side by side. `student_profiles` and
  `enrollments` are different populations.
- Money screens filter `source:'purchase'`, so admin grants are invisible there. The
  complete read is `GET /api/admin/students/:userId/grants`.
- Production Playwright login fails intermittently with `$RC is not defined`, a hydration
  race. Retry the whole login.
- **Never create test data on a live stack**, especially centres: one active centre shows
  the centre question to every student on that stack.
