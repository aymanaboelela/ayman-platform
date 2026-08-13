'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, m } from 'motion/react';
import { CheckCircle2, Move, RotateCcw, X } from 'lucide-react';
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
 *   - `./assistant-session`  — the thread probe          (`MyConversationSchema`)
 *   - `./assistant-catalog`  — the course list           (`CatalogListSchema`)
 *   - `./assistant-escalate` — the handoff form          (`ConversationThreadSchema`)
 *   - `./assistant-thread`   — the conversation          (`ConversationThreadSchema`)
 *
 * `./assistant-guide` stays static: it is the panel's first screen, it is what
 * a tap on the launcher must paint immediately, and it reaches no schema at
 * all — `@ayman/contracts/assistant/script` is a plain node table with no Zod
 * in it, verified rather than assumed.
 *
 * ⚠️ Zod is off the CRITICAL path, not off the network. See the probe effect
 * below for the one edge that still pulls it on every page load, and for what
 * it would take to remove that too.
 */
import { copy } from '@ayman/contracts/copy';
import type { CatalogCourse } from '@ayman/contracts/catalog';
import type { ConversationThread } from '@ayman/contracts/assistant/conversation';
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
import { AssistantRobot } from './assistant-robot';
import { ASSISTANT_OPEN_EVENT } from './assistant-open';
import { useLauncherDrag } from './use-launcher-drag';
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

/**
 * Where the launcher lives, which is a property of the SURFACE and not of the
 * widget.
 *
 * `floating` — the public shell and the auth screens. A fixed pill in the
 * corner, because those pages have no persistent chrome to put it in. It can be
 * picked up and moved; see `use-launcher-drag.ts` for why.
 *
 * `docked` — the signed-in shell. The launcher becomes a control in the topbar
 * beside the notification bell, because that surface already HAS a row of
 * persistent controls and a floating disc over the content is a second,
 * competing one. Asked for by name: «في الداشبورد… خليها جنب النوتيفيكيشن فوق».
 *
 * Nothing else differs. Same panel, same state, same thread.
 */
type AssistantVariant = 'floating' | 'docked';

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
 * ## Everything is fetched LATE
 *
 * The thread lookup runs after mount, not in a layout, so no page pays a round
 * trip for a panel most visitors never open. The catalog is fetched only when
 * someone actually walks onto the node that shows it, and kept for the rest of
 * the session.
 */
