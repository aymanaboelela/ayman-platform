# المساعد — Chat, Conversations, Attachments & the AI Assistant

**Scope:** everything a Flutter client needs to reproduce the platform's chat surface exactly:
the AI chat (`المساعد`), the human conversation thread with the instructor (`م. أيمن`),
attachments (images / documents / **voice notes**), unread state, and the admin inbox.

**Base URL:** all API routes below are served under the global prefix `api`
(`app.setGlobalPrefix('api')` — `apps/api/src/main.ts:32`). The web app reaches them
same-origin through a Next rewrite; a mobile client hits `https://<host>/api/...` directly.

**Everything is Arabic / RTL.** Every user-visible string in this document is quoted verbatim
from `packages/contracts/src/copy/ar.ts` (student + shared) or
`packages/contracts/src/copy/admin.ts` (admin-only). **Do not translate, do not re-word.**
There is a hard project rule that copy is never gendered — no second-person imperatives
(`اضغط`/`اضغطي`), only verbal nouns (`تحميل`, `فتح`, `إرسال`) or first person. Follow it in any
new string you must invent.

---

## 0. The mental model (read this first)

There are **two separate things** behind one launcher button, and they must not be confused:

| | `المساعد` open chat | The conversation with أيمن |
|---|---|---|
| Endpoint | `POST /api/assistant/ask` | `/api/assistant/conversations/*` |
| Storage | **Nothing persisted client-visible.** The transcript lives only in RAM. (The server keeps an admin-only `assistant_questions` row for 90 days.) | Real Postgres rows: `conversations` + `conversation_messages` |
| Answered by | An LLM (Gemini → Groq → Anthropic chain) or the hand-written corpus | A human, by hand, in `/admin/inbox` |
| Transport | SSE (`text/event-stream`) streamed token-by-token | Plain JSON request/response |
| Auth | `@Public()` — works signed-out | `@Public()` — works signed-out via a guest cookie |
| Attachments | none | yes, **admin → student only** |
| Realtime | streaming answer only | none for the thread itself; see §9 |

A student "crosses over" from the first to the second when المساعد decides a question needs a
person. That crossing is called the **handoff** and it is automatic (§7.4), not a button press.

Source files (repo-relative):

```
apps/api/src/modules/assistant/assistant.controller.ts        student conversation routes
apps/api/src/modules/assistant/admin-inbox.controller.ts      admin inbox routes
apps/api/src/modules/assistant/assistant.service.ts           all conversation logic
apps/api/src/modules/assistant/conversation-attachment.service.ts  attachment upload/stream
apps/api/src/modules/assistant/serve-attachment.ts            attachment response headers
apps/api/src/modules/assistant/guest-token.ts                 guest cookie
apps/api/src/modules/assistant/ai/assistant-ask.controller.ts SSE ask route
apps/api/src/modules/assistant/ai/assistant-ai.service.ts     prompt + provider + sentinel filter
apps/api/src/modules/assistant/ai/providers/*.ts              gemini / groq / anthropic / chain
apps/api/src/modules/assistant/ai/assistant-student.service.ts personal context + exam lock
apps/api/src/modules/assistant/ai/assistant-question.service.ts question log (admin only)
apps/api/src/modules/media/{media,document,voice}.service.ts  three upload pipelines
apps/api/src/modules/media/storage/local-disk.storage.ts      byte store (LOCAL DISK)
packages/contracts/src/assistant/conversation.ts              THE wire contract
packages/contracts/src/assistant/ask.ts                       SSE event contract
packages/contracts/src/assistant/summary.ts                   launcher probe contract
packages/contracts/src/assistant/script.ts                    guided node tree (legacy, see §10)
packages/contracts/src/admin/media.ts                         mime/size/key rules
apps/api/prisma/schema.prisma                                 models (lines ~3550-3910)
apps/web/components/assistant/*                               the student UI
apps/web/app/(admin)/admin/inbox/**                           the admin UI
```

---

## 1. Data model — every column

### 1.1 `app.conversations` (Prisma model `Conversation`)

`schema.prisma:3561`. One thread between one visitor and the instructor.

| Column (DB) | Prisma field | Type | Null | Meaning |
|---|---|---|---|---|
| `id` | `id` | `uuid` (`uuid(7)`, so **id order == time order**) | no | PK |
| `origin` | `origin` | enum `conversation_origin` | no, default `visitor` | who spoke first. `visitor` = a thread the student/guest opened. `outreach` = a thread the platform opened *in the instructor's name* (quiz result, nudge, group invite). An `outreach` row **always** has a `user_id`. |
| `user_id` | `userId` | text (better-auth id — a **nanoid**, NOT a uuid) | yes | set for a signed-in student; NULL for a guest |
| `guest_name` | `guestName` | `varchar(120)` | yes | what a guest typed |
| `guest_phone` | `guestPhone` | `varchar(20)` | yes | guest's WhatsApp number, E.164 |
| `guest_token_hash` | `guestTokenHash` | `char(64)`, UNIQUE | yes | **SHA-256 hex** of the opaque cookie token. The raw token is never stored. |
| `entry_path` | `entryPath` | `text[]` | no | node ids the visitor walked, e.g. `['root','join','joinPrice']`. IDs, never sentences — resolved to Arabic at read time. |
| `status` | `status` | enum `conversation_status` | no, default `open` | `open` / `answered` / `closed` |
| `last_message_at` | `lastMessageAt` | `timestamptz` | no, default `now()` | denormalised; the inbox orders by it |
| `last_message_author` | `lastMessageAuthor` | enum `message_author` | no, default `visitor` | who spoke LAST. Drives "unread for admin". |
| `admin_read_at` | `adminReadAt` | `timestamptz` | yes | when the instructor last OPENED the thread |
| `visitor_read_at` | `visitorReadAt` | `timestamptz` | yes | when the visitor last read it |
| `created_at` | `createdAt` | `timestamptz` | no, default `now()` | |

DB CHECK constraints (migration `20260804190000_assistant_conversations`, `20260816120000_instructor_outreach`):

* `conversations_not_two_owners`: `NOT (user_id IS NOT NULL AND guest_token_hash IS NOT NULL)` — exactly one owner.
* `conversations_guest_contactable`: `guest_token_hash IS NULL OR (guest_name IS NOT NULL AND guest_phone IS NOT NULL)`.
* `conversations_outreach_has_owner`: an outreach row must have `user_id`.
* FK `user_id → users.id` is **`ON DELETE SET NULL`**, not cascade — deleting an account does not erase the thread.

Indexes: `(status, last_message_at DESC)`, `(origin, last_message_at DESC)`, `(user_id)`.

### 1.2 `app.conversation_messages` (Prisma model `ConversationMessage`)

`schema.prisma:3652`.

| Column | Prisma field | Type | Null | Meaning |
|---|---|---|---|---|
| `id` | `id` | `uuid` (`uuid(7)`) | no | PK |
| `conversation_id` | `conversationId` | `uuid` | no | FK, `ON DELETE CASCADE` |
| `author` | `author` | enum `message_author` (`visitor` \| `admin`) | no | |
| `body` | `body` | `text` | no (may be `''` when there is an attachment) | **PLAIN TEXT. There is no HTML sink on this path at all** — never render it as HTML/markdown. |
| `created_at` | `createdAt` | `timestamptz` | no, default `now()` | |
| `admin_reaction` | `adminReaction` | `varchar(16)` | yes | one emoji the INSTRUCTOR put on this message (WhatsApp style). There is no visitor reaction column. |
| `attachment_key` | `attachmentKey` | text | yes | storage key, always `msg/<2 hex>/<uuid>.<ext>` |
| `attachment_name` | `attachmentName` | `varchar(200)` | yes | display filename only — **never used to build a path** |
| `attachment_bytes` | `attachmentBytes` | `int` | yes | size |
| `attachment_duration_seconds` | `attachmentDurationSeconds` | `int` | yes | **voice notes only**, whole seconds, supplied by the recorder |
| `edited_at` | `editedAt` | `timestamptz` | yes | when the instructor last rewrote the words; renders as «معدّلة» |

There is **no `mime` column, by design.** The mime is derived from the extension in the storage
key (`mimeForStorageKey`, `packages/contracts/src/admin/media.ts`), because the extension is
chosen by the server from the *detected* type and is the only unforgeable statement about the
bytes. There is no FK to `media_assets` — conversation attachments have no media-library row.

DB CHECK constraints:

* `conversation_messages_body_length`: `char_length(body) <= 2000 AND (char_length(body) >= 1 OR attachment_key IS NOT NULL)` — i.e. a message may be a file with **no caption**.
* `conversation_messages_attachment_complete`: `(attachment_key IS NULL) = (attachment_name IS NULL) AND (attachment_key IS NULL) = (attachment_bytes IS NULL)` — all three or none.
* `conversation_messages_duration_sane`: `attachment_duration_seconds IS NULL OR (>0 AND <=600)`.
* `conversation_messages_duration_needs_attachment`: a duration requires an `attachment_key`.

Index: `(conversation_id, created_at)`.

### 1.3 `app.assistant_questions` (Prisma model `AssistantQuestion`)

`schema.prisma:3853`. **Admin-read-only. No student-facing route exists.** Records what was
typed into the AI chat and what came back.

| Column | Type | Null | Meaning |
|---|---|---|---|
| `id` | `uuid` (`uuid(7)`) | no | |
| `user_id` | text | yes | NULL = an anonymous visitor. **No name, phone, IP, session or guest token is stored** — the name shown in admin is JOINed at read time. |
| `question` | `text` | no | exactly what was typed, truncated to 4000 chars on write |
| `answer` | `text` | no | exactly what was sent back, truncated to 4000 |
| `provider` | `varchar(120)` | yes | which model answered (`gemini:…`, `groq:…`, `anthropic:claude-opus-5`) or **NULL when the written corpus answered** |
| `escalated` | `boolean` | no, default false | المساعد said this one needed a person |
| `created_at` | `timestamptz` | no | |

**Rows expire after 90 days** (`RETENTION_DAYS = 90`, swept daily by a cron in
`AssistantQuestionService`). Indexes: `(created_at DESC)`, `(escalated, created_at DESC)`.

### 1.4 `app.outreach_messages` (context only)

A ledger of messages the platform sent in the instructor's name. The *message itself* is an
ordinary `conversation_messages` row authored `admin` inside an `origin: 'outreach'`
conversation, so a mobile chat client needs to do nothing special for it — it renders as an
ordinary reply from أيمن. Kinds: `quiz_result`, `quiz_nudge`, `lesson_praise`, `whatsapp_invite`.

### 1.5 Enums (Postgres + wire)

```
conversation_status : 'open' | 'answered' | 'closed'
   open     — waiting on the instructor
   answered — he replied; the visitor may still follow up
   closed   — done. The visitor may start a NEW thread, not revive this one.

conversation_origin : 'visitor' | 'outreach'
message_author      : 'visitor' | 'admin'
```

---

## 2. Constants you must hard-code identically

From `packages/contracts/src/assistant/conversation.ts` and `.../ask.ts` and `.../admin/media.ts`:

| Constant | Value | Enforced where |
|---|---|---|
| `MESSAGE_MAX` | `2000` | zod `.max()` **and** a Postgres CHECK |
| `MESSAGE_MIN` (internal) | `2` | zod `.min()` on open/post/edit |
| `EntryPathSchema` max length | `24` items, each must be a real node id | zod |
| `TRANSCRIPT_TURNS_MAX` | `12` | zod `.max()` on the `transcript` array |
| `TRANSCRIPT_TURN_WIRE_MAX` | `1000` | zod `.max()` on each turn's `text` |
| `TRANSCRIPT_TURN_MAX` | `300` | server-side per-turn clip when serialising |
| `TRANSCRIPT_BODY_MAX` | `2000` (= `MESSAGE_MAX`) | server-side total clip |
| `MAX_OPEN_PER_IDENTITY` | `3` | service; `origin: 'visitor'`, `status != closed` |
| `THREAD_MESSAGE_WINDOW` | `100` | newest 100 messages returned per thread |
| `THREAD_CANDIDATES` | `8` | how many of a caller's threads are ranked |
| `PREVIEW_MAX` (inbox row) | `140` | server truncation, `…` appended |
| `SUMMARY_PREVIEW_MAX` | `240` | launcher/dashboard teaser truncation |
| `ASK_QUESTION_MAX` | `500` | zod on `POST /api/assistant/ask` |
| `ASK_HISTORY_MAX` | `8` | max turns of history sent up |
| `AskTurn.text` max | `4000` | zod |
| `ASK_ACTIONS_MAX` | `3` | buttons under an AI answer |
| `ASK_ACTION_LABEL_MAX` | `40` | label chars, longer is clipped with `…` |
| `MESSAGE_REACTIONS` | `['👍','❤️','😂','🔥','😮','🙏']` — **closed list, in this order** | zod enum, API validates |
| `MAX_UPLOAD_BYTES` (image) | `8 * 1024 * 1024` = 8 MiB | image pipeline |
| `MAX_DOCUMENT_BYTES` | `95 * 1024 * 1024` = 95 MiB | document pipeline + multer limit |
| `MAX_VOICE_BYTES` | `20 * 1024 * 1024` = 20 MiB | voice pipeline |
| `MAX_VOICE_SECONDS` | `600` (10 min) | zod + Postgres CHECK |
| `GUEST_COOKIE_MAX_AGE_SECONDS` | `90 * 24 * 60 * 60` (90 days) | cookie |

---

## 3. Identity: signed-in student vs guest

`apps/api/src/modules/assistant/guest-token.ts`, `assistant.controller.ts`.

* Every `/api/assistant/*` route is `@Public()` — **a 401 is never the right answer here.**
* The server resolves identity in this order (`AssistantService.ownerWhere`):
  1. session `userId` if signed in — **the account always wins**, even if a guest cookie is also present;
  2. otherwise `sha256(guestCookieValue)` matched against `conversations.guest_token_hash`;
  3. otherwise `null` → the caller owns nothing.
* **Guest cookie**: name is `__Host-assistant` in production, `assistant` in dev
  (`guestCookieName(isProduction)`). Attributes set by the server on the `POST
  /api/assistant/conversations` response that creates a guest thread:
  `httpOnly; secure(prod only); SameSite=Strict; Path=/; Max-Age=7776000` (90 days).
  Value = `randomBytes(32).toString('base64url')`, returned exactly once and never again.
