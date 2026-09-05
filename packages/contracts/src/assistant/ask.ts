import { z } from '@ayman/contracts/zod';
import { copy } from '@ayman/contracts/copy';

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

/* ────────────────────────────────────────────────────────────────────────
 * الزراير اللي تحت الرد — where an answer POINTS.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * How many destinations may ride along with one answer.
 *
 * Three, and the number is the design. A wall of buttons is a menu, and the
 * guided tree next door already IS the menu — a good one, written by hand,
 * that this half exists precisely because a student walked past. An answer
 * that ends in six links has not answered anything; it has re-asked the
 * question as a list. One is the common case, three is a generous ceiling for
 * «الكتب بكام والاشتراك بكام؟», and anything past it is dropped rather than
 * rejected: a fourth link is not worth failing an answer the student is
 * already reading.
 */
export const ASK_ACTIONS_MAX = 3;

/** Longest label a button may carry — a pill in a 300px panel, not a sentence. */
export const ASK_ACTION_LABEL_MAX = 40;

/**
 * Where المساعد is allowed to send somebody, keyed by the id it names.
 *
 * ⚠️ THE MODEL NEVER WRITES A PATH. It names an id from this table and the
 * server looks the href up — which is what makes «a button that 404s» not a
 * bug this feature can have. The alternative, asking for a URL and checking
 * it, is one hallucinated `/support` away from a dead end that looks exactly
 * like a working button until it is pressed.
 *
 * ⚠️ A total `Record` over `AskActionId`, whose keys are
 * `copy.assistant.ai.actions`. So a destination with no Arabic label does not
 * compile and an Arabic label with no destination does not compile — the same
 * arrangement `script.ts` uses for its nodes, for the same reason: the copy
 * and the routing are one fact written twice, and the compiler is what keeps
 * them from drifting.
 *
 * Every path below is an App Router page in `apps/web/app` — `ask.spec.ts`
 * walks the filesystem and asserts it, because "this route exists" is a claim
 * that goes stale the day somebody renames a folder, and nothing else in the
 * system would notice.
 *
 * ## The pairs are deliberate, not duplication
 *
 * `/books` and `/store` are the SAME shop, and `/essentials` and
 * `/foundations` the same lessons — one rendered in the marketing chrome, one
 * inside the signed-in shell. Sending a signed-in student to the marketing
 * copy throws them out of the app (rail gone, topbar replaced, back button
 * the only way home — reported with a screenshot, see `student-nav-items.ts`),
 * and sending a visitor to the in-app one bounces them to the login page. So
 * both are here and the prompt says which is which.
 */
export type AskActionId = keyof typeof copy.assistant.ai.actions;

export const ASK_ACTION_HREFS: Record<AskActionId, string> = {
  courses: '/courses',
  books: '/books',
  essentials: '/essentials',
  dashboard: '/dashboard',
  library: '/library',
  path: '/path',
  results: '/results',
  foundations: '/foundations',
  store: '/store',
  orders: '/store/orders',
  playground: '/playground',
  profile: '/profile',
  devices: '/settings/devices',
  login: '/login',
  register: '/register',
};

/**
 * One button under an answer: a name and an in-app path.
 *
 * The LABEL travels rather than being looked up client-side, because a course
 * button carries the course's own title and there is no table to look that up
 * in. It is still never model-authored — see `askActions`.
 */
export interface AskAction {
  readonly label: string;
  readonly href: string;
}

/**
 * A course page, `/courses/<slug>`.
 *
 * The one destination family that is not a fixed path, and the one worth the
 * exception: «الكورس ده بكام؟» wants the button that opens THAT course, not
 * the catalog it is somewhere inside. Mirrors `SlugSchema` in `content.ts` —
 * lowercase Latin, digits and single hyphens — deliberately re-stated here
 * rather than imported, so this module stays free of the content schemas and
 * out of the client bundle that carries them.
 */
