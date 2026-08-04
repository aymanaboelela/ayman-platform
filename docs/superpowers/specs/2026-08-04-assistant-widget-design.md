# المساعد — guided assistant widget + admin inbox

**Date:** 2026-08-04
**Status:** implemented — see §11 for what changed on the way

A floating assistant on every public and student page. It answers the questions students
actually ask by walking them down a **hand-written question tree** — never free text, never an
LLM. When the tree runs out, it opens a **conversation** that lands in a new `/admin/inbox`
screen, where the instructor replies in his own time.

---

## 1. Decisions taken (and what was rejected)

| Decision | Chosen | Rejected, and why |
|---|---|---|
| What drives the answers | A hand-written tree of nodes. Zero AI. | RAG over an LLM: recurring cost, hallucination risk, prompt-injection surface, and it contradicts the product intent — the student picks from options, he does not chat. |
| Human handoff | Asynchronous inbox inside the admin dashboard. | Real-time SSE chat: the instructor is one person and cannot be online; a student staring at a typing indicator that never moves is worse than being told up front that a reply is coming later. WhatsApp-only: leaves no record, no follow-up, no view of what students keep asking. |
| Who may open a conversation | Anyone — anonymous visitor **and** signed-in student. | Signed-in only: the highest-value questions ("بكام؟", "هنبدأ إمتى؟") come from people who have not registered yet. That is the exact person this feature exists to capture. |
| Where answers come from | Static copy in `ar.ts` + live **public** catalog data through the existing `@Public()` catalog read path. | Static-only: goes stale silently the first time a course is added. Student-scoped data (progress, enrolments): deferred — it adds a second authenticated read path inside the widget for a question the dashboard already answers. |

---

## 2. Architecture — three layers, independently testable

### 2.1 The script — `packages/contracts/src/assistant/script.ts`

Pure data. No React, no I/O, no `zod` runtime work at module load. A directed graph:

```ts
interface ScriptNode {
  id: NodeId;
  /** Copy key path, e.g. 'assistant.nodes.coursesIntro'. Never a literal. */
  body: string;
  choices: readonly ScriptChoice[];
  /** Present only on nodes that render live data. */
  data?: 'courses' | 'subjects';
}

type ScriptChoice =
  | { label: string; next: NodeId }        // walk on
  | { label: string; href: string }        // leave for a real page
  | { label: string; escalate: true };     // open a conversation
```

Every user-visible string is a **key**, resolved by the widget against `copy.assistant.*`. This is
what keeps Global Constraint 4 (no literals in components) true for a surface that is almost
entirely words.

**`script.test.ts` walks the graph and fails on:**

1. a `next` pointing at a node id that does not exist;
2. a node unreachable from `root` (dead copy nobody can ever see);
3. a cycle with no escape — every node must reach a terminal (`href`, `escalate`, or `root`)
   within the graph, or a student gets stuck in a loop with no way out;
4. a `body`/`label` key that does not resolve in `copy`;
5. a node with zero choices that is not itself terminal.

The whole tree is therefore verified without a browser, a server, or a database.

### 2.2 The widget — `apps/web/components/assistant/`

| File | Responsibility |
|---|---|
| `assistant-mount.tsx` | Server component. Decides whether to render at all (see §2.4), fetches the public catalog snapshot once, passes it down. |
| `assistant-widget.tsx` | Client. Owns open/closed state, the FAB, the panel, focus management. |
| `assistant-transcript.tsx` | Renders the walked path — the questions asked and the answers given. |
| `assistant-choices.tsx` | The current node's buttons. |
| `assistant-escalate.tsx` | The handoff form: message, and for anonymous visitors name + WhatsApp. |
| `use-assistant-script.ts` | The runner: current node, history, `choose()`, `restart()`. Pure state, unit-testable with no DOM. |

Mounted **once**, in the root layout, beside `<Toaster/>` — for the reason that file already
records: `(app)`, `(site)` and `(admin)` are sibling route groups, so the root layout is the only
common ancestor.

### 2.3 The conversation — `apps/api/src/modules/assistant/`

Two new tables (§3), one module, two controllers (public + admin), one service.

### 2.4 Where the widget does **not** render

- **`/admin/*`** — the instructor does not message himself.
- **`/quizzes/:lessonId/attempt/:attemptId`** — a support channel open during a timed graded
  attempt is an integrity hole (a student can ask about a question in front of them) on top of
  being a distraction. `(site)/layout.tsx` already removed ambient motion from working surfaces
  for the weaker of those two reasons.
- **`/onboarding`** — a modal-ish flow the student must finish; a second overlay competes with it.

The decision lives in one exported predicate, `shouldMountAssistant(pathname)`, with its own test
table, so the rule cannot drift between the mount and whatever else asks later.

---

## 3. Data model