* Identity in the request **body is ignored** for a signed-in caller: posting `name`/`phone`
  while signed in does not rename you in the inbox.

### 3.1 CSRF — mandatory on every write, even though the routes are public

`apps/api/src/modules/security/csrf.guard.ts`, `apps/web/lib/csrf.ts`.

Every `POST` / `PUT` / `PATCH` / `DELETE` on these routes runs three checks:

1. **`x-csrf-token` header must be present and non-empty.** Presence is the control; the value
   is *not* compared against anything server-side today. The web client echoes the value of the
   `__Host-csrf` cookie.
2. If an `Origin` header is present it must equal `APP_URL` exactly. **Absent is allowed** — a
   native client that sends no `Origin` passes.
3. If `Sec-Fetch-Site` is present it must be `same-origin` or `none`. Absent is allowed.

**Flutter:** send `x-csrf-token: <anything non-empty>` on every write (mirroring the cookie value
if you have one), send **no** `Origin`, send **no** `Sec-Fetch-Site`. Failing this is
`403 {"message":"CSRF: missing x-csrf-token header"}`.

### 3.2 Rate limits

Global throttlers (`apps/api/src/app.module.ts:86`), keyed on a hash of the session cookie or,
for anonymous callers, on the client IP: `short` 10/1s, `medium` 60/60s, `long` 1000/3600s, plus
an IP-only ceiling of 1200/60s.

Route overrides:

| Route | Limits |
|---|---|
| `POST /api/assistant/conversations` | 1 / 10s, 3 / 600s, 5 / 3600s |
| `POST /api/assistant/conversations/:id/messages` | 1 / 3s, 10 / 600s |
| `POST /api/assistant/ask` | 2 / 6s, 20 / 600s, 60 / 3600s |

Over-limit is `429`. The UI **must** map 429 to its own sentence, not a generic error (§14).

---

## 4. Student-side endpoints

### 4.1 `GET /api/assistant/conversations/mine/summary`

The **launcher probe.** Called once per page load in the web app; a mobile client should call it
on app resume and after any write. Public; returns 200 for an anonymous caller.

Response (`packages/contracts/src/assistant/summary.ts` — hand-narrowed, **no zod**):

```json
{
  "unread": 0,            // int >= 0. Admin messages the visitor has not read. 0 if no thread.
  "hasThread": false,     // there is a thread AT ALL, closed ones included
  "hasOpenThread": false, // that thread is 'open' or 'answered' (i.e. NOT 'closed')
  "isSignedIn": false,    // convenience only, never an authorization signal
  "latestFromAyman": null // string | null — newest UNREAD admin message, server-truncated to 240 chars with a trailing '…'
}
```

Rules a client must reproduce:

* `latestFromAyman` is non-null **only when `unread > 0`**.
* A message that is only a file has an empty body; the teaser then becomes `📎 <filename>`.
* Whitespace is squeezed (`[^\S\n]+ → ' '`, `\n{2,} → '\n'`) but **newlines are preserved** —
  render it `pre-wrap`, clamped to ~6 lines.
* Throwing on a malformed shape is correct behaviour (the web client's `parseMyConversationSummary`
  throws rather than defaulting); treat as "no dot".

### 4.2 `GET /api/assistant/conversations/mine`

The **panel's** shape: the whole thread. Public. Returns **200 with `conversation: null`** when
the caller has no thread — *never* a 404.

```json
{
  "conversation": {
    "id": "uuid",
    "status": "open" | "answered" | "closed",
    "entryPath": ["root"],
    "messages": [ ConversationMessage, ... ],   // OLDEST FIRST
    "unreadForVisitor": 0
  } | null,
  "isSignedIn": true
}
```

`ConversationMessage` (`ConversationMessageSchema`):

```json
{
  "id": "uuid",
  "author": "visitor" | "admin",
  "body": "string",                       // plain text, may be ""
  "createdAt": "2026-09-08T12:00:00.000Z",// ISO 8601
  "adminReaction": "👍" | null,           // plain nullable STRING on the wire, not the enum
  "attachment": MessageAttachment | null,
  "editedAt": "ISO" | null
}
```

`MessageAttachment` (`MessageAttachmentSchema`):

```json
{
  "kind": "image" | "document" | "voice",
  "filename": "المحاضرة الأولى.pdf",
  "sizeBytes": 1234567,
  "durationSeconds": 42 | null,   // whole seconds, non-null ONLY for kind === "voice"
  "path": "/api/assistant/conversations/<cid>/messages/<mid>/attachment",
  "downloadPath": "/api/assistant/conversations/<cid>/messages/<mid>/attachment?download=1"
}
```

**Which thread you get.** A student may hold several threads (up to 3 of their own plus an
outreach thread). `AssistantService.myThread` fetches the newest 8 by `lastMessageAt desc`, then:

1. any thread with an **unread admin message** wins;
2. among those, the one whose **oldest unread** admin message is oldest wins (drains the queue in
   arrival order);
3. otherwise the newest thread by `lastMessageAt`.

**Message window.** Only the newest `100` messages come back, ordered
`createdAt desc, id desc` server-side and then reversed, so the array you receive is
**oldest-first** and `messages[length-1]` is newest. There is no pagination for older messages.

`unreadForVisitor` = count of messages in that window where `author === 'admin'` and
(`visitorReadAt` is null or `createdAt > visitorReadAt`).

### 4.3 `POST /api/assistant/conversations` — open a thread

Public + CSRF + throttled (1/10s, 3/10min, 5/hr). Body (`OpenConversationSchema`, **`.strict()`** —
any unknown key is a 400):

```json
{
  "entryPath": ["root"],            // required; array<string>, max 24, each must be a known node id
  "message": "…",                    // required; trimmed, min 2, max 2000
  "name":  "الاسم بالكامل",          // GUEST ONLY; optional; trimmed, min 2, max 120
  "phone": "01012345678",           // GUEST ONLY; optional; Egyptian phone (see below)
  "transcript": [ {"role":"user"|"assistant","text":"…"}, ... ]  // optional; max 12 turns, each text trimmed min 1 max 1000
}
```

* A **signed-in** caller must omit `name`/`phone` entirely (sending them is harmless but ignored;
  sending empty strings is a 400 because of the min lengths).
* An **anonymous** caller with no `name` **and** `phone` gets `400 "guest conversations require a
  name and a phone"`.
* `phone` is validated by `egyptianPhone(...)` (`packages/contracts/src/phone.ts`) and stored
  E.164; the placeholder shown to users is `01xxxxxxxxx`.
* Send `entryPath: ["root"]` from a mobile chat — the guided tree is no longer walked (§10).

**Response: `200` with the full `ConversationThread`** (the same object as
`conversation` in §4.2). If the caller was a guest, a `Set-Cookie` for `__Host-assistant` is on
this response — **persist that cookie**; losing it loses the thread forever.

Failure modes: `403 "too many open conversations"` when the identity already holds 3 non-closed
`origin: 'visitor'` threads (keyed on `userId`, or on `guest_phone` for a guest); `429`
throttled; `400` validation.

Side effect: every admin holding `conversation:read` gets an `assistant_question_received`
notification carrying a 240-char preview.

### 4.4 `POST /api/assistant/conversations/:id/messages` — follow up

Public + CSRF + throttled (1/3s, 10/10min). `:id` must be a **UUID** (`ParseUUIDPipe`, else 400).
Body (`PostMessageSchema`, `.strict()`):

```json
{ "message": "…",                       // trimmed, min 2, max 2000
  "transcript": [ … ] }                  // optional, same rules as above
```

Response: `200` with the updated full `ConversationThread`.

* `403` (no body detail) when the caller presented **no identity at all**.
* `404` when the id is not a thread this caller owns (ownership is in the WHERE — a guessed id
  never confirms existence).
* `403 "conversation is closed"` when `status === 'closed'`. A closed thread can never be
  reopened from the student side; the client must offer "start a new one" instead.
* Side effects: `status` goes back to `open`, `lastMessageAt`/`lastMessageAuthor='visitor'` and
  `visitorReadAt` are all set to the new message's timestamp; `adminReadAt` is deliberately left
  alone. Admins are notified.

### 4.5 `POST /api/assistant/conversations/:id/read` — mark read

Public + CSRF. **No body. Responds `204` with no content, always** — including for an id the
caller does not own (it is an `updateMany` scoped by owner, so it silently matches zero rows;
this is deliberate, so the route is not an existence oracle).

Sets `visitor_read_at = now()`. Call it whenever the thread view is on screen and
`unreadForVisitor > 0`; on success, locally set `unreadForVisitor = 0` so the launcher dot clears
without a refetch.

### 4.6 `GET /api/assistant/conversations/:id/messages/:messageId/attachment[?download=1]`

Public (gated by ownership inside the query), **no CSRF** (it is a GET).

* `403` when the caller has neither a session nor a guest cookie.
* `404` when the pair (`conversationId`, `messageId`) does not resolve to a message with a
  complete attachment **owned by this caller**.
* `200` streams the bytes with:
  * `Content-Type`: derived from the storage-key extension (`image/webp`, `application/pdf`,
    `application/vnd.openxmlformats-officedocument.*`, `audio/webm`, `audio/mp4`)
  * `Content-Length`
  * `X-Content-Type-Options: nosniff`
  * `Content-Disposition: inline; filename*=UTF-8''<percent-encoded>` — or `attachment; …` when
    **any** `download` query param is present (presence, not value: `?download=1`, `?download=yes`
    and `?download=` are identical)
  * `Cache-Control: private, no-store`
  * `Content-Security-Policy: default-src 'none'; sandbox`

Because of `private, no-store`, a mobile client must fetch these with credentials and **must not**
put them in a shared/public cache. There is **no signed URL and no TTL** — access is re-checked on
every request from the session/cookie.

### 4.7 `POST /api/assistant/ask` — the AI chat (SSE)

See §11 in full.

---

## 5. Admin-side endpoints (`/api/admin/conversations`)

All require a session. Three separate permissions, deliberately:
`conversation:read`, `conversation:reply`, `conversation:close`. A student gets `403`, an
anonymous caller `401` (authorization matrix rows: `apps/api/src/test/authorization-matrix.int-spec.ts:876-935`).

### 5.1 `GET /api/admin/conversations` — the inbox list

Permission `conversation:read`. Query params:

| Param | Schema | Default |
|---|---|---|
| `filter` | `'unread' \| 'open' \| 'answered' \| 'closed' \| 'all'` | `unread` |
| `sort` | `'newest' \| 'oldest'` | `newest` |
| `page` | int ≥ 1 | `1` |
| `perPage` | one of `10, 20, 50, 100` | `20` |

Response: `{ "rows": AdminConversationRow[], "rowCount": <total matching> }`.

`AdminConversationRow`:

```json
{
  "id": "uuid",
  "status": "open"|"answered"|"closed",
  "origin": "visitor"|"outreach",
  "hasVisitorReply": true,      // the student has written here at least once
  "who": "اسم الطالب",           // account name, else the guest's typed name, else ""
  "userId": "nanoid" | null,    // null for a guest; links to /admin/students/:userId
  "isGuest": false,
  "guestPhone": "+201..." | null, // ALWAYS null for a signed-in student, by design
  "entryPath": ["root","join"],
  "preview": "…",                // FIRST LINE OF THE NEWEST message, server-truncated to 140 + '…'
  "previewAuthor": "visitor"|"admin",
  "lastMessageAt": "ISO",
  "unreadForAdmin": true
}
```

Ordering: `lastMessageAt` then `id` as tiebreak, both in the chosen direction (stable under
pagination — two threads can share a millisecond).

What the inbox *is* (`INBOX_WHERE`): `origin = 'visitor' OR EXISTS(message with author='visitor')`.
Automated outreach threads nobody answered are excluded (they live at `/admin/outreach`).

`unreadForAdmin` / the `unread` filter: `status != 'closed'` **AND** `lastMessageAuthor = 'visitor'`
**AND** (`adminReadAt IS NULL` OR `lastMessageAt > adminReadAt`). Note the author clause — the
instructor's own outbound messages must never mark a thread unread for him.

`preview` special cases:
* If the newest message body parses as an **assistant transcript** (§8), the preview is the text of
  the **last `user` turn** in it, never the last turn.
* If the body is empty (file-only message), the preview is `📎 <attachmentName>`.

### 5.2 `GET /api/admin/conversations/unread-count`

Permission `conversation:read`. `{ "unread": <int> }`. Same WHERE as the `unread` filter.
The web admin polls this every **30 s** while the tab is visible (§9.3).

### 5.3 `GET /api/admin/conversations/:id` — the thread

Permission `conversation:read`. **Side effect: this GET writes `admin_read_at = now()`.** There is
no separate mark-read call.

Response `AdminConversationDetail` = `AdminConversationRow` plus:

```json
{
  "messages": [ ConversationMessage… ],  // OLDEST FIRST, ALL of them (no window on this side)
  "createdAt": "ISO",
  "contactPhone": "+201..." | null,      // guest's typed number OR the student's account phone, joined live
  "hasActiveSubscription": true|false|null,  // null for a guest; derived from courses.length > 0
  "courses": [
    { "courseId": "…", "courseTitle": "…", "source": "purchase"|"admin"|"platform", "validUntil": "ISO"|null }
  ] | null                                // null for a guest
}
```

`unreadForAdmin` is forced to `false` in this response (he has just read it). Attachment `path`s
in this response point at the **admin** route (`/api/admin/conversations/:id/messages/:mid/attachment`).

Course grants shown: `scope='course'`, `revokedAt: null`, `validFrom <= now`, and
`validUntil IS NULL OR validUntil > now`. **No `source` filter** — a hand-granted course counts.

### 5.4 `POST /api/admin/conversations/attachments` — stage a file

Permission **`conversation:reply`** (not `media:write`). `multipart/form-data`, field name `file`,
one file, multer limit `MAX_DOCUMENT_BYTES` (95 MiB).

Returns `MessageAttachmentInput`:

```json
{ "storageKey": "msg/ab/<uuid>.webp", "filename": "photo.jpg", "sizeBytes": 84213 }
```

