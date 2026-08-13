'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, m } from 'motion/react';
import { CheckCircle2, Loader2, MessagesSquare, RotateCcw, X } from 'lucide-react';
/*
 * SUBPATHS ONLY in this file — the two root barrels are both forbidden here.
 *
 * This widget is mounted in the `(site)`, `(app)` AND `(auth)` layouts, so it
 * is a client reference on effectively every route a student can reach. One
 * `from '@ayman/contracts'` here put the whole contracts barrel — 539 KB raw /
 * 128 KB gzip of zod schemas, libphonenumber's 245-country table and the entire
 * Arabic copy table including the admin course builder's strings — into an
 * async `<script>` in the `<head>` of 64 of 65 prerendered pages: the landing
 * page opened from a WhatsApp link, the login form, and a timed graded quiz
 * attempt. `@ayman/ui`'s barrel cost the same way, in seven Radix client
 * modules this file renders none of.
 *
 * The symbol-to-subpath mapping is not always guessable — `CatalogListSchema`
 * lives in `./catalog`, not `./content` — so typecheck rather than assume.
 *
 * ⚠️ THE SPECIFIER IS ONLY HALF OF IT, and this is where the second half is
 * paid. Subpaths fixed WHICH modules arrive; they cannot fix that this file
 * genuinely needs Zod schemas to validate three API responses, and a schema
 * imported here — through any specifier — is Zod on the critical path of every
 * route. That is what the post-Wave-2 build still measured: a 62 KB gzip chunk
 * on 21 prerendered routes, from here.
 *
 * So every Zod-dependent thing this widget does now sits behind a `import()`
 * or a `next/dynamic` boundary, and NONE of it is in the static graph above:
 *
 *   - `./assistant-session`  — the panel's own thread    (`MyConversationSchema`)
 *   - `./assistant-catalog`  — the course list           (`CatalogListSchema`)
 *   - `./assistant-escalate` — the handoff form          (`ConversationThreadSchema`)
 *   - `./assistant-thread`   — the conversation          (`ConversationThreadSchema`)
 *
 * `./assistant-guide` stays static: it is the panel's first screen, it is what
 * a tap on the launcher must paint immediately, and it reaches no schema at
 * all — `@ayman/contracts/assistant/script` is a plain node table with no Zod
 * in it, verified rather than assumed.
 *
 * `./assistant-summary` stays static BECAUSE it runs on every page load, not
 * despite it. The launcher's probe cannot wait for a tap — the dot is what
 * tells a student there is something to tap — so the one contract it reads,
 * `@ayman/contracts/assistant/summary`, deliberately carries no schema: four
 * primitives, narrowed by hand. That is what finally took Zod off the NETWORK
 * as well as off the critical path. See the probe effect below.
 */
import { copy } from '@ayman/contracts/copy';
import type { CatalogCourse } from '@ayman/contracts/catalog';
import type { ConversationThread } from '@ayman/contracts/assistant/conversation';
import type { MyConversationSummary } from '@ayman/contracts/assistant/summary';
import {
  ASSISTANT_NODES,
  isNextChoice,
  type AssistantChoice,
} from '@ayman/contracts/assistant/script';
import { cn } from '@ayman/ui/lib/cn';
// The barrel spells this `export * as motionPresets`, so the namespace form is
// the only one that reproduces it — `@ayman/ui/motion` has no `motionPresets`
// named export to destructure.
import * as motionPresets from '@ayman/ui/motion';
import { ASSISTANT_OPEN_PARAM, shouldMountAssistant } from '@/lib/assistant-mount';
import { AssistantGuide } from './assistant-guide';
import { loadAssistantSummary } from './assistant-summary';
import { useAssistantScript } from './use-assistant-script';

/*
 * The two panel screens that validate an API response, and therefore the two
 * that carry Zod.
 *
 * `next/dynamic` declares the import at module scope but does not FETCH the
 * chunk until the component actually renders (the same property
 * `showpiece-mount.tsx` relies on), and `ssr: false` stops Next emitting a
 * preload link for it. Neither screen can render before the panel is open, and
 * for most visitors neither ever renders at all: the handoff form takes an
 * explicit tap on «ابعت لأيمن», and the conversation needs a thread that
 * already exists. Someone who opens the panel, reads an answer off the guide
 * and closes it requests neither chunk.
 *
 * Both are conditionally rendered already, so this is a specifier change and
 * nothing else: same props, same parent, same place in the tree. The one
 * observable difference is that reaching either screen now waits on a chunk —
 * a round trip at the moment of a deliberate tap, rather than a delay on the
 * way to a page.
 */
