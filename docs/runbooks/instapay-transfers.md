# التحويلات الواردة — approving InstaPay payments with nobody watching

Everything about this feature: why it exists, how it decides, what still has
to be set up, and what to check when it goes wrong. Written to be picked up
cold in a month.

**Status as of 2026-09-08: code complete, nothing configured, nothing
deployed.** With `INSTAPAY_INGEST_TOKEN` unset the ingest route rejects every
request and the platform behaves exactly as it always has — every payment
approved by hand. Nothing about this is load-bearing until it is turned on.

---

## 1. What this replaces

A student transfers over InstaPay, uploads a screenshot, and files a claim.
Someone then opens a phone, finds the transfer, and decides it is the one the
claim is talking about. That is the whole job, and it does not scale.

The obvious automations all fail, each for its own reason. This is worth
reading before proposing one of them again:

| idea | why it does not work |
| --- | --- |
| Read the bank's SMS | «تم اضافة مبلغ 250EGP الى حساب رقم xxx1734 فى 07-SEP-2026». No sender, no clock time. Two students who each sent 250 that day are one row. |
| Read the InstaPay push on the iPhone | iOS hands app notifications to **no** automation. Not a missing setting — a platform rule. It can only be captured by screenshotting it, which needs a human every time. |
| Read the student's own screenshot | An image the student supplied. Evidence of nothing, and every bank app formats its receipt differently. |
| Put a code in the piastres (250.13) | InstaPay transfers arrive as round pounds, and a student's own bank app may not accept a fraction at all. Tried, then removed. |
| Match on the sender's phone number | The notification does not carry one. The address is all there is. |

## 2. What actually works, and why

The InstaPay push says two things: an **amount** and a **sender address** —
`moazkoritam@instapay`, or an IBAN-shaped `eg6300010002200000@instapay` for a
bank account with no username. That address matches nothing the platform
holds. It is not an email, not a phone, not anything a student has ever typed.

So the platform **learns** it.

1. The first payment from an unknown address is reviewed by hand, exactly as
   every payment used to be.
2. Approving the student's claim records that address against that student
   (`student_payment_addresses`).
3. Every later payment from that address is matched and approved with nobody
   looking — a course subscription **or** a book order.

The manual queue is not removed on day one. It **drains**. A new cohort's first
month looks like today; by the second most transfers never reach a human.

There is a second, weaker route that makes it useful immediately: an unknown
address whose amount matches **exactly one** outstanding thing in the entire
platform is settled anyway, and the address is learned from it. Two candidates
at that amount and it refuses, every time.

### Why the receiver is an Android handset

Android lets an app read another app's notifications. That single fact turns
the InstaPay push — the only feed that names a sender — into an unattended
webhook. On iOS the same push can only be screenshotted by hand.

The device is not the phone anyone carries. It is a cheap handset on wifi and
a charger that nobody opens.

## 3. What each person does

**The student** — nothing new. Picks a plan, transfers, enters the phone they
sent from, uploads a screenshot, exactly as before. The screenshot is still
collected and still shown in the review queue; it is simply no longer the only
evidence there is.

**Ayman** — approves what reaches `/admin/payments`, which is less every week.
Glances at `/admin/transfers` for money nothing explains.

**Nobody** — approves the rest.

## 4. Turning it on

### 4.1 The InstaPay account and the number

InstaPay runs on one device at a time, so the Android handset needs its **own
number and its own InstaPay registration**. Consequence, and it is easy to
miss: **students will be transferring to a different number than they are
today.**

- Register InstaPay on the Android with the new number.
- Update it at `/admin/settings` → the InstaPay number. That field is what the
  course page prints for students to copy.
- Until that is changed, money keeps arriving on the old phone where nothing
  is watching for it.

### 4.2 The token

```
openssl rand -hex 32
```

Set it as `INSTAPAY_INGEST_TOKEN` on the API — Dokploy's env editor, or
`docker-compose.yml`'s `${INSTAPAY_INGEST_TOKEN:-}`. Empty or unset means the
route rejects everything, which is the intended default.

### 4.3 The Android device

Anything running Android 8 or newer. It does not need to be fast, and it does
not need a SIM if it is on wifi — but InstaPay's own registration will need
one at least once for the OTP.

Settings that actually matter, because the failure they cause is silent:

- **Wifi always on**, including while asleep.
- **Battery optimisation OFF** for both InstaPay and the forwarder app.
  (Settings → Apps → the app → Battery → Unrestricted.) On Xiaomi, Samsung and
  Oppo there is a second, separate "Autostart" or "Allow background activity"
  switch. Both have to be on.
- **Plugged into a charger permanently.**
- **Notifications enabled** for InstaPay, and not silenced by a Focus/Do Not
  Disturb mode. A notification that is never posted is never read.
- Screen lock is fine. The listener does not need the screen on.

### 4.4 The notification forwarder

**MacroDroid** (free tier is enough). Tasker or Automate do the same job if
either is already familiar.

1. Install MacroDroid, and grant it **Notification Access** when it asks
   (Settings → Notifications → Special app access → Notification access).