const COURSE_HREF = /^\/courses\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The id a model names for a course page: `course:<slug>`. */
const COURSE_ID = /^course:([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/**
 * Whether a path is somewhere المساعد may send a reader.
 *
 * Membership for the fixed table, SHAPE for a course page — and the
 * difference matters, so it is stated plainly: nothing on the client knows
 * which slugs exist. `askActions` is where a course href is proven, against
 * the catalog the server is already holding; this function is the second
 * fence, and what it stops is a malformed or invented `href` on the wire
 * turning into an anchor the reader can press.
 */
export function isAskHref(value: string): boolean {
  return FIXED_HREFS.has(value) || COURSE_HREF.test(value);
}

const FIXED_HREFS: ReadonlySet<string> = new Set(Object.values(ASK_ACTION_HREFS));

/** Whether a string names a destination in the fixed table. */
export function isAskActionId(value: string): value is AskActionId {
  return Object.hasOwn(ASK_ACTION_HREFS, value);
}

/**
 * The buttons for a list of ids the model named — ordered, deduped, capped.
 *
 * ⚠️ THIS IS THE VALIDATION BOUNDARY, and it is on the SERVER. Everything
 * that reaches a student's screen as a link is built here out of two things
 * the model did not write: a path from `ASK_ACTION_HREFS`, and a label from
 * `copy.assistant.ai.actions` (or, for a course, the title of a course that is
 * actually in the published catalog). An id nobody recognises — `/support`,
 * `course:does-not-exist`, `__proto__`, an entire English sentence — is
 * DROPPED. Not rejected, not logged as a failure, not turned into an error the
 * student reads: dropped, leaving an answer with one button instead of two, or
 * with none, which is exactly what this feature looked like last week.
 *
 * `courses` is the catalog snapshot the caller already has in hand (see
 * `AssistantAiService.courses()`). Passing nothing is safe and means no course
 * button can be built — the failure mode is a missing button, never a wrong
 * one.
 */
export function askActions(
  ids: readonly string[],
  courses: readonly { readonly slug: string; readonly title: string }[] = [],
): readonly AskAction[] {
  const out: AskAction[] = [];
  const seen = new Set<string>();

  for (const raw of ids) {
    if (out.length >= ASK_ACTIONS_MAX) break;
    const id = raw.trim();

    const course = COURSE_ID.exec(id);
    if (course) {
      /*
       * A slug the CATALOG confirms, and a title the catalog wrote. The model
       * naming a course that was unpublished this morning produces no button,
       * which is the whole reason the lookup is against the snapshot rather
       * than against the shape of the string.
       */
      const match = courses.find((entry) => entry.slug === course[1]);
      if (!match) continue;
      const href = `/courses/${match.slug}`;
      if (seen.has(href)) continue;
      seen.add(href);
      out.push({ label: trimLabel(match.title), href });
      continue;
    }

    if (!isAskActionId(id)) continue;
    const href = ASK_ACTION_HREFS[id];
    if (seen.has(href)) continue;
    seen.add(href);
    out.push({ label: copy.assistant.ai.actions[id], href });
  }

  return out;
}

/** A course title is Arabic prose of any length; a pill is not. */
function trimLabel(title: string): string {
  const text = title.trim();
  return text.length <= ASK_ACTION_LABEL_MAX ? text : `${text.slice(0, ASK_ACTION_LABEL_MAX - 1)}…`;
}

/**
 * The destinations, as the model reads them.
 *
 * One line per id, so the prompt lists what can be pointed at without any file
 * outside this one carrying a copy of the list. Arabic labels on purpose: the
 * model is choosing between places a student would name in Arabic, and an
 * English gloss of «التأسيس» would just be a second translation to keep in
 * step.
 */
export function askActionMenu(): string {
  return (Object.keys(ASK_ACTION_HREFS) as AskActionId[])
    .map((id) => `${id} — ${copy.assistant.ai.actions[id]}`)
    .join('\n');
}

/**
 * How المساعد names a destination inside its own answer: `[[GO:results]]`.
 *
 * The same trick as `[[ASK_AYMAN]]` and for the same reason — one request, no
 * second classification round-trip — and it is defined HERE rather than beside
 * that one because the ids it carries are this module's vocabulary. The
 * service that owns the prompt strips these before any text reaches the
 * browser; see `SentinelFilter`, which must hold back a tail that could still
 * become one.
 *
 * Global, so `readGoMarkers` can find every marker in one pass. ⚠️ A `/g`
 * regex carries `lastIndex` between calls, so this constant is only ever used
 * through `matchAll` on a fresh string — never `.test()`.
 */
export const ASK_GO_PATTERN = /\[\[GO:([a-z0-9:_-]{1,120})\]\]/g;

/** The literal a stream filter has to watch for before it can release a tail. */
export const ASK_GO_OPEN = '[[GO:';

/**
 * The answer with its markers removed, and the ids they named.
 *
 * Order is the model's, which is the order the buttons appear in — the first
 * one it thought of is the one the answer was mostly about. Nothing here
 * validates an id: that is `askActions`, which is the only place that can,
 * because it is the only place holding the catalog.
 */
export function readGoMarkers(text: string): { readonly text: string; readonly ids: string[] } {
  const ids: string[] = [];
  const stripped = text.replace(ASK_GO_PATTERN, (_match, id: string) => {
    ids.push(id);
    return '';
  });
  return { text: stripped, ids };
}

/**
 * One frame of the answer, as it arrives.
 *
 * Sent as `text/event-stream`, one JSON object per `data:` line. Deliberately
 * a hand-narrowed union rather than a Zod schema on the reading side: the
 * producer is this repo's own server, the shapes are three fields wide, and
 * the reader is a hot loop that runs once per token.
 *
 * `done` carries the two things the text cannot: whether المساعد thinks this
 * question wants a PERSON — the widget turns that into the «أكلّم م. أيمن»
 * card, pre-filled with what was asked, which is the entire point of having
 * built this beside an inbox instead of instead of one — and where the answer
 * POINTS, as up to three real destinations. See `AskAction`.
 */
export type AskEvent =
  | { readonly t: 'delta'; readonly text: string }
  | {
      readonly t: 'done';
      readonly escalate: boolean;
      /** Up to three places this answer points at. Absent means none. */
      readonly actions?: readonly AskAction[];
    }
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
    return { t: 'done', escalate: candidate.escalate, actions: asAskActions(candidate.actions) };
  }
  if (
    candidate.t === 'error' &&
    (candidate.code === 'failed' || candidate.code === 'tooMany' || candidate.code === 'unavailable')
  ) {
    return { t: 'error', code: candidate.code };
  }
  return null;
}

