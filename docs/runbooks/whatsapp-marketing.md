# التسويق — turning WhatsApp campaigns on

`/admin/marketing` ships wired up but **sends nothing** until a device is
paired. Unconfigured, the device screen says «الخدمة لسه مش متظبطة على
السيرفر» and every campaign stays a draft — nothing 404s, nothing silently
half-works.

**Status: not configured as of 2026-08-24.**

---

## What this actually is, and the trade being made

This is **not** the WhatsApp Cloud API. It is a linked-device session
(`services/wa`, on Baileys) — the same mechanism as opening WhatsApp Web on a
laptop, run headless in a container. That is the only way to send from a
personal number for free; the official route bills per marketing message and
requires template approval for exactly this use case.

The consequence: **this is against WhatsApp's terms of service**, and the
number used can be banned. `apps/api/src/modules/marketing` exists to manage
that risk down, not eliminate it — conservative pacing (30–90s between sends,
a pause every 30 messages, a 200/day cap, a 10:00–22:00 Cairo window, none of
it configurable past sane ceilings) and an opt-out path («قف») honoured
immediately. Read `pacing.ts`'s module comment before loosening any of those
defaults; each one is there because of what happens without it, not as a
suggestion.

Use a number that is not load-bearing elsewhere, and prefer one students
already expect to hear from over a fresh one bought for this.

---

## Turning it on

1. **Pick the number.** A phone that can keep WhatsApp installed and online —
   this is a persistent linked-device session, not a one-time send.

2. **Generate a shared secret** for the sidecar to trust the API with:

   ```
   openssl rand -hex 32
   ```

3. **Add three variables** to the deployment's `.env`:

   ```
   WA_TOKEN="<the secret from step 2>"
   WA_SERVICE_URL=http://wa:3400
   WA_SERVICE_TOKEN="<the SAME secret from step 2>"
   ```

   ⚠️ Same trap as every other section on this page: a variable in `.env` and
   *not* named in `docker-compose.yml`'s `environment:` block never enters the
   container. All three are already listed there (`wa.WA_TOKEN`,
   `api.WA_SERVICE_URL`, `api.WA_SERVICE_TOKEN`) — that line is load-bearing.

   `WA_SERVICE_URL` and `WA_SERVICE_TOKEN` are a pair: the API refuses to boot
   if only one is set (`env.ts`'s own `.refine()`), on purpose — a URL with no
   token is a sender that answers 401 to every message, which looks exactly
   like a broken campaign rather than a missing variable.

4. **Redeploy**, then open `/admin/marketing/device` and press «اربط رقم
   جديد». A QR appears. On the phone: واتساب ← الإعدادات ← الأجهزة المرتبطة ←
   ربط جهاز، وامسح الكود.

5. The badge turns «متربط» with the number under it. That pairing lives on
   the `wasession` volume and survives every redeploy after this one — the
   phone is never asked to scan again unless it revokes the device itself.

---

## What the pieces are

- `services/wa` — the sidecar. **Outside the pnpm workspace on purpose**; see
  its own `README.md`. One process, one WhatsApp socket, one message at a
  time.
- `apps/api/src/modules/marketing/whatsapp-device.service.ts` — the API's only
  way to reach it. Every call fails soft: `status()` never throws, because the
  device screen's whole job when the sidecar is down is to say so plainly.
- `apps/api/src/modules/marketing/campaign-runner.service.ts` — the drip. A
  10-second cron tick that asks the pacing module "is anything due", and sends
  at most one message per tick, platform-wide, never per campaign.
- `apps/api/src/modules/marketing/whatsapp-inbound.controller.ts` — replies
  land here. Only «قف» (and its spellings) does anything; that one message
  writes a permanent opt-out and stops every future campaign from ever
  reaching that number again.

---

## If a campaign gets stuck

1. **Check `/admin/marketing/device` first.** «مفيش رقم متربط» or «مقدرناش
   نوصل» explains a stalled campaign completely — the runner pauses a
   campaign automatically the moment a send fails because the device is not
   connected, rather than marking four thousand recipients `failed` over one
   dropped session.
2. **«مستنية بكرة»** on the detail page means the daily cap was reached — not
   a fault. It resumes on its own at the window's opening hour tomorrow.
3. **A recipient stuck on `failed`** has already been retried three times.
   Its `colError` cell carries the sidecar's own message — a number that is
   not on WhatsApp reads as `skipped`, not `failed`, and needs no attention.
4. **Nothing sends outside 10:00–22:00 Cairo, ever**, even right after
   pressing «ابدأ» at 11pm. That is `withinWindow`, not a bug.

---

## Turning it back off

`POST /admin/marketing/device` → «افصل الرقم», or simply remove `WA_TOKEN` /
`WA_SERVICE_URL` / `WA_SERVICE_TOKEN` and redeploy. Any campaign mid-run
pauses itself the moment its next send fails to find a connected device — no
message goes out from a number that has been unlinked.
