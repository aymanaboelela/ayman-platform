'use client';

import { useRef, type PointerEvent, type ReactNode } from 'react';
import { Reply } from 'lucide-react';

/** How far the bubble has to travel before letting go sends it to the composer. */
const TRIGGER_PX = 56;
/** The bubble stops following the finger here. */
const MAX_PX = 80;
/** Movement before the gesture decides whether it is a swipe or a scroll. */
const DECIDE_PX = 8;

/**
 * «اسحبها وأرد عليها» — WhatsApp's swipe on a bubble to quote it.
 *
 * ## Touch and pen only
 *
 * A mouse drag across a transcript is how text gets selected, and taking that
 * away to imitate a phone gesture on a desktop would break the more useful
 * thing. A mouse reaches the same action through the bubble's menu.
 *
 * ## Deciding before moving
 *
 * Nothing moves for the first `DECIDE_PX`. If the finger went mostly sideways
 * the gesture is a swipe and the pointer is captured; if it went up or down it
 * is a scroll and this component lets go for good. `touch-action: pan-y` on
 * the row (chat.css) is what lets the browser keep the vertical scroll native
 * while handing the horizontal movement to us.
 *
 * ## Toward the inline END, in either direction of text
 *
 * WhatsApp swipes right in English and left in Arabic — away from where the
 * line starts. `direction` is read off the row at press time, so the same
 * component is right in the RTL app and in an LTR one.
 *
 * ## The DOM, not state
 *
 * The bubble follows the finger at pointer rate. A `setState` per move would
 * re-render the bubble — and its voice player and image — sixty times a
 * second; a transform written to the element costs a style change.
 */
export function SwipeToReply({
  onReply,
  disabled = false,
  children,
}: {
  onReply: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);
  const icon = useRef<HTMLSpanElement>(null);
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    sign: 1 | -1;
    mode: 'undecided' | 'swipe' | 'scroll';
    offset: number;
  } | null>(null);

  function paint(offset: number, settle: boolean) {
    const el = track.current;
    if (!el) return;
    el.style.transition = settle ? '' : 'none';
    el.style.transform = offset === 0 ? '' : `translateX(${offset * (gesture.current?.sign ?? 1)}px)`;
    if (icon.current) {
      const progress = Math.min(1, offset / TRIGGER_PX);
      icon.current.style.opacity = String(progress);
      icon.current.style.transform = `scale(${0.6 + progress * 0.4})`;
    }
  }

  function down(event: PointerEvent<HTMLDivElement>) {
    if (disabled || event.pointerType === 'mouse' || !event.isPrimary) return;
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      // Toward the inline end: left on an RTL page, right on an LTR one.
      sign: rtl ? -1 : 1,
      mode: 'undecided',
      offset: 0,
    };
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId || g.mode === 'scroll') return;
    const along = (event.clientX - g.x) * g.sign;
    const across = Math.abs(event.clientY - g.y);

    if (g.mode === 'undecided') {
      if (Math.abs(along) < DECIDE_PX && across < DECIDE_PX) return;
      if (along > 0 && along > across * 1.5) {
        g.mode = 'swipe';
        event.currentTarget.setPointerCapture(event.pointerId);
      } else {
        g.mode = 'scroll';
        return;
      }
    }

    // Past the trigger it drags with resistance, so the bubble cannot be
    // pulled off the screen and the point of no return is felt.
    const raw = Math.max(0, along);
    const offset = raw <= TRIGGER_PX ? raw : Math.min(MAX_PX, TRIGGER_PX + (raw - TRIGGER_PX) * 0.35);
    if (g.offset < TRIGGER_PX && offset >= TRIGGER_PX) navigator.vibrate?.(10);
    g.offset = offset;
    paint(offset, false);
  }

  function up(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    const fire = g.mode === 'swipe' && g.offset >= TRIGGER_PX;
    paint(0, true);
    gesture.current = null;
    if (fire) onReply();
  }

  return (
    <div
      className="chat-swipe"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <span ref={icon} className="chat-swipe__icon" aria-hidden="true">
        <Reply className="size-4" />
      </span>
      <div ref={track} className="chat-swipe__track">
        {children}
      </div>
    </div>
  );
}