/**
 * The buttons on a `done` frame, narrowed — the second fence.
 *
 * The first one is `askActions` on the server, and it is the one that matters:
 * by the time a frame is written, every href in it came out of a table. This
 * runs anyway, on the reader's side, and drops anything whose `href` is not a
 * path this app serves.
 *
 * Not paranoia about our own server, but about the three ways a dead button
 * still gets rendered without one: an older deployment answering a newer tab
 * with a route that has since been renamed; a hand-written test double; and
 * the day somebody decides it would be simpler to let the model write the URL
 * after all. In every one of those the failure is silent and lands on a
 * student — a button that looks like the answer and goes to a 404. Dropping it
 * costs an affordance and keeps the promise: nothing المساعد draws as a
 * destination fails to be one.
 *
 * Deduped by href and capped at `ASK_ACTIONS_MAX`, because neither is
 * guaranteed by anything upstream of a network boundary.
 */
export function asAskActions(value: unknown): readonly AskAction[] {
  if (!Array.isArray(value)) return [];

  const actions: AskAction[] = [];
  const seen = new Set<string>();

  for (const entry of value as readonly unknown[]) {
    if (actions.length >= ASK_ACTIONS_MAX) break;
    if (typeof entry !== 'object' || entry === null) continue;

    const { label, href } = entry as Record<string, unknown>;
    if (typeof label !== 'string' || typeof href !== 'string') continue;

    const text = label.trim();
    if (text.length === 0 || text.length > ASK_ACTION_LABEL_MAX) continue;
    if (!isAskHref(href) || seen.has(href)) continue;

    seen.add(href);
    actions.push({ label: text, href });
  }

  return actions;
}
