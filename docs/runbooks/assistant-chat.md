# المساعد's open chat — turning the model on

The panel now opens onto a box you can type into («اسأل أي حاجة»), beside the
guided question tree, and both of them sit above a strip that reaches أيمن from
every screen.

**All of that already works with no key configured**, which is the important
thing to know before reading the rest of this page. Unset, `POST
/api/assistant/ask` answers out of `matchKnowledge` — the same paragraphs the
guided tree shows, retrieved by word overlap — and puts «أكلّم م. أيمن» on every
reply. So the widget is never broken; it is either grounded-and-smart or
grounded-and-literal.

**Status: the key is NOT set as of 2026-08-20.** Everything below is the part
that can only happen in a browser against Anthropic's console.

---

## What changes when the key is set

| | key unset | key set |
|---|---|---|
| «الامتحانات شكلها إيه؟» | the written paragraph, verbatim | the same fact, in the words the student used |
| «أنا في تانية لغات، أنزّل الملخّص منين؟» | «مش لاقي ليه إجابة مظبوطة» + the أيمن card | a real answer |
| «يعني إيه loop؟» | the أيمن card | a two-sentence explanation with a tiny example |
| «الكورس بكام؟» | the price node, which refuses to name a number | the same refusal + the أيمن card |

The last row is not a limitation to fix. Prices, offers and revision dates
change without anybody touching this repo, and both paths are instructed to
route them at a person rather than quote a number that was true in March.

---

## Turning it on

1. Create an API key at <https://console.anthropic.com/settings/keys>. Give it
   a name that says where it is used — `ayman-platform-prod` — so a leak is
   revocable without guessing which service dies.
2. Put it in the deployment's `.env` **and** confirm it is listed in
   `docker-compose.yml`'s `api.environment:` block. It is (`ANTHROPIC_API_KEY:
   ${ANTHROPIC_API_KEY:-}`), and that line is load-bearing:

   ```
   ANTHROPIC_API_KEY="sk-ant-..."
   ```

   ⚠️ A variable that is in `.env` and *not* named in `environment:` never
   enters the container. That is how the admin-bootstrap vars failed silently
   once already — see the comment above `ADMIN_EMAIL` in `docker-compose.yml`.
   Here the failure is quieter still: the chat keeps answering, from the
   script, and nothing anywhere says why.
3. Redeploy. The API logs one line at boot when the key is missing:

   ```
   ANTHROPIC_API_KEY is unset — المساعد will answer from the written script only
   ```

   **The absence of that line is the confirmation.** There is deliberately no
   "model configured" log — a secret's presence is not something to announce.

---

## What it can reach, and what it costs

`apps/api/src/modules/assistant/ai/` is the whole of it:

- `assistant-knowledge.ts` — the corpus, **derived** from
  `copy.assistant.script`. Re-wording a node re-words the chat; there is no
  second list to keep in sync. Plus the public catalog (`CatalogService.list()`,
  the same already-public read the catalog page performs), re-read at most every
  five minutes.
- `assistant-ai.service.ts` — the model call. No tools, no database beyond that
  catalog read, no session. It cannot answer «أنا خلّصت كام درس؟» because it
  genuinely cannot know.
- `assistant-ask.controller.ts` — one public, CSRF-checked, throttled route that
  streams the answer as it is written.

**Nothing is stored.** The question, the history and the answer live for the
length of one request; the transcript lives in the browser tab and dies with it.
No transcript table, no log line carrying what a student typed. The moment a
conversation is worth keeping is the moment it becomes a real one, and
`POST /api/assistant/conversations` — the instructor's inbox — is what that
costs.

Model: `claude-opus-5` at `effort: low`, capped at 1024 output tokens. The
instructions and the entire corpus are one cached prefix, so the second question
of any five-minute window reads them at roughly a tenth of the price. Rate
limits are in the controller: 2 per 6 seconds, 20 per 10 minutes, 60 per hour,
keyed per session (per IP for a visitor with none).

---

## If an answer is ever wrong

The fix is almost never in the prompt. Check in this order:

1. **Is the fact in `copy.assistant.script`?** If not, the model was asked to
   invent it and did the honest thing badly. Add a node — the corpus follows.
2. **Is the node's wording ambiguous?** The chat reads exactly what a student
   reading the tree reads. Fixing it fixes both.
3. **Only then** the system prompt in `assistant-ai.service.ts`. It is one
   string, and every rule in it has a reason written beside it — including the
   one that matters most on this platform: never address the reader with a
   gendered form, because the platform never asks whether a student is a boy or
   a girl.

---

## Turning it back off

Remove the variable and redeploy. The chat keeps working, worse, and every reply
carries the way to a person. Nothing 404s and no screen disappears — which is
the property the whole no-key path exists to hold.
