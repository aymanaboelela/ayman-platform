import { copy } from '@ayman/contracts/copy';

/**
 * المساعد's question tree — pure data, walked by the widget.
 *
 * ## Why this is data and not components
 *
 * The whole point of the assistant is that every answer was written by a human
 * on purpose. Expressed as JSX it would be a hundred lines of markup nobody
 * can check for holes; expressed as a graph it is a structure a test can walk
 * — and `script.test.ts` does, asserting that every node is reachable, that no
 * branch dead-ends, and that no Arabic text is stranded with no node to show
 * it. None of that needs a browser, a server, or a database.
 *
 * ## Ids ARE copy keys
 *
 * `AssistantNodeId` is `keyof typeof copy.assistant.script`, and `NODES` is a
 * total `Record` over it. So a node with no Arabic text does not compile, and
 * Arabic text with no node does not compile either. The two files cannot drift
 * — which matters more here than anywhere else in the product, because the
 * copy IS the feature. Same arrangement for `AssistantChoiceId`.
 *
 * No relative import beyond `../copy/ar` — the widget reaches this through
 * `@ayman/contracts/assistant/script` without pulling the root barrel (and the
 * whole quiz surface) into a client bundle.
 */

/** Node ids, and simultaneously the keys of `copy.assistant.script`. */
export type AssistantNodeId = keyof typeof copy.assistant.script;

/** Choice ids, and simultaneously the keys of `copy.assistant.choices`. */
export type AssistantChoiceId = keyof typeof copy.assistant.choices;

/** Walk on to another node. */
export interface AssistantChoiceNext {
  readonly id: AssistantChoiceId;
  readonly next: AssistantNodeId;
}

/** Leave the widget for a real page. Internal paths only — see `script.test.ts`. */
export interface AssistantChoiceLink {
  readonly id: AssistantChoiceId;
  readonly href: string;
}

/** Hand off to a human. Opens a conversation. */
export interface AssistantChoiceEscalate {
  readonly id: AssistantChoiceId;
  readonly escalate: true;
}

export type AssistantChoice =
  | AssistantChoiceNext
  | AssistantChoiceLink
  | AssistantChoiceEscalate;

export interface AssistantNode {
  /**
   * Live data this node renders UNDER its body, if any. The widget resolves it
   * from the public catalog snapshot it was handed — this module names the
   * need and never fetches anything itself.
   */
  readonly data?: 'courses';
  readonly choices: readonly AssistantChoice[];
}

export const ASSISTANT_ROOT: AssistantNodeId = 'root';

/**
 * A `Record`, not an array: TypeScript then requires an entry for every id, so
 * adding Arabic text without wiring it up is caught at build time rather than
 * by a student staring at a button that does nothing.
 */
