import { copy } from '../copy/ar';

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
  joinEnroll: {
    choices: [
      { id: 'browseCourses', href: '/courses' },
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

  // ── المذاكرة والامتحانات ─────────────────────────────────────────────
  study: {
    choices: [
      { id: 'studyQuizzes', next: 'studyQuizzes' },
      { id: 'studyRetake', next: 'studyRetake' },
      { id: 'studyAppeal', next: 'studyAppeal' },
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
  studyAppeal: {
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
  accountPassword: {
    choices: [
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
