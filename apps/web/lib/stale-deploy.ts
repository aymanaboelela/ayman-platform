/**
 * "This tab is older than the server it is talking to."
 *
 * ## The failure
 *
 * Next gives every Server Action a build-scoped id and ships it inside the
 * client bundle. A deploy mints new ids. So a tab that was open across a deploy
 * still holds the OLD id, and the first action it fires — a form submit, a
 * delete, an admin save — is answered by a server that has never heard of it:
 *
 *   Server Action "70674c275044efa878d1f18e7c30cc06df93a1365f" was not found
 *   on the server.
 *
 * Recorded once on production against `/admin/courses/{id}` (`/admin/errors`
 * row 17) — an editor with the course builder open while `main` deployed, which
 * on this project happens several times an evening.
 *
 * ## Why it needs its own branch
 *
 * Nothing is broken. The build the tab is holding no longer exists, and the
 * only cure is to go and get the current one. That has two consequences the
 * generic error path gets wrong in opposite directions:
 *
 *  1. `router.refresh()` — what «حاول تاني» does first — CANNOT fix it. The
 *     refresh re-fetches the RSC payload but leaves the loaded client bundle,
 *     and the stale action id lives in that bundle. The student or editor
 *     presses retry, watches nothing happen, and only the second press (which
 *     escalates to `location.reload()`) actually works. So this skips straight
 *     to the reload that was always going to be required.
 *  2. It is not a fault, so it must not be filed as one. `/admin/errors` exists
 *     to answer «إيه اللي بايظ» and every deploy-shaped row in it is a row that
 *     makes a real one harder to see.
 *
 * ## Matched on the message, deliberately
 *
 * Next throws this as an internal error type it does not export, and the
 * `digest` is absent (it is raised on the client). The sentence itself is the
 * only stable handle, and it is stable: it is a fixed string in Next's source
 * with the action id interpolated into it, and it carries a documentation URL
 * that would move with it. Matched on two invariant fragments rather than the
 * whole sentence so a reworded middle does not silently turn this off.
 *
 * ⚠️ If this stops matching, the symptom is the OLD behaviour — a retry that
 * needs two presses and a spurious row in the error log. Nothing breaks, which
 * is why it is worth stating: it will not announce itself.
 */
export function isStaleDeployError(error: Error): boolean {
  const message = error.message;
  return message.includes('Server Action') && message.includes('was not found on the server');
}