export const ASSISTANT_NODES: Record<AssistantNodeId, AssistantNode> = {
  root: {
    choices: [
      { id: 'courses', next: 'courses' },
      { id: 'join', next: 'join' },
      { id: 'books', next: 'books' },
      { id: 'study', next: 'study' },
      { id: 'account', next: 'account' },
      { id: 'talk', escalate: true },
    ],
  },

  // ── الكورسات والمحتوى ────────────────────────────────────────────────
  courses: {
    choices: [
      { id: 'coursesAvailable', next: 'coursesList' },
      { id: 'courseInside', next: 'courseInside' },
      { id: 'courseStart', next: 'courseStart' },
      { id: 'back', next: 'root' },
    ],
  },
  coursesList: {
    data: 'courses',
    choices: [
      { id: 'browseCourses', href: '/courses' },
      { id: 'back', next: 'courses' },
    ],
  },
  courseInside: {
    choices: [
      { id: 'browseCourses', href: '/courses' },
      { id: 'essentials', href: '/essentials' },
      { id: 'back', next: 'courses' },
    ],
  },
  courseStart: {
    choices: [
      { id: 'talk', escalate: true },
      { id: 'back', next: 'courses' },
    ],
  },

  // ── الاشتراك والحساب ─────────────────────────────────────────────────
  join: {
    choices: [
      { id: 'joinAccount', next: 'joinAccount' },
      { id: 'joinEnroll', next: 'joinEnroll' },
      { id: 'joinPrice', next: 'joinPrice' },
      { id: 'back', next: 'root' },
    ],
  },
  joinAccount: {
    choices: [
      { id: 'register', href: '/register' },
      { id: 'back', next: 'join' },
    ],
  },
  /*
   * The subscribe walk-through — THREE nodes, one step each, and a chain
   * rather than a single paragraph.
   *
   * «امشي معاه لحد آخر خطوة»: a student who wants to pay has to choose a
   * course, choose a plan, transfer on Vodafone Cash, and then send back two
   * things the platform cannot learn on its own — the number the money came
   * FROM, and a screenshot of the transfer. That is four decisions, and
   * stacking them into one bubble is how the second half stops being read.
   *
   * Each node keeps ONE onward stop, which is also what keeps all three in the
   * AI corpus: `assistant-knowledge.ts` treats a node with two or more onward
   * choices as a menu and drops it. So the chain is not only easier to read in
   * the widget — it is the difference between the chat knowing the payment
   * steps and the chat knowing that a menu about payment exists.
   *
   * No number anywhere in the copy. The plan prices are on the course's own
   * panel and the Vodafone Cash number comes from site settings, and both move
   * without anybody touching this repo — same reasoning as `joinPrice` below.
   *
   * ⚠️ EVERY `back` ON A CHAIN POINTS AT THE MENU, never at the step before —
   * and that is not a UX preference, it is a correctness constraint.
   *
   * `assistant-knowledge.ts` labels each corpus entry with the choice that
   * LEADS to its node, walking every node in key order and letting the last
   * write win. A `back` edge is an edge like any other to that walk, so
   * `joinPay: { back → joinEnroll }` silently retitled the subscribe answer
   * «رجوع» — the one word in the tree that carries no meaning — and threw away
   * «إزاي أشترك في كورس؟», which is the exact phrase a student types. The
   * matcher then had «رجوع» as a STRONG token for the payment steps.
   *
   * Pointing back at the menu is also what the rest of this tree already does,
   * so nothing here is a special case; it just now has a reason written down.
   * A `backStep` id would NOT fix it — the same module treats any non-`back`
   * onward choice as evidence the node is a menu and drops it from the corpus
   * entirely, which is worse than a bad label.
   */
  joinEnroll: {
    choices: [
      { id: 'joinPay', next: 'joinPay' },
      { id: 'browseCourses', href: '/courses' },
      { id: 'back', next: 'join' },
    ],
  },
  joinPay: {
    choices: [
      { id: 'joinReview', next: 'joinReview' },
      { id: 'back', next: 'join' },
    ],
  },
  /*
   * The last step, and the one that ESCALATES.
   *
   * Review is a human reading a screenshot against a real Vodafone Cash log —
   * there is no automatic approval anywhere in `payments.ts` — so the only
   * honest answer to «طلبي واقف ليه؟» is the person doing the reading.
   * `subscribe.success` already refuses to name a turnaround window on purpose
   * (a stated window becomes a complaint the moment it slips), and this node
   * holds that line: it says the review is by hand and says how the answer
   * arrives, and it does not invent hours.
   */
  joinReview: {
    choices: [
      { id: 'talk', escalate: true },
      { id: 'dashboard', href: '/dashboard' },
      { id: 'back', next: 'join' },
    ],
  },
  /*
   * Price is deliberately a DEAD END that escalates.
   *
   * Writing a number here would put a price in the copy table, where it would
   * go stale the first time an offer runs and nobody would remember this file
   * exists. The assistant's job is to get the question to someone who knows
   * the answer today.
   */
  joinPrice: {
    choices: [
      { id: 'talk', escalate: true },
      { id: 'back', next: 'join' },
    ],
  },

  // ── الكتاب الورقي ────────────────────────────────────────────────────
  /*
   * The shop had no branch on this tree at all, which is why it is here.
   *
   * «الكتب» is a whole product surface — a public catalogue at `/books`, a
   * cart, a Vodafone Cash checkout, and an order the student can follow at
   * `/store/orders` — and the assistant's five-button menu behaved as though
   * none of it existed. The two questions it is asked about books are «أطلبه
   * إزاي؟» and «فين كتابي؟», so the branch is exactly those two.
   */
  books: {
    choices: [
      { id: 'bookOrderHow', next: 'bookOrderHow' },
      { id: 'bookNotArrived', next: 'bookNotArrived' },
      { id: 'back', next: 'root' },
    ],
  },
  /*
   * `/books` and NOT `/store`.
   *
   * They are the same shop and only one of them is open to a visitor with no
   * session: `/store` renders inside the student shell and `proxy.ts` sends an
   * anonymous request from it to the sign-in page. The assistant is on the
   * public site — `escalate.leadGuest` exists precisely because the person
   * asking may have no account yet — so a link that bounces to a login form is
   * a dead end dressed as an answer.
   */
  bookOrderHow: {
    choices: [
      { id: 'browseBooks', href: '/books' },
      { id: 'back', next: 'books' },
    ],
  },
  /*
   * «طمّنه» — the node the instructor asked for by name.
   *
   * ⚠️ The order of the answer is deliberate and it was WRONG at first: it
   * used to reassure first («الكتاب في السكة وبيوصل خلال أيام»), give the
   * reason second, and point at the page third. That put a claim about ONE
   * student's shipment in front of the only thing that actually knows —
   * stated by a node with no session, to a student whose order may never have
   * been paid for at all. So the page leads now, and the reassurance that
   * follows it is about the SHOP being busy, which is true for everybody
   * reading this.
   *
   * `/store/orders` is authed on purpose — it is their own order, and nobody
   * else's business.
   *
   * It must not promise a date either. `books.mine.noteShipped` already
   * carries that discipline for the same person on the dashboard («ساعات
   * بيتأخر يوم أو اتنين، وده عادي»), and a cheerful date from the assistant
   * that the courier then misses is worse than the worry it was meant to
   * settle.
   */
  bookNotArrived: {
    choices: [
      { id: 'bookWhenExactly', next: 'bookWhenExactly' },
      { id: 'myOrders', href: '/store/orders' },
      { id: 'back', next: 'books' },
    ],
  },
  /*
   * «هيوصل إمتى بالظبط؟» — and the answer is a PROMISE THE PLATFORM KEEPS
   * instead of a date it guesses.
   *
   * Nobody here knows which day a courier will knock. What the platform does
   * know is its own procedure: somebody calls the day before. That answers the
   * real question underneath — «أستنى في البيت إمتى؟» — without naming a date,
   * which is the one thing this node is not allowed to do.
   */
  bookWhenExactly: {
    choices: [
      { id: 'talk', escalate: true },
      { id: 'myOrders', href: '/store/orders' },
      { id: 'back', next: 'books' },
    ],
  },

  // ── المذاكرة والامتحانات ─────────────────────────────────────────────
  study: {
    choices: [
      { id: 'studyQuizzes', next: 'studyQuizzes' },
      { id: 'studyRetake', next: 'studyRetake' },
      { id: 'studyProgress', next: 'studyProgress' },
      { id: 'back', next: 'root' },
    ],
  },
  studyQuizzes: {
    choices: [{ id: 'back', next: 'study' }],
  },
  studyRetake: {
    choices: [
      { id: 'talk', escalate: true },
      { id: 'back', next: 'study' },
    ],
  },
  studyProgress: {
    choices: [
      { id: 'dashboard', href: '/dashboard' },
      { id: 'back', next: 'study' },
    ],
  },

  // ── مشاكل الحساب ─────────────────────────────────────────────────────
  account: {
    choices: [
      { id: 'accountPassword', next: 'accountPassword' },
      { id: 'accountProfile', next: 'accountProfile' },
      { id: 'accountVideo', next: 'accountVideo' },
      { id: 'back', next: 'root' },
    ],
  },
  /*
   * ESCALATES, and it has to.
   *
   * This node used to offer the login page and nothing else, because its copy
   * described a "نسيت كلمة السر" flow that does not exist — no reset route, no
   * mail, no SMS (`auth.config.ts` says so beside the disabled OTP plugin).
   * Sending a locked-out student to the page they already cannot get past is
   * the one dead end on this tree that leaves someone worse off than the menu
   * they started from. `talk` is FIRST for the same reason it is first on
   * `joinPrice`: it is the only choice here that ends with the problem solved.
   */
  accountPassword: {
    choices: [
      { id: 'talk', escalate: true },
      { id: 'login', href: '/login' },
      { id: 'back', next: 'account' },
    ],
  },
  accountProfile: {
    choices: [
      { id: 'profile', href: '/profile' },
      { id: 'back', next: 'account' },
    ],
  },
  accountVideo: {
    choices: [
      { id: 'talk', escalate: true },
      { id: 'back', next: 'account' },
    ],
  },
};

export function isNextChoice(choice: AssistantChoice): choice is AssistantChoiceNext {
  return 'next' in choice;
}

export function isLinkChoice(choice: AssistantChoice): choice is AssistantChoiceLink {
  return 'href' in choice;
}

export function isEscalateChoice(choice: AssistantChoice): choice is AssistantChoiceEscalate {
  return 'escalate' in choice;
}

/**
 * Whether a string names a real node.
 *
 * The wire carries `entryPath` — the trail that led to an escalation — and it
 * arrives from a browser, so it is attacker-controlled. The API validates
 * every element through this before storing it, which is what keeps the admin
 * inbox rendering node ids it can actually resolve to Arabic rather than
 * whatever someone posted.
 */
export function isAssistantNodeId(value: string): value is AssistantNodeId {
  return Object.hasOwn(ASSISTANT_NODES, value);
}
