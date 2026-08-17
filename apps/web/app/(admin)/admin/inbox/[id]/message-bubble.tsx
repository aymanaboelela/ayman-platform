'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { copy } from '@ayman/contracts/copy';
import {
  MESSAGE_REACTIONS,
  type ConversationMessageEntry,
} from '@ayman/contracts/assistant/conversation';
import { cn } from '@ayman/ui/lib/cn';
import { MessageBody } from '@/components/assistant/message-body';
import { inboxTimeFormatter } from '../status-chip';
import { setReactionAction } from '../actions';

const c = copy.assistant.inbox;

/** How long a press has to be held before the picker opens, in ms. */
const LONG_PRESS_MS = 450;
/** A press that MOVES this far is a scroll, not a long press. */
const SLOP_PX = 10;

/**
 * One message in the instructor's thread view, with WhatsApp's long-press
 * reaction on it.
 *
 * ## Why long-press, and why it is not the only way in
 *
 * Asked for by name — «يضغط ضغطة مطوّلة على الرسالة ويعمل إيموجي شبه واتساب».
 * It is the right gesture on a phone and it is the one he already has in his
 * fingers from the app this is imitating.
 *
 * It is also invisible and impossible on a desktop with no touch screen, so it
 * is not the only affordance: a small button appears beside the bubble on
 * hover/focus, and the picker is reachable by keyboard through it. A gesture
 * nobody can discover is a feature only its author uses.
 *
 * ## The press must not fight the page
 *
 * A long press on mobile is also the browser's own text-selection and
 * context-menu gesture, so both are suppressed on the bubble — but only after
 * the timer has actually fired, so an ordinary tap or a drag-to-scroll still
 * behaves normally. A press that moves more than `SLOP_PX` is a scroll and
 * cancels the timer; that check is what stops the picker opening in someone's
 * face every time they flick through a long thread.
 *
 * ## Optimistic, because a reaction that lags is not a reaction
 *
 * The emoji appears on the bubble immediately and the server is told after. On
 * failure it goes back and nothing is said: the whole point of the gesture is
 * that it costs nothing, and an error toast about «👍» would cost more than
 * the reaction was worth. `router.refresh()` reconciles with the server.
 */
