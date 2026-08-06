'use client';

import type { ActionResult } from '@/app/(admin)/admin/courses/actions';

/**
 * The two pieces every form in the course builder needs.
 *
 * Extracted when `course-editor.tsx` was split into eight files: three of them
 * render a server action's failure, and three private copies of the same
 * four-line component is how one of them ends up without `role="alert"`.
 */
export const IDLE: ActionResult = { ok: true };

/**
 * `aria-live="polite"` as well as `role="alert"`: the message replaces an
 * empty node rather than appearing fresh, and some screen readers do not
 * announce a `role="alert"` that was already in the accessibility tree.
 */
export function ActionError({ state }: { state: ActionResult }) {
  if (state.ok) return null;
  return (
    <p role="alert" aria-live="polite" className="text-[length:var(--fs-text-xs)] text-err">
      {state.message}
    </p>
  );
}
