# Launch runbook

Operational steps that are deliberately **not** automated because they require a human
decision, a real deploy target, or the passage of time. Each step below is dated —
this file is the single source of truth for "has this actually been done yet."

---

## 1. Flip the CSP from Report-Only to enforcing

**Status: NOT YET DONE. Soak started 2026-07-27. Do not flip before 2026-08-10.**

### Why this is gated on time, not on code

`apps/web/proxy.ts` serves `Content-Security-Policy-Report-Only` unless the
`CSP_ENFORCE` environment variable is the literal string `"true"`, in which case it
serves `Content-Security-Policy` (enforcing) instead. `CSP_ENFORCE` is intentionally
**unset** everywhere right now (root `.env`, `apps/api/.env`, and every `.env.example`
— confirmed absent as of this soak's start). A strict CSP shipped blind will break
real user flows in ways no test suite catches (a third-party embed, a browser
extension injecting a script, a CDN host nobody remembered) — the report-only period
is how those surface *before* they become outages.

The policy itself already reflects the corrected design (see
`docs/superpowers/plans/2026-07-26-plan-7-motion-polish-hardening.md` Task 11):

- Public/prerendered routes (`isProtectedRoute(pathname) === false`, i.e. `/`,
  `/courses`, `/courses/:slug`, `/about`, `/contact`) get
  `script-src 'self' 'unsafe-inline'` — no nonce, no hash, so the route stays
  statically optimizable/ISR/PPR-eligible. **`'strict-dynamic'` makes browsers ignore
  every host allowlist entry in `script-src`** — adding a domain there instead of
  granting it the nonce is a silent no-op, so don't do it if a public-route
  violation ever asks for a new external script host.
- Authenticated routes (`/dashboard`, `/onboarding`, `/settings`, `/admin`,
  `/quizzes/*`, `/courses/:slug/lessons/:id`) get a per-request nonce +
  `'strict-dynamic'` + the theme script's SHA-256 hash. These routes already read
  cookies (`resolveAuthState`), so they pay the dynamic-rendering cost regardless of
  CSP — nonces cost nothing extra there.

### Procedure

1. **Collect at least 7-14 days of `csp violation` log lines** from
   `CspReportController` (`apps/api/src/modules/security/csp-report.controller.ts`).
   Each line is a structured pino `warn` with shape
   `{ csp: { directive, blockedUri, documentUri, sample } }`, deduped per
   `directive|blockedUri` pair for 60s so one broken page doesn't flood the log.
   In production, query the log aggregator for `msg:"csp violation"`; locally,
   `grep 'csp violation' <api log output>`.
2. **Triage every distinct `(directive, blockedUri)` pair to zero** — either the
   violation is a real bug (fix the page/script, not the policy) or the policy is
   missing something legitimate (extend `sharedCspDirectives`/`buildAuthenticatedCsp`
   in `apps/web/proxy.ts`, add a test case to `apps/web/proxy.test.ts`, and restart
   the soak clock from the date of that change — a policy change means the soak's
   evidence no longer covers the shipped policy).
3. **Confirm a full 24h with zero new violations** immediately before flipping.
4. Set `CSP_ENFORCE=true` in the production environment only (never commit it to a
   tracked `.env` file — it is deploy-target configuration, not application code).
5. Re-run the three Playwright flows (`apps/web/e2e/*.spec.ts` — signup→lesson,
   quiz→review, admin publish→visible) against the environment with enforcement on,
   plus the a11y/visual suite (`apps/web/e2e/a11y.e2e.ts`, `visual.e2e.ts`), before
   calling the flip complete. An enforcing CSP that silently breaks the quiz runner
   is worse than the report-only period it replaced.
6. Update the "Status" line at the top of this section with the actual flip date and
   who did it.

### What NOT to do

- Do not flip `CSP_ENFORCE` because "the report-only period feels long enough" —
  flip it because the log is provably quiet for a full day.
- Do not add a CDN/script host to `script-src` on the authenticated policy expecting
  it to take effect — `'strict-dynamic'` ignores it. Give the specific inline/external
  script the nonce (it already receives `x-nonce` via the request header trick in
  `proxy.ts`) or hash it if it's a static inline script like `THEME_SCRIPT`.
- Do not skip the public-route policy when auditing reports — it is intentionally
  the more permissive of the two (`'unsafe-inline'`, no hash, no nonce) because
  Next's own inline flight/RSC bootstrap scripts cannot be hashed by this app and a
  nonce there would disable static optimization on the pages that carry the SEO.

---

## 2. Other deploy-gated items (tracked here, not yet actioned)

These were explicitly deferred by Plan 7 pending a real deployment target and are
listed here so they are not lost between the plan documents and an actual launch.

- **`sslmode=verify-full` with a pinned CA** on `DATABASE_URL`/`DIRECT_DATABASE_URL`.
  Meaningless against a local Unix-socket Postgres; required the moment the database
  is reachable over a network the app doesn't fully control.
- **Apple Sign In verification.** Blocked on a staging HTTPS domain — Apple rejects
  `http://localhost` redirect URIs. Still untested; do not report it as working until
  it has been exercised against a real HTTPS callback.
- **Alerting on log spikes** (CSP violations, throttle lockouts, failed-login bursts).
  Logging exists; nothing pages anyone yet. Needs a real alerting channel, which needs
  a real deployment.
- **Production secret generation.** `scripts/db-bootstrap.sql`'s three role passwords
  and every `BETTER_AUTH_SECRET` in a committed `.env.example` are dev-only literals,
  allowlisted in `.gitleaks.toml` for exactly that reason. A production environment
  needs its own generated secrets pulled from a secret manager, never these literals.

---

_Last updated: 2026-07-27, as part of Plan 7 Tasks 9-15 (security hardening)._
