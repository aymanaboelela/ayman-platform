'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, m } from 'motion/react';
import {
  CheckCircle2,
  Loader2,
  MessageCircle,
  UserRoundCheck,
  X,
} from 'lucide-react';
/*
 * ONE brand mark, imported directly rather than through
 * `components/site/social-icons`. That module holds five of them, and this file
 * is a client reference on every route — pulling four unused SVG paths onto the
 * landing page to draw one WhatsApp glyph is exactly the kind of byte the note
 * below spends thirty lines on. `simple-icons` sets `sideEffects: false`, so a
 * named import of one icon is one icon.
 */
import { siWhatsapp } from 'simple-icons';
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
import type { ConversationThread } from '@ayman/contracts/assistant/conversation';
import type { MyConversationSummary } from '@ayman/contracts/assistant/summary';
import { cn } from '@ayman/ui/lib/cn';
// The barrel spells this `export * as motionPresets`, so the namespace form is
// the only one that reproduces it — `@ayman/ui/motion` has no `motionPresets`
// named export to destructure.
import * as motionPresets from '@ayman/ui/motion';
import { ASSISTANT_OPEN_PARAM, shouldMountAssistant } from '@/lib/assistant-mount';
import { AssistantRobot } from './assistant-robot';
import { ASSISTANT_OPEN_EVENT, type AssistantIntent } from './assistant-open';
import { useVisibleViewport } from './use-visible-viewport';
import { loadAssistantSummary } from './assistant-summary';

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
const AssistantChat = dynamic(
  () => import('./assistant-chat').then((module) => module.AssistantChat),
  { ssr: false },
);
const AssistantEscalate = dynamic(
  () => import('./assistant-escalate').then((module) => module.AssistantEscalate),
  { ssr: false },
);
const AssistantThread = dynamic(
  () => import('./assistant-thread').then((module) => module.AssistantThread),
  { ssr: false },
);

const c = copy.assistant;

/**
 * The four screens of the panel — and only ONE of them is a destination.
 *
 * `chat` is what opens, and for most students it is the whole widget. The
 * other three are places the chat sends you: the handoff form, its
 * confirmation, and the conversation أيمن answers in.
 *
 * There used to be a fifth, `guide` — a question tree behind its own tab,
 * beside the chat and the conversation. Three tabs over a support panel is
 * three decisions before a student has asked anything, and the report was
 * exactly that: «هيتلحبط من ٣ دول، عايز يبقى الموضوع سهل». The tree's ANSWERS
 * did not go anywhere — they are still the corpus the chat answers from, on
 * the server, derived from `copy.assistant.script` — but nobody has to walk
 * them to get one.
 */
type Mode = 'chat' | 'escalate' | 'sent' | 'thread';

/**
 * Where the launcher lives, which is a property of the SURFACE and not of the
 * widget.
 *
 * `floating` — the public shell and the auth screens. A fixed pill in the
 * corner, because those pages have no persistent chrome to put it in. It can be
 * pinned there — see `.assistant-dock` in `globals.css`.
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
 * ## Everything is fetched LATE, and most of it is never fetched at all
 *
 * The probe runs after mount, not in a layout, so no page waits on a round
 * trip for a panel most visitors never open — and what it asks for is a
 * four-field summary rather than a conversation. The thread itself is fetched
 * only when the panel opens onto it, and the catalog only when someone
 * actually walks onto the node that shows it; both are kept for the rest of
 * the session.
 */
/**
 * The two WhatsApp destinations, resolved on the server from the admin's own
 * contact settings and handed down — never read from a constant here.
 *
 * Either may be `null`; the panel then renders only the one that is set, and
 * nothing at all when neither is. There is deliberately no fallback URL: a
 * `https://whatsapp.com/` placeholder in a support panel is the same bug the
 * footer shipped once, and it puts a student on WhatsApp's marketing page at
 * the moment they were asking for help.
 */
export interface AssistantWhatsapp {
  /** The broadcast channel URL. */
  channel: string | null;
  /** The number in E.164 — turned into a `wa.me` link below. */
  number: string | null;
}