(plus `durationSeconds` if the client adds it locally for a voice note — the server does not
return it). See §6 for the pipelines and the exact accept rules.

### 5.5 `POST /api/admin/conversations/:id/reply`

Permission `conversation:reply`. **`204 No Content` on success** (there is no response body — do
not try to parse one). Body (`ReplySchema`, `.strict()`):

```json
{
  "message": "…",                        // trimmed, max 2000; may be "" IF an attachment is present
  "attachment": {                        // optional, nullable
    "storageKey": "msg/ab/<uuid>.webm",  // must match one of the storage-key patterns
    "filename": "voice.webm",            // trimmed, 1..200
    "sizeBytes": 12345,                  // int > 0, <= 95 MiB
    "durationSeconds": 42                // OPTIONAL/nullable; VOICE ONLY; int 1..600
  } | null
}
```

Refinement: `message.length >= 2 || attachment != null`, else `400` with
`{"message": "اكتب رسالة أو ارفق ملف", "path": ["message"]}`.

Server also calls `attachments.assertStored()` — a `storageKey` that is well-shaped but was never
uploaded is `400 "attachment was not uploaded"`.

Side effects, in one transaction: message row inserted with `author='admin'`; conversation set to
`status='answered'`, `lastMessageAt=now`, `lastMessageAuthor='admin'`, `adminReadAt=now`;
`visitorReadAt` deliberately **not** touched (so the student's unread dot appears); a
`conversation_reply` notification is emitted **only for a signed-in student** (a guest gets none).
`403 "conversation is closed"` if the thread is closed; `404` if it does not exist.

### 5.6 `PUT /api/admin/conversations/:id/messages/:messageId/reaction`

Permission `conversation:reply`. `204`. Body `{ "reaction": "👍" | null }` — must be one of
`MESSAGE_REACTIONS` or `null` (which clears it). An emoji outside the list is `400`. Unknown ids
are a **silent no-op that still returns 204** (`updateMany`). Nothing else moves: not
`lastMessageAt`, not `status`, not `adminReadAt`, and the student is **not** notified.

### 5.7 `PATCH /api/admin/conversations/:id/messages/:messageId` — edit

Permission `conversation:reply`. `204`. Body `{ "message": "…" }` — trimmed, min 2 (`'اكتب رسالة'`),
max 2000. `author='admin'` is enforced **in the WHERE**, so editing a student's message is a plain
`404`. Sets `editedAt = now()`. **Does not** bump `lastMessageAt` and does not reopen the thread.
Text only — an edit can never swap the attachment.

### 5.8 `DELETE /api/admin/conversations/:id/messages/:messageId`

Permission `conversation:reply`. `204`. Hard delete, **no tombstone** — the message simply
disappears from both sides. Same `author='admin'` WHERE; `404` otherwise. The attachment's bytes
are deliberately left in storage (unreachable once the row is gone).

### 5.9 `PATCH /api/admin/conversations/:id/status`

Permission **`conversation:close`**. `204`. Body `{ "status": "open" | "closed" }` — reopening is
`"open"`. `updateMany`, so an unknown id is a no-op 204.

### 5.10 `GET /api/admin/conversations/:id/messages/:messageId/attachment[?download=1]`

Permission `conversation:read`. Same headers as §4.6, no ownership filter (the permission *is*
the check), `404` for ids that do not pair up.

### 5.11 The AI question log — `/api/admin/assistant/questions`

Permission `conversation:read` (same authority as the inbox).

`GET /api/admin/assistant/questions?page&perPage&q&dir&escalatedOnly`

* `q` searches the **question text only**, `contains`, case-insensitive.
* `escalatedOnly` is a coerced boolean, default `false`.
* `dir` is `asc|desc`, default `desc` (newest first).

Row: `{ id, question, answer, provider|null, escalated, studentName|null, isGuest,
conversationId|null, askedAt }`. `conversationId` is a *hint* — the signed-in student's
conversation closest in time to the question, computed after the fact; always `null` for a guest.

`GET /api/admin/assistant/questions/:id/context` →
`{ question, siblings: AssistantQuestion[] /* oldest first, ≤20, same user within ±3h */,
conversation: { id, status, startedAt } | null }`. `404` for an unknown id.

---

## 6. Attachments — exactly how they work today

### 6.1 Direction

**One direction only: instructor → student.** `PostMessageSchema` (the student's follow-up) has
**no** attachment field, and there is no student upload endpoint. This is a deliberate decision,
not an oversight — see the header comment on `MessageAttachmentInputSchema`
(`packages/contracts/src/assistant/conversation.ts:344`): *"a student cannot attach anything…
Receiving a file needs no permission; sending one does."*

### 6.2 Storage backend

**Local disk**, not R2/S3. `MEDIA_STORAGE` is bound to
`new LocalDiskStorage(loadEnv(process.env).MEDIA_ROOT)` in `apps/api/src/modules/media/media.module.ts`.
The `MediaStorage` interface is deliberately narrow — `put / getStream / stat / delete` — with
**no listing and no signed URLs**. (R2 is used for database backups, not for this.)

Consequence for mobile: **there are no signed URLs and no expiry.** Bytes are always fetched
through an authenticated `/api/…` route that re-checks the caller on every request.

### 6.3 Key shapes (`packages/contracts/src/admin/media.ts`)

Conversation attachments always live under a **three-segment `msg/` prefix**:

```
CONVERSATION_KEY_PATTERN = /^msg\/[0-9a-f]{2}\/[0-9a-f-]{36}\.(?:webp|pdf|pptx|docx|xlsx)$/
```

The public media route is `GET /media/:prefix/:name`, which binds exactly **two** segments — so a
three-segment key is structurally unreachable publicly. That is the entire access-control story
for the bytes.

**⚠️ CONFIRMED BUG — voice keys are not in the allowlist.** The pattern above does not list
`webm` or `m4a`, and neither does any other pattern in `isValidStorageKey`
(`STORAGE_KEY_PATTERN`, `DOCUMENT_KEY_PATTERN`, `CONVERSATION_KEY_PATTERN`,
`PAYMENT_PROOF_KEY_PATTERN`, `BOOK_ORDER_PROOF_KEY_PATTERN`, `HOMEWORK_KEY_PATTERN`).
`VoiceService.upload` mints `msg/<2 hex>/<uuid>.webm` (or `.m4a`) and calls
`storage.put(key, …)`, and `LocalDiskStorage.resolveKey` **throws `invalid storage key: …`** for
anything `isValidStorageKey` rejects — so a voice-note upload should 500 at the storage layer.
`mimeForStorageKey` *does* map both extensions, so the read path would work if a key ever landed.
There is no `voice.service.spec.ts` and no `webm` case in `local-disk.storage.spec.ts`, which is
why nothing catches it. Verify against the running system; the fix is one alternation added to
`CONVERSATION_KEY_PATTERN`. This is the same omission that file already documents twice, for
`payment-proof/` and `book-order-proof/`.

`MIME_FOR_EXT`:

```
webp → image/webp
pdf  → application/pdf
pptx → application/vnd.openxmlformats-officedocument.presentationml.presentation
docx → application/vnd.openxmlformats-officedocument.wordprocessingml.document
xlsx → application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
webm → audio/webm
m4a  → audio/mp4
```

`kind` is derived by the serializer, never stored:
`audio/* → 'voice'`, `image/* → 'image'`, everything else → `'document'`.

### 6.4 The three upload pipelines

`ConversationAttachmentService.upload()` picks a pipeline from the **declared file extension**,
then each pipeline re-derives the truth from the bytes:

| Extension (lowercased, after the last `.`) | Pipeline | Cap | What happens |
|---|---|---|---|
| `png jpg jpeg webp avif gif` | `MediaService.uploadPrivateImage(file, 'msg')` | 8 MiB | 4 gates: extension allowlist → magic-byte sniff → **sharp re-encode to WebP** (destroys polyglots, strips EXIF/GPS; `limitInputPixels = 50,000,000`) → uuid key. Stored as `msg/xx/<uuid>.webp`. `filename` returned is the decoded original name, clipped to 200 chars. |
| `pdf pptx docx xlsx` | `DocumentService.upload(file, 'msg')` | 95 MiB | size → extension allowlist → magic-byte sniff (must resolve to one of 4 exact OOXML/PDF mimes; a `.pptx` that sniffs as `application/zip` is **rejected**) → uuid key with the extension chosen from the DETECTED mime. No re-encode. |
| `webm m4a` | `VoiceService.upload(file, 'msg')` | 20 MiB | size → extension allowlist → **container magic sniff** → uuid key with the DETECTED extension. No re-encode. `filename` is forced to `voice.webm` / `voice.m4a`. |
| anything else | — | — | `400 "file extension is not allowed"` |

Errors: `413` (`PayloadTooLargeException`) when over the pipeline's cap;
`400 "file extension is not allowed"`; `400 "file contents are not an allowed document type"`;
`400 "file contents are not an allowed audio type"`; `400 "could not be processed"` from the image
pipeline.

⚠️ `webp` (image) and `webm` (audio) differ by one letter and route to different pipelines.

### 6.5 VOICE NOTES — current state

**Voice notes ARE supported today, admin-side only.** Everything exists:

* Contract: `ALLOWED_VOICE_EXT = ['webm','m4a']`, `ALLOWED_VOICE_MIME = ['audio/webm','audio/mp4']`,
  `MAX_VOICE_BYTES = 20 MiB`, `MAX_VOICE_SECONDS = 600`.
* Magic bytes checked against the buffer (`VOICE_MAGIC`):
  * `webm` — EBML header `1A 45 DF A3` at offset **0**
  * `m4a` — `66 74 79 70` (`ftyp`) at offset **4**
* Schema column: `conversation_messages.attachment_duration_seconds` (int, 1..600, requires an
  attachment) — the **duration comes from the recorder**, because `MediaRecorder` writes no
  duration into a live WebM header and `HTMLAudioElement.duration` reads `Infinity` until the file
  is seeked end to end.
* Wire: `MessageAttachmentInputSchema.durationSeconds` (`int().min(1).max(600).nullish()`), and
  `MessageAttachmentSchema.durationSeconds` on the way back out (`null` for non-voice).
* Web recorder: `apps/web/components/assistant/voice-recorder.tsx` — picks `audio/webm` if
  `MediaRecorder.isTypeSupported`, else `audio/mp4`, else refuses; counts elapsed seconds itself;
  **auto-stops at 600 s**; has an explicit cancel.
* Playback: a native `<audio controls preload="metadata">` plus the stored duration printed as
  `m:ss` in Western digits (`formatClock`). **No waveform exists anywhere** — do not invent one if
  you want parity.

**What is NOT supported and must be added for a student to send a voice note:**

1. **No student upload endpoint.** `POST /api/admin/conversations/attachments` is
   `conversation:reply`. A student-side route (e.g. `POST /api/assistant/conversations/attachments`)
   would have to be added, `@Public()` + `@RequireCsrf()`, throttled hard.
2. **No attachment field on `PostMessageSchema`.** It would need `attachment:
   MessageAttachmentInputSchema.nullish()` and `AssistantService.postMessage` would need to write
   the three columns (+ duration) exactly as `reply()` does.
3. **The security argument changes.** `VoiceService`'s own docblock says control #1 — "only the
   instructor can reach it" — is what makes storing audio *without a re-encode* proportionate.
   Opening it to students means either accepting unre-encoded audio from untrusted uploaders or
   adding ffmpeg to the runtime image (which the project explicitly declined to carry).
4. **`CONVERSATION_KEY_PATTERN` must gain `webm|m4a`** (see §6.3) or `isValidStorageKey` rejects
   the key at `LocalDiskStorage.put` — the exact failure mode already documented twice in that file
   for `payment-proof/` and `book-order-proof/`.
5. Storage has **no quota** — a student-facing audio upload needs one.
6. No waveform data, no transcription, no server-side duration probe: if you want a waveform in
   Flutter, compute it client-side from the decoded PCM; nothing is stored for it.

**iOS/Android recording formats:** the platform accepts exactly `audio/webm` and `audio/mp4`.
On iOS, record **AAC in an MP4/M4A container** (`.m4a`) — that is the branch Safari already uses.
On Android, prefer `.m4a` too for one code path; WebM/Opus also passes. **`.ogg`, `.wav`, `.mp3`,
`.aac` (raw ADTS), `.3gp` and `.amr` are all rejected.**

---

## 7. The handoff (المساعد → أيمن) and the embedded transcript

### 7.1 What travels

When المساعد gives up, the client opens (or appends to) a conversation, and carries the chat
transcript with it as the `transcript` field. The server serialises it into **one ordinary message
row authored `visitor`** — because `message_author` has exactly two members and a third would be a
migration.

### 7.2 The serialisation format — you must parse this

`serializeAssistantTranscript` / `parseAssistantTranscript` in
`packages/contracts/src/assistant/conversation.ts`. The marks are **structure, not copy** — they
never move to the copy table.

```
line 0 : "🤖💬"                 <- TRANSCRIPT_MARK; if line 0 is not exactly this, the body is ordinary text
line 1 : "⋯"                    <- OPTIONAL. Present only when older turns were dropped.
line n : "🙋 <text>"            <- a student turn   (TURN_MARK.user)
line n : "🤖 <text>"            <- an assistant turn (TURN_MARK.assistant)
```

Parsing rules to reproduce exactly:

* Split on `\n`. If `lines[0] !== '🤖💬'` → **return null** (it is a normal message; render a bubble).
* Skip lines equal to `'⋯'` and empty lines.
* A line starting with `'🙋 '` → `{role:'user', text: line.slice(2)}` (mark length + 1).
* A line starting with `'🤖 '` → `{role:'assistant', text: line.slice(2)}`.
* **Any other line → return null for the whole body.** Half a transcript read as the student's own
  words is worse than raw text.
* If zero turns were collected → return null.
* `assistantTranscriptTrimmed(body)` = `body.split('\n')[1] === '⋯'`.

Serialisation (if you ever need to produce it): every turn is collapsed to ONE line
(`\s+ → ' '`, trimmed, and a leading mark stripped), clipped to 300 chars with a trailing `…`,
newest 12 kept, then oldest dropped one at a time until the whole joined block fits 2000 UTF-16
units, then the whole thing clipped to 2000.

### 7.3 Client-side trimming is mandatory

`OpenConversationSchema` validates **before** the service runs, so an over-long transcript is a
**400**, not a server-side trim. The web client's `carry()` (`assistant-handoff.ts`) does:

```
turns.slice(-12).map(t => ({role: t.role, text: t.text.trim().slice(0, 1000)})).filter(t => t.text.length > 0)
```

and **omits the field entirely** when the result is empty (`.strict()` + `min(1)` would 400 on an
empty array). Reproduce this exactly.

### 7.4 The handoff state machine (student side)

`HandoffState = 'idle' | 'sending' | 'sent' | 'needsIdentity' | 'failed'`
(`apps/web/components/assistant/assistant-handoff.ts`).

The AI answer carries an `escalate: true` flag on its `done` frame. The moment an answer finishes
with `escalate === true` (and is not still streaming), the client **automatically**:

1. Takes the transcript **as it stood at that moment** (frozen — do not re-read it later; the
   answer may keep streaming), minus whatever a previous handoff already filed (`carriedTurns`).
   ⚠️ Clamp `carriedTurns` to `transcript.length` first — clearing the chat resets the transcript
   but not the counter, and an unclamped `slice` sends an empty transcript on the second handoff.
2. If **not signed in** → `needsIdentity`; show the card asking for a name + WhatsApp number and
   route to the handoff form. Nothing is sent yet.
3. If **signed in** → `sending`:
   * if the summary says `hasOpenThread` and the thread is not loaded, **fetch it first**
     (`GET …/mine`); a failed fetch falls through to opening a new thread rather than failing;
   * if a live (`status !== 'closed'`) thread exists → `POST …/:id/messages`;
   * else → `POST /api/assistant/conversations` with `entryPath: ['root']`.
   * on success → `sent`, store the returned thread, set `carriedTurns = transcript.length`.
   * on **any** failure (429, 403 open-thread limit, network) → `failed`.
4. Asking a **new** question resets the state to `idle` (otherwise the next escalating answer
   briefly renders the previous handoff's receipt).
5. `idle` renders **nothing at all** — no card.

Each answer may be handed off **once**; track the answer's id.

---

## 8. Read receipts & unread counts — the exact rules

| Question | Rule | Endpoint |
|---|---|---|
| Student: is there something unread? | `count(messages where author='admin' and (visitorReadAt is null or createdAt > visitorReadAt))` within the 100-message window | `GET …/mine/summary` → `unread`; `GET …/mine` → `unreadForVisitor` |
| Student: mark read | sets `visitor_read_at = now()` | `POST …/:id/read` → 204 |
| Admin: is a thread unread? | `status != 'closed' AND lastMessageAuthor = 'visitor' AND (adminReadAt IS NULL OR lastMessageAt > adminReadAt)` | row field `unreadForAdmin`, filter `unread` |
| Admin: mark read | **opening the thread does it** (`GET /api/admin/conversations/:id` writes `admin_read_at`) | — |
| Admin: badge number | same WHERE as above, plus `INBOX_WHERE` | `GET /api/admin/conversations/unread-count` |

There are **no per-message read receipts** (no "seen at" per message, no delivery ticks). The
model is one `read_at` timestamp per side per conversation. Do not draw WhatsApp double-ticks —
nothing backs them.

Client precedence: once the full thread has been fetched, `thread.unreadForVisitor` **wins over**
the (older) `summary.unread`, so the dot clears the instant the student reads the message.

---

## 9. Realtime — what exists today

### 9.1 The conversation thread: **no realtime at all**

`apps/web/components/assistant/assistant-thread.tsx` states it in as many words:

> *No polling. A reply arrives on the next page load, which is what an asynchronous inbox honestly
> promises — a typing indicator with nobody behind it would be a lie the interface tells every
> visitor.*

There is **no** SSE, WebSocket or poll on `/api/assistant/conversations/*`. The student learns
about a reply through the notification system (below) or on the next fetch of the summary probe.

### 9.2 Notifications: **SSE**, for signed-in users only

`GET /api/me/notifications/stream` — `text/event-stream`, permission `profile:read`
(`apps/api/src/modules/notifications/notifications.controller.ts:78`). Details:

* Headers: `Content-Type: text/event-stream; charset=utf-8`,
  `Cache-Control: private, no-store, no-transform`, `Connection: keep-alive`,
  `X-Accel-Buffering: no`.
* First frame written is literally `retry: 5000\n\n` (browser reconnect delay).
* Heartbeat: `{"type":"ping"}` every **25 000 ms** (`HEARTBEAT_MS`), chosen to sit under Traefik's
  read timeout, Cloudflare's 100 s and a mobile radio's ~60 s idle.
* Payload frames: `data: {"type":"notification","notification":<Notification>,"unread":<int>}\n\n`.
  `unread` is **absolute, not a delta** — a client that slept converges on the first frame it sees.
* Backed by Redis pub/sub server-side; authenticated by **cookie** (that is why it is SSE and not
  a WebSocket — `EventSource` cannot set headers).

The two kinds that matter here:

* `conversation_reply` — «مهندس أيمن ردّ على سؤالك». Web deep-links to
  `/dashboard?assistant=1`, which opens the panel straight onto the thread.
* `instructor_message` (outreach) — same destination.
* `assistant_question_received` — the ADMIN-side kind, links to `/admin/inbox/:conversationId`,
  carries `preview` and `studentName`.

### 9.3 Web Push

VAPID web push exists (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`, all optional).
⚠️ **`pushPayloadFor` in `apps/api/src/modules/notifications/push-text.ts` has NO case for
`conversation_reply`** — it falls through to `default: return null`. So a student currently gets
**no push** when the instructor replies; only the in-app SSE toast and the unread dot. Admins DO
get a push for `assistant_question_received` (`tag: 'ayman-inbox'`, url `/admin/inbox/:id`).

### 9.4 Admin inbox badge: polling

`apps/web/components/admin/inbox-alerts.tsx` — `GET /api/admin/conversations/unread-count` every
**30 000 ms**, skipped entirely while the tab is hidden, refetched immediately on
`visibilitychange` back to visible. The very first count never raises an alert (only a rise from a
*known* previous number does).

### 9.5 What a mobile app should do instead

* **Thread:** do not poll the thread. Subscribe to push (FCM/APNs) for `conversation_reply`, and
  refetch `GET …/mine` on (a) app foreground, (b) push receipt, (c) opening the chat screen,
  (d) after any write (the write already returns the updated thread — use it).
* **Launcher dot:** call `GET …/mine/summary` on foreground and after writes. It is cheap
  (a handful of bytes) and de-duplicated concurrently in the web client; do the same.
* **Do not open an `EventSource`-equivalent for the assistant thread** — none exists.
  You *may* consume `GET /api/me/notifications/stream` while the app is in the foreground and the
  user is signed in; it needs the session cookie and nothing else. Expect `ping` frames every 25 s
  and treat >60 s of silence as a dead connection.
* **Guests get nothing realtime** (no account, no notifications). Poll the summary on foreground.
* **Backend work needed for real mobile push on a reply:** add a `conversation_reply` case to
  `pushPayloadFor`, and add an FCM/APNs transport beside the existing Web Push one (§15).

---

## 10. The guided script (`assistant/script.ts`) — status and content

`packages/contracts/src/assistant/script.ts` is a **pure-data question tree** the web widget used
to walk locally (no server round trip, works offline). `ASSISTANT_NODES` is a total
`Record<AssistantNodeId, AssistantNode>` where `AssistantNodeId = keyof typeof copy.assistant.script`
and choice ids are `keyof typeof copy.assistant.choices`, so copy and structure cannot drift.

**⚠️ The tree is NO LONGER SHOWN to students.** `assistant-widget.tsx` documents the removal:
the panel used to have three tabs and the report was «هيتلحبط من ٣ دول، عايز يبقى الموضوع سهل».
Today the panel opens straight onto the chat, and the tree's *answers* survive only as the
**server-side corpus** the AI is grounded in (`assistant-knowledge.ts` builds it from
`copy.assistant.script` + `copy.assistant.knowledge`). Handoffs now post `entryPath: ['root']`.

You still need the tree for **two** things:

1. **Validation** — `EntryPathSchema` refuses any element that is not a real node id, so if you
   ever send a longer path it must come from this table.
2. **Rendering breadcrumbs** in an admin-style view: a stop is labelled by the **choice that leads
   to it**, found on the previous stop; the root is dropped
   (`apps/web/lib/assistant-path.ts::assistantPathLabels`), joined with `' ← '`.

Node ids and their edges (`next` = walk on, `href` = leave for a page, `escalate` = ask a human):

```
root         → courses | join | books | study | account | talk(escalate)
courses      → coursesAvailable→coursesList | courseInside | courseStart | back→root
coursesList  → browseCourses(/courses) | back→courses            [data: 'courses' — renders the live catalog]
courseInside → browseCourses(/courses) | essentials(/essentials) | back→courses
courseStart  → talk(escalate) | back→courses
join         → joinAccount | joinEnroll | joinPrice | back→root
joinAccount  → register(/register) | back→join
joinEnroll   → joinPay | browseCourses(/courses) | back→join
joinPay      → joinReview | back→join
joinReview   → talk(escalate) | dashboard(/dashboard) | back→join
joinPrice    → talk(escalate) | back→join
books        → bookOrderHow | bookNotArrived | back→root
bookOrderHow → browseBooks(/books) | back→books
bookNotArrived → bookWhenExactly | myOrders(/store/orders) | back→books
bookWhenExactly → talk(escalate) | myOrders(/store/orders) | back→books
study        → studyQuizzes | studyRetake | studyProgress | back→root
studyQuizzes → back→study
studyRetake  → talk(escalate) | back→study
studyProgress→ dashboard(/dashboard) | back→study
account      → accountPassword | accountProfile | accountVideo | back→root
accountPassword → talk(escalate) | login(/login) | back→account
accountProfile  → profile(/profile) | back→account
accountVideo    → talk(escalate) | back→account
```

⚠️ Rule enforced by the corpus builder: **every `back` edge points at the branch MENU, never at the
previous step.** A `back` pointing at a step retitles the corpus entry «رجوع».

The Arabic for every node body and every choice label is in §12.5 / §12.6.

---

## 11. The AI ask path — `POST /api/assistant/ask`

### 11.1 Request

Public + `@RequireCsrf()` + throttled (2/6 s, 20/10 min, 60/1 h).
Body (`AskRequestSchema`, `.strict()` — a body carrying `system`, `model` or `max_tokens` is a 400):

```json
{
  "question": "…",   // trimmed, min 1 ('مفيش سؤال متكتوب'), max 500 ('السؤال طويل أوي — الحد 500 حرف')
  "history": [ {"role":"user"|"assistant","text":"…"}, … ]  // optional, default [], max 8 turns, each text trimmed 1..4000, OLDEST FIRST, WITHOUT the question being asked now
}
```

Send `Accept: text/event-stream`, `Content-Type: application/json`, `x-csrf-token: …`, and the
session cookie if you have one.

The web client sends **only clean turns**: it filters out any message with an `error` or with an
empty/whitespace text before slicing the last 8. Reproduce that — sending back a half-written
answer teaches the model to continue a sentence it never finished. The server additionally trims
any leading `assistant` turns (`openingWithUser`), because both providers reject a history that
does not begin with `user`.

### 11.2 Response — **SSE, streamed, not JSON**

`200` with:
```
Content-Type: text/event-stream; charset=utf-8
Cache-Control: private, no-store, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

Frames are `data: <json>\n\n`. There is no `event:` name and no `id:`. Three shapes
(`AskEvent`, `packages/contracts/src/assistant/ask.ts`):

```json
{"t":"delta","text":"…"}                                  // append to the current answer
{"t":"done","escalate":false,"actions":[{"label":"…","href":"/books"}]}   // actions optional
{"t":"error","code":"failed"|"tooMany"|"unavailable"}
```

Parsing rules the client must reproduce (`use-assistant-ask.ts`):

* Buffer bytes and split on `\n\n`; keep the remainder for the next chunk.
* Within a frame, take the first line starting with `data:`; `JSON.parse(line.slice(5).trim())`.
* A frame that fails to parse is **skipped**, not fatal.
* Narrow with the equivalent of `asAskEvent` — an unknown shape is dropped.
* On `done`, `actions` may be **absent**; treat as `[]`.
* Validate each action a second time client-side (`asAskActions`): drop any whose `href` is not
  either one of the fixed hrefs or `^/courses/[a-z0-9]+(-[a-z0-9]+)*$`; dedupe by href; cap at 3;
  label must be 1..40 chars.
* **A `429` is not an SSE frame.** The throttler answers before the handler runs, so it arrives as
  an ordinary JSON error response and the body never opens. Check `response.statusCode` first:
  `429 → 'tooMany'`, any other non-2xx or missing body → `'failed'`.
* Aborting the request is the «إيقاف» button. On abort, keep whatever text arrived and show **no**
  error — an abandoned answer is not a failure.

### 11.3 What the server does per request

`AssistantAskController.ask` + `AssistantAiService.answer`:

1. Resolve the user from the **session cookie only** (there is no field for a user id in the body).
2. **The exam lock.** If the user has any `quizAttempt` with `state IN ('in_progress','overdue')`,
   the model is **not called at all**. The whole response is:
   `{"t":"delta","text":"<copy.assistant.ai.duringExam>"}` then `{"t":"done","escalate":false}`.
   Nothing is recorded. Reproduce this understanding in the UI: while a paper is open the chat is
   effectively disabled. The web app additionally refuses to mount the widget on
   `/quizzes/:lessonId/attempt/:attemptId` (`shouldMountAssistant`).
3. Read the money snapshot (`AssistantFactsService.read()`, 60-second TTL; **returns `null` rather
   than a stale price**, and `null` means "state no number, escalate").
4. If **no provider is configured** → answer from the written corpus (`matchKnowledge`) and return.
5. Otherwise stream from the provider chain, run every chunk through `SentinelFilter`, and emit
   `delta` frames.
6. `done.escalate` is true iff the filter saw the `[[ASK_AYMAN]]` marker.
7. `done.actions` is built **on the server** from `[[GO:<id>]]` markers: an id is looked up in a
   fixed table, or `course:<slug>` is matched against the live published catalog. **The model never
   writes a URL.** An unknown id is silently dropped.
8. After the stream ends, one `assistant_questions` row is written (question, answer, provider,
   escalated). Failure to write never affects the answer.
9. `response.on('close')` aborts the upstream generation when the client disconnects
   (⚠️ on the *response*, never the request).

### 11.4 Models, keys and fallbacks

`selectProvider()` in `assistant-ai.service.ts`, env in `apps/api/src/config/env.ts`.
All three keys are **optional** and the product must work with none of them.

| Order | Provider | Env | Default models | Notes |
|---|---|---|---|---|
| 1 | Gemini | `GEMINI_API_KEY` | `GEMINI_MODEL` = `gemini-2.5-flash,gemini-2.5-flash-lite,gemini-3.5-flash-lite` | `POST https://generativelanguage.googleapis.com/v1beta/models/<model>:streamGenerateContent?alt=sse`, header `x-goog-api-key`. `maxOutputTokens: 1024`, `temperature: 0.4`, thinking disabled. Walks to the next model on 404/429/500/503 **only before the first byte**. Free tier ≈ 20 answers/day/model. |
| 2 | Groq | `GROQ_API_KEY` | `GROQ_MODEL` = `openai/gpt-oss-120b,openai/gpt-oss-20b` | OpenAI-shaped endpoint, `Bearer` auth, `temperature: 0.4`. Retries next model on 404/429/500/502/503. ~14,400/day free. |
| 3 | Anthropic | `ANTHROPIC_API_KEY` | `claude-opus-5` (`MODEL` constant, `MAX_TOKENS = 1024`, `output_config.effort = 'low'`) | paid; last so a free tier is spent first. |
| — | none set | — | — | `matchKnowledge` answers from `copy.assistant.knowledge` + the script bodies, by word overlap; `provider` is recorded as `null`. |

`REQUEST_TIMEOUT_MS = 30_000` wall-clock ceiling on one answer.
`ChainProvider` only switches provider **before the first byte** — a provider that fails
mid-stream fails the whole request (the client then gets a `{"t":"error","code":"failed"}` under
the partial answer).
Catalog snapshot TTL for grounding: `CATALOG_TTL_MS = 5 * 60 * 1000`.

### 11.5 Sentinels — never let these reach a user

The model emits two markers the server strips before anything is written to the wire:

* `[[ASK_AYMAN]]` — "this needs a person" → becomes `done.escalate: true`.
* `[[GO:<id>]]` — a destination, `id` matching `[a-z0-9:_-]{1,120}` → becomes `done.actions`.

`SentinelFilter` holds back any tail that could still grow into either marker (tokens arrive on
arbitrary boundaries). **You should never see these strings in a `delta`** — but defensively strip
them client-side anyway.

### 11.6 The action table (`ASK_ACTION_HREFS`)

id → href, and the Arabic label from `copy.assistant.ai.actions`:

| id | href | label |
|---|---|---|
| `courses` | `/courses` | `الكورسات وأسعارها` |
| `books` | `/books` | `الكتب وأسعارها` |
| `essentials` | `/essentials` | `التأسيس` |
| `dashboard` | `/dashboard` | `حسابي` |
| `library` | `/library` | `كورساتي` |
| `path` | `/path` | `مساري` |
| `results` | `/results` | `نتائجي` |
| `foundations` | `/foundations` | `دروس التأسيس` |
| `store` | `/store` | `قسم الكتب` |
| `orders` | `/store/orders` | `طلبات الكتب` |
| `playground` | `/playground` | `تجربة الكود` |
| `profile` | `/profile` | `بياناتي` |
| `devices` | `/settings/devices` | `أجهزتي` |
| `login` | `/login` | `تسجيل الدخول` |
| `register` | `/register` | `حساب جديد` |

Plus `course:<slug>` → `/courses/<slug>` with the course's own title as the label (clipped to 40
chars + `…`). `books`/`store` are the same shop and `essentials`/`foundations` the same lessons —
the public one for signed-out readers, the in-app one for signed-in.

### 11.7 What the assistant is allowed to know

* The written corpus (`copy.assistant.knowledge`, 24 entries + the script bodies).
* The **published** catalog only (`CatalogService.list()`).
* Live prices from `books` / `courses` rows, ≤60 s old, or nothing at all.
* **The asking student's own studying**, rendered as a `# THIS STUDENT` text block built by
  `AssistantStudentService.contextFor(userId)` from `DashboardService.forUser(userId)`:
  `كورساته:` + up to 8 lines `- {title}: خلّص {done} من {total} درس ({percent}%)` (+ ` — الكورس مقفول مؤقتاً`
  when unpublished), `آخر درس وقف عنده: {lesson} (في {course})`, `آخر درجاته:` + up to 5 lines
  `- {quiz}: {percent}%`. **No phone, no email, no governorate, no guardian number, no per-question
  breakdown, no attempt ids.** There are **no tools and no ids** — a jailbreak returns nothing
  because nothing else is in the process.
* It is instructed to **never** answer a quiz/exam question in any form, never invent a price or a
  date, never claim to be أيمن, and to answer only in Egyptian colloquial Arabic with no markdown.

---

## 12. Every Arabic string in the chat UI, verbatim

Source: `packages/contracts/src/copy/ar.ts` (the `assistant` block starts at line 3104) and
`packages/contracts/src/copy/admin.ts`. Reproduce these **byte for byte**.
`{n}`, `{name}`, `{date}` are placeholders substituted by `formatCopy`.

### 12.1 Launcher and panel chrome — `copy.assistant.*`

| Key | Arabic | Where |
|---|---|---|
| `open` | `فتح المساعد` | `aria-label` on the launcher; also the visible pill label on ≥sm |
| `openWithReply` | `فتح المساعد — فيه رد جديد` | launcher label when `unread > 0` |
| `close` | `قفل المساعد` | close button |
| `title` | `مساعد المنصة` | panel header title; also the dialog's accessible name |
| `subtitle` | `إجابات سريعة، ولو مالقيتش اللي بتدوّر عليه بوصّلك لأيمن.` | panel header subtitle |
| `whatsapp.channel` | `قناة الواتساب` | footer link |
| `whatsapp.chat` | `التواصل على واتساب` | footer link |
| `contact.lead` | `محتاج حد يرد بنفسه؟` | (footer lead, currently unused in the one-screen panel) |
| `contact.ayman` | `أكلّم م. أيمن` | footer button when there is **no** thread |
| `youPicked` | `الاختيار` | transcript label for what the visitor pressed |

### 12.2 The open chat — `copy.assistant.ai.*`

| Key | Arabic |
|---|---|
| `lead` | `اسأل أي حاجة عن المنصة أو عن المادة، بالعامية عادي.` |
| `starters[0]` | `الكورسات المفتوحة دلوقتي إيه؟` |
| `starters[1]` | `إزاي أشترك في كورس؟` |
| `starters[2]` | `الامتحانات شكلها إيه؟` |
| `starters[3]` | `يعني إيه متغيّر في البرمجة؟` |
| `placeholder` | `سؤالك هنا…` |
| `send` | `إرسال` |
| `stop` | `إيقاف` |
| `thinking` | `بيفكّر…` |
| `you` | `إنت` |
| `bot` | `مساعد المنصة` |
| `clear` | `محادثة جديدة` |
| `disclaimer` | `ردود آلية من كلام المنصة نفسها. ولو مش كفاية، م. أيمن تحت.` |
| `unknown` | `السؤال ده مش لاقي ليه إجابة مظبوطة عندي، ومش عايز أخمّن.` |
| `refused` | `ده مش حاجة أقدر أساعد فيها. أنا هنا للمنصة وللمادة نفسها.` |
| `duringExam` | `المساعد مقفول أثناء الامتحان — ده جزء من إن الدرجة تبقى بجد. أول ما الامتحان يتسلّم، أنا هنا.` |
| `failed` | `حصلت مشكلة في الرد. تحاول تاني بعد شوية.` |
| `tooMany` | `أسئلة كتير في وقت قصير. شوية ونكمّل.` |
| `escalateTitle` | `السؤال ده محتاج أيمن` |
| `escalateBody` | `أوصّله ليه بالسؤال زي ما هو، والرد بيرجع هنا ومعاه إشعار.` |
| `escalateAction` | `إرسال السؤال لأيمن` |
| `handoffSending` | `بنوصّل السؤال لم. أيمن…` |
| `handoffSentTitle` | `الرسالة راحت لم. أيمن` |
| `handoffSentBody` | `هو اللي هيرد، والرد بيوصل هنا ومعاه إشعار. والصفحة ممكن تتقفل عادي.` |
| `handoffOpenThread` | `فتح المحادثة` |
| `handoffIdentityTitle` | `ناقص حاجة واحدة` |
| `handoffIdentityBody` | `الاسم ورقم الواتساب، عشان رد م. أيمن يلاقي طريقه.` |
| `handoffFailedTitle` | `مقدرناش نوصّل السؤال` |
| `handoffFailedBody` | `السؤال لسه موجود. نجرب نبعته من هنا تاني.` |
| `actionsLabel` | `روابط تخص السؤال ده` |
| `actions.*` | see the table in §11.6 |

### 12.3 The handoff form — `copy.assistant.escalate.*`

| Key | Arabic |
|---|---|
| `title` | `إرسال لأيمن` |
| `lead` (signed in) | `سؤالك هنا، والرد هيوصلك في نفس المكان ومعاه إشعار.` |
| `leadGuest` | `سؤالك هنا، ومعاه اسمك ورقم الواتساب. الرد هيوصلك هنا، وعلى رقمك.` |
| `pathLabel` | `وصل لهنا من:` |
| `name` | `اسمك` |
| `namePlaceholder` | `الاسم بالكامل` |
| `phone` | `رقم الواتساب` |
| `phonePlaceholder` | `01xxxxxxxxx` |
| `message` | `سؤالك` |
| `messagePlaceholder` | `سؤالك هنا…` |
| `send` | `إرسال` |
| `sending` | `بنبعت…` |
| `sentTitle` | `وصلت لأيمن` |
| `sentBody` | `هيرد من هنا. والصفحة ممكن تتقفل عادي — الرد مش هيضيع.` |
| `transcriptNote` | `محادثتك مع المساعد رايحة مع السؤال، عشان م. أيمن يشوفه في سياقه.` |
| `failed` | `مقدرناش نبعت رسالتك. نحاول تاني.` |
| `tooMany` | `رسايل كتير في وقت قصير. شوية ونحاول تاني.` |

### 12.4 The student's thread with أيمن — `copy.assistant.thread.*`

| Key | Arabic |
|---|---|
| `title` | `محادثتك مع مهندس أيمن` |
| `you` | `إنت` |
| `ayman` | `مهندس أيمن` |
| `aymanAvatarAlt` | `م. أيمن أبو العلا` |
| `aymanRole` | `مدرّس المادة` |
| `waiting` | `مستنيين رد أيمن.` |
| `whatsappCard.title` | `قناة الواتساب` |
| `whatsappCard.lead` | `كل الملفات والمراجعات` |
| `whatsappCard.action` | `فتح القناة` |
| `attachmentDownload` | `تحميل` |
| `attachmentImageAlt` | `ملف مرفق` |
| `replyPlaceholder` | `ردّك هنا…` |
| `send` | `إرسال` |
| `closed` | `المحادثة دي اتقفلت. ولو فيه حاجة تانية، نبدأ من الأول.` |
| `failed` | `مقدرناش نجيب المحادثة. تحديث الصفحة ونحاول تاني.` |

Related, from other blocks:
`copy.notifications.loading` = `بنجيب…` (shown while the thread is being fetched);
`copy.notifications.conversationReply` = `مهندس أيمن ردّ على سؤالك`;
`copy.dashboard.instructorMessage.eyebrow` = `رسالة جديدة`, `.role` = `م. أيمن أبو العلا`,
`.open` = `اقرأها وردّ`, `.more` = `وكمان {n} رسالة`.

### 12.5 Node bodies — `copy.assistant.script.*` (the AI corpus)

Keys **are** the node ids of §10.

| id | Arabic |
|---|---|
| `root` | `أهلاً وسهلاً! أنا هنا أجاوب على أكتر الأسئلة اللي بتتسأل. دي أكترهم:` |
| `courses` | `تمام. السؤال عن الكورسات في إيه بالظبط؟` |
| `coursesList` | `دي الكورسات المفتوحة دلوقتي:` |
| `courseInside` | `كل كورس متقسّم وحدات، وكل وحدة فيها دروس فيديو ومعاها ملخّص مكتوب وملفات للتحميل. بعد كل درس فيه كويز قصير يقيس فهمك، وآخر كل وحدة امتحان شامل.` |
| `courseStart` | `الكورس مالوش ميعاد بداية ثابت — أول ما الاشتراك يتم بيتفتح على طول، والمشي فيه بالسرعة اللي تريّح. اللي بيكون بميعاد هو المراجعات النهائية قبل الامتحانات، ودي بتتعلن على الصفحة الرئيسية وعلى واتساب.` |
| `join` | `الأسئلة اللي بتتسأل هنا:` |
| `joinAccount` | `دوسة على إنشاء حساب، وبعدها الاسم والرقم والمحافظة والسنة الدراسية. الخطوة دي بتاخد دقيقة، وبعدها المنصة بتعرف تورّي مواد سنتك بالظبط بدل الدوران.` |
| `joinEnroll` | `الاشتراك بيتم من صفحة الكورس نفسه: دوسة على «اشترك دلوقتي»، وبعدها اختيار الباقة — شهر، تلات شهور، سنة كاملة، أو ترم — وكل باقة سعرها مكتوب على الكارت بتاعها. الخطوة اللي بعدها الدفع.` |
| `joinPay` | `الدفع إنستاباي. رقم التحويل بيبان في نفس الشاشة ومعاه زرار نسخ. وبعد التحويل بيتبعت حاجتين: رقم الموبايل اللي التحويل اتبعت منه، وصورة سكرين شوت من إنستاباي بتوضّح المبلغ والتاريخ. وآخر حاجة دوسة على «إرسال الطلب».` |
| `joinReview` | `الطلب بيروح لأيمن، وهو بيراجع الصورة والرقم على كشف إنستاباي بإيده — مفيش تفعيل تلقائي هنا. وطول ما الطلب في المراجعة بيبان على صفحة الكورس إنه في مراجعة. أول ما يتقبل، الكورس بيتفتح على طول ويوصل إشعار. ولو طوّلت أكتر من المعقول، رسالة لأيمن وهو يراجعه.` |
| `joinPrice` | `الأسعار والعروض بتتغيّر من فترة للتانية، فمش عايز أقولك رقم قديم. أحسن حاجة إني أوصّلك لأيمن يقولك السعر الحالي بالظبط.` |
| `books` | `الكتب الورقية بتتشحن لحد باب البيت. السؤال في إيه؟` |
| `bookOrderHow` | `من صفحة «الكتب»: اختيار الكتب المطلوبة وتحديد العدد، وبعدين «كمّل الطلب» — بيانات الاستلام (الاسم، الرقم، المحافظة، والعنوان)، وبعدها نفس خطوة إنستاباي: تحويل المبلغ، ورقم الموبايل اللي التحويل اتبعت منه، وصورة التحويل. والشحن بيتحسب مرة واحدة على الطلب كله مهما كان عدد الكتب.` |
| `bookNotArrived` | `صفحة «طلبات الكتب» بتوري كل طلب هو فين بالظبط — لسه مكمّلش، ولا بنجهّزه، ولا في الطريق، ولا وصل — ودي أدق حاجة عن الطلب ده، لأنها بتتحدّث مع كل خطوة. ونقولها بصراحة: الطلب على الكتب كتير جداً دلوقتي، فساعات بيتأخر يوم أو اتنين عن المتوقع — وده عادي وملوش لزوم قلق. ولو الصفحة بتقول إنه في الطريق وعدّت الأيام، أوصّل السؤال لأيمن على طول.` |
| `bookWhenExactly` | `مش هقول يوم بالظبط، عشان التوصيل مع شركة شحن ومش هينفع أضمن ميعاد. اللي مضمون إن حد بيتواصل قبل التوصيل بيوم، فمحدش محتاج يقعد مستني ورا الباب. ولو عدّت الأيام ومحدش اتواصل، أوصّل السؤال لأيمن على طول.` |
| `study` | `السؤال في إيه؟` |
| `studyQuizzes` | `الكويزات القصيرة اختيار من متعدد وصح وغلط، وبتتصحّح لحظياً وتشوف نتيجتك على طول. الامتحانات الشاملة ممكن يكون فيها أسئلة مقالية بيصحّحها أيمن بنفسه، ودي بتاخد وقت — وهيوصلك إشعار أول ما تتصحّح.` |
| `studyRetake` | `كل كويز ليه محاولة واحدة بس، ودرجتها بتتسجّل وبتفضل. الاستثناء الوحيد هو الامتحان النهائي بتاع الكورس: بعده فيه امتحان تحسين مرة واحدة بأسئلة مختلفة، وأعلى درجة في الاتنين هي اللي بتتحسب — يعني التحسين مش بيضيّع درجة. ولو حصلت مشكلة تقنية في نص الامتحان، رسالة لأيمن.` |
| `studyProgress` | `كل درس بيخلص بيتسجّل لوحده من غير أي حاجة، ولوحتك بتوريك نسبة كل كورس وآخر درس اتفتح عشان الكمالة تبقى من نفس المكان.` |
| `account` | `المشكلة في إيه؟` |
| `accountPassword` | `مفيش لينك «نسيت كلمة السر» في المنصة، لأن المنصة مابتبعتش إيميلات ولا رسايل. والطريق اللي بيشتغل فعلاً خطوتين: رسالة لأيمن من هنا أو على الواتساب فيها الاسم ورقم الموبايل بتاع الحساب، وهو بيظبّط كلمة السر ويبعتها — وبعدها الدخول عادي من صفحة الدخول بالرقم وكلمة السر الجديدة. وفيه حالة واحدة مالهاش دعوة بالكلام ده كله: الحساب اللي اتعمل بجوجل مافيهوش كلمة سر من الأساس، والدخول بيتم من زرار «المتابعة بحساب جوجل» على نفس الصفحة.` |
| `accountProfile` | `من صفحة حسابي بيتعدّل الاسم والرقم والمحافظة والسنة الدراسية. وللعلم: تغيير السنة بيغيّر المواد اللي المنصة بتعرضها.` |
| `accountVideo` | `قفل الصفحة وفتحها تاني الأول — ده بيحل أغلب الحالات. ولو الفيديو لسه واقف، متصفح تاني أو شبكة تانية. ولو المشكلة مستمرة، أنا أوصّلك لأيمن ومعاه اسم الدرس.` |

### 12.6 Choice labels — `copy.assistant.choices.*` (used for breadcrumbs)

```
back: 'رجوع'                       talk: 'أكلّم أيمن'
courses: 'الكورسات والمحتوى'        join: 'الاشتراك والحساب'
books: 'الكتب والتوصيل'             study: 'المذاكرة والامتحانات'
account: 'مشكلة في حسابي'
coursesAvailable: 'إيه المتاح دلوقتي؟'   courseInside: 'الكورس فيه إيه؟'
courseStart: 'هنبدأ إمتى؟'               browseCourses: 'الكورسات المتاحة'
essentials: 'أساسيات المادة'
joinAccount: 'إزاي أعمل حساب؟'           joinEnroll: 'إزاي أشترك في كورس؟'
joinPrice: 'الكورس بكام؟'                joinPay: 'أدفع إزاي؟'
joinReview: 'وبعد ما أبعت الطلب؟'        register: 'إنشاء حساب'
bookOrderHow: 'إزاي أطلب الكتاب؟'        bookNotArrived: 'طلبت كتاب ولسه مجاش'
bookWhenExactly: 'هيوصل إمتى بالظبط؟'    browseBooks: 'صفحة الكتب'
myOrders: 'طلبات الكتب'
studyQuizzes: 'الامتحانات شكلها إيه؟'    studyRetake: 'أقدر أعيد الامتحان؟'
studyProgress: 'تقدّمي بيتحسب إزاي؟'      dashboard: 'لوحتي'
accountPassword: 'نسيت كلمة السر'        accountProfile: 'أعدّل بياناتي'
accountVideo: 'الفيديو مش شغّال'          login: 'صفحة الدخول'
profile: 'صفحة حسابي'
```

### 12.7 The written corpus — `copy.assistant.knowledge[]`

24 `{ id, q, a }` entries. These are the paragraphs `matchKnowledge` returns verbatim when no
model is configured, and the grounding the model rephrases otherwise. Reproduce the ids exactly if
you cache the corpus offline.

| id | q | a (first clause — full text in `ar.ts:3290+`) |
|---|---|---|
| `enter` | `إزاي أدخل المنصة وأعمل حساب؟` | `من زرار «حساب جديد»: الاسم، ورقم الموبايل، وكلمة سر — والإيميل اختياري…` |
| `loginHow` | `عندي حساب — أدخل إزاي؟` | `من صفحة الدخول: رقم الموبايل (أو الإيميل لو كان مضاف) وكلمة السر…` |
| `loginIdentity` | `الدخول بالإيميل ولا بالرقم؟` | `رقم الموبايل هو أساس الحساب…` |
| `emailNone` | `مش عندي إيميل — أقدر أسجّل؟` | `أيوة، عادي خالص. الإيميل اختياري بالكامل…` |
| `passwordLost` | `نسيت كلمة السر` | `مفيش لينك استرجاع، لأن المنصة مابتبعتش إيميلات ولا رسايل…` |
| `profileEdit` | `أعدّل بياناتي` | `من صفحة «بروفايلي» بيتعدّل الاسم والرقم والمحافظة…` |
| `devices` | `حسابي مفتوح على جهاز مش بتاعي` | `صفحة «أجهزتي» بتوري كل الأجهزة…` |
| `banned` | `حسابي موقوف` | `الإيقاف بيقفل الدخول، وصفحة الدخول بتوري السبب…` |
| `parentPhone` | `ليه بتطلبوا رقم ولي الأمر؟` | `عشان نقدر نتواصل مع ولي الأمر عن المستوى لو احتاج…` |
| `privacy` | `بياناتي بتروح فين؟` | `بياناتك محفوظة عند أيمن أبو العلا وبس…` |
| `coursesWhere` | `الكورسات فين؟` | `صفحة «الكورسات» فيها كل الكورسات المنشورة…` |
| `startWhere` | `أبدأ منين؟` | `من صفحة «حسابي» — فيها كارت «نكمّل من مكانك»…` |
| `essentials` | `التأسيس ده إيه؟` | `مسار قصير قبل أول سطر كود…` |
| `yearMatch` | `الكورس ده لسنتي ولا لأ؟` | `كل كورس متعلّم بصفّه ومساره…` |
| `stream` | `عام ولا لغات؟` | `المنصة بتفرّق بين مدارس عام ومدارس لغات…` |
| `lessonLocked` | `الدرس مش بيفتح` | `الدروس كلها مفتوحة جوه الكورس — مفيش درس بيستنى اللي قبله…` |
| `downloads` | `الملخصات والملفات فين؟` | `مع الدرس نفسه — كل درس معاه ملخّص مكتوب وملفات للتحميل…` |
| `playground` | `تجربة الكود دي إيه؟` | `صفحة «تجربة الكود»: كود بيتكتب ويشتغل على طول في المتصفح…` |
| `resultsWhere` | `نتايجي فين؟` | `صفحة «نتائجي» فيها كل امتحان اتدخل…` |
| `gradeLate` | `امتحنت والدرجة لسه ماظهرتش` | `الأسئلة الاختيارية بتتصحّح لحظيًا…` |
| `examProblem` | `حصلت مشكلة في نص الامتحان` | `ده اللي محتاج أيمن نفسه…` |
| `notifications` | `الإشعارات بتوصل إمتى؟` | `صفحة «الإشعارات» فيها كل حاجة حصلت في الحساب…` |
| `whatsappChannel` | `قناة الواتساب فيها إيه؟` | `الملفات والمراجعات…` |
| `install` | `فيه تطبيق للموبايل؟` | `مفيش تطبيق على المتاجر — المنصة بتشتغل من المتصفح عادي…` ⚠️ **this answer becomes false the day the app ships — update it** |
| `slow` | `الصفحة بطيئة أو مش بتفتح` | `قفل الصفحة وفتحها تاني الأول…` |
| `whoIsAyman` | `مين أيمن أبو العلا؟` | `المهندس أيمن أبو العلا — مدرّس البرمجة وعلوم الحاسب للمرحلة الثانوية…` |

### 12.8 Admin inbox — `copy.assistant.inbox.*`

```
eyebrow: 'الوارد'                 title: 'صندوق الوارد'
subtitle: 'أسئلة الطلبة والزوار — بس اللي حد كتبها بإيده.'
empty: 'مفيش رسايل جديدة.'
emptyHint: 'كل الرسايل مقروءة. تاب «الكل» فيه المحادثات القديمة.'
systemNote: 'الرسايل اللي المنصة بتبعتها أوتوماتيك مش هنا —'
systemLink: 'رسايلي للطلبة'
previewYou: 'إنت:'                outreachBadge: 'رسالة منك'
repliedBadge: 'وصل رد'
filterLabel: 'اعرض'               sortLabel: 'الترتيب'
sortNewest: 'الأحدث حركة'          sortOldest: 'الأقدم حركة'
filterUnread: 'غير مقروءة'         filterOpen: 'محتاجة رد'
filterAnswered: 'اتردّ عليها'       filterClosed: 'مقفولة'      filterAll: 'الكل'
colWho: 'مين'  colAsked: 'السؤال'  colWhen: 'إمتى'  colStatus: 'الحالة'
guestBadge: 'زائر'                studentBadge: 'طالب'
subscribedBadge: 'مشترك'          notSubscribedBadge: 'مش مشترك'
subscribedUntil: 'لحد {date}'      subscribedNoExpiry: 'مبينتهيش'
subscribedByHand: 'بالإيد'
unanswered: 'محتاجة رد'
reactLabel: 'ردّ بإيموجي'          reactClose: 'قفل الإيموجي'
threadTitle: 'المحادثة'
transcriptTitle: 'نص المحادثة مع المساعد الآلي'
transcriptNote: 'ده اللي اتقال قبل ما السؤال يتحوّل — مش كلام مكتوب لك.'
transcriptStudent: 'الطالب'        transcriptBot: 'المساعد'
transcriptTrimmed: 'أول المحادثة اتشال عشان الطول — ده آخر جزء منها.'
pathLabel: 'وصل لهنا من:'
contactLabel: 'وسيلة التواصل'      noPhone: 'مفيش رقم'
whatsapp: 'مراسلته على واتساب'      openProfile: 'فتح الملف الكامل'
replyLabel: 'ردّك'                 replyPlaceholder: 'الرد على الطالب…'
reply: 'إرسال الرد'                replying: 'بنبعت…'
replyFailed: 'مقدرناش نبعت الرد. نحاول تاني.'
attach: 'إرفاق ملف'
attachHint: 'صورة (٨ ميجا) أو PDF / PowerPoint / Word / Excel (٩٥ ميجا)'
attaching: 'بنرفع…'                attachRemove: 'إزالة الملف'
attachTooLarge: 'الملف كبير أوي.'
attachBadType: 'نوع الملف ده مش مدعوم.'
attachFailed: 'مقدرناش نرفع الملف. نحاول تاني.'
voiceRecord: 'سجّل رسالة صوتية'     voiceStop: 'ابعت التسجيل'
voiceCancel: 'إلغاء التسجيل'
voiceDenied: 'المتصفح مسمحش بالمايك'
voiceUnsupported: 'المتصفح ده مابيسجلش صوت'
voiceUploading: 'بيرفع التسجيل…'
messageEdit: 'تعديل'               messageDelete: 'مسح'
messageDeleteConfirm: 'تمسح الرسالة دي؟ مش هترجع.'
messageEditSave: 'حفظ'             messageEditCancel: 'إلغاء'
messageEdited: 'معدّلة'             messageActionFailed: 'مانفعش'
attachmentImageAlt: 'الملف المرفق'  attachmentDownload: 'تحميل'
close: 'قفل المحادثة'              closing: 'بنقفل…'
reopen: 'افتحها تاني'              closed: 'المحادثة مقفولة.'
statusOpen: 'مفتوحة'   statusAnswered: 'اتردّ عليها'   statusClosed: 'مقفولة'
badgeLabel: '{n} رسالة جديدة'
alertTitle: 'رسالة جديدة في صندوق الوارد'
alertBodyOne: 'في رسالة جديدة مش مقروءة.'
alertBodyMany: 'في {n} رسايل جديدة مش مقروءة.'
alertOpen: 'فتح الوارد'
alertsEnable: 'تفعيل تنبيهات الرسايل'
alertsEnabled: 'التنبيهات شغالة'
alertsBlocked: 'المتصفح مانع التنبيهات — فعّلها من إعدادات الموقع'
```

`copy.admin.inboxTabs`: `ariaLabel: 'أقسام صندوق الوارد'`, `tabConversations: 'المحادثات'`,
`tabQuestions: 'أسئلة الطلبة'`.

`copy.admin.assistantQuestions` (the AI question log): `eyebrow: 'المساعد'`,
`title: 'أسئلة الطلبة'`,
`lead: 'كل سؤال اتكتب في الشات، والرد اللي راح عليه. اللي عليه علامة معناه إن المساعد وقف قدامه — ودي أهم صف في الصفحة.'`,
`retention: 'الأسئلة بتتشال لوحدها بعد ٩٠ يوم.'`, `empty: 'لسه محدش سأل حاجة.'`,
`emptyFiltered: 'مفيش سؤال وقف قدام المساعد في الفترة دي.'`, `filterAll: 'كل الأسئلة'`,
`filterEscalated: 'اللي وقف قدامه'`, `searchLabel: 'دوّر في الأسئلة'`,
`searchPlaceholder: 'دوّر في الأسئلة…'`, `searchSubmit: 'دوّر'`,
`answeredByAssistant: 'رد المساعد'`, `question: 'السؤال'`, `answer: 'الرد'`,
`student: 'الطالب'`, `askedAt: 'إمتى'`, `visitor: 'زائر من غير حساب'`,
`escalated: 'محتاج أيمن'`, `byModel: 'رد بالذكاء الاصطناعي'`, `byScript: 'من الكلام المكتوب'`,
`needsAttention: 'لسه محدش كلّمه'`, `hasConversation: 'اتحول لمحادثة'`,
`guestUnreachable: 'زائر — مفيش طريقة نلاقيه تاني'`, `openConversation: 'افتح المحادثة'`,
`detailTitle: 'السؤال ده'`, `siblingsTitle: 'باقي اللي سأله في نفس الوقت تقريبًا'`,
`siblingsEmpty: 'ده السؤال الوحيد منه في الفترة دي.'`,
`siblingsGuestNote: 'زائر من غير حساب — مينفعش نربط أسئلته ببعض.'`.

---

## 13. Screen-by-screen UI structure

### 13.1 The launcher

Two variants in the web app; on mobile pick one.

* **floating** (public/marketing/auth screens): a fixed pill, bottom corner, `z-index: 70`,
  height 56, amber background (`--accent`), ink `#1A1206`. Shows a robot mark + the label
  `فتح المساعد` (label hidden below the `sm` breakpoint). It is **not draggable** — that was
  built and then explicitly removed («خليه على الشمال ميتحركش بقى»).
* **docked** (signed-in shell): a 36×36 round button in the top bar beside the notification bell,
  amber tint, the only coloured control in that row.
* **Unread dot**: when `unread > 0` and the panel is closed, a 10 px red dot
  (`var(--err)`) with a 2 px ring, positioned top-end of the icon. `aria-hidden` — the count lives
  in the accessible name (`فتح المساعد — فيه رد جديد`).
* **Not shown at all** on: `/admin*`, `/onboarding*`, and a live graded attempt
  (`^/quizzes/[^/]+/attempt/[^/]+$`) — but **is** shown on `.../review` pages.

### 13.2 The panel — four modes

`Mode = 'chat' | 'escalate' | 'sent' | 'thread'`. The panel is a rounded card
(`rounded-2xl`, 1px subtle border, surface-1, big shadow) with:

**Header** (always): amber band, ink `#1A1206`; 36 px robot tile, then `مساعد المنصة` (semibold,
text-sm) over `إجابات سريعة، ولو مالقيتش اللي بتدوّر عليه بوصّلك لأيمن.` (text-xs, 80 % opacity),
then a close button labelled `قفل المساعد`.

**Body** (one of the four modes below).

**Footer** — rendered **only in `chat` mode**: one pill button plus the WhatsApp links.
The pill says `محادثتك مع مهندس أيمن` when a thread exists (`hasThread`), else `أكلّم م. أيمن`;
it carries its own small red dot when `hasThread && unread > 0`. The WhatsApp row renders the
channel link first (`قناة الواتساب`, WhatsApp green `#25D366` icon) then the chat link
(`التواصل على واتساب`); **either or both may be absent** if the admin has not configured them —
render nothing rather than a placeholder URL. `wa.me` links strip the leading `+` from E.164.

#### Mode `chat` — the AI conversation

* **Empty state** (`messages.length === 0`): centred column — a 64 px robot tile, then
  `اسأل أي حاجة عن المنصة أو عن المادة، بالعامية عادي.` (max-width ~16 rem), then the four
  starter chips as full-width bordered rows with an "enter" glyph at the end, each fading up with
  a 40 ms stagger, then the disclaimer
  `ردود آلية من كلام المنصة نفسها. ولو مش كفاية، م. أيمن تحت.` in the faintest tone.
  Tapping a starter sends it immediately.
* **Transcript**: an ordered list, gap 14, scrolls; auto-scroll follows the **total character
  count**, not the message count, so the view follows a streaming answer.
  * Student turn: aligned to the **start** (right in RTL), label row `👤 إنت`, bubble
    `rounded-2xl` with `rounded-ss-md`, bordered, surface-2.
  * Assistant turn: aligned to the **end**, label row `🤖 مساعد المنصة`, bubble with
    `rounded-se-md` and an **accent WASH** (`color-mix(accent 9%, transparent)` + `accent/20`
    border) — deliberately *not* the solid amber أيمن's own replies use.
  * Body is `whitespace-pre-wrap`, `wrap-anywhere`, **a plain text node** — no markdown, no HTML,
    no link-splitting on this side.
  * While streaming, a blinking caret block is appended inside the bubble.
  * An assistant bubble with empty text renders **nothing** (the thinking line speaks for it).
* **Thinking indicator**: shown only while `waiting` (request open, zero tokens back):
  robot tile + three pulsing dots + `بيفكّر…`, `role="status"`.
* **Answer actions**: up to 3 pills under the answer, only once streaming has stopped, in a
  `<nav aria-label="روابط تخص السؤال ده">`, right-aligned, each an internal link with the label
  and a leading arrow that points **left** (forward in RTL). No `target="_blank"`.
* **Error line**: `role="alert"`, error colour, `أسئلة كتير في وقت قصير. شوية ونكمّل.` for
  `tooMany`, `حصلت مشكلة في الرد. تحاول تاني بعد شوية.` for everything else.
* **Handoff card**: rendered under the **latest** answer only, when `escalate && !streaming &&
  handoff !== 'idle'`, `role="status"`, amber-tinted rounded box:
  * `sending` → spinner + `بنوصّل السؤال لم. أيمن…`
  * `sent` → ✓ + `الرسالة راحت لم. أيمن` / `هو اللي هيرد، والرد بيوصل هنا ومعاه إشعار. والصفحة ممكن تتقفل عادي.` / a text button `فتح المحادثة`
  * `needsIdentity` → `ناقص حاجة واحدة` / `الاسم ورقم الواتساب، عشان رد م. أيمن يلاقي طريقه.` / amber button `إرسال السؤال لأيمن` → opens the handoff form
  * `failed` → `مقدرناش نوصّل السؤال` / `السؤال لسه موجود. نجرب نبعته من هنا تاني.` / same button
  * `idle` → renders nothing.
* **Composer**: a `محادثة جديدة` reset link above it (only when there is something to clear —
  it also resets the handoff state), then a 1-row auto-growing textarea
  (`min-h 2.75rem`, `max-h 6rem`, `maxLength = 500`, placeholder and aria-label `سؤالك هنا…`) and
  one 44 px square button: **send** (amber, `aria-label` `إرسال`, disabled while the draft is
  empty) or, while busy, **stop** (neutral square icon, `aria-label` `إيقاف`).
  Enter sends, Shift+Enter newlines.
* **Critical:** when the panel switches away from `chat`, the chat is **hidden, not unmounted** —
  its transcript and any in-flight answer must survive. In Flutter: keep the state object alive
  (an `IndexedStack`/`Offstage`, or state held above the screen), never rebuild it.

#### Mode `escalate` — the handoff form

Scrollable column, padding 16, gap 14:

1. a back button `رجوع` (returns to `chat`);
2. breadcrumbs box, only if `entryPath` resolves to any labels: `وصل لهنا من:` then the labels
   joined with `' ← '`;
3. lead paragraph — `سؤالك هنا، والرد هيوصلك في نفس المكان ومعاه إشعار.` when signed in, else
   `سؤالك هنا، ومعاه اسمك ورقم الواتساب. الرد هيوصلك هنا، وعلى رقمك.`;
4. **guests only**: `اسمك` (placeholder `الاسم بالكامل`, required, maxLength 120) and
   `رقم الواتساب` (placeholder `01xxxxxxxxx`, `type=tel`, required);
5. `سؤالك` textarea, required, 4 rows, `maxLength = 2000`, placeholder `سؤالك هنا…`,
   pre-filled with the question that triggered the handoff (a starting value, editable);
6. `محادثتك مع المساعد رايحة مع السؤال، عشان م. أيمن يشوفه في سياقه.` — **only when a transcript
   is actually travelling**;
7. error line (`role="alert"`): `رسايل كتير في وقت قصير. شوية ونحاول تاني.` on 429, else
   `مقدرناش نبعت رسالتك. نحاول تاني.`;
8. full-width submit: `إرسال`, or `بنبعت…` while pending.

On success → mode `sent`, store the returned thread, mark the handoff `sent`.

#### Mode `sent` — confirmation

Centred column, ✓ in accent, `وصلت لأيمن` (semibold), then
`هيرد من هنا. والصفحة ممكن تتقفل عادي — الرد مش هيضيع.`, then — if the thread object is in hand —
a text button `محادثتك مع مهندس أيمن` that switches to `thread`.

#### Mode `thread` — the conversation with أيمن

* **Loading**: one line, `role="status"`, spinner + `بنجيب…`. **Not** a skeleton chat.
* **Error**: one line, `role="alert"`, `مقدرناش نجيب المحادثة. تحديث الصفحة ونحاول تاني.`
  (deliberately **not** retried automatically).
* **Messages**, oldest at the top, gap 14, padding 16, scrolled to the bottom on load and on every
  new message (`block: 'nearest'` — never scroll the page behind it):
  * Student message: aligned start, label `إنت`, bubble `rounded-ss-md`, bordered, surface-2.
  * أيمن's message: aligned **end**, label row = `AymanAvatar` (his photo, 28 px, circular, amber
    ring; falls back to a monogram `أ`; alt `م. أيمن أبو العلا`) + `مهندس أيمن`,
    bubble `rounded-se-md`, **solid amber background with `#1A1206` ink**.
  * Bubble body: `whitespace-pre-wrap`, `wrap-anywhere`, **text nodes and `<a>` elements only**.
    Link handling (`MessageBody`): split on `https?://[^\s<>()[\]{}"'«»]+[^\s…]` (bare `www.` is
    **not** linkified), render each URL `dir="ltr"` and break-all. A line that is **nothing but** a
    WhatsApp URL (`chat.whatsapp.com`, `wa.me`, `whatsapp.com`, `www.whatsapp.com`) is replaced
    entirely by a **card**: a near-white sheet (`#FFFDF8`), a green disc (`#25D366`) with the
    WhatsApp glyph, title `قناة الواتساب`, lead `كل الملفات والمراجعات`, and a full-width green
    button `فتح القناة` with a left arrow. Max width 17.5 rem.
  * **Attachment**, if present, under the body (see §13.4).
  * **Reaction**, if `adminReaction`: a small pill overlapping the bubble's bottom edge (start side
    for a student message, end side for أيمن's), surface-1, bordered, showing the emoji.
    **Read-only on the student side — the student cannot react.**
  * Timestamp under the bubble: `Intl.DateTimeFormat('ar-EG-u-nu-latn', {hour:'2-digit',
    minute:'2-digit', day:'numeric', month:'short'})` — Arabic locale, **Western digits**.
* **Composer**, unless `status === 'closed'`: a 2-row textarea, `maxLength = 2000`, placeholder and
  aria-label `ردّك هنا…`, plus a 44 px amber send button (`aria-label` `إرسال`, disabled while
  pending or the draft is blank). On failure show `مقدرناش نبعت رسالتك. نحاول تاني.`
  (`copy.assistant.escalate.failed`) in the error colour above the row.
* **Closed**: replace the composer with a centred line
  `المحادثة دي اتقفلت. ولو فيه حاجة تانية، نبدأ من الأول.`
* On mount, if `unreadForVisitor > 0`, fire `POST …/:id/read` and locally zero the count.

### 13.3 Dashboard card «رسالة من م. أيمن»

Renders **only** while `summary.latestFromAyman !== null`; occupies nothing otherwise (no
placeholder, no reserved space). Amber-tinted section, `AymanAvatar` at 44 px, eyebrow
`رسالة جديدة`, name `م. أيمن أبو العلا`, then the teaser rendered `whitespace-pre-wrap` clamped to
6 lines, then an amber button `اقرأها وردّ` with a left arrow that opens the panel **directly onto
the thread** (not onto the handoff form).

### 13.4 Attachment rendering (shared, both sides)

`apps/web/components/assistant/message-attachment.tsx`.

* `kind === 'voice'` → a **native audio player** (`preload="metadata"`), max-width 16 rem, and
  under it the duration as `m:ss` in Western digits (`Math.floor(s/60) + ':' + pad2(s%60)`), or
  nothing when `durationSeconds` is null. **No waveform anywhere.**
* `kind === 'image'` → the image inline, wrapped in a link to `path` (opens full size), rounded
  12 px, `max-height: 22rem`, `width: auto`, `object-fit: contain`, alt = `ملف مرفق` on the student
  side / `الملف المرفق` on the admin side. Use a plain image fetch, **not** an image CDN/optimizer —
  these bytes are private and `no-store`.
* anything else → a **file card**, the whole card being the download link to `downloadPath`:
  a document icon, the filename on one line **middle-truncated** to 28 chars keeping the extension
  (`المحاضرة الأولى — الوحدة الثالثة.pdf` → `المحاضرة الأولى — ال….pdf`), the size under it
  (`formatBytes`: binary steps, `B/KB/MB/GB`, one decimal below 10, none above — e.g. `9.7 MB`,
  `94 MB`), and a 44 px download glyph whose screen-reader name is `تحميل`.
  Minimum card width 16 rem so the filename does not wrap.
* Tone: `own` (on the amber bubble) uses `#1A1206`-derived borders/backgrounds; `other` uses the
  neutral tokens.

### 13.5 Admin: `/admin/inbox` list

Eyebrow `الوارد`, title `صندوق الوارد`, subtitle
`أسئلة الطلبة والزوار — بس اللي حد كتبها بإيده.`, then a one-line pointer
`الرسايل اللي المنصة بتبعتها أوتوماتيك مش هنا — رسايلي للطلبة` (link → `/admin/outreach`), then
the tabs `المحادثات` / `أسئلة الطلبة`, then two dropdowns: `اعرض` (the five filters) and
`الترتيب` (`الأحدث حركة` / `الأقدم حركة`).

**Empty state** (`rowCount === 0`): dashed box, `مفيش رسايل جديدة.` +
`كل الرسايل مقروءة. تاب «الكل» فيه المحادثات القديمة.`

**Row** (a card, border turns accent when `unreadForAdmin`): a 40 px glyph tile —
send icon for `origin === 'outreach'`, person icon for a guest, message icon for a student — then
the name (a link to `/admin/students/:userId` with a **dotted underline at rest** when `userId` is
non-null, plain text for a guest), a status chip, `رسالة منك` for outreach rows, `وصل رد` for an
answered outreach row, and `زائر`/`طالب`. Below: breadcrumbs (`وصل لهنا من: a ← b`), the preview
clamped to 2 lines prefixed with a muted `إنت:` when `previewAuthor === 'admin'`, and the guest
phone in mono with a phone glyph when present. On the trailing edge: the timestamp
(`Intl.DateTimeFormat('ar-EG-u-nu-latn', {dateStyle:'short', timeStyle:'short'})`) and an amber
button `المحادثة` that also stretches to claim the whole card as a tap target.

**Status chip** (`InboxStatusChip`): label is `محتاجة رد` when `unread && status === 'open'`, else
`مفتوحة` / `اتردّ عليها` / `مقفولة`. Tones: `open` = solid amber on `#1A1206`; `answered` = green
tint; `closed` = neutral outline.

### 13.6 Admin: `/admin/inbox/:id` thread

Back link `صندوق الوارد`. **Header card**: person tile, the name (linked for a student),
status chip, `زائر`/`طالب`, then **one badge per live course** (green, showing the course title,
with ` · بالإيد` appended when `source === 'admin'`; hover title `لحد {date}` or `مبينتهيش`), or
the single badge `مش مشترك` when the array is empty; nothing at all for a guest (`courses: null`).
Then a definition list: `وسيلة التواصل` → the phone in mono or `مفيش رقم`; `وصل لهنا من:` →
breadcrumbs. Then buttons: a WhatsApp-green `مراسلته على واتساب` (built with `waMeHref`, omitted
entirely when there is no number — never a bare `https://wa.me/`) and `فتح الملف الكامل`.

**Message list**: same bubble geometry as the student side but with the student's name as the
label on their messages. A body that parses as an **assistant transcript** is rendered instead as
a dashed-border **card**, not a bubble: header `نص المحادثة مع المساعد الآلي` +
`ده اللي اتقال قبل ما السؤال يتحوّل — مش كلام مكتوب لك.`, an optional line
`أول المحادثة اتشال عشان الطول — ده آخر جزء منها.` when trimmed, then a definition list of turns
labelled `الطالب` / `المساعد`, student turns lightly tinted. No reaction, no edit, no delete on a
transcript.

**Per-message actions** (admin only): long-press ≥ **450 ms** (cancelled if the pointer moves
> 10 px) or right-click or the always-tabbable ☺ button opens a row: the six reactions
`👍 ❤️ 😂 🔥 😮 🙏` (tapping the current one clears it), and — **only on the instructor's own
messages** — a divider then `تعديل` (in-place textarea with `حفظ` / `إلغاء`) and `مسح`
(confirm `تمسح الرسالة دي؟ مش هترجع.`). Reactions are **optimistic** and silently revert on
failure; edit/delete show `مانفعش` on failure. A message with `editedAt` shows ` · معدّلة` beside
its timestamp.

**Reply box**: label `ردّك`, placeholder `الرد على الطالب…`, 4 rows, `maxLength = 2000`, **not
`required`** (a file with no caption is valid). Staged attachment chip between the box and the
buttons showing the filename + size and an `إزالة الملف` button. Upload progress: spinner +
`بنرفع…` + a real progress bar driven by upload progress. Buttons: `إرسال الرد` / `بنبعت…`,
`إرفاق ملف` (a hidden file input whose `accept` is built from the contracts:
`.png,.jpg,.jpeg,.webp,.avif,.gif,.pdf,.pptx,.docx,.xlsx`), the voice recorder, and `قفل المحادثة`
/ `بنقفل…`. Hint under everything: `صورة (٨ ميجا) أو PDF / PowerPoint / Word / Excel (٩٥ ميجا)`.
When closed, the whole form is replaced by `المحادثة مقفولة.` + a `افتحها تاني` button.

**Voice recorder** states: idle → a round mic button (`سجّل رسالة صوتية`); recording → a pill with
a pulsing red dot, an `m:ss` counter, `إلغاء التسجيل` (trash) and `ابعت التسجيل` (send);
auto-stops at 600 s. Errors: `المتصفح ده مابيسجلش صوت` when no supported container,
`المتصفح مسمحش بالمايك` when permission is denied or there is no microphone.

---

## 14. Error codes and what the UI does

| Where | Status / code | Cause | UI |
|---|---|---|---|
| `POST /assistant/conversations` | `400` | zod: message <2 or >2000, bad name/phone, unknown `entryPath` element (`خطوة مش معروفة`), unknown key (`.strict()`) | show the zod message; the form's generic fallback is `مقدرناش نبعت رسالتك. نحاول تاني.` |
| ″ | `400 "guest conversations require a name and a phone"` | anonymous, missing either | ask for both — `ناقص حاجة واحدة` card, or the form |
| ″ | `403 "too many open conversations"` | 3 open visitor threads already | `مقدرناش نبعت رسالتك. نحاول تاني.` (web collapses it), handoff card → `failed` |
| ″ / follow-up | `429` | throttled | `رسايل كتير في وقت قصير. شوية ونحاول تاني.` |
| follow-up | `403` (no body) | no identity at all | treat as "no thread"; restart the flow |
| follow-up | `404` | not your thread / does not exist | `مقدرناش نجيب المحادثة. تحديث الصفحة ونحاول تاني.` |
| follow-up | `403 "conversation is closed"` | closed | render `المحادثة دي اتقفلت. ولو فيه حاجة تانية، نبدأ من الأول.` and hide the composer |
| any write | `403 "CSRF: missing x-csrf-token header"` | header absent | a client bug — never surface it as a user error |
| mark read | always `204` | — | nothing |
| attachment (student) | `403` | no session and no guest cookie | nothing to render |
| attachment | `404` | wrong ids, or not yours, or unknown extension | show the file card but no bytes |
| `POST /assistant/ask` | `400` | empty question (`مفيش سؤال متكتوب`) or >500 (`السؤال طويل أوي — الحد 500 حرف`) | inline |
| ″ | `429` (plain JSON, **not** an SSE frame) | throttled | `أسئلة كتير في وقت قصير. شوية ونكمّل.` |
| ″ | SSE `{"t":"error","code":"failed"}` | provider died, possibly mid-answer | keep whatever text arrived, show `حصلت مشكلة في الرد. تحاول تاني بعد شوية.` under it |
| ″ | SSE `{"t":"error","code":"tooMany"}` | — | `أسئلة كتير في وقت قصير. شوية ونكمّل.` |
| ″ | SSE `{"t":"error","code":"unavailable"}` | declared in `AskErrorCode` and narrowed by `asAskEvent`, but **never emitted by the server today** — when no model is configured the service silently answers from the written corpus instead. Handle it defensively. | the web UI would render it as `failed` (it only special-cases `tooMany`); prefer showing nothing, since the intended meaning is "not configured", not "broken" |
| ″ | client abort | «إيقاف», closing the panel, navigating | keep the partial answer, **no error** |
| admin reply | `400` `اكتب رسالة أو ارفق ملف` | neither words nor a file | inline |
| admin reply | `400 "attachment was not uploaded"` | fabricated storage key | `مقدرناش نبعت الرد. نحاول تاني.` |
| admin upload | `413` | over the pipeline cap | `الملف كبير أوي.` |
| admin upload | `400 "file extension is not allowed"` / `"…not an allowed document type"` / `"…not an allowed audio type"` | bad type or a lying extension | `نوع الملف ده مش مدعوم.` |
| admin upload | network / other | — | `مقدرناش نرفع الملف. نحاول تاني.` |
| admin edit/delete | `404` | not his message, or gone | `مانفعش` |
| admin reaction | `400` | emoji outside the six | (should be unreachable — the picker is closed) |
| any admin route | `401` / `403` | not signed in / lacks the permission | admin shell handles it |

Client-side pre-checks that avoid a round trip (reproduce them): reject a file over the endpoint's
cap **before** uploading; cap the composer at 2000/500 chars with `maxLength`; disable send while a
request is in flight; trim the transcript to 12×1000 before posting.

---

## 15. What a Flutter client must do differently / what is missing

1. **Cookies are the whole auth story.** Sessions (`better-auth`), the guest thread token
   (`__Host-assistant`) and the CSRF token are all cookies. Flutter must use a persistent cookie
   jar that survives app restarts, and must send `x-csrf-token` on every write. There is **no
   bearer-token API**. If you want one, that is backend work.
2. **`__Host-` cookies require HTTPS and `Path=/` with no `Domain`.** Against a local dev API over
   `http://`, the server drops the prefix (`assistant` instead of `__Host-assistant`) — handle both
   names.
3. **No push for a reply.** `pushPayloadFor` has no `conversation_reply` case, and there is no
   FCM/APNs transport at all (only Web Push/VAPID). Both must be added before a student can be told
   about an answer while the app is closed.
4. **No realtime for the thread.** Refetch on foreground / push / open / after-write. Do not build
   a poll loop against `…/mine` — use the 5-field `…/mine/summary` probe for the badge.
5. **Students cannot send attachments or voice notes.** See §6.5 for the exact list of backend
   changes (new public upload route, `attachment` on `PostMessageSchema`, key-pattern fix, quota,
   and a decision about re-encoding untrusted audio).
6. **Voice notes are almost certainly broken on the server today.**
   `CONVERSATION_KEY_PATTERN` omits `webm|m4a` while `VoiceService` mints exactly those keys under
   `msg/`, and `LocalDiskStorage.resolveKey` runs `isValidStorageKey` on every read **and write**
   — so `storage.put` should throw `invalid storage key`. Untested (no `voice.service.spec.ts`).
   Confirm against production before designing any voice flow; the fix is one alternation in that
   regex. See §6.3.
7. **Attachment bytes are `Cache-Control: private, no-store`** and are served from an authenticated
   route. Do not hand these URLs to a caching image widget with a shared HTTP cache; fetch with the
   session and cache in the app's own private storage if at all.
8. **No message pagination.** The student thread returns only the newest 100 messages and there is
   no cursor. A thread longer than that silently loses its head. If mobile needs history, a
   paginated route must be added.
9. **No per-message read receipts, no typing indicator, no presence.** Do not draw any of them.
10. **No student-side reactions.** Only `admin_reaction` exists. A `visitor_reaction` column would
    be a one-line migration, but the API, contract and UI do not exist.
11. **Guests are first-class.** The entire assistant works signed-out; a mobile app that forces
    login before the chat changes the product. If you keep the guest path, the cookie **must**
    survive reinstall-free app restarts or the student silently loses their thread.
12. **The exam lock is server-side and must be mirrored in the UI**: hide/disable the assistant
    entrance while a quiz attempt is in progress, and expect the fixed
    `المساعد مقفول أثناء الامتحان…` answer if it is reached anyway.
13. **SSE over a mobile radio.** `POST /assistant/ask` streams; use a streamed HTTP response
    (`http.Client().send` + `StreamedResponse.stream`), not `EventSource` (it cannot POST and
    cannot set the CSRF header — the same reason the web client uses `fetch`). Honour
    `X-Accel-Buffering: no`; if an intermediary buffers, the answer arrives as one block and the
    UX silently degrades to "8 seconds of nothing then a paragraph".
14. **The knowledge entry `install` says there is no mobile app** (`مفيش تطبيق على المتاجر —
    المنصة بتشتغل من المتصفح عادي.`). Shipping the app makes المساعد tell students it does not
    exist. Update `copy.assistant.knowledge` when you ship.
15. **The guided tree is dead UI but live data.** Do not build the node-walking UI; do keep the
    node table for `entryPath` validation and breadcrumb labels, and post `entryPath: ['root']`.
16. **Numbers and dates**: every measurement in this product renders through
    `ar-EG-u-nu-latn` (Arabic locale, **Latin digits**). File sizes use Latin units (`MB`).
    Do not switch to Arabic-Indic numerals.
17. **Directionality**: RTL throughout; "forward" arrows point **left**. URLs inside a bubble are
    rendered `dir="ltr"`.
