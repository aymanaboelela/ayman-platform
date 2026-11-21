# Runbook: DoS / bot flood response

The real failure mode of this platform is not capacity — it is a flood of
requests pegging the shared VPS's CPU. On 2026-10-04 two IPs sent ~16 req/s to
one tenant's public pages (6.55M requests, 90% of that tenant's 30-day
traffic). Every hit forced a full SSR render; CPU sat flat at ~43%, ffmpeg on
top pushed it to 100%, and Hostinger auto-capped the box for 7 days. All three
tenants went down together because they share four cores (see `CLAUDE.md` §5).

Capacity upgrades only raise the number an attacker must reach. **The defence is
at the edge (Cloudflare), not in the server or the app.** This runbook is how to
detect a flood and stop it fast.

---

## 1. Is there a flood right now?

The VPS is `root@69.62.115.174`. Read-only SSH is always available (prod
*writes* are blocked by the auto-mode classifier — a human runs those).

```bash
# Load average far above 4 (the core count) = something is eating the box.
ssh root@69.62.115.174 'uptime'

# Who is actually eating CPU, and which container is it (Traefik has no access log,
# so the API's pino log is the only per-request record).
ssh root@69.62.115.174 'ps aux --sort=-%cpu | head -15'

# Top client IPs over the last 10 min, per tenant. A real student does
# ~1-12 req/min; a flood is one IP doing hundreds.
ssh root@69.62.115.174 'for s in ayman-platform-bvbble-1dl2vb sabry-platform-gxmao4 adel-platform-7ik2p1; do
  echo "=== $s ==="
  docker logs --since 10m ${s}-api-1 2>&1 \
    | grep -o "\"cf-connecting-ip\":\"[^\"]*\"" | sort | uniq -c | sort -rn | head -8
done'
```

`cf-connecting-ip` is the real client; `request.ip` is the Cloudflare edge and
is useless as a key. A flat packets/s line in `sar -n DEV` (40 → 1000+ and
holding) is the signature of a bot, not humans.

## 2. Stop it (Cloudflare — the owner does this; ~2 min)

All three zones live on Ayman's Cloudflare account. The origin firewall already
admits only Cloudflare ranges, so the edge is the single front door.

**Automatic — a rate-limiting rule (preferred, set once per zone):**

- `dash.cloudflare.com` → the zone → **Security → Rate limiting rules → Create**
- Field `URI Path` `does not equal` `/api/security/csp-report` (i.e. the whole zone)
- When rate exceeds **60 requests / 10 seconds**, counting by the same **IP**
- Then **Managed Challenge**, duration 60s
- Deploy, then repeat on `engmohamedsabry.com` and `mr-mohammedadel.com`.

60/10s is safe: the busiest real student seen is ~12 req/min, and a school NAT
(≈40 students on one address) stays well under it, while a 16 req/s bot trips it
immediately. Tune against §1's real numbers before tightening.

**Reactive — block a specific attacker (what stopped 2026-10-04):**

- **Security → WAF → Custom rules → Create** → `(ip.src in {203.0.113.1 203.0.113.2})` → **Block**.

**Also on (free plan):** Security → Bots → **Bot Fight Mode: On**.

## 3. Recover the box if it already collapsed

See `CLAUDE.md` §5 and the `cpu-cap-reboot-recovery` note. In short: a stuck
container needs `docker kill -s SIGKILL <name>` then `docker start <name>`; a
`web` container left `Exited` after a reboot does **not** come back on its own
(a stopped container counts as manual) — `docker start` it. If many are down,
a full `reboot` from hPanel is faster than chasing each one.

## 4. What is already in place (do not re-do)

- **Per-service CPU caps** (`docker-compose.yml`, PR #691): api/web 3 cores,
  wa 1 — a runaway container can no longer take all four, so one tenant's flood
  no longer guarantees all three go down.
- **ffmpeg** runs at `threads: 2` with a load-based throttle (`upload-pipeline.ts`,
  `ladder-upgrade.ts`).
- **`init: true`** on api/web/wa kills the zombie-process pile-up.
- **Per-IP + per-session throttling on `/api/*`** (`app.module.ts`): 10/s, 60/min,
  1000/hr session-keyed, plus a 1200/min IP ceiling. Note this covers the Nest
  API only — the 2026-10-04 flood hit public **web pages**, which this does not
  see. That gap is exactly why the Cloudflare rule in §2 is the real defence.

## 5. Load testing (prove a change holds before shipping)

`scripts/load/` drives N concurrent students through sign-in, lessons,
heartbeats and public pages against a LOCAL production build on a throwaway DB —
**never against a live stack** (it would trigger the very collapse above).

```bash
k6 run -e PROFILE=smoke  scripts/load/student-journey.js   # 20 users
k6 run -e PROFILE=1000   scripts/load/student-journey.js   # 1000 concurrent
k6 run -e PROFILE=spike  scripts/load/student-journey.js   # exam-start shape
```

Each VU carries its own `cf-connecting-ip`, so the throttlers see N clients the
way Cloudflare presents them in production. A 1000-VU run on a 10-core dev box
passed with 0 errors; Postgres (not the API) was the first resource to saturate.
