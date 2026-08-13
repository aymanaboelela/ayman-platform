'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

export type LauncherPosition = { x: number; y: number } | null;

/** Where a moved launcher is remembered. Per device, per browser — see below. */
const STORAGE_KEY = 'ayman:assistant-position';

/** How long a press has to be held, with the finger still, before it picks up. */
const HOLD_MS = 400;

/** A mouse drags immediately; this is the slop that separates a drag from a click. */
const MOUSE_SLOP_PX = 6;

/**
 * How far a FINGER may travel before the press is read as a scroll instead.
 *
 * Deliberately larger than the mouse's. A thumb never holds perfectly still on
 * a moving page, and a launcher that hijacked the scroll every time someone
 * happened to start their swipe on top of it would be worse than one that
 * cannot move at all.
 */
const TOUCH_SLOP_PX = 12;

/** Keeps the button fully on screen, with room to tap around it. */
const EDGE_MARGIN_PX = 8;

function clamp(low: number, value: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

function readStored(): LauncherPosition {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { x: unknown }).x === 'number' &&
      typeof (parsed as { y: unknown }).y === 'number'
    ) {
      return parsed as { x: number; y: number };
    }
    return null;
  } catch {
    // A private-mode browser that throws on `localStorage`, or a value some
    // other tab wrote badly. Either way the launcher belongs in its corner.
    return null;
  }
}

/**
 * Picking المساعد up and putting it somewhere else.
 *
 * ## Why this exists
 *
 * The floating launcher is a 56px disc pinned over the bottom corner of
 * whatever the page ends with, and on a phone that is often the one thing the
 * reader was trying to reach — «بجد أخد مساحة كبيرة جدا». The two obvious
 * answers are both bad: shrinking it makes the support channel harder to hit
 * for the students who need it most, and hiding it on scroll means a button
 * that is never where you left it (`assistant-widget.tsx` already documents
 * that experiment and its reversal). Letting the reader move it costs nobody
 * the button.
 *
 * ## Two gestures, because there are two input devices
 *
 * A MOUSE drags: press and move past six pixels and it comes with you, which is
 * what dragging anything on a desktop has always meant.
 *
 * A FINGER holds: press and keep still for 400ms and it picks up. It cannot be
 * "press and move", because on a touch screen that gesture already means scroll
 * the page — and the launcher sits over content, so a reader flicking upward
 * with their thumb starting on the button would drag it instead of scrolling.
 * So a finger that moves before the timer wins is a scroll, the hold is
 * cancelled, and pointer capture is released so the browser gets the gesture
 * back untouched.
 *
 * ## The position is per-device and deliberately not synced
 *
 * `localStorage`, not the profile. Where a button should sit is a fact about a
 * SCREEN — a thumb's reach on a phone held in the right hand has nothing to do
 * with where it belongs on a laptop — and syncing it would mean the launcher
 * moving on a device the student never touched it on. It is also re-clamped on
 * every resize, so a position saved in landscape cannot strand the button
 * off-screen in portrait.
 *
 * ## ⚠️ The element's ref is a PARAMETER, not something this returns
 *
 * A lint constraint rather than a preference.
 *
 * Returning `{ ref, position, dragging, … }` is the tidier API and it does not
 * survive `react-hooks/refs`: the React Compiler's analysis treats an object
 * that carries a ref as ref-like in its entirety, so reading `launcher.position`
 * in the render body was reported as "Cannot access refs during render" — nine
 * times, on values that are ordinary `useState`. Taking the ref in and handing
 * back only plain values keeps the same call site and leaves nothing for the
 * rule to catch.
 */
