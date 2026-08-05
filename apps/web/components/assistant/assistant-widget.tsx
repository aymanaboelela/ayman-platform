'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, m } from 'motion/react';
import { CheckCircle2, MessagesSquare, RotateCcw, X } from 'lucide-react';
import { copy, CatalogListSchema, type CatalogCourse } from '@ayman/contracts';
import {
  MyConversationSchema,
  type ConversationThread,
} from '@ayman/contracts/assistant/conversation';
import { ASSISTANT_NODES, isNextChoice, type AssistantChoice } from '@ayman/contracts/assistant/script';
import { cn, motionPresets } from '@ayman/ui';
import { apiGet } from '@/lib/api';
import { ASSISTANT_OPEN_PARAM, shouldMountAssistant } from '@/lib/assistant-mount';
import { AssistantGuide } from './assistant-guide';
import { AssistantEscalate } from './assistant-escalate';
import { AssistantThread } from './assistant-thread';
import { useAssistantScript } from './use-assistant-script';

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
 * hydration gate below means this contributes nothing to the server-rendered
 * HTML of any page: no bytes in the streamed document, nothing for a cached
 * `'use cache'` shell to disagree with, and no `usePathname()` read during a
 * prerender. The widget is an enhancement; a student who never gets JavaScript
 * loses a button, not a page.
 *
 * ## Everything is fetched LATE
 *
 * The thread lookup runs after mount, not in a layout, so no page pays a
 * round trip for a panel most visitors never open. The catalog is fetched only
 * when someone actually reaches the node that shows it, and cached for the
 * session after that.
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
    // The server has no widget to render, which is the point: this component
    // contributes nothing to any prerendered page.
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
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  /*
   * Who is this, and do they have a thread already?
   *
   * One request answers both. It runs once per page load rather than once per
   * open, because the answer drives the dot on the LAUNCHER — a student has to
   * be able to see that a reply landed without opening anything.
   */
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    void apiGet('/api/assistant/conversations/mine', MyConversationSchema)
      .then((result) => {
        if (cancelled) return;
        setThread(result.conversation);
        setIsSignedIn(result.isSignedIn);
      })
      // Deliberately silent. The widget failing to reach the API is not
      // something to interrupt a student's lesson about; the launcher simply
      // opens onto the script, which needs no server at all.
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  const unread = thread?.unreadForVisitor ?? 0;

  /** Lazily loads the catalog the first time a node actually needs it. */
  const ensureCourses = useCallback(() => {
    if (courses !== null || coursesPending) return;
    setCoursesPending(true);
    setCoursesFailed(false);
    void apiGet('/api/catalog/courses', CatalogListSchema)
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
   * node that shows courses just as a choice can walk onto it.
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

  function openPanel() {
    setOpen(true);
    /*
     * A waiting reply wins over the script.
     *
     * Someone who opens the widget with an unread answer sitting in it wants
     * the answer, not the menu.
     */
    setMode(thread && thread.status !== 'closed' ? 'thread' : 'guide');
  }

  if (!hydrated || !shouldMountAssistant(pathname)) return null;

  return (
    <>
      <AnimatePresence>
        {panelOpen ? (
          <m.div
            ref={panelRef}
            role="dialog"
            aria-modal="false"
            aria-label={c.title}
            initial={motionPresets.popover.initial}
            animate={motionPresets.popover.animate}
            exit={motionPresets.popover.exit}
            /*
             * The panel grows out of the launcher's corner rather than the
             * middle of itself. `transform-origin` is a static style, not an
             * animated one — the composited scale is what moves.
             */
            style={{ transformOrigin: 'bottom right' }}
            className={cn(
              'fixed bottom-24 start-4 z-[70] flex flex-col overflow-hidden sm:start-6',
              'w-[min(23rem,calc(100vw-2rem))] max-h-[min(34rem,calc(100dvh-9rem))]',
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
                <MessagesSquare className="size-4.5" />
              </span>
              <span className="flex-1">
                <span className="block text-[length:var(--fs-text-sm)] font-bold">{c.title}</span>
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
                  <p className="text-[length:var(--fs-text-base)] font-bold text-fg">
                    {copy.assistant.escalate.sentTitle}
                  </p>
                  <p className="text-[length:var(--fs-text-sm)] leading-[1.7] text-fg-muted">
                    {copy.assistant.escalate.sentBody}
                  </p>
                  {thread ? (
                    <button
                      type="button"
                      onClick={() => setMode('thread')}
                      className="text-[length:var(--fs-text-sm)] text-accent-text hover:underline"
                    >
                      {copy.assistant.thread.title}
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
          'fixed bottom-6 start-4 z-[70] flex items-center gap-2.5 sm:start-6',
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
            <span
              aria-hidden="true"
              className="absolute -top-1 -end-1 size-2.5 rounded-full bg-[--err] ring-2 ring-[color:var(--a-9)]"
            />
          ) : null}
        </span>
        {/* Hidden below `sm` rather than removed, so the accessible name comes
            from `aria-label` at every size and never changes shape. */}
        <span aria-hidden="true" className="hidden text-[length:var(--fs-text-sm)] font-bold sm:inline">
          {c.open}
        </span>
      </button>
    </>
  );
}