export function AssistantWidget({
  variant = 'floating',
  whatsapp,
}: { variant?: AssistantVariant; whatsapp?: AssistantWhatsapp } = {}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const docked = variant === 'docked';

  /*
    Whether this route shows the assistant at all. Read TWICE — once to decide
    whether to fetch the summary, once to decide whether to render — and named
    here so the two can never drift apart. A probe that runs on a route the
    launcher refuses to appear on is a request paid for nothing, which is
    exactly what it was before.
  */
  const mounted = shouldMountAssistant(pathname);

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
  const [mode, setMode] = useState<Mode>('chat');
  /*
   * Only while the panel is open. The listener is cheap, but it writes two
   * custom properties on `<html>` on every visual-viewport change — which on a
   * phone means on every scroll — and there is nothing to place when the panel
   * is closed.
   */
  useVisibleViewport(open);
  /*
   * What «أكلّم م. أيمن» starts the box with.
   *
   * Empty from the footer and from the guided tree — nothing has been typed
   * yet — and the student's own question when the handoff came out of the
   * chat, where they have already written it once. Held here rather than in
   * `AssistantChat` because the form is a sibling screen, not a child of it.
   */
  const [escalateDraft, setEscalateDraft] = useState('');

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



  /**
   * The launcher, so Escape can put focus back on the button that opened the
   * panel. That is the whole job — it used to also be what the drag hook
   * measured, and the drag is gone.
   */
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
  /*
    Gated on `shouldMountAssistant`, not just on hydration.

    The launcher already refuses to render on `/admin`, `/onboarding` and
    inside a running attempt (the `return null` at the foot of this component
    reads the same predicate). The PROBE did not: it fired on every one of
    those routes and threw the answer away, because nothing was on screen to
    show a dot on. On a graded attempt that is a request competing with the
    runner for the student's own rate-limit budget, on a timer, for a control
    the page has deliberately hidden.

    `probed` keeps the semantics identical to before rather than merely
    cheaper: today the summary is fetched ONCE per full page load — the widget
    lives in the layout, so a client navigation does not remount it and the
    effect does not re-run. Without the ref, adding `mounted` to the deps would
    turn every admin → dashboard hop into another fetch. With it, the request
    is simply DEFERRED to the first route that can actually display it, and a
    student who never leaves `/admin` never makes it at all.
  */
  const probed = useRef(false);

  useEffect(() => {
    if (!hydrated || !mounted || probed.current) return;
    probed.current = true;
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
  }, [hydrated, mounted]);

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
  /*
   * Whether there is a conversation with أيمن at all — which is the only thing
   * that puts a third tab on the panel.
   *
   * `hasThread`, not `hasOpenThread`: a thread he has answered and CLOSED is
   * still a thread the student may want to re-read, and hiding the tab the
   * moment it closes would make his answer vanish from under them. Same
   * reasoning, and the same field, as the deep link below.
   */
  const hasThread = summary?.hasThread === true || thread !== null;

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
    setMode('chat');
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
      setMode(thread.status !== 'closed' ? 'thread' : 'chat');
      return;
    }
    if (summary?.hasOpenThread) {
      ensureThread();
      setMode('thread');
      return;
    }
    setMode('chat');
  }

  /*
   * Opened from somewhere that is not the launcher — today, the error
   * boundary's «كلّم الدعم».
   *
   * A DOM event rather than a context or a store, for the reasons written out
   * in `assistant-open.ts`: an `error.tsx` has a signature Next fixes and no
   * path to a provider, and this widget deliberately owns its state alone.
   *
   * It lands on the HANDOFF form by default, not on the guide. That caller is
   * a screen that has already failed, and walking someone whose page would not
   * load through a decision tree about enrolment is the wrong answer to the
   * question they are actually asking.
   *
   * `detail: 'thread'` is the other destination, used by the dashboard's
   * «رسالة من م. أيمن» card. Same branch `openPanel` takes for someone with a
   * waiting answer, and for the same reason: a press on «اقرأها وردّ» must land
   * on the message, not on an empty box asking them to think of a question.
   */
  useEffect(() => {
    if (!hydrated) return;
    const onOpen = (event: Event) => {
      setOpen(true);
      if ((event as CustomEvent<AssistantIntent | undefined>).detail === 'thread') {
        // The thread is usually not fetched yet — this press is what fetches
        // it, exactly as a tap on the launcher would. The panel shows one line
        // of «بنجيب…» meanwhile (see the `panelMode === 'thread' && !thread`
        // branch below) rather than a fake transcript.
        ensureThread();
        setMode('thread');
        return;
      }
      setMode('escalate');
    };
    window.addEventListener(ASSISTANT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ASSISTANT_OPEN_EVENT, onOpen);
  }, [hydrated, ensureThread]);

  if (!hydrated || !mounted) return null;

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
               * `bottom`, `width` and `max-height` all live in
               * `.assistant-panel` in `globals.css` — they are one calculation,
               * not three utilities. The panel stacks on top of the launcher,
               * so the launcher's height is a term in the panel's `bottom`, and
               * the height it may take is whatever the screen has left after
               * that. They were separate arbitrary values here and drifted:
               * the panel kept a desktop's 38rem card on a 390px phone, and
               * had no term at all for the on-screen keyboard.
               *
               * The panel still rides up through `bottom` rather than a
               * transform — Motion owns this element's `transform` for the
               * open/close scale, and two writers to one property is a fight,
               * not a composition.
               */
              'assistant-panel',
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

            {/*
              `min-h-0` is load-bearing, not decoration. Two of the screens
              below own their own scroller and pin a composer to the bottom of
              it; without it a flex child refuses to shrink past its content
              and the composer is pushed off the end of the panel instead of
              the transcript scrolling behind it.
            */}
            <div className="flex min-h-0 flex-1 flex-col">
              {/*
                ⚠️ HIDDEN, not unmounted — and this is the difference between a
                chat and a form that forgets you.

                The transcript lives inside `useAssistantAsk`, so unmounting
                this screen throws it away: a tap on «أسئلة شائعة», or the
                round trip through the handoff form and back, erased the
                conversation the student was in the middle of. Worse, it
                aborted an answer that was still streaming.

                `display: contents` on the wrapper keeps `AssistantChat` a
                direct flex item of the column above — its `flex-1 min-h-0` is
                what lets the composer sit at the bottom while the transcript
                scrolls — and `display: none` takes the whole subtree out of
                layout without touching its state. An answer requested from
                this tab keeps arriving while the reader is on another one, and
                is waiting for them when they come back.
              */}
              <div className={panelMode === 'chat' ? 'contents' : 'hidden'}>
                <AssistantChat
                  onEscalate={(question) => {
                    setEscalateDraft(question);
                    setMode('escalate');
                  }}
                />
              </div>

              {panelMode === 'escalate' ? (
                <div className="flex-1 overflow-y-auto">
                  <AssistantEscalate
                    /*
                      The tree is gone, so there is no trail to carry. The
                      inbox renders breadcrumbs from this and simply gets none
                      — which is honest: the student typed a question, they did
                      not walk a route to it.
                    */
                    entryPath={['root']}
                    isSignedIn={isSignedIn}
                    initialMessage={escalateDraft}
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
                    /*
                      There is one screen to go back TO now. This used to
                      branch — `escalateDraft ? 'chat' : 'guide'` — because the
                      handoff could be reached from either the chat or the
                      question tree. The tree is gone, and the stale branch
                      sent «رجوع» to a mode that no longer renders: the panel
                      went blank, with the chat still mounted and hidden behind
                      nothing. Caught by `assistant.e2e.ts`, which walks
                      chat → handoff → back.
                    */
                    onBack={() => setMode('chat')}
                  />
                </div>
              ) : null}

              {panelMode === 'sent' ? (
                <div className="flex flex-1 flex-col items-center gap-3 overflow-y-auto px-6 py-10 text-center">
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

            {/*
              ── «أكلّم م. أيمن», on every screen ─────────────────────────

              «عاوز يقدر يتواصل مع المهندس أيمن على طول». Before this, reaching
              him meant walking two or three stops into the tree and finding a
              tinted row at the bottom of a menu — so somebody who opened the
              panel already knowing they wanted a person had to answer four
              questions they did not care about first.

              Not shown on `escalate` or `sent`: on those two screens the
              student IS talking to him, and a button offering to start what
              they are already doing is the kind of thing that makes a reader
              doubt whether it worked. Not on `thread` either, for the same
              reason.
            */}
            {panelMode === 'chat' ? (
              <footer className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line-subtle px-3 py-2">
                {/*
                  ONE button, and what it says depends on whether a
                  conversation already exists.

                  «محادثتك» used to be a third tab. Three tabs over a chat
                  panel is three decisions before a student has asked
                  anything — «هيتلحبط من ٣ دول» — so the panel is one screen
                  now and this is the only way out of it. That makes the label
                  load-bearing: «أكلّم م. أيمن» when there is nobody to go back
                  to, and «محادثتك» when there is, because a student with an
                  answer waiting must not be offered a way to start a second
                  conversation instead of reading the first.
                */}
                <button
                  type="button"
                  onClick={() => {
                    if (hasThread) {
                      ensureThread();
                      setMode('thread');
                      return;
                    }
                    setEscalateDraft('');
                    setMode('escalate');
                  }}
                  className={cn(
                    'relative flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent/10 px-2.5 py-1',
                    'text-[length:var(--fs-text-xs)] font-medium text-accent-text',
                    'transition-colors duration-[160ms] ease-out hover:border-accent hover:bg-accent/20',
                  )}
                >
                  <UserRoundCheck className="size-3.5" aria-hidden="true" />
                  {hasThread ? c.thread.title : copy.assistant.contact.ayman}
                  {/* The same dot the launcher carries, for the same reason:
                      it is the only thing on this screen that says an answer
                      is waiting behind the button. */}
                  {hasThread && unread > 0 ? (
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full bg-[color:var(--err)]"
                    />
                  ) : null}
                </button>

                <AssistantWhatsappLinks whatsapp={whatsapp} />
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
   * A labelled pill that collapses to a circle on a phone, because a pill wide
   * enough to read is a pill wide enough to cover the content.
   *
   * ## It does not move any more
   *
   * It used to be draggable — press and hold on a touch screen, press and drag
   * with a mouse — with the position kept per device. That was asked for
   * («بجد أخد مساحة كبيرة جدا») and then asked back («خليه على الشمال
   * ميتحركش بقى، لأن بيتحرك»), and the second ask is the right one: a support
   * button that is somewhere different on every device is a button students
   * have to hunt for, and a press-and-hold that moves it is a gesture nobody
   * asked for the moment their thumb rests on it.
   *
   * The whole mechanism is gone rather than disabled — the hook, the stored
   * position, the reset control and the three copy strings — because a
   * feature that is merely switched off leaves copy nobody can reach and
   * behaviour nobody can explain. `git` still has it.
   */
  return (
    <div className="contents">
      {panel}

      <button
        ref={launcherRef}
        type="button"
        onClick={() => (panelOpen ? closePanel() : openPanel())}
        aria-expanded={panelOpen}
        /*
         * Read by CSS alone, to hide this button behind the phone sheet — the
         * sheet is full screen and has its own close control, so the floating
         * launcher under it is redundant and, with the keyboard up, stranded
         * in the middle of the visible area. `aria-expanded` says the same
         * thing but attribute selectors on it would tie a layout rule to an
         * accessibility contract that `launcher-name.test.ts` exists to keep
         * separate.
         */
        data-panel-open={panelOpen}
        /*
         * ⚠️ THE NAME IS THE NAME, and nothing else goes in it.
         *
         * This briefly carried the drag hint — `«اسأل المساعد» — «دوس مطوّل
         * واسحب عشان تنقله»` — and that changed the accessible NAME of the one
         * control the whole `assistant.e2e.ts` suite locates by name, which
         * took out four Playwright shards and with them the deploy. There is no
         * hint to add any more; the rule outlives the feature that broke it.
         */
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
           * is the accepted cost — and it is now the reader's to fix, by moving
           * the thing themselves.
           */
          /*
           * The SIDE lives in `.assistant-dock` (globals.css), not here.
           *
           * It has been moved three times by request, and each move used to be
           * one class edit here plus a `transform-origin` edit on the panel
           * that had to be remembered separately. Keeping both in one CSS rule
           * is what stops the next move from getting half done.
           */
          'robot-host assistant-dock assistant-launcher fixed z-[70] flex items-center gap-2.5',
          'h-14 rounded-full bg-accent px-4 text-[#1A1206] shadow-lg sm:px-5',
          'transition-colors duration-[160ms] ease-out hover:bg-accent-hover',
        )}
      >
        <span className="relative grid size-6 shrink-0 place-items-center">
          {panelOpen ? (
            <X className="size-5" aria-hidden="true" />
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

    </div>
  );
}

/**
 * «تواصل معانا» — the way out of the script and onto a real conversation.
 *
 * ## Why these are plain links and not another script node
 *
 * The guide answers questions the platform can answer. These two do not belong
 * inside it: one is a broadcast channel with nothing to ask, and the other
 * leaves for an app. A node that ends in "now open WhatsApp" would be a dead
 * end drawn to look like a step.
 *
 * ## Why the channel comes FIRST
 *
 * It is the one that scales. A student who follows it gets every announcement
 * without anybody typing a reply; a student who opens the chat costs a reply.
 * Both are offered, in that order, on purpose.
 */
function AssistantWhatsappLinks({ whatsapp }: { whatsapp?: AssistantWhatsapp }) {
  // `wa.me` takes the number WITHOUT the `+`. Stored E.164, so stripping the
  // one leading character is the whole conversion — see `site-footer.tsx`,
  // which builds the identical link from the identical setting.
  const chatHref = whatsapp?.number ? `https://wa.me/${whatsapp.number.replace(/^\+/, '')}` : null;

  if (!whatsapp?.channel && !chatHref) return null;

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {whatsapp?.channel ? (
        <a
          href={whatsapp.channel}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-1.5 text-[length:var(--fs-text-xs)] font-medium text-[color:var(--wa-ink)] transition-opacity duration-[160ms] ease-out hover:opacity-80"
          style={{ '--wa-ink': `#${siWhatsapp.hex}` } as CSSProperties}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d={siWhatsapp.path} />
          </svg>
          {c.whatsapp.channel}
        </a>
      ) : null}

      {chatHref ? (
        <a
          href={chatHref}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-1.5 text-[length:var(--fs-text-xs)] text-fg-muted transition-colors duration-[160ms] ease-out hover:text-fg"
        >
          <MessageCircle className="size-3.5" aria-hidden="true" />
          {c.whatsapp.chat}
        </a>
      ) : null}
    </span>
  );
}
