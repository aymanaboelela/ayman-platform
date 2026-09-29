/**
 * Noticing that a deploy has landed BEFORE the tab tries to save into it.
 *
 * ## The failure this gets ahead of
 *
 * `lib/stale-deploy.ts` has the whole story: every deploy mints new Server
 * Action ids, so a tab that was open across one fails its next save with Next's
 * «Server Action "…" was not found on the server». On this project that is
 * several times an evening, and the person it lands on is usually the one with
 * the most typed into the page — an editor halfway through a lesson.
 *
 * Every reactive fix (`use-error-retry.ts`, `actionErrorMessage` in
 * `stale-tab.ts`) can only speak once the save has already failed. This asks
 * the server which build it is running and compares it with the build this
 * tab was served, so the toast can say «نزل تحديث» while there is still time to
 * reload with nothing lost.
 *
 * ## What is compared
 *
 * `NEXT_PUBLIC_BUILD_ID` on both sides. The Dockerfile computes it in the same
 * layer that runs `next build`, so it changes exactly when the code does, and
 * Next inlines it into the client bundle AND the server bundle as a literal —
 * the tab carries the build it was served, `app/build-id/route.ts` answers with
 * the build the server is running. Not Next's own build id: that never reaches
 * client code (`service-worker-register.tsx` records the dead end), and
 * `deploymentId` is deliberately unset (`next.config.ts` has the measurement).
 *
 * Absent in `next dev` and in any build that did not go through the
 * Dockerfile, and then there is nothing to compare — the caller does not start
 * this at all, so neither local development nor the e2e build ever polls.
 *
 * ## When it asks
 *
 * Only while someone is looking, and never in a burst:
 *
 *   · the tab becomes visible, and the window gains focus — the moment a person
 *     comes back to a tab that may have sat through a deploy, which is exactly
 *     the moment before their next save;
 *   · every `CHECK_EVERY_MS` while visible, for the editor who never leaves the
 *     tab while a deploy lands underneath them.
 *
 * All three share one floor (`MIN_GAP_MS`), counted from mount: a focus and a
 * visibility event arrive as a pair, alt-tabbing fires them all day, and a page
 * that has just loaded is by definition current.
 *
 * ## When it reloads on its own — almost never, on purpose
 *
 * A mismatch always raises the toast and stops polling (the answer cannot
 * change back). It reloads WITHOUT being asked only on the way out: the tab
 * going hidden, with nothing on it that a reload could cost. "Nothing" is
 * judged conservatively, because the cost of being wrong is someone's work:
 *
 *   · no `input`, `change` or `drop` anywhere on the page since it loaded — a
 *     typed character, a ticked answer, a chosen file. Once is enough, for the
 *     page's whole lifetime, saved or not: this cannot see whether a form's
 *     last write landed, and a search box that blocks an auto-reload costs
 *     one toast;
 *   · no `<video>`, `<audio>` or `<iframe>` in the document — a lecture
 *     playing in a background tab is the most common thing a student leaves
 *     running, and a YouTube player is an iframe nothing here can ask whether
 *     it is playing.
 *
 * And ONCE per server build per tab, recorded in `sessionStorage` before the
 * reload — the same bound `use-error-retry.ts` puts on its automatic reloads,
 * for the same reason: while a deploy is swapping containers the reload can
 * land on the OLD one, find the same mismatch, and must not go round again.
 * Failing closed: a store that throws means no automatic reload, only the
 * toast.
 */

/**
 * Not under `/api/`: that prefix is Nest's (Traefik routes it straight past
 * this app, and `next.config.ts` rewrites it there in development). Not under
 * `/_next/static/`: `public/sw.js` answers that prefix cache-first, which would
 * pin the first answer forever. Anything else is a plain network request to
 * the worker — it only intercepts GETs for `/_next/static/`, its one mark
 * image and navigations — so this path is never cached on the device.
 */
export const BUILD_ID_PATH = '/build-id';

/** Five minutes: a deploy takes about eight, so a visible tab hears within one. */
export const CHECK_EVERY_MS = 5 * 60_000;

/** The floor between two asks, whatever triggered them. */
export const MIN_GAP_MS = 30_000;

/** `sessionStorage` slot bounding the automatic reload — see the header. */
export const AUTO_RELOAD_MARK = 'ayman:stale-build-reload';

/**
 * The build the server is running, or `null` for "could not tell".
 *
 * `null` covers everything that is not a clean answer — a network failure, the
 * 404 every route returns while a deploy swaps containers, a 5xx, an HTML
 * challenge page from the edge. None of those is evidence the tab is behind,
 * so none of them may raise the toast; the next ask will try again.
 *
 * `no-store` plus a throwaway query so no cache between here and the origin —
 * the browser's, or a "cache everything" rule at the edge — can hand back an
 * answer from before the deploy it is meant to detect.
 */
export async function fetchServerBuild(): Promise<string | null> {
  try {
    const response = await fetch(`${BUILD_ID_PATH}?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { buildId?: unknown } | null;
    const id = body?.buildId;
    return typeof id === 'string' && id !== '' ? id : null;
  } catch {
    return null;
  }
}

export type BuildWatchOptions = {
  /** The build this tab was served. */
  running: string;
  /** Called once, with the server's build, the first time they differ. */
  onStale: (serverBuild: string) => void;
  /** Injected for tests; `fetchServerBuild` otherwise. */
  fetchServerBuild?: () => Promise<string | null>;
  /** Injected for tests; `location.reload()` otherwise. */
  reload?: () => void;
};

/** Starts watching. Returns the teardown. */
export function watchBuild({
  running,
  onStale,
  fetchServerBuild: ask = fetchServerBuild,
  reload = () => window.location.reload(),
}: BuildWatchOptions): () => void {
  let disposed = false;
  let inFlight = false;
  let lastAsked = Date.now();
  let serverBuild: string | null = null;
  let interacted = false;

  async function check(): Promise<void> {
    if (disposed || serverBuild !== null || inFlight) return;
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - lastAsked < MIN_GAP_MS) return;
    lastAsked = now;

    inFlight = true;
    const answer = await ask();
    inFlight = false;

    if (disposed || answer === null || answer === running) return;
    serverBuild = answer;
    onStale(answer);
  }

  function hasUnsavedWork(): boolean {
    return interacted || document.querySelector('video, audio, iframe') !== null;
  }

  function reloadIfSafe(): void {
    if (serverBuild === null) return;
    if (document.visibilityState !== 'hidden') return;
    if (hasUnsavedWork()) return;
    try {
      if (window.sessionStorage.getItem(AUTO_RELOAD_MARK) === serverBuild) return;
      window.sessionStorage.setItem(AUTO_RELOAD_MARK, serverBuild);
    } catch {
      return;
    }
    reload();
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') void check();
    else reloadIfSafe();
  };
  const onFocus = () => void check();
  const onInteract = () => {
    interacted = true;
  };
  const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onFocus);
  // Capture, so a handler that stops propagation cannot hide an edit from us.
  for (const type of INTERACTIONS) document.addEventListener(type, onInteract, true);

  return () => {
    disposed = true;
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', onFocus);
    for (const type of INTERACTIONS) document.removeEventListener(type, onInteract, true);
  };
}

const INTERACTIONS = ['input', 'change', 'drop'] as const;