export function useLauncherDrag(ref: RefObject<HTMLButtonElement | null>, enabled: boolean) {
  const [position, setPosition] = useState<LauncherPosition>(readStored);
  const [dragging, setDragging] = useState(false);

  /** Set the moment a drag actually starts, and read by the click handler. */
  const movedRef = useRef(false);
  const holdRef = useRef(0);
  /** Pointer origin, and the offset from it to the button's top-left corner. */
  const originRef = useRef({ x: 0, y: 0, dx: 0, dy: 0 });

  const persist = useCallback((next: LauncherPosition) => {
    try {
      if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Private mode, or the quota is full. The launcher still moved for this
      // page view; it just will not be there next time. Not worth a message.
    }
  }, []);

  /** Puts the button back in the corner the stylesheet chose for it. */
  const reset = useCallback(() => {
    setPosition(null);
    persist(null);
  }, [persist]);

  const moveTo = useCallback(
    (clientX: number, clientY: number) => {
      const element = ref.current;
      if (!element) return;
      const { width, height } = element.getBoundingClientRect();
      setPosition({
        x: clamp(
          EDGE_MARGIN_PX,
          clientX - originRef.current.dx,
          window.innerWidth - width - EDGE_MARGIN_PX,
        ),
        y: clamp(
          EDGE_MARGIN_PX,
          clientY - originRef.current.dy,
          window.innerHeight - height - EDGE_MARGIN_PX,
        ),
      });
    },
    [ref],
  );

  const cancelHold = useCallback(() => {
    window.clearTimeout(holdRef.current);
    holdRef.current = 0;
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!enabled || event.button !== 0) return;
      const element = ref.current;
      if (!element) return;

      const box = element.getBoundingClientRect();
      originRef.current = {
        x: event.clientX,
        y: event.clientY,
        dx: event.clientX - box.left,
        dy: event.clientY - box.top,
      };
      movedRef.current = false;

      // Capture on the way DOWN, so a fast drag that leaves the button still
      // delivers its moves here. Released again the moment a touch turns out to
      // be a scroll.
      element.setPointerCapture(event.pointerId);

      cancelHold();
      holdRef.current = window.setTimeout(() => {
        movedRef.current = true;
        setDragging(true);
        moveTo(originRef.current.x, originRef.current.y);
      }, HOLD_MS);
    },
    [cancelHold, enabled, moveTo, ref],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!enabled) return;

      if (movedRef.current) {
        moveTo(event.clientX, event.clientY);
        return;
      }

      const travelled = Math.hypot(
        event.clientX - originRef.current.x,
        event.clientY - originRef.current.y,
      );

      if (event.pointerType === 'mouse') {
        if (travelled < MOUSE_SLOP_PX) return;
        cancelHold();
        movedRef.current = true;
        setDragging(true);
        moveTo(event.clientX, event.clientY);
        return;
      }

      // A finger that has travelled is scrolling, not moving the button. Give
      // the gesture back to the browser — see the note at the top.
      if (travelled > TOUCH_SLOP_PX) {
        cancelHold();
        if (ref.current?.hasPointerCapture(event.pointerId)) {
          ref.current.releasePointerCapture(event.pointerId);
        }
      }
    },
    [cancelHold, enabled, moveTo, ref],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      cancelHold();
      if (ref.current?.hasPointerCapture(event.pointerId)) {
        ref.current.releasePointerCapture(event.pointerId);
      }
      if (!movedRef.current) return;
      setDragging(false);
      setPosition((current) => {
        persist(current);
        return current;
      });
    },
    [cancelHold, persist, ref],
  );

  /**
   * A drag must not also open the panel.
   *
   * Read (and cleared) by the launcher's `onClick`. A `preventDefault` on
   * pointerup would not do it — the click is synthesised from the whole
   * down-up pair, and by then the button has already moved out from under the
   * cursor, which is exactly the sequence that fires a click nobody meant.
   */
  const consumeDrag = useCallback(() => {
    const dragged = movedRef.current;
    movedRef.current = false;
    return dragged;
  }, []);

  /*
   * Re-clamp when the viewport changes.
   *
   * A position saved in landscape, or before the on-screen keyboard closed, can
   * be entirely outside a portrait viewport — and a launcher off screen is a
   * support channel that has silently disappeared, with no affordance left to
   * bring it back. This is also why the position is stored rather than the
   * corner it was nearest: pinning to a corner would survive rotation but would
   * throw away the reader's actual choice.
   */
  useEffect(() => {
    if (!enabled) return;
    const onResize = () => {
      const element = ref.current;
      if (!element) return;
      const { width, height } = element.getBoundingClientRect();
      setPosition((current) => {
        if (!current) return current;
        const next = {
          x: clamp(EDGE_MARGIN_PX, current.x, window.innerWidth - width - EDGE_MARGIN_PX),
          y: clamp(EDGE_MARGIN_PX, current.y, window.innerHeight - height - EDGE_MARGIN_PX),
        };
        if (next.x === current.x && next.y === current.y) return current;
        persist(next);
        return next;
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [enabled, persist, ref]);

  useEffect(() => () => window.clearTimeout(holdRef.current), []);

  return {
    position: enabled ? position : null,
    dragging,
    reset,
    consumeDrag,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