export function MessageBubble({
  conversationId,
  message,
  who,
}: {
  conversationId: string;
  message: ConversationMessageEntry;
  who: string;
}) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  /**
   * The optimistic value, or `undefined` for "show whatever the server said".
   *
   * ⚠️ NOT `useState(message.adminReaction)` synced back by an effect. That is
   * the obvious shape and it is the one `react-hooks/set-state-in-effect`
   * rejects: mirroring a prop into state means every refresh commits a render
   * and then immediately schedules another to copy the prop across. An
   * override that DEFERS to the prop needs no effect at all — it is cleared
   * once the refresh that carries the new value has landed.
   */
  const [override, setOverride] = useState<string | null | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const fromVisitor = message.author === 'visitor';
  const reaction = override === undefined ? message.adminReaction : override;

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function startPress(event: React.PointerEvent) {
    // Mouse RIGHT-click is the desktop equivalent and opens it immediately;
    // anything else starts the hold timer.
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    fired.current = false;
    origin.current = { x: event.clientX, y: event.clientY };
    timer.current = setTimeout(() => {
      fired.current = true;
      setPicking(true);
    }, LONG_PRESS_MS);
  }

  function movePress(event: React.PointerEvent) {
    if (!origin.current || !timer.current) return;
    const dx = Math.abs(event.clientX - origin.current.x);
    const dy = Math.abs(event.clientY - origin.current.y);
    // Scrolling, not pressing.
    if (dx > SLOP_PX || dy > SLOP_PX) endPress();
  }

  function endPress() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  }

  function choose(emoji: string) {
    // Tapping the one already there takes it back — WhatsApp's own rule, and
    // the reason the route is a PUT that accepts `null`.
    const next = reaction === emoji ? null : emoji;
    setPicking(false);
    setOverride(next);
    void setReactionAction(conversationId, message.id, next)
      .then(() => router.refresh())
      // Either way the override steps aside and the server's value shows: on
      // success it now agrees, and on failure the bubble silently goes back to
      // the truth rather than keeping an emoji that was never saved.
      .finally(() => setOverride(undefined));
  }

  return (
    <li className={cn('group flex flex-col gap-1', fromVisitor ? 'items-start' : 'items-end')}>
      <span className="flex items-center gap-1.5 px-1 text-[length:var(--fs-text-xs)] text-fg-faint">
        {fromVisitor ? who : copy.assistant.thread.ayman}
      </span>

      <div className={cn('flex items-center gap-1.5', fromVisitor ? '' : 'flex-row-reverse')}>
        <div
          onPointerDown={startPress}
          onPointerMove={movePress}
          onPointerUp={endPress}
          onPointerCancel={endPress}
          onPointerLeave={endPress}
          onContextMenu={(event) => {
            // Both the desktop way in AND the suppression of the OS menu that
            // a finished long press would otherwise raise on top of the picker.
            event.preventDefault();
            setPicking(true);
          }}
          className={cn(
            'relative max-w-[min(38rem,85%)] whitespace-pre-wrap wrap-anywhere rounded-2xl px-4 py-3',
            'text-[length:var(--fs-text-sm)] leading-[1.75]',
            // Only while the timer is armed: an ordinary tap must still be able
            // to select text, which is what a reader expects of a transcript.
            fired.current ? 'select-none' : '',
            fromVisitor
              ? 'rounded-ss-md border border-line bg-surface-2 text-fg'
              : 'rounded-se-md bg-accent text-[#1A1206]',
          )}
        >
          <MessageBody body={message.body} />

          {reaction ? (
            <span
              // Overlapping the bottom edge, exactly where WhatsApp puts it.
              className={cn(
                'absolute -bottom-2.5 grid h-6 min-w-6 place-items-center rounded-full px-1',
                'border border-line bg-surface-1 text-[length:var(--fs-text-xs)] leading-none',
                fromVisitor ? 'start-3' : 'end-3',
              )}
            >
              {reaction}
            </span>
          ) : null}
        </div>

        {/*
          The discoverable way in. Hidden until hover or keyboard focus so it
          does not clutter a transcript, but always in the tab order — the
          long press is unreachable without a touch screen and unknowable
          without being told.
        */}
        <button
          type="button"
          onClick={() => setPicking((open) => !open)}
          aria-label={c.reactLabel}
          aria-expanded={picking}
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-full text-fg-faint opacity-0',
            'transition-opacity duration-[160ms] ease-out',
            'group-hover:opacity-100 focus-visible:opacity-100 hover:bg-surface-3',
          )}
        >
          <span aria-hidden="true">☺</span>
        </button>
      </div>

      {/* Put back deliberately: replacing the page's inline bubbles with this
          component dropped the timestamps off the whole admin thread, and a
          transcript with no times on it is not a transcript. The linter found
          it — the import went unused — rather than anybody noticing. */}
      <time
        dateTime={message.createdAt}
        className="mono px-1 text-[length:var(--fs-mono-label)] text-fg-faint"
      >
        {inboxTimeFormatter.format(new Date(message.createdAt))}
      </time>

      {picking ? (
        <>
          {/* Catches the next press anywhere so the row closes without needing
              a listener on `document` that outlives this component. */}
          <button
            type="button"
            aria-label={c.reactClose}
            onClick={() => setPicking(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            role="group"
            aria-label={c.reactLabel}
            className={cn(
              'relative z-20 flex items-center gap-0.5 rounded-full border border-line',
              'bg-surface-1 px-1.5 py-1 shadow-sm',
            )}
          >
            {MESSAGE_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => choose(emoji)}
                aria-label={emoji}
                aria-pressed={reaction === emoji}
                className={cn(
                  'grid size-9 place-items-center rounded-full text-[length:var(--fs-text-base)]',
                  'transition-transform duration-[120ms] ease-out hover:scale-125',
                  reaction === emoji ? 'bg-accent/20' : '',
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </li>
  );
}
