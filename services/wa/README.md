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
| `WA_RECEIPT_URL`  | **Set this.** Delivery receipts are POSTed here. Unset, the service goes back to reporting a send as successful the moment WhatsApp's servers take custody — one grey tick — which is how a campaign that reached nobody reported «٧٤ من ٧٤ · اتبعت». |
| `WA_LOG_LEVEL`    | Optional, default `info` — OUR lines, one per send. It used to default to `warn`, and the logs being empty is why a campaign that delivered nothing could not be diagnosed after the fact. |
| `WA_BAILEYS_LOG_LEVEL` | Optional, default `warn`. The library's own noise, kept separate so `info` on ours does not bury them. `warn` still carries «received error in ack» — where WhatsApp's refusal codes appear. |
| `WA_CONNECT_TIMEOUT_MS` | Optional, default `30000`. How long a single connect attempt may go with zero progress (no `open`, no `close`, not even a QR refresh) before it is declared wedged and reset — see `src/connect-watchdog.mjs`. |

## Pairing

`POST /link` starts a pairing and `GET /status` then returns a QR as a data
URL until the phone scans it. `POST /link { "phone": "+2010…" }` asks for an
8-character **pairing code** instead (`status.pairingCode`, `XXXX-XXXX`) — the
way to link from the same phone the admin page is open on, which cannot scan
its own screen. The credentials are written to `WA_AUTH_DIR` and survive
restarts, so this is done once — not on every deploy.

`POST /unlink` logs the device out, cancels any pending reconnect, fences the
old socket's late writes (`src/auth-fence.mjs`) and empties `WA_AUTH_DIR` by
its children (it is a volume mount point — see `src/auth-store.mjs`).
«اربط رقم تاني بدل ده» on the device page is `/unlink` then `/link`.

An **unpaired** sidecar stays quiet: boot, reconnects and the watchdog only
reconnect a device that WhatsApp actually paired (`creds.account` present).
It used to open a throwaway QR session at boot and every 5s after each one
expired — thousands of handshakes a day against the service whose trust the
number depends on.

Closes are classified in `src/reconnect-policy.mjs`: 401 wipes and waits, 403
(banned) and 411 stop and say so, 515 (right after a scan) reconnects at once,
everything else backs off exponentially from 5s to 5 minutes.

## Baileys 7 and new chats

Pinned to `7.0.0-rc14`. On a brand-new number every message is a new-chat
initiation, and that is what WhatsApp meters:

- 7.x attaches the contact's privacy token (`tctoken`) when one is stored and,
  after every 1:1 send, issues ours to the recipient — 6.x did neither.
- 7.x can read WhatsApp's **reach-out timelock** and **new-chat cap**. The
  sidecar asks on connect, after every `463`, and at most every 30 minutes
  before a send (`src/new-chat-limits.mjs`), and `GET /status` reports them as
  `limits`. While either says no, `POST /send` to a number with no trusted
  chat answers **423** `{ code: 'timelock' | 'capped', until }` *without
  sending* — every refused attempt deepens the restriction. The API pauses the
  campaign with the end time.
- Inbound «قف» from LID-addressed chats is mapped back to a phone number
  (`src/inbound.mjs`); before, the relay dropped every reply from a migrated
  account.
- `libsignal` now comes from the registry with an integrity hash; 6.x pulled
  it from a GitHub commit.

## Receipts

The one thing `POST /send` cannot tell you is whether the message arrived.
`sendMessage()` resolving means WhatsApp's servers accepted the stanza — the
first tick — and for months that was the only signal this service produced, so
the API recorded «اتبعت» for messages delivered to nobody.

`messages.update` and `message-receipt.update` are now subscribed per socket
(they must be re-registered on every reconnect, which is why they sit inside
`connect()`) and relayed to `WA_RECEIPT_URL` as `{ messageId, status }`,
deduplicated highest-status-wins by `src/receipt-store.mjs` so a late receipt
can never walk a row backwards. `3` is delivered, `4` read, `0` a refusal.

A refusal carries WhatsApp's own error code, lifted from `messageStubParameters`
and relayed as `code`. Its Egyptian-Arabic explanation is applied by the API
from `packages/contracts/src/copy/admin.ts` (`marketing.waErrors`), so the
campaign screen, the device page and the test send say the same thing. The one
to know is **463**: WhatsApp blocking this account from STARTING new chats
(a reach-out timelock or the new-chat cap) while existing chats keep working.

Every receipt also lands in the API's `whatsapp_sends` ledger, which covers
every sender (campaigns, shipping notices, test sends). The device page's
24-hour delivery rate, last delivery and refusal reasons are read from it.

To read it off the running container directly:

```
docker logs --since 336h <wa> 2>&1 | grep -E 'received error in ack|error 463|whatsapp refused|new-chat limits' | tail -40
```