2. New macro:
   - **Trigger:** Notification → Notification Received → application: InstaPay
     → leave the text filter empty.
   - **Action:** HTTP Request
     - Method `POST`
     - URL `https://<api-host>/api/ingest/transfers`
     - Content type **`text/plain`**
     - Header `x-instapay-token` = the token from 4.2
     - Body: the notification-text magic variable, **on its own** — no JSON,
       no quotes, no braces. Insert it from the magic-text picker (the `{}`
       button) under Notification rather than typing it; the exact name
       (`[notification_text]`, `[not_text]`) varies by version.

   Plain text and not JSON on purpose. Building `{"text": "…"}` by hand means
   interpolating a notification into a string with no escaping, and the day one
   contains a quotation mark the request becomes malformed, the API answers
   400, and it looks exactly like the money never arriving. `application/json`
   still works if something else ever posts here — the route accepts both.
3. Test it before trusting it: send 1 EGP from another account and watch
   `/admin/transfers`. The row should appear within seconds.

If a capture ever needs to go in by hand, `/admin/transfers` has a paste box
that runs the identical ingest under an admin session.

## 5. الكتب — books settle the same way

A book order sitting at `address_only` (address entered, never paid) is
matched on its own total exactly like a subscription, and moves to `paid`
with no screenshot. Same address, same ledger, same rules — including the
refusal to act when a subscription claim and a book order want the same
amount.

A guest checkout still gets marked paid; it simply teaches the platform
nothing, because there is no account to bind the address to.

## 6. Reading `/admin/transfers`

Every row says which of five situations it is in, because they need different
things from the reader:

- **فتح <كورس> لـ<طالب>** — settled. Nothing to do.
- **دفع طلب كتاب لـ<طالب>** — a book, settled.
- **أول مرة نشوف العنوان ده** — a stranger's address. Approving that student's
  own claim in `/admin/payments` is what teaches it.
- **التحويل من <طالب>، بس مفيش عنده طلب مستني** — a student the platform knows,
  who owes nothing. Usually a repayment or a mistake.
- **رسالة البنك مبتقولش مين حوّل** — an SMS. Corroboration only; it can never
  settle anything on its own.
- **مش مقروء** — the parser could not read the line. Kept deliberately: silence
  about money that arrived is the one outcome worth engineering against.

«اقفلها» stamps a row as needing no action. It is never deleted — the row is
still the record that money arrived.

## 7. What it refuses to do, on purpose

- **Two candidates, no decision.** Two pending claims at the same amount, or a
  claim and a book order at the same amount, are left for a human. Always.
- **An SMS never settles anything.** It names nobody.
- **A known address does not mean a blank cheque.** The amount must equal the
  amount claimed. The address says *who*, never *what for*.
- **Nothing is settled twice.** `incoming_transfers.matched_submission_id` and
  `matched_book_order_id` are both UNIQUE, and every settle is a conditional
  `updateMany`. A retried webhook is a no-op, not a second course.
- **A wrong learn is bounded.** Even a mis-learned address only ever matches
  that student's own outstanding claims at the exact amount.

## 8. Where the code is

| what | where |
| --- | --- |
| The two models | `apps/api/prisma/schema.prisma` — `StudentPaymentAddress`, `IncomingTransfer` |
| The migration, with the full reasoning | `apps/api/prisma/migrations/20260908010000_instapay_transfers/` |
| Reading the notification text | `apps/api/src/modules/payments/transfer-parse.ts` (+ spec) |
| Matching, learning, the ledger | `apps/api/src/modules/payments/transfers.service.ts` (+ spec) |
| Approving a claim off a transfer | `PaymentsService.approveFromTransfer` |
| Marking a book paid off a transfer | `BookOrdersService.markPaidFromTransfer` |
| The ingest endpoint (token, `@Public()`) | `transfers-ingest.controller.ts` (+ spec) |
| Accepting a plain-text body from the handset | `transfers-ingest.body.ts` (+ spec) |
| The admin screen | `apps/web/app/(admin)/admin/transfers/` |

Audit actions to search the log for: `payment:auto-approve`,
`book-order:auto-pay`, `transfer:ingest`, `transfer:learn-address`,
`transfer:dismiss`. Every automatic one carries a **null actor** — that is how
you tell "nobody decided this" from "an admin decided this".

## 9. When it goes wrong

**Nothing arrives at all.** Check, in this order: is `INSTAPAY_INGEST_TOKEN`
set on the API; does the Android still have Notification Access; is battery
optimisation still off (a system update turns it back on); is the handset on
wifi. MacroDroid keeps a log of every macro run, including the HTTP response —
a 401 means the token does not match.

**Transfers arrive but never match.** Look at a row's sender address. If it is
right but the student still waits, the address has not been learned yet, or
the amount does not equal what was claimed.

**The wrong student was approved.** Find the `payment:auto-approve` audit row,
which carries the transfer id. Delete the offending
`student_payment_addresses` row so it stops matching, then cancel the
subscription the ordinary way.

**A student paid and nothing happened.** The manual queue still works and is
still the fallback for everything. Nothing here removes it.

## 10. Not done

- Not deployed, not configured, no token set anywhere.
- Never run against a real InstaPay notification — the parser is written
  against the exact text of a real one and is covered by tests, but the round
  trip from a real handset has not happened yet.
- No admin UI for unbinding a learned address; it is a database row.
- The Android device does not exist yet.
