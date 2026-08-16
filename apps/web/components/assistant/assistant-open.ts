/**
 * Opening المساعد from somewhere that is not المساعد.
 *
 * The widget owns its own open state and always has — there is no store, no
 * context and no URL for it, deliberately (see `assistant-widget.tsx`: the
 * thread lives in the widget and nowhere else). That was fine while the
 * launcher was the only thing that could open it.
 *
 * The error boundary is the second thing. It renders inside the same layout the
 * widget is mounted in, but as a SIBLING several levels away, and threading a
 * callback from a route group's layout down into an `error.tsx` — a file Next
 * constructs itself, with a fixed two-prop signature — is not possible without
 * a provider wrapping every group purely so one button on one screen can reach
 * one setter.
 *
 * A DOM event is the smaller thing. It costs one listener on a component that
 * is already mounted, it cannot desynchronise from the widget's state because
 * it does not hold any, and it no-ops harmlessly on the surfaces where the
 * widget is suppressed (`/admin`, `/onboarding`, a graded attempt) — nothing is
 * listening, so nothing happens. Callers that care ask `shouldMountAssistant`
 * first and do not draw the button at all.
 *
 * ⚠️ `window`, not `document`. The widget's listener is registered on `window`
 * for the same reason every other global listener in this app is: it is the one
 * target that cannot be inside a portal, a dialog, or an `inert` subtree.
 */
export const ASSISTANT_OPEN_EVENT = 'ayman:assistant-open';

/**
 * WHICH screen the panel opens onto.
 *
 * `escalate` is the original and stays the default: every caller of the first
 * version was a page that had already failed, and walking someone whose lesson
 * would not load through a decision tree about enrolment is the wrong screen —
 * they want a person.
 *
 * `thread` arrived with «رسايل م. أيمن». The dashboard card's button says
 * «اقرأها وردّ» about a message already sitting in the thread, and landing that
 * press on a blank «اكتب سؤالك» box asks the student to compose a question in
 * answer to a message they have not been shown — the opposite of what the
 * button promises.
 */
export type AssistantIntent = 'escalate' | 'thread';

/**
 * Asks المساعد to open.
 *
 * The intent travels on the event's `detail` rather than as a second event
 * name, so the widget keeps ONE listener and adding a third destination later
 * is a branch rather than another registration. An event with no detail — an
 * older caller, or a hand-dispatched one — still means `escalate`, which is
 * what every caller meant before this parameter existed.
 */
export function openAssistant(intent: AssistantIntent = 'escalate'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AssistantIntent>(ASSISTANT_OPEN_EVENT, { detail: intent }));
}