```prisma
model Conversation {
  id        String   @id @default(uuid(7)) @db.Uuid
  /// Set when a signed-in student opens it. NULL for an anonymous visitor.
  userId    String?  @map("user_id")
  /// Only for anonymous visitors — what they typed so they can be reached.
  guestName  String? @map("guest_name")
  guestPhone String? @map("guest_phone")
  /// SHA-256 of the opaque cookie token. The raw token is never stored, so a
  /// database leak does not hand out read access to every guest thread.
  guestTokenHash String? @unique @map("guest_token_hash")
  /// The tree path that led here, e.g. ['root','courses','pricing'].
  /// Node IDS, not sentences — the same read-time-resolution discipline
  /// NotificationsService uses for titles.
  entryPath String[] @map("entry_path")
  status    ConversationStatus @default(open)
  /// Denormalised for the inbox list's ordering and unread dot. Maintained in
  /// the same transaction as the message insert.
  lastMessageAt   DateTime @default(now()) @map("last_message_at")
  adminReadAt     DateTime? @map("admin_read_at")
  visitorReadAt   DateTime? @map("visitor_read_at")
  createdAt DateTime @default(now()) @map("created_at")

  user     User?                 @relation(fields: [userId], references: [id], onDelete: SetNull)
  messages ConversationMessage[]

  @@index([status, lastMessageAt(sort: Desc)])
  @@index([userId])
  @@map("conversations")
  @@schema("app")
}

model ConversationMessage {
  id             String   @id @default(uuid(7)) @db.Uuid
  conversationId String   @map("conversation_id") @db.Uuid
  author         MessageAuthor
  body           String   @db.Text
  createdAt      DateTime @default(now()) @map("created_at")

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
  @@map("conversation_messages")
  @@schema("app")
}

enum ConversationStatus { open, answered, closed }
enum MessageAuthor      { visitor, admin }
```

`onDelete: SetNull` on `userId`, not `Cascade`: a deleted account must not erase the instructor's
side of a conversation he already answered.

### 3.1 Guest identity

On first escalation by an anonymous visitor the API mints a 32-byte random token, stores its
SHA-256, and sets `__Host-assistant` — `httpOnly`, `Secure`, `SameSite=Strict`, `Path=/`,
90 days. Reading or continuing a guest thread requires presenting it. This works only because
of the single-origin invariant; it needs no CORS and no new host.

The raw token never touches the database and never reaches JavaScript.

---

## 4. API surface

### Public (`@Public()`, throttled)

| Route | Notes |
|---|---|
| `POST /api/assistant/conversations` | Opens one. Body: `entryPath`, `message`, plus `name`+`phone` when anonymous. Sets the guest cookie when anonymous. |
| `POST /api/assistant/conversations/:id/messages` | Adds a follow-up. Ownership resolved from the session **or** the guest cookie — never from the id alone. |
| `GET /api/assistant/conversations/mine` | The caller's own thread(s), same resolution. |

Rate limits (`@Throttle`): 3 conversations per hour and 10 messages per 10 minutes per identity,
where identity is the existing `request-identity.ts` helper (session id, else IP). Message body
capped at 2000 characters in the Zod schema, so the limit is enforced before the service runs.

### Admin

| Route | Permission |
|---|---|
| `GET /api/admin/conversations` | `conversation:read` |
| `GET /api/admin/conversations/:id` | `conversation:read` |
| `POST /api/admin/conversations/:id/reply` | `conversation:reply` |
| `PATCH /api/admin/conversations/:id/status` | `conversation:close` |
| `GET /api/admin/conversations/unread-count` | `conversation:read` |

Three new entries in `PERMISSIONS`, granted only through `admin: '*'`. Every route gets an
expectation in `authorization-matrix.int-spec.ts`, which fails on any route nobody wrote one for.

### 4.1 The data-access rule, enforced

`AssistantService` touches **only** `conversation` and `conversationMessage`. Live catalog
content reaches the widget through the existing `@Public() GET /api/catalog/courses` read — no
new query is written against content tables at all. A unit spec asserts the service's Prisma
delegate usage, so the rule is checked by CI rather than promised in a comment.

Visitor-supplied text is stored raw and rendered as **text, never HTML** — there is no rich-text
path here, so `sanitizeRichText` is not the control; not having an HTML sink is.

---

## 5. Admin inbox — `/admin/inbox`

- A row per conversation: who (student name, or guest name + phone), the entry path rendered as
  breadcrumbs, first line of the message, relative time, unread dot.
- Filters: unanswered / all / closed. Server-side, via the existing `admin/list.ts` contract.
- Thread view: full transcript, the entry path pinned at the top, a reply box, and a close button.
- A sidebar entry in `ADMIN_NAV` (group `teaching`, permission `conversation:read`) — one table
  feeds the sidebar, the breadcrumbs and the command palette, so this is a single edit.
- An unread count on that entry, so an unanswered question is visible from any admin screen.

### 5.1 Notifying the student

A reply to a **signed-in** student emits a notification through the existing
`NotificationsService`. That requires a fourth `NotificationKind`, `conversation_reply`, and its
payload carries `conversationId` — which means `EmitInput` and `toEntry` stop assuming every
notification is about a lesson. That refactor is part of this work, not a follow-up: leaving
`lessonId` mandatory would force a fake one.

An anonymous visitor gets no notification — there is no account to notify. They see an unread
badge on the FAB, resolved from the guest cookie on page load.

