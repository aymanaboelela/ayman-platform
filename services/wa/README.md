# `services/wa` — the WhatsApp sender

A single-purpose sidecar that holds one WhatsApp **linked device** session and
sends one message at a time when the API asks it to.

## Why it is not part of the monorepo

`pnpm-workspace.yaml` globs `apps/*` and `packages/*` — this directory is
neither, deliberately. Baileys pulls a large dependency tree (protobuf,
libsignal, sharp-adjacent image tooling) that has nothing to do with the
platform's own builds, and adding it to the root lockfile would put it in
front of every CI install and every developer's `pnpm install`. It installs
its own dependencies inside its own Docker image and is versioned by its own
`package.json`.

## What it is, honestly

This is the **unofficial** route. It logs in the way WhatsApp Web does and is
against WhatsApp's terms of service. It exists because the official Cloud API
charges per marketing message and requires template approval for exactly this
use case, and because the alternative — the instructor forwarding the same
message by hand four hundred times — is what it replaces.

The consequences of that choice are managed in the API, not here: the pacing,
the daily cap, the sending window and the opt-out list all live in
`apps/api/src/modules/marketing`. This process has no idea what a campaign is.
It sends one message when told to, and reports whether it worked.

## Environment

| variable          | meaning                                                        |
| ----------------- | -------------------------------------------------------------- |
| `WA_PORT`         | HTTP port. Default `3400`. Internal network only — never routed. |
| `WA_TOKEN`        | Shared secret. Every request must carry it as `x-wa-token`.     |
| `WA_AUTH_DIR`     | Where the pairing credentials live. **Must be a volume.**       |
| `WA_INBOUND_URL`  | Optional. Incoming messages are POSTed here (for «قف»).         |
| `WA_CONNECT_TIMEOUT_MS` | Optional, default `30000`. How long a single connect attempt may go with zero progress (no `open`, no `close`, not even a QR refresh) before it is declared wedged and reset — see `src/connect-watchdog.mjs`. |

## Pairing

`POST /link` starts a pairing and `GET /status` then returns a QR as a data
URL until the phone scans it. The credentials are written to `WA_AUTH_DIR`
and survive restarts, so this is done once — not on every deploy.

`POST /unlink` wipes them and drops the session.

## Endpoints

All except `/health` require `x-wa-token`.

- `GET /health` → `{ ok: true }`, or `{ ok: false, detail }` with `503` **only** if a connect attempt has been wedged for far longer than it should ever take to self-recover (see `WA_CONNECT_TIMEOUT_MS`). A device that simply isn't linked yet is still `{ ok: true }` — that has always been on purpose (see `Dockerfile`).
- `GET /status` → `{ state, phone, qr, detail }`
- `POST /link` → begins pairing
- `POST /unlink` → forgets the device
- `POST /send` `{ phone, text, imageUrl? }` → `{ messageId, onWhatsApp }`