export function AssistantWidget({ variant = 'floating' }: { variant?: AssistantVariant } = {}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const docked = variant === 'docked';

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

  const [thread, setThread] = useState<ConversationThread | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);

  const [courses, setCourses] = useState<CatalogCourse[] | null>(null);
  const [coursesPending, setCoursesPending] = useState(false);
  const [coursesFailed, setCoursesFailed] = useState(false);

  const script = useAssistantScript();

  /*
   * Picking the launcher up, on the floating surfaces only.
   *
   * The docked one is a control in a toolbar and is not draggable, which is not
   * an omission: it is not covering anything (that is the entire reason it was
   * moved up there), and a button that can be dragged out of a row of buttons
   * is a button that can be lost.
   */
  const launcherRef = useRef<HTMLButtonElement>(null);
  const launcher = useLauncherDrag(launcherRef, !docked);


  /*
   * Who is this, and do they have a thread already?
   *
   * One request answers both. It runs once per page load rather than once per
   * open, because the answer drives the dot on the LAUNCHER — a student has to
   * be able to see that a reply landed without opening anything.
   *
   * ## ⚠️ This is the last edge that still pulls Zod, and it is deliberate
   *
   * The fetch and its schema live in `./assistant-session` and are reached by
   * `import()`, so the 62 KB is an async chunk rather than a `<head>` preload
   * on 21 routes — it no longer competes with the page. But this probe fires
   * on EVERY page load, so the chunk is still requested on every page, after
   * hydration, by students who will never open the panel.
   *
   * Three ways to remove that were considered and all three were worse:
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
   * What would actually remove it is a smaller ANSWER, not a smaller client:
   * an endpoint returning `{ unread: number, isSignedIn: boolean }` is two
   * primitives, validatable in four lines of hand-written narrowing, and the
   * full thread is then the panel's business — where Zod already is. That is
   * an API change, so it is not this pass.
   */
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    void import('./assistant-session')
      .then(({ loadAssistantSession }) => loadAssistantSession())
      .then((result) => {
        if (cancelled) return;
        setThread(result.conversation);
        setIsSignedIn(result.isSignedIn);
      })
      // Deliberately silent. The widget failing to reach the API is not worth
      // interrupting a lesson over; the launcher still opens onto the script,
      // which needs no server at all. A failed chunk fetch lands here too, and
      // means the same thing to the student.
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  const unread = thread?.unreadForVisitor ?? 0;

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
  const deepLinked = searchParams.get(ASSISTANT_OPEN_PARAM) !== null && thread !== null;
  const panelOpen = open || deepLinked;
  const panelMode: Mode = deepLinked && !open ? 'thread' : mode;

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

  const openPanel = useCallback(() => {
    setOpen(true);
    // A waiting answer wins over the menu: someone with an unread reply
    // sitting in the widget opened it to read that, not to browse.
    setMode(thread && thread.status !== 'closed' ? 'thread' : 'guide');
  }, [thread]);

  /*
   * Opened from somewhere that is not the launcher — today, the error
   * boundary's «كلّم الدعم».
   *
   * A DOM event rather than a context or a store, for the reasons written out
   * in `assistant-open.ts`: an `error.tsx` has a signature Next fixes and no
   * path to a provider, and this widget deliberately owns its state alone.
   *
   * It lands on the HANDOFF form, not on the guide. Every caller is a screen
   * that has already failed, and walking someone whose page would not load
   * through a decision tree about enrolment is the wrong answer to the question
   * they are actually asking.
   */
  useEffect(() => {
    if (!hydrated) return;
    const onOpen = () => {
      setOpen(true);
      setMode('escalate');
    };
    window.addEventListener(ASSISTANT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ASSISTANT_OPEN_EVENT, onOpen);
  }, [hydrated]);

  if (!hydrated || !shouldMountAssistant(pathname)) return null;

  /*
   * Where the panel goes when the launcher is no longer in its corner.
   *
   * `.assistant-dock` knows one location and that is the right design while the
   * launcher is fixed to it — but a launcher the reader has carried to the top
   * of the screen, opening a panel that grows out of the bottom corner, reads as
   * two unrelated things. So when (and only when) the button has been moved, the
   * panel is anchored to it.
   *
   * Above the button by preference, below it when there is no room above, and
   * clamped into the viewport on both axes. The numbers match the Tailwind
   * classes on the panel itself — `w-[min(23rem,…)]` and
   * `max-h-[min(34rem,…)]` — and are the one duplication here, because a
   * measured read would need the panel to exist before it could be placed.
   *
   * Safe to read `window` during render: everything below the `hydrated` gate
   * above runs in a browser by construction.
   */
  const moved = launcher.position;
  let panelStyle: React.CSSProperties | undefined;
  if (moved) {
    const width = Math.min(368, window.innerWidth - 32);
    const height = Math.min(544, window.innerHeight - 144);
    const above = moved.y - height - 12;
    panelStyle = {
      insetInlineStart: 'auto',
      insetInlineEnd: 'auto',
      bottom: 'auto',
      left: Math.min(Math.max(8, moved.x), Math.max(8, window.innerWidth - width - 8)),
      top: above >= 8 ? above : Math.min(moved.y + 68, Math.max(8, window.innerHeight - height - 8)),
      transformOrigin: above >= 8 ? 'bottom left' : 'top left',
    };
  }

  const panel = (
    <AnimatePresence>
        {panelOpen ? (
          <m.div
            role="dialog"
            aria-modal="false"
            aria-label={c.title}
            initial={motionPresets.popover.initial}
            animate={motionPresets.popover.animate}
            exit={motionPresets.popover.exit}
            style={panelStyle}
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
            <header className="robot-host flex items-start gap-3 bg-accent px-4 py-3 text-[#1A1206]">
              {/* The same face as the launcher, so opening the panel reads as
                  the button expanding rather than as a second thing arriving.
                  `robot-host` on the header means it laughs when the panel is
                  hovered, which is the one moment it has someone's attention. */}
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#1A1206]/12"
              >
                <AssistantRobot
                  className="text-[#1A1206]"
                  style={{ ['--robot-size' as string]: '1.375rem' }}
                />
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

  );

  const badge =
    unread > 0 && !panelOpen ? (
      // `aria-hidden`: the count is already in the button's accessible name,
      // and announcing it twice is noise.
      <span
        aria-hidden="true"
        className="absolute -top-0.5 -end-0.5 size-2.5 rounded-full bg-[color:var(--err)] ring-2 ring-[color:var(--n-1)]"
      />
    ) : null;

  /*
   * ── DOCKED: a control in the signed-in topbar ──────────────────────────────
   *
   * «في الداشبورد… خليها جنب النوتيفيكيشن فوق، وخليها كده كأنها بتتحرك، وشكل
   * الروبوت حلو وكده بيضحك وبيلعب.»
   *
   * The floating disc was the right shape for the public pages and the wrong one
   * here: the signed-in shell ALREADY has a row of persistent controls, and a
   * 56px pill floating over the lesson player is a second navigation competing
   * with the first. Up here it costs no content area at all.
   *
   * It is deliberately the ONE coloured control in that row. The bell, the theme
   * switch and the account button are monochrome outline icons; this is amber
   * and it moves. That is the point — it is the only one of the four that is
   * offering something rather than toggling something.
   *
   * ⚠️ The panel is PORTALLED to `document.body`, and it has to be. This button
   * renders inside `StudentTopbar`'s `<header>`, which carries
   * `backdrop-blur-[var(--header-blur)]` — and a `backdrop-filter` other than
   * `none` makes an element the containing block for its `position: fixed`
   * descendants, exactly like a transform does. Left in place, the panel would
   * be pinned to a 56px-tall bar and clipped to nothing. This is the same class
   * of bug `student-shell.tsx`'s `overlay` prop was created to fix, arriving by
   * a different route.
   */
  if (docked) {
    return (
      <>
        {createPortal(panel, document.body)}
        <button
          ref={launcherRef}
          type="button"
          onClick={() => (panelOpen ? closePanel() : openPanel())}
          aria-expanded={panelOpen}
          aria-label={unread > 0 ? c.openWithReply : c.open}
          className={cn(
            // `robot-host` is what drives the laugh — the eyes arc and the head
            // giggles on hover and on keyboard focus. See `globals.css`.
            'robot-host relative grid size-9 shrink-0 place-items-center rounded-full',
            'bg-[color-mix(in_oklab,var(--a-9)_18%,transparent)] text-accent-text',
            'transition-colors duration-[160ms] ease-out',
            'hover:bg-[color-mix(in_oklab,var(--a-9)_32%,transparent)]',
          )}
        >
          {panelOpen ? (
            <X className="size-4.5" aria-hidden="true" />
          ) : (
            <AssistantRobot style={{ ['--robot-size' as string]: '1.375rem' }} />
          )}
          {badge}
        </button>
      </>
    );
  }

  /*
   * ── FLOATING: the public shell and the auth screens ────────────────────────
   *
   * Unchanged in shape — a labelled pill that collapses to a circle on a phone,
   * because a pill wide enough to read is a pill wide enough to cover the
   * content. What is new is that it can be PICKED UP: press and hold on a touch
   * screen, press and drag with a mouse. See `use-launcher-drag.ts` for why the
   * two gestures differ and why the position is per-device.
   *
   * The launcher keeps its `.assistant-dock` corner until it is moved; from then
   * on the inline `left`/`top` win, and `assistant-dock`'s insets are explicitly
   * unset so a fixed element with values on both sides cannot stretch instead of
   * moving.
   */
  const carried = launcher.position;

  return (
    <div className="contents">
      {panel}

      <button
        ref={launcherRef}
        type="button"
        onClick={() => {
          // A drag must not also open the panel — the pointer travelled, the
          // button moved out from under it, and the browser synthesises a click
          // anyway. See `consumeDrag`.
          if (launcher.consumeDrag()) return;
          if (panelOpen) closePanel();
          else openPanel();
        }}
        {...launcher.handlers}
        aria-expanded={panelOpen}
        aria-label={`${unread > 0 ? c.openWithReply : c.open} — ${launcher.dragging ? c.dragging : c.drag}`}
        style={
          carried
            ? {
                insetInlineStart: 'auto',
                insetInlineEnd: 'auto',
                bottom: 'auto',
                left: carried.x,
                top: carried.y,
              }
            : undefined
        }
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
           * is the accepted cost — and it is now the reader's to fix, by moving
           * the thing themselves.
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
          'robot-host assistant-dock fixed bottom-6 z-[70] flex items-center gap-2.5',
          'h-14 rounded-full bg-accent px-4 text-[#1A1206] shadow-lg sm:px-5',
          'transition-colors duration-[160ms] ease-out hover:bg-accent-hover',
          /*
           * ⚠️ `touch-none` only while a drag is actually in progress.
           *
           * Set permanently, it would kill the page scroll for any swipe that
           * happens to begin on the button — which on a phone is a large target
           * sitting over the content. `use-launcher-drag` releases pointer
           * capture the moment a finger travels far enough to be scrolling, and
           * this follows the same rule from the CSS side.
           */
          launcher.dragging && 'touch-none cursor-grabbing shadow-2xl',
        )}
      >
        <span className="relative grid size-6 shrink-0 place-items-center">
          {panelOpen ? (
            <X className="size-5" aria-hidden="true" />
          ) : launcher.dragging ? (
            <Move className="size-5" aria-hidden="true" />
          ) : (
            <AssistantRobot
              className="text-[#1A1206]"
              style={{ ['--robot-size' as string]: '1.5rem' }}
            />
          )}
          {badge}
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

      {/*
        Putting it back. Drawn only once it HAS been moved — an affordance for
        undoing something nobody has done yet is clutter, and this row sits over
        page content.

        Below the launcher rather than inside the panel: the reader who wants
        this is looking at a button in the wrong place, not at an open
        conversation.
      */}
      {carried ? (
        <button
          type="button"
          onClick={launcher.reset}
          style={{
            insetInlineStart: 'auto',
            insetInlineEnd: 'auto',
            bottom: 'auto',
            left: carried.x,
            top: carried.y + 60,
          }}
          className={cn(
            'fixed z-[70] inline-flex min-h-8 items-center gap-1.5 rounded-full px-3',
            'border border-line-subtle bg-surface-1/95 text-[length:var(--fs-text-xs)] text-fg-muted',
            'shadow-md transition-colors duration-[160ms] ease-out hover:text-fg',
          )}
        >
          <RotateCcw className="size-3" aria-hidden="true" />
          {c.resetPosition}
        </button>
      ) : null}
    </div>
  );
}
