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
 * Asks المساعد to open, straight onto the handoff form.
 *
 * `escalate` rather than the guide: the only caller today is a page that has
 * already failed, and walking someone whose lesson would not load through a
 * decision tree about enrolment is the wrong screen. They want a person.
 */
export function openAssistant(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ASSISTANT_OPEN_EVENT));
}