const AssistantEscalate = dynamic(
  () => import('./assistant-escalate').then((module) => module.AssistantEscalate),
  { ssr: false },
);
const AssistantThread = dynamic(
  () => import('./assistant-thread').then((module) => module.AssistantThread),
  { ssr: false },
);

const c = copy.assistant;

type Mode = 'guide' | 'escalate' | 'sent' | 'thread';

/** Never changes after mount, so there is nothing to subscribe to. */
function subscribeNever(): () => void {
  return () => {};
}

/**
 * المساعد — the launcher, the panel, and everything they need.
 *
 * ## Mounted once, at the root, and rendered only after hydration
 *
 * `(site)`, `(app)` and `(admin)` are sibling route groups, so the root layout
 * is the only common ancestor — the same reason `<Toaster/>` lives there. The
 * hydration gate means this contributes nothing to the server-rendered HTML of
 * any page: no bytes in the streamed document, nothing for a cached
 * `'use cache'` shell to disagree with, and no `usePathname()` read during a
 * prerender. The widget is an enhancement; a student who never gets JavaScript
 * loses a button, not a page.
 *
 * ## Everything is fetched LATE, and most of it is never fetched at all
 *
 * The probe runs after mount, not in a layout, so no page waits on a round
 * trip for a panel most visitors never open — and what it asks for is a
 * four-field summary rather than a conversation. The thread itself is fetched
 * only when the panel opens onto it, and the catalog only when someone
 * actually walks onto the node that shows it; both are kept for the rest of
 * the session.
 */