---

## 6. Motion and appearance

Governed by `ayman/no-layout-animation`, so this is not a stylistic preference:

- FAB → panel is `opacity` + `transform` only (`scale`/`translate`). Never `width`, `height`,
  `top` or `filter`.
- Durations from `packages/ui/src/motion/variants.ts` — `popover` (200ms) for the panel,
  `SECONDS.exit` (120ms) out. Nothing exceeds the 400ms cap.
- `m.*` inside the existing `<LazyMotion strict>`; bare `motion.*` imports are rejected by lint.
- Every continuous effect (the attention pulse on the FAB when a reply is waiting) stops under
  `prefers-reduced-motion`, and pointer-driven effects are off on touch.
- Logical properties throughout — `inset-inline-start`, `ms-*`, `text-start`. `ayman/no-physical-direction`
  rejects the alternative, including inside `cn()`.

Built from `@ayman/ui` primitives, not a third-party chat kit: every kit surveyed
(`@chatscope/chat-ui-kit-react`, `assistant-ui`) ships LTR-mirrored physical properties, English
strings inside components, and width/height transitions — three separate lint failures each, plus
a second visual language on a site that already has one.

---

## 7. Copy

One new top-level block, `copy.assistant`, holding: the FAB label, panel chrome, every node body,
every choice label, the escalation form, and the admin inbox. E2E selects by these keys, never by
rendered Arabic.

---

## 8. Test plan

| Layer | Test | Runner |
|---|---|---|
| Script graph | reachability, dangling ids, cycles, key resolution | Vitest (`packages/contracts`) |
| Script runner | choose/back/restart state transitions | Vitest (`apps/web`) |
| Mount predicate | route table: admin / attempt / onboarding excluded | Vitest (`apps/web`) |
| Service | ownership resolution, guest-token hashing, throttle-independent limits, delegate allowlist | Jest (`apps/api`) |
| Authorization | the three new permissions on the five admin routes | Jest integration |
| a11y | `/` with the widget open, added to the hand-maintained route list in `a11y.e2e.ts` | Playwright |
| E2E | walk the tree → escalate as guest → reply as admin → guest sees it | Playwright |

`lib/loading-coverage.test.ts` requires a `loading.tsx` beside every product `page.tsx`, so
`/admin/inbox` ships one.

---

## 9. Deliberately out of scope

- Any LLM, at any point in the flow.
- Real-time delivery. The inbox is asynchronous by design (§1).
- An analytics table of every node traversal. The escalation's `entryPath` gives the same
  insight — what students were looking at when they gave up — for two columns instead of a table
  that grows without bound.
- Student-scoped answers ("فين وصلت؟"). The dashboard answers this already.
- File attachments in conversations. The media pipeline is an upload surface with its own
  threat model; opening it to anonymous visitors is a separate decision.

---

## 11. What changed during implementation

The design above is what was built. Five decisions moved, each because building it
surfaced something the design could not have known.

**The panel renders a TRAIL, not a chat log.** §2.2 said "renders the walked path" without
saying how. It became the widget's one distinctive element: visited stops as tappable chips on
one line, with the current answer below. There is no conversation to log — there is a route
through a tree — and rendering it as a route makes "back" a place on screen rather than a button
to hunt for. The escalated thread DOES render as bubbles, because that half genuinely is a
conversation, and the two halves looking different is the point.

**The `last_message_at >= created_at` CHECK was removed before it ever shipped.** `created_at` is
written by Postgres and the other three timestamps by Node; comparing them compares two clocks.
Every guest conversation failed to insert with a 23514 because the application clock was a few
milliseconds behind the database's. The failure it prevented is cosmetic; the failure it caused
is an outage. `visitorReadAt` is now left NULL at creation for the same reason.

**`GET .../mine` also answers `isSignedIn`.** The escalation form needs it to decide whether to
ask for a name and a WhatsApp number, and a second request to `/api/session` to render one panel
is not worth the tidier separation. It is not an authorization signal and nothing gates on it.

**`@Public()` stopped implying "no CSRF check".** §4 assumed the existing guard covered these
routes. It did not: `CsrfGuard` skips public routes, which was safe only while every public route
was a read. `@RequireCsrf()` splits the two questions. Without it, another origin could make a
signed-in student's browser post a support message the instructor would read as theirs.

**`packages/ui`'s motion presets had to be typed before they could be used.** They were
`Record<string, unknown>` — permissive about the banned properties AND not assignable to Motion's
own target type, so no component could spread one. `MotionTarget` is now a composited-only
allowlist, declared as a type ALIAS rather than an interface (only an alias gets the implicit
index signature Motion's `Target` requires).

### Not built, and still not built

Everything in §9 holds. Two additions to that list:

- **No polling in the thread.** A reply appears on the next page load. A typing indicator with
  nobody behind it is a lie the interface would tell every visitor.
- **No unread badge on the sidebar nav entry yet.** `GET /api/admin/conversations/unread-count`
  exists and is tested; wiring it into `ADMIN_NAV` means giving that table an async slot, which
  is a change to a file three other surfaces read. The inbox's own filter shows the count today.
