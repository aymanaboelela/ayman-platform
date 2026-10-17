import { isTabStale } from './stale-tab';

/**
 * Once a tab KNOWS it is older than the server, the next page it moves to is
 * fetched as a document — so every student lands on the new build on their
 * next press, and nobody is ever told to clear anything.
 *
 * ## What "stale" still cost before this
 *
 * `lib/build-watch.ts` notices a deploy within minutes and raises «نزل تحديث»,
 * and the tab reloads itself on its way into the background if nothing on it
 * could be lost. A student who never leaves the tab never gets that reload —
 * they press the rail, a card, «التالي», and keep running last build's code:
 * old screens, fixes missing, the next Server Action failing on an id the
 * server no longer has.
 *
 * Next already covers part of this: a soft navigation whose RSC answer carries
 * another build id becomes a document load (`fetch-server-response.js`; see
 * the `deploymentId` note in `next.config.ts`). What it cannot cover is a
 * navigation that never asks the server — a page still inside the router's
 * 30-second `staleTimes` window, a prefetched static one, back and forward.
 * Those render from memory, in the old build, and stay there.
 *
 * ## Why at the ROUTER's door, not at the click
 *
 * The obvious build is a capture-phase click listener that turns a link press
 * into `location.assign`. It runs BEFORE the link's own handlers, and several
 * of those exist to stop or reshape the navigation: the rail and the tab bar
 * make the ACTIVE item inert (`student-nav-list.tsx`), the welcome screen holds
 * its press for an exit animation (`welcome-scene.tsx`). A hijack in front of
 * them overrules every one. It would also miss `router.push` — forty-odd call
 * sites with no central helper — and the browser's own back button.
 *
 * `onRouterTransitionStart` (`instrumentation-client.ts`) is the one place
 * every App Router navigation passes AFTER those handlers have had their say:
 * a `<Link>` whose `onClick` prevented it never dispatches, while a link press
 * that goes ahead, every `router.push` / `replace` and every back / forward
 * does. Turning that one into a document load is the whole fix. A page with
 * unsaved work still gets its say too — a document load fires `beforeunload`,
 * which is exactly what the course editor's autosave listens to.
 *
 * A NEW module, never more exports on a shipped one — `zod-exports-only-z
 * .spec.ts` in contracts explains what an old tab does with a fresh export.
 */

export type RouterNavigationType = 'push' | 'replace' | 'traverse';

/**
 * Where, and how, to load a document instead of finishing this soft
 * navigation — or `null` to let it finish.
 *
 *   · not stale                     → `null`: nothing to fix.
 *   · another origin                → `null`: not this router's to change.
 *   · the same page                 → `null`: a `#hash` jump, or a filter that
 *                                     only rewrote the query is not a move to
 *                                     another page; nor is a back press that
 *                                     closes an overlay (`useBackDismiss`
 *                                     pops an entry that has the SAME url).
 *   · back/forward onto the runner  → `null`: see `isExamRunnerPath` — the
 *                                     runner's own back guard lives on exactly
 *                                     that pop.
 *   · `push`                        → `assign`, so back still returns here.
 *   · `replace` / `traverse`        → `replace`: the history entry already is
 *                                     (or replaces) the target, and a second
 *                                     one would make back land on it twice.
 *
 * "The same page" is judged against `current` for a push or a replace — the
 * hook runs before the URL moves — and against `previousPathname` for a
 * traverse, which only reports AFTER back/forward has moved it.
 */
export function documentLoadFor(
  href: string,
  navigationType: RouterNavigationType,
  current: Pick<Location, 'href' | 'origin' | 'pathname' | 'search'>,
  previousPathname: string,
  stale: boolean = isTabStale(),
): { href: string; mode: 'assign' | 'replace' } | null {
  if (!stale) return null;
  let target: URL;
  try {
    target = new URL(href, current.href);
  } catch {
    return null;
  }
  if (target.origin !== current.origin) return null;

  if (navigationType === 'traverse') {
    if (target.pathname === previousPathname) return null;
    if (isExamRunnerPath(target.pathname)) return null;
  } else if (target.pathname === current.pathname) {
    return null;
  }
  return { href: target.href, mode: navigationType === 'push' ? 'assign' : 'replace' };
}

/**
 * The exam runner, `/quizzes/:lessonId/attempt/:attemptId` — and not its
 * `/review`, which is an ordinary page.
 *
 * The one screen nothing AUTOMATIC may reload. Its server render posts
 * `resume` and rotates the attempt token (`quiz-runner.tsx` refuses even a
 * `router.refresh()` for that reason), and a student with a countdown running
 * does not get their paper yanked to swap builds: answers autosave, but a
 * reload still costs seconds of a clock they cannot pause. A navigation the
 * student made themselves — submitting, leaving — is not that, and goes
 * through `documentLoadFor` like any other.
 */
const EXAM_RUNNER = /^\/quizzes\/[^/]+\/attempt\/[^/]+\/?$/;

export function isExamRunnerPath(pathname: string): boolean {
  return EXAM_RUNNER.test(pathname);
}
