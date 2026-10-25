# Teachers platform — adding a new teacher from the dashboard

The context a future session (Claude or Codex) needs before touching
"add a teacher", subjects, or a teacher's landing look. It was shipped in
PR #651 (2026-10-12), which superseded #646 and #649.

Read `CLAUDE.md` §2–§5 first. This file does not repeat the tenant model, it
builds on it.

---

## 1. What exists

The owner (Ayman) adds a teacher at **`/admin/platforms` → «مدرّس جديد»**
(`/admin/platforms/new`). One form creates a complete, isolated stack on the
same Dokploy, then shows the teacher's login so it can be sent on WhatsApp.

| Piece | Where |
|---|---|
| Form, run screen, live build watcher | `apps/web/app/(admin)/admin/platforms/new/` |
| Teacher cards (status, redeploy, «تعديل», «إنهاء الإعداد») | `apps/web/app/(admin)/admin/platforms/tenants-section.tsx`, `tenant-row-actions.tsx`, `tenant-actions.ts` |
| Orchestration (the run, resume, finalize, apply entitlements, identity edit) | `apps/web/lib/provisioning/provision.ts` |
| Dokploy client (v0.30 REST) | `apps/web/lib/provisioning/dokploy.ts` |
| Cloudflare DNS client | `apps/web/lib/provisioning/cloudflare.ts` |
| Env generation (secrets, VAPID, admin password, template order) | `apps/web/lib/provisioning/tenant-env.ts` |
| The one gate for every action | `apps/web/lib/provisioning/gate.ts` (`IS_AYMAN` + `settings:write`) |
| Subject list | `packages/contracts/src/subjects.ts` |
| Subject-aware copy | `packages/contracts/src/copy/subject.ts`, `apps/web/lib/tenant-subject.ts` (`TEACHES_CODE`) |
| Landing look on day one | `packages/contracts/src/admin/tenant-branding.ts` |
| Preflight (also run by the form) | `scripts/check-tenant-env.mjs` |
| Manual runbook (fallback) | `docs/runbooks/new-tenant.md` (§0 is the fast path) |

Owner-only. Every server action re-checks `IS_AYMAN`. The section is hidden
from the nav and `notFound()` on any teacher's stack.

---

## 2. What one run does (`provision()`)

The steps run in order. Each step looks for what it is about to make first, so
pressing the button again **resumes**.

1. **env**: discovers stacks on Dokploy, then generates every secret and the
   full env in template order. It runs `checkTenantEnv(..., {firstDeploy: true})`
   and refuses on any error. It also signs the entitlements document from the
   form's ticks (365 days).
2. **project**: a new Dokploy project, tagged `(tenant: <key>)` in its
   description. A dead run's project is found by that tag.
3. **compose**: created in that project's default environment
   (`environmentId`).
4. **environment**: one `compose.update` writes the env plus the owner
   compose's git source, copied **by allowlist**.
5. **domains**: the owner's domains are mapped onto the new hosts. The
   APP_URL host goes to the teacher's domain and the MEDIA host to
   `media.<domain>`; any other host is skipped.
6. **dns** (optional, needs Cloudflare permissions): creates the zone if it is
   missing and returns its nameservers. Adds proxied A records pointing to the
   owner's apex A record. Sets SSL to `full` **only on a zone it just
   created**.
7. **deploy**: `compose.deploy`, unless a build is already running or the
   stack is live.

Hard rules baked in:
- **Never regenerate an existing env.** Postgres was initialised with that
  password.
- A key that already names another domain is refused.
- Hosts already used by another stack are refused.
- The owner's own compose is never a target. `tenantStack()` requires a
  non-`ayman` `TENANT_KEY` in the env.

**Dokploy is the register.** There is no tenants table. A stack is a compose
whose env has `TENANT_KEY`. The template is the compose whose `APP_URL` equals
this stack's `NEXT_PUBLIC_APP_URL`.

---

## 3. A teacher's stack: what is different

All of these are env vars, written by the form, and they ride in the web
**build** (prerender), so changing them needs a rebuild, not a restart.

| Var | Effect | Unset means |
|---|---|---|
| `TENANT_KEY` | whose stack this is | Ayman's stack |
| `TENANT_DISPLAY_NAME` | the name everywhere (web **and** api: assistant, WhatsApp, push) | «المنصة» |
| `TENANT_SUBJECT` | subject slug. Drives titles/SEO/GEO, assistant scope, onboarding pickers, and the seed opening that subject on every track/year. Programming tools (`/playground`, `/foundations`, `/essentials`, neon preset) exist only for `programming_cs` | `programming_cs` (Ayman, Sabry, Adel unchanged) |
| `TENANT_GRADES` | the grades taught, e.g. `prep1,prep2,prep3,sec1` (`packages/contracts/src/grades.ts`). The student picks ONE grade instead of system → year → track; the seed creates المرحلة الإعدادية when a prep grade is listed; library, landing tiles, footer, sitemap and `/years/<grade>` work per grade; the copy says «الإعدادي والثانوي». Not allowed on a programming stack | the old questions, `/years/1..3` |
| `TENANT_LANDING_PRESET` / `TENANT_ACCENT` | landing look on day one. Seeded into `site_settings.branding` **once**, only while the row has no `branding` key (a fresh DB), and used as the web's branding fallback so the prerender doesn't flash the default | schema defaults (classic, amber) |

