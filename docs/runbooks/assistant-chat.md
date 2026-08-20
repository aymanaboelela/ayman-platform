# المساعد's open chat — turning the model on

The panel opens onto a box you can type into («اسأل أي حاجة»), beside the guided
question tree, and both sit above a strip that reaches أيمن from every screen.

**All of it already works with no key at all**, which is the important thing to
know before reading the rest of this page. Unconfigured, `POST
/api/assistant/ask` answers out of `matchKnowledge` — the written corpus in
`copy.assistant.knowledge`, retrieved by word overlap — and puts «أكلّم م. أيمن»
on every reply. So the widget is never broken; it is either grounded-and-smart
or grounded-and-literal.

**Status: no key is set as of 2026-08-20.**

---

## Which key

Three configurations, chosen by whichever variable is present. The service logs
which one it picked at boot.

| | variable | cost | Egyptian Arabic |
|---|---|---|---|
| **Gemini** ← default | `GEMINI_API_KEY` | **free tier, no card** | very good |
| Anthropic | `ANTHROPIC_API_KEY` | billed per token | best |
| none | — | free | the written corpus, verbatim |

Gemini wins when both keys are set: a deployment carrying two is one
mid-migration, and the free one is the safer thing to be spending while nobody
is watching.

### Turning on the free one

1. Open <https://aistudio.google.com/apikey>, sign in with a Google account,
   **Create API key**. No card, no subscription.
2. Put it in the deployment's `.env`:

   ```
   GEMINI_API_KEY="AIza..."
   ```

   ⚠️ A variable that is in `.env` and *not* named in `docker-compose.yml`'s
   `api.environment:` block never enters the container. All three are already
   listed there — that line is load-bearing, and it is how the admin-bootstrap
   vars failed silently once before. Here the failure would be quieter still:
   the chat keeps answering, from the written corpus, and nothing says why.
3. Redeploy, then read one line of the API log:

   ```
   المساعد answering with gemini:gemini-2.5-flash     ← configured
   no GEMINI_API_KEY or ANTHROPIC_API_KEY — …          ← not
   ```

   The provider id is logged; the key never is.

### If the free tier runs out

A 429 lands in the log as `assistant ask failed via gemini:… : gemini responded
429`, and every student still gets an answer — the written corpus, with the
أيمن card. Nothing breaks, it just stops being clever. Options, cheapest first:

- **Switch model.** `GEMINI_MODEL` exists precisely because free-tier
  availability is Google's decision and changes without warning. Current
  alternatives: `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`,
  `gemini-3.6-flash`, `gemini-3.7-flash`. Check the current free limits at
  <https://aistudio.google.com/rate-limit> — and note `gemini-2.0-flash` is shut
  down, so an old snippet naming it will fail.
- **Tighten the throttle** in `assistant-ask.controller.ts` (currently 2 per 6
  seconds, 20 per 10 minutes, 60 per hour, per session).
- **Pay.** Set `ANTHROPIC_API_KEY` and drop `GEMINI_API_KEY`. No code change.

---

## ⚠️ One thing to decide before it goes live

The typed question leaves this server and reaches Google. What travels is the
question, the platform's own written corpus, and the published course list —
**no name, no phone, no email, no grades, no user id, no session**. The student
is anonymous to the model.

That is still a third party processing something a student typed, and
`/privacy` currently promises «بياناتك محفوظة عند أيمن أبو العلا وبس، ومابتتباعش
ولا بتتشارك مع حد». Free-tier Gemini traffic may also be used by Google to
improve their products, which paid tiers exclude.

Two honest ways to square it, and it is أيمن's call, not this file's:

1. Add one line to `/privacy` saying the assistant's questions are answered by
   an external model and that no personal data is sent with them.
2. Leave the model off. The written corpus answers the common questions and the
   card reaches a person for the rest.

---

## What it can reach

`apps/api/src/modules/assistant/ai/` is the whole of it:

- `assistant-knowledge.ts` — the corpus. Three sources: what the platform is,
  the guided tree's own paragraphs (**derived** from `copy.assistant.script`, so
  re-wording a node re-words the chat), and `copy.assistant.knowledge` — the
  two dozen answers the tree had no button for. Plus the public catalog
  (`CatalogService.list()`), re-read at most every five minutes.
- `assistant-ai.service.ts` — the prompt, the marker filter, the fallbacks.
- `providers/` — one file per vendor, behind `AnswerProvider`. Adding a third
  (Groq, Cloudflare Workers AI, OpenRouter) is one file and one `if`.
- `assistant-ask.controller.ts` — one public, CSRF-checked, throttled route that
  streams the answer as it is written.

**Nothing is stored.** The question, the history and the answer live for the
length of one request; the transcript lives in the browser tab and dies with it.
No transcript table, no log line carrying what a student typed. The moment a
conversation is worth keeping is the moment it becomes a real one, and
`POST /api/assistant/conversations` — the instructor's inbox — is what that
costs.

---

## If an answer is ever wrong

The fix is almost never in the prompt. In order:

1. **Is the fact in `copy.assistant.knowledge` or `copy.assistant.script`?** If
   not, the model was asked to invent it. Add an entry — both halves follow.
2. **Is it findable?** With no key, `matchKnowledge` has to find it by word
   overlap. If students phrase it in words the answer does not contain, add
   them to `SEARCH_ALIASES` in `assistant-knowledge.ts` and to the table test —
   that is what the table is for.
3. **Is it wrong?** Then it was written from an assumption instead of from the
   code. That already happened once: «نسيت كلمة السر» described an email reset
   link this product has never had, and a locked-out student was told to wait
   for a message that could not arrive. Check the implementation, not the
   intention.
4. **Only then** the system prompt in `assistant-ai.service.ts`. Every rule in
   it has a reason beside it — including the one that matters most here: never
   address the reader with a gendered form, because the platform never asks
   whether a student is a boy or a girl.

---

## Turning it back off

Remove the key and redeploy. The chat keeps working, worse, and every reply
carries the way to a person. Nothing 404s and no screen disappears — which is
the property the whole no-key path exists to hold.