export function AssistantWidget() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  /*
   * "Am I in a browser yet?", through React's hydration-safe path rather than
   * `useEffect` + `setState` — the same device `admin/command-palette.tsx`
   * uses, and rejected by `react-hooks/set-state-in-effect` for the same good
   * reason: an effect that immediately re-renders is a commit the user can
   * sometimes see.
   */
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    // The server has no widget to render, which is the point.
    () => false,
  );

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('guide');

  /*
   * What the LAUNCHER knows, and what the PANEL knows, kept apart on purpose.
   *
   * `summary` arrives on every page load and is four primitives; `thread` is
   * the conversation itself and arrives only if the panel opens onto it. The
   * split is the whole optimisation — see the probe effect below — and it is
   * also why `thread` wins wherever both can answer: it is the fresher of the
   * two the moment it exists, and reading a reply updates it.
   */
  const [summary, setSummary] = useState<MyConversationSummary | null>(null);
  const [thread, setThread] = useState<ConversationThread | null>(null);
  const [threadFailed, setThreadFailed] = useState(false);
  /*
   * "Has the thread fetch been started?" — a ref, not state, because it is
   * read and written from an EFFECT (the `?assistant=1` path opens the panel
   * without anyone tapping anything) and a `setState` in an effect body is
   * both a visible extra commit and what `react-hooks/set-state-in-effect`
   * exists to catch. Nothing renders from it, so state would buy nothing.
   */
  const threadRequested = useRef(false);

  const [courses, setCourses] = useState<CatalogCourse[] | null>(null);
  const [coursesPending, setCoursesPending] = useState(false);
  const [coursesFailed, setCoursesFailed] = useState(false);

  const script = useAssistantScript();
  const launcherRef = useRef<HTMLButtonElement>(null);


  /*
   * Who is this, is there a thread, and is anything in it unread?
   *
   * One request answers all three. It runs once per page load rather than once
   * per open, because the answer drives the dot on the LAUNCHER — a student
   * has to be able to see that a reply landed without opening anything.
   *
   * ## What this used to cost, and what it costs now
   *
   * It used to ask `…/mine`: the entire conversation, every message the
   * student and the instructor had ever exchanged, validated with a 62 KB Zod
   * schema, on every page load of every route — to decide whether to draw a
   * ten-pixel circle. Moving the fetch behind `import('./assistant-session')`
   * took those bytes off the critical path but not off the network: the chunk
   * was still requested on every page, after hydration, by students who would
   * never open the panel.
   *
   * Three cheaper fixes were considered first and all three were worse:
   *
   *   - Drop the validation and read the JSON raw. Then a contract drift is a
   *     silent `undefined` in the panel instead of a thrown error at the
   *     fetch. 62 KB is not worth that.
   *   - Move the probe into the panel, so it runs on open. Then the dot only
   *     appears once you open the thing the dot exists to tell you to open.
   *   - Fire it only for visitors known to have escalated (a local marker).
   *     That marker does not survive a cleared browser or a second device, and
   *     the failure is silent in the worst place — the instructor answered and
   *     the student is never told. The bell notification softens it on `(app)`
   *     routes only; `(site)` and `(auth)` have no bell.
   *
   * What worked was a smaller ANSWER, not a smaller client:
   * `…/mine/summary` returns `{ unread, hasThread, hasOpenThread, isSignedIn }`
   * and its contract carries no schema at all, so `./assistant-summary` is a
   * STATIC import, no chunk is fetched, and the body is a few dozen bytes
   * instead of a conversation. The conversation is now the panel's business —
   * `ensureThread` below — where Zod already is.
   */
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    void loadAssistantSummary()
      .then((result) => {
        if (cancelled) return;
        setSummary(result);
      })
      // Deliberately silent. The widget failing to reach the API is not worth
      // interrupting a lesson over; the launcher still opens onto the script,
      // which needs no server at all.
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  /*
   * The thread wins over the summary once it exists.
   *
   * Both can answer this, and they disagree for exactly one moment that
   * matters: the summary was fetched on page load, and reading the reply
   * clears `unreadForVisitor` on the thread (see `assistant-thread.tsx`). If
   * the stale count won, the dot would still be sitting on the launcher after
   * the student had just read the message underneath it.
   */
  const unread = thread?.unreadForVisitor ?? summary?.unread ?? 0;
  const isSignedIn = summary?.isSignedIn ?? false;

  /**
   * Fetches the conversation, once, the first time something is about to
   * render it — a tap on the launcher with a live thread waiting, or the
   * `?assistant=1` a reply notification carries.
   *
   * Not retried on failure, deliberately: `copy.assistant.thread.failed` tells
   * the student to refresh, which is the honest instruction when the panel has
   * no other way to reach the messages. A button that silently re-fetched
   * would be a spinner that sometimes never ends.
   */
  const ensureThread = useCallback(() => {
    if (threadRequested.current) return;
    threadRequested.current = true;
    void import('./assistant-session')
      .then(({ loadAssistantThread }) => loadAssistantThread())
      .then((loaded) => {
        /*
         * `null` is a legitimate answer from `…/mine` and an impossible one
         * here: nothing calls this unless the summary said there is a thread.
         * If the two ever disagree anyway — the instructor deleted it, a guest
         * cookie expired between the two requests — the failure line is the
         * honest answer. A spinner with nothing behind it never stops.
         */
        if (loaded) setThread(loaded);
        else setThreadFailed(true);
      })
      // A failed chunk fetch lands here too, and means the same thing to the
      // student: the conversation is not going to appear on this page load.
      .catch(() => setThreadFailed(true));
  }, []);

  /**
   * Lazily loads the catalog the first time a node actually needs it — and now
   * lazily loads the CODE that loads it, too. `./assistant-catalog` carries
   * `CatalogListSchema`, so a static import would put Zod back on the critical
   * path of every route to serve one node of the tree. The chunk request and
   * the API request are both consequences of the same tap.
   */
  const ensureCourses = useCallback(() => {
    if (courses !== null || coursesPending) return;
    setCoursesPending(true);
    setCoursesFailed(false);
    void import('./assistant-catalog')
      .then(({ loadAssistantCatalog }) => loadAssistantCatalog())
      .then((list) => setCourses(list.courses))
      .catch(() => setCoursesFailed(true))
      .finally(() => setCoursesPending(false));
  }, [courses, coursesPending]);

  /**
   * Moving through the tree, with the catalog fetched as a consequence of the
   * TAP rather than of the render.
   *
   * The obvious version — an effect watching `node.data` — is the shape
   * `react-hooks/set-state-in-effect` rejects, and it is right to: a fetch is
   * something the student's action causes, not something the panel's existence
   * causes. Both movers are wrapped, because the trail can rewind onto the
   * courses node just as a choice can walk onto it.
   */
  const choose = useCallback(
    (choice: AssistantChoice) => {
      if (isNextChoice(choice) && ASSISTANT_NODES[choice.next].data === 'courses') {
        ensureCourses();
      }
      script.choose(choice);
    },
    [ensureCourses, script],
  );

  const rewindTo = useCallback(
    (index: number) => {
      const target = script.path[index];
      if (target && ASSISTANT_NODES[target].data === 'courses') ensureCourses();
      script.rewindTo(index);
    },
    [ensureCourses, script],
  );

  /*
   * `?assistant=1` — where a reply notification lands.
   *
   * DERIVED, not stored. The thread lives in this widget and nowhere else, so
   * the notification has no page to link to and carries this flag instead; but
   * an effect that reacted to it by calling `setOpen` would be the same
   * "commit then immediately re-render" the hydration gate above avoids. The
   * URL is already state — reading it is enough, and closing the panel strips
   * the parameter so a refresh does not reopen it forever.
   */
  const deepLinked =
    searchParams.get(ASSISTANT_OPEN_PARAM) !== null &&
    // `hasThread`, not `hasOpenThread`: the notification that carries this
    // parameter was sent when the instructor replied, and he may well have
    // closed the thread since. A link he answered has to still land on the
    // answer.
    (summary?.hasThread === true || thread !== null);
  const panelOpen = open || deepLinked;
  const panelMode: Mode = deepLinked && !open ? 'thread' : mode;

  /*
   * The deep link opens the panel with nobody tapping anything, so the fetch a
   * tap would have started (see `openPanel`) has to start here instead.
   *
   * An effect, and the one kind this codebase permits: it sets no state
   * synchronously — `ensureThread` writes a ref and everything else happens in
   * an async callback — so it is not the "commit, then immediately re-render"
   * that `react-hooks/set-state-in-effect` rejects.
   */
  useEffect(() => {
    if (deepLinked) ensureThread();
  }, [deepLinked, ensureThread]);

  const closePanel = useCallback(() => {
    setOpen(false);
    setMode('guide');
    // `router.replace`, not `history.replaceState`: `useSearchParams()` reads
    // Next's router state, and a raw history write leaves it believing the
    // parameter is still there — the panel would refuse to close.
    if (deepLinked) router.replace(pathname, { scroll: false });
    launcherRef.current?.focus();
  }, [deepLinked, pathname, router]);

  /** Esc closes, and focus goes back to the button that opened it. */
  useEffect(() => {
    if (!panelOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') closePanel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panelOpen, closePanel]);

  function openPanel() {
    setOpen(true);
    /*
     * A waiting answer wins over the menu: someone with an unread reply
     * sitting in the widget opened it to read that, not to browse. A CLOSED
     * conversation does not win — it is finished, and whoever is tapping now
     * has a new question.
     *
     * Asked of the thread when the thread is here (it is the fresher of the
     * two, and it is here whenever this session opened or started one), and of
     * the summary otherwise, which is the ordinary case: the conversation has
     * not been fetched yet and this tap is what fetches it.
     */
    if (thread) {
      setMode(thread.status !== 'closed' ? 'thread' : 'guide');
      return;
    }
    if (summary?.hasOpenThread) {
      ensureThread();
      setMode('thread');
      return;
    }
    setMode('guide');
  }

  if (!hydrated || !shouldMountAssistant(pathname)) return null;

  return (
    /*
      `display: contents` — a carrier for one custom property and nothing else.

      A carrier that generates no box at all, so it cannot affect layout,
      cannot intercept a pointer, and — the load-bearing part — cannot become
      the containing block of the `position: fixed` children below it. A
      transformed ancestor would silently re-anchor both the launcher and the
      panel to a box at the end of the document instead of to the viewport,
      which looks exactly like "the button stopped being fixed". Never give
      this element a transform.
    */
    <div className="contents">
      <AnimatePresence>
        {panelOpen ? (
          <m.div
            role="dialog"
            aria-modal="false"
            aria-label={c.title}
            initial={motionPresets.popover.initial}
            animate={motionPresets.popover.animate}
            exit={motionPresets.popover.exit}
            /*
             * The panel grows out of the launcher's corner rather than the
             * middle of itself, and BOTH the corner and the side now come from
             * `.assistant-dock` in `globals.css` — one place that knows where
             * the assistant lives, instead of a hard-coded `end-4` here and a
             * matching `transform-origin` beside it that had to be remembered
             * whenever the side changed. `transform-origin` is a static style,
             * not an animated one; the composited scale is what moves.
             */
            className={cn(
              'assistant-dock fixed z-[70] flex flex-col overflow-hidden',
              /*
               * The panel rides up with the launcher, through `bottom` rather
               * than a transform — Motion owns this element's `transform` for
               * the open/close scale, and two writers to one property is a
               * fight, not a composition. The layout cost `ayman/
               * no-layout-animation` exists to prevent is a per-frame one; a
               * panel that is open while the sign-off is on screen is not a
               * scroll path, it is a rare moment, and it is two boxes.
               *
               * The height budget subtracts the same lift: a panel that grew
               * to fill the space it no longer starts at would be clipped at
               * the top of the screen.
               */
              'bottom-24',
              'w-[min(23rem,calc(100vw-2rem))]',
              'max-h-[min(34rem,calc(100dvh-9rem))]',
              'rounded-2xl border border-line-subtle bg-surface-1 shadow-2xl',
            )}
          >
            {/* A coloured band, not a white bar. It is the first thing that
                says this belongs to the platform rather than to the browser. */}
            <header className="flex items-start gap-3 bg-accent px-4 py-3 text-[#1A1206]">
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#1A1206]/12"
              >
                <MessagesSquare className="size-5" />
              </span>
              <span className="flex-1">
                <span className="block text-[length:var(--fs-text-sm)] font-semibold">
                  {c.title}
                </span>
                <span className="mt-0.5 block text-[length:var(--fs-text-xs)] opacity-80">
                  {c.subtitle}
                </span>
              </span>
              <button
                type="button"
                aria-label={c.close}
                onClick={closePanel}
                className="-me-1 grid size-8 shrink-0 place-items-center rounded-lg transition-colors duration-[160ms] ease-out hover:bg-[#1A1206]/12"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto">
              {panelMode === 'guide' ? (
                <AssistantGuide
                  // The wrapped movers, so landing on the courses node fetches
                  // them — see `choose`/`rewindTo` above.
                  script={{ ...script, choose, rewindTo }}
                  courses={courses}
                  coursesPending={coursesPending}
                  coursesFailed={coursesFailed}
                  onEscalate={() => setMode('escalate')}
                  onNavigate={closePanel}
                />
              ) : null}

              {panelMode === 'escalate' ? (
                <AssistantEscalate
                  entryPath={script.path}
                  isSignedIn={isSignedIn}
                  onOpened={(opened) => {
                    setThread(opened);
                    // The POST just returned the thread this session created,
                    // so there is nothing left for `ensureThread` to go and
                    // get. Marking it done stops a later tap — or a
                    // `?assistant=1` — spending a request to fetch what is
                    // already in hand.
                    threadRequested.current = true;
                    setMode('sent');
                  }}
                  onBack={() => setMode('guide')}
                />
              ) : null}

              {panelMode === 'sent' ? (
                <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                  <CheckCircle2 className="size-9 text-accent" aria-hidden="true" />
                  <p className="text-[length:var(--fs-text-base)] font-semibold text-fg">
                    {c.escalate.sentTitle}
                  </p>
                  <p className="text-[length:var(--fs-text-sm)] leading-[1.7] text-fg-muted">
                    {c.escalate.sentBody}
                  </p>
                  {thread ? (
                    <button
                      type="button"
                      onClick={() => setMode('thread')}
                      className="text-[length:var(--fs-text-sm)] text-accent-text hover:underline"
                    >
                      {c.thread.title}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {panelMode === 'thread' && thread ? (
                <AssistantThread thread={thread} onUpdated={setThread} />
              ) : null}

              {/*
                The one moment the split between the summary and the thread is
                visible: the launcher knew there was a conversation — that is
                why it opened onto this screen — and the conversation itself is
                still on its way. One line, the same shape the courses node
                shows while its own fetch is in flight, rather than a skeleton
                of a chat: a fake transcript reads worse the longer it stays.
                Only reachable for someone who HAS a thread, which is a small
                minority of the people who ever open this panel.
              */}
              {panelMode === 'thread' && !thread ? (
                <p
                  role={threadFailed ? 'alert' : 'status'}
                  className="flex items-center gap-2 px-4 py-6 text-[length:var(--fs-text-sm)] text-fg-muted"
                >
                  {threadFailed ? (
                    c.thread.failed
                  ) : (
                    <>
                      <Loader2
                        className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                      {copy.notifications.loading}
                    </>
                  )}
                </p>
              ) : null}
            </div>

            {panelMode === 'guide' && script.path.length > 1 ? (
              <footer className="border-t border-line-subtle px-4 py-2.5">
                <button
                  type="button"
                  onClick={script.restart}
                  className="flex items-center gap-1.5 text-[length:var(--fs-text-xs)] text-fg-muted transition-colors duration-[160ms] ease-out hover:text-fg"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  {c.restart}
                </button>
              </footer>
            ) : null}
          </m.div>
        ) : null}
      </AnimatePresence>

      {/*
        A labelled pill, not a mystery circle — on a phone it collapses to the
        circle, because a pill wide enough to read is a pill wide enough to
        cover the content. The label is static at each size: animating WIDTH on
        hover is exactly what `ayman/no-layout-animation` exists to prevent.
      */}
      <button
        ref={launcherRef}
        type="button"
        onClick={() => (panelOpen ? closePanel() : openPanel())}
        aria-expanded={panelOpen}
        aria-label={unread > 0 ? c.openWithReply : c.open}
        className={cn(
          /*
           * Pinned, and it STAYS pinned.
           *
           * It used to "park" — riding up off the viewport floor once the
           * page's sign-off scrolled into view, so it would not sit on top of
           * the footer wordmark. Correct about the wordmark, wrong about the
           * widget: a support button that moves while you are scrolling is one
           * you have to look for, and every chat launcher a student has ever
           * used stays exactly where they left it. The overlap with the footer
           * is the accepted cost.
           */
          /*
           * The SIDE lives in `.assistant-dock` (globals.css), not here.
           *
           * It has been moved twice by request and both moves were one class
           * edit here plus a `transform-origin` edit on the panel above that
           * had to be remembered separately. The rule that finally works — the
           * inline start, offset past the rail's current width on desktop —
           * cannot be written as a utility at all, because it depends on
           * whether the page has a rail and on whether that rail is collapsed.
           */
          'assistant-dock fixed bottom-6 z-[70] flex items-center gap-2.5',
          'h-14 rounded-full bg-accent px-4 text-[#1A1206] shadow-lg sm:px-5',
          'transition-colors duration-[160ms] ease-out hover:bg-accent-hover',
        )}
      >
        <span className="relative grid size-6 shrink-0 place-items-center">
          {panelOpen ? (
            <X className="size-5" aria-hidden="true" />
          ) : (
            <MessagesSquare className="size-5" aria-hidden="true" />
          )}
          {unread > 0 && !panelOpen ? (
            // `aria-hidden`: the count is already in the button's accessible
            // name, and announcing it twice is noise.
            <span
              aria-hidden="true"
              className="absolute -top-1 -end-1 size-2.5 rounded-full bg-[color:var(--err)] ring-2 ring-[color:var(--a-9)]"
            />
          ) : null}
        </span>
        {/* Hidden below `sm` rather than removed, so the accessible name comes
            from `aria-label` at every size and never changes shape. */}
        <span
          aria-hidden="true"
          className="hidden text-[length:var(--fs-text-sm)] font-semibold sm:inline"
        >
          {c.open}
        </span>
      </button>
    </div>
  );
}