After the first boot the teacher owns the look: `/admin/settings` → الهوية
البصرية (preset — classic, board, studio, ruqaa «الرقعة», kurrasa «الكرّاسة», taif «الطيف»; colour, custom hue, logo, favicon, portrait), plus
`/admin/home` for blocks and `/admin/settings` → عن المدرّس for the bio.

The owner can change name and subject later from «تعديل» on the card. It
rewrites the two env lines and rebuilds. It does not change the look; that
belongs to the teacher's settings.

---

## 4. Dokploy facts (v0.30.6 live, code read against v0.30.8)

These were all verified on the live panel on 2026-10-12 unless marked.

- **Auth:** the `x-api-key` header.
- **REST shape:** `GET /api/<router>.<proc>?q`, or POST with JSON. The POST
  content type must be **exactly** `application/json`; `; charset=utf-8`
  silently drops the body.
- **Create keys in the panel UI.** Keys created through the API get a
  10-requests-a-day limit that fails as **401**.
- **`compose.create`:** takes `environmentId`. `project.create` returns
  `{project, environment}`. `appName` always gets a random suffix.
- **Owner compose:** `sourceType: github`, `autoDeploy: true`,
  `triggerType: push`, branch `main`. So a cloned stack rebuilds itself on
  every merge. Do **not** add it to `DOKPLOY_TENANT_DEPLOY_URLS`, or every
  merge builds twice on 4 cores.
- **Owner compose has extra `*.sslip.io` domains.** They are not APP/MEDIA
  hosts, so they are correctly skipped.
- **Never spread `compose.one`.** It carries `env` (secrets), `refreshToken`
  (a shared webhook) and `environmentId` (moves the compose).
- **Reaching the panel:** from the web container, use `http://dokploy:3000`.
  The public panel host sits behind a Cloudflare challenge, and an automated
  browser hits it too. Don't try to solve it; ask the owner.
- **`deploy`, not `redeploy`:** `redeploy` fails on a never-deployed compose.
  The queue is in memory.

---

## 5. Live configuration state (2026-10-12)

| Item | State |
|---|---|
| `CONTROL_PLANE_DOKPLOY_KEY` on Ayman's stack | ✅ set (Dokploy key «control-plane», no expiry, no rate limit), deployed |
| `/admin/platforms` live | ✅ lists Sabry + Adel from Dokploy |
| `CONTROL_PLANE_CF_TOKEN` (CF token «platform-usage-read») | ⚠️ analytics only. Add Zone→DNS Edit, Zone→Zone Settings Edit, Zone→Zone Edit on all zones for automatic DNS. Without them the run still deploys and lists the two records to add by hand. |
| Maintenance router (`/etc/dokploy/traefik/dynamic/maintenance.yml`) | ⚠️ still the old 3-host rule. The repo version is ``PathPrefix(`/`)`` at priority 1. Set it via Dokploy → Traefik File System, or re-run `deploy/maintenance/install.sh`. |
| Sabry / Adel `ADMIN_EMAIL`/`ADMIN_PASSWORD` | still in their env. Press «إنهاء الإعداد» once they have changed their passwords. |

Auto mode denies these to Claude, so the owner does them:
- merging PRs;
- editing Cloudflare tokens;
- writing Traefik files;
- SSH;
- solving Cloudflare challenges.

---

## 6. Adding a teacher (owner's steps)

1. `/admin/platforms` → «مدرّس جديد».
2. Fill in name, subject, login email, phone, domain, and the look (preset +
   accent; neon only for programming). Tick the features.
3. «اعمل المنصة». Wait about 10 min until «الموقع بيرد».
4. Send the login («ابعتها واتساب»).
5. If the zone was created, set the registrar's nameservers to the two printed.
6. Backups: in Dokploy → Backups, using its own R2 bucket.
7. WhatsApp: the teacher pairs from their own admin.
8. After the teacher's first sign-in and password change, press
   «إنهاء الإعداد».

---

## 7. Known gaps / next work

- **Separate physical server per teacher:** not supported yet. Every stack
  runs on the one 4-core VPS (69.62.115.174), so one overload takes all of
  them down (2026-10-04). Plan:
  1. the owner adds the server in Dokploy → Remote Servers;
  2. add a server picker to the form;
  3. pass `serverId` to `compose.create`;
  4. take the DNS origin IP from that server's `ipAddress`;
  5. that server needs the Cloudflare-only firewall and the maintenance
     page too.
- **End-to-end on the real panel:** the code was tested against a fake
  Dokploy and Cloudflare and checked against the live panel's shapes. The
  first real teacher is the first full run; it resumes if it stops.
- **Year labels are Bakalorya-only publicly** on a stack without
  `TENANT_GRADES`. A الثانوية العامة teacher should set `sec1,sec2,sec3`.
  Still keyed on the year number alone even with grades: centre slots, books,
  PDFs, practice sets, the marketing audience and the admin students filter.
- **R2 buckets (backups, video) are still manual,** as is the video-host cache
  rule.

## 8. Tests

- `apps/web/lib/provisioning/provision.test.ts` runs against a fake Dokploy
  and Cloudflare. It asserts the exact content type and covers the fresh run,
  resume, orphan adoption, refusals, DNS conflicts, finalize, apply and
  identity edit.
- `tenant-env.test.ts`: the generated env passes the first-deploy preflight,
  and the keys match `deploy/tenant.env.example` in order.
- `packages/contracts/src/check-tenant-env.spec.ts`: covers subject, look and
  control-plane-key rules, and that the slug list equals `subjects.ts`.
- `packages/contracts/src/admin/tenant-branding.spec.ts`.
