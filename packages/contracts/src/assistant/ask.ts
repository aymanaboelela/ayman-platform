import { z } from '@ayman/contracts/zod';

/**
 * `POST /api/assistant/ask` — المساعد's OPEN chat, the half that answers a
 * question nobody wrote a button for.
 *
 * ## Why this exists beside the script
 *
 * `./script.ts` is a tree of questions the instructor decided to answer, and
 * it is still the better answer for every question ON it: the words were
 * written by a human, they are free, they are instant, and they work with the
 * network off. What it cannot do is answer «أنا في تانية لغات، أنزّل الملخّص
 * منين؟» — a real question, phrased the way a fifteen-year-old phrases it,
 * that matches no node. Until now the only thing waiting for that student was
 * a menu of four things they did not ask.
 *
 * So this route takes the typed question and answers it from the SAME facts
 * the script already carries, plus the public catalog. It is grounded, not
 * open-ended: see `assistant-knowledge.ts` on the API side, which builds the
 * corpus out of `copy.assistant.script` so the two can never disagree.
 *
 * ## Stateless on purpose — the transcript lives in the browser
 *
 * `history` comes UP with every question rather than being stored. That is not
 * laziness: an AI transcript is the one thing in this product nobody has
 * agreed to keep. Nothing is written to `conversation`, nothing appears in the
 * instructor's inbox, and closing the tab ends it. The moment a student wants
 * a PERSON, `POST /api/assistant/conversations` is still the only path — and
 * that one stores, notifies and is answered by hand.
 *
 * ## The response is a STREAM, not a body
 *
 * A grounded answer takes a few seconds to generate and about one second to
 * read. Waiting for the whole of it before painting anything is what makes a
 * chat feel like a form; the events below are what make it feel like someone
 * typing. See `AskEvent`.
 */

/** How long a single typed question may be. */
export const ASK_QUESTION_MAX = 500;

/**
 * How many previous turns travel back up with the question.
 *
 * Four exchanges is enough for «وده بكام؟» to still know what «ده» is, and
 * short enough that the request stays small and the cost stays bounded. The
 * widget keeps the whole transcript on screen and sends only the tail.
 */
export const ASK_HISTORY_MAX = 8;

export const ASK_ROLES = ['user', 'assistant'] as const;

export const AskTurnSchema = z
  .object({
    role: z.enum(ASK_ROLES),
    text: z.string().trim().min(1).max(4000),
  })
  .strict();

export const AskRequestSchema = z
  .object({
    question: z
      .string()
      .trim()
      .min(1, 'مفيش سؤال متكتوب')
      .max(ASK_QUESTION_MAX, `السؤال طويل أوي — الحد ${ASK_QUESTION_MAX} حرف`),
    /**
     * Previous turns, oldest first, WITHOUT the question being asked now.
     * Trusted for continuity and nothing else — it is attacker-controlled text
     * that reaches a model with no tools, no database and no session.
     */
    history: z.array(AskTurnSchema).max(ASK_HISTORY_MAX).default([]),
  })
  .strict();

export type AskTurn = z.infer<typeof AskTurnSchema>;
export type AskRequest = z.infer<typeof AskRequestSchema>;

/**
 * One frame of the answer, as it arrives.
 *
 * Sent as `text/event-stream`, one JSON object per `data:` line. Deliberately
 * a hand-narrowed union rather than a Zod schema on the reading side: the
 * producer is this repo's own server, the shapes are three fields wide, and
 * the reader is a hot loop that runs once per token.
 *
 * `done` carries the one thing the text cannot: whether المساعد thinks this
 * question wants a PERSON. The widget turns that into the «أكلّم م. أيمن»
 * card, pre-filled with what was asked — which is the entire point of having
 * built this beside an inbox instead of instead of one.
 */
export type AskEvent =
  | { readonly t: 'delta'; readonly text: string }
  | { readonly t: 'done'; readonly escalate: boolean }
  | { readonly t: 'error'; readonly code: AskErrorCode };

/**
 * Why an answer stopped, when it stopped badly.
 *
 * `unavailable` is its own code and not an `error` because it is not a
 * failure: it means the model is not configured on this deployment, and the
 * widget answers from the script instead of showing a red line. See the
 * service — the platform shipped with this route live and the key unset, and
 * that has to look like a working product.
 */
export type AskErrorCode = 'failed' | 'tooMany' | 'unavailable';

/** Narrows one parsed `data:` payload, or `null` if it is not an event. */
export function asAskEvent(value: unknown): AskEvent | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.t === 'delta' && typeof candidate.text === 'string') {
    return { t: 'delta', text: candidate.text };
  }
  if (candidate.t === 'done' && typeof candidate.escalate === 'boolean') {
    return { t: 'done', escalate: candidate.escalate };
  }
  if (
    candidate.t === 'error' &&
    (candidate.code === 'failed' || candidate.code === 'tooMany' || candidate.code === 'unavailable')
  ) {
    return { t: 'error', code: candidate.code };
  }
  return null;
}
