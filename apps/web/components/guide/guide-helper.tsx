'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { guideCopy, type GuideVoiceKey } from '@ayman/contracts/copy/guide';
import { CHECKOUT_STEP_EVENT, currentCheckoutStep, type CheckoutStepDetail } from '@/lib/checkout-step';
import type { GuideSurface, HelperPlace } from './guide-gate';
import type { GuideFace } from './guide-launcher';
import { GUIDE_SCOPE, GuideFaceImage, MuteButton, SpeechLine } from './guide-parts';
import { statusOf, type FieldStatus, type StatusKind } from './guide-status';
import type { GuideVoice } from './guide-voice';

const c = guideCopy;

/** The register form's fields, by the `name` react-hook-form gives each. */
const REGISTER_LINES: Record<string, GuideVoiceKey> = {
  name: 'register-name',
  phone: 'register-phone',
  email: 'register-email',
  password: 'register-password',
  confirmPassword: 'register-confirm',
};

/** Which of those have a live line under the spoken one (`guide-status.ts`). */
const REGISTER_STATUS: Record<string, StatusKind> = {
  name: 'name',
  phone: 'phone',
  password: 'password',
  confirmPassword: 'confirm',
};

/** The two pay-step controls worth a line of their own, by element id. */
type PayFocus = 'sender' | 'receipt';
const PAY_FOCUS: Record<string, PayFocus> = {
  'subscribe-sender-phone': 'sender',
  'subscribe-screenshot': 'receipt',
  'subscribe-screenshot-button': 'receipt',
};

/** The checkout steps after which there is nothing left to guide. */
const FINISHED = new Set(['success', 'walletSuccess', 'pending']);

/** How long a field must be quiet before its live line is recomputed. */
const STATUS_DEBOUNCE_MS = 250;

function subscribeCheckout(listener: () => void): () => void {
  window.addEventListener(CHECKOUT_STEP_EVENT, listener);
  return () => window.removeEventListener(CHECKOUT_STEP_EVENT, listener);
}

function subscribeNothing(): () => void {
  return () => {};
}

const noCheckout = (): CheckoutStepDetail | null => null;

/**
 * The line for where the checkout is — a pure function of what the panel
 * announced and which pay-step control was last focused.
 */
export function checkoutLine(detail: CheckoutStepDetail | null, focus: PayFocus | null): GuideVoiceKey {
  if (detail === null) return 'checkout-start';
  if (detail.step === 'pending') return 'checkout-pending';
  if (detail.step === 'success') return 'done';
  if (detail.step === 'walletSuccess') return 'done-open';
  if (detail.step === 'form' || detail.step === 'submitting') {
    if (!detail.railChosen) return 'checkout-method';
    if (focus === 'receipt') return 'checkout-receipt';
    if (focus === 'sender') return 'checkout-sender';
    return 'checkout-transfer';
  }
  // Checking, and the plan / term / month screens: the choices are still
  // being confirmed.
  return 'checkout-start';
}

/** The register line for a focused element — `null` for anything else. */
export function registerLine(target: EventTarget | null): GuideVoiceKey | null {
  const name = (target as { name?: unknown } | null)?.name;
  return typeof name === 'string' ? (REGISTER_LINES[name] ?? null) : null;
}

/** Which live line, if any, belongs to this element on this page. */
export function statusKindOf(place: HelperPlace, target: EventTarget | null): StatusKind | null {
  const element = target as { name?: unknown; id?: unknown } | null;
  if (place === 'register') {
    return typeof element?.name === 'string' ? (REGISTER_STATUS[element.name] ?? null) : null;
  }
  // The checkout's «the number the transfer came from» is validated by the
  // same function as the register form's phone.
  if (place === 'checkout') return element?.id === 'subscribe-sender-phone' ? 'phone' : null;
  return null;
}

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * How many pixels of a field the helper is sitting on — 0 when they do not
 * touch. Measured from the top of the field to the bottom of the helper: the
 * helper is pinned at the TOP, so this is how far the page must move down for
 * the field to clear it.
 */
export function coveredBy(field: Box, helper: Box): number {
  const sideBySide = field.right <= helper.left || field.left >= helper.right;
  const apart = field.bottom <= helper.top || field.top >= helper.bottom;
  if (sideBySide || apart) return 0;
  return Math.max(0, helper.bottom - field.top);
}

/** Room left between a field and the helper once the page has moved. */
const CLEARANCE_PX = 12;

/**
 * Keeps the helper off the field being filled in.
 *
 * It is pinned at the top of the screen, beside the form on a wide page and
 * above it on a phone, and the browser scrolls a focused field wherever it
 * likes — including under the helper. So on every focus, and whenever the
 * visible area changes (the on-screen keyboard), the two boxes are measured:
 *
 *   1. if the helper covers the focused field, the PAGE is scrolled so the
 *      field sits just below it — the form moves, the helper does not jump;
 *   2. if the page has no room to move (already at the top), the helper is
 *      hidden for as long as that field has focus. The voice still speaks,
 *      and a field nobody can see is worse than a hint nobody can see.
 *
 * `visualViewport`: on a phone the keyboard does not shrink the layout
 * viewport, it pans a smaller window over it — and a `position: fixed` box
 * stays with the layout, i.e. scrolls off the top exactly when somebody starts
 * typing. `--guide-vv-top` carries the pan to the stylesheet, which adds it to
 * the helper's `top`. Written straight to the element: it changes on every
 * scroll of the visual viewport, and React has no business re-rendering for it.
 */
function useKeepClear(dock: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    let frame = 0;
    let retried = false;

    const measure = () => {
      frame = 0;
      const element = dock.current;
      if (!element) return;
      element.style.setProperty('--guide-vv-top', `${viewport?.offsetTop ?? 0}px`);

      const active = document.activeElement;
      const typing =
        active instanceof HTMLElement &&
        !element.contains(active) &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
      // Measured with the helper showing, or a hidden helper would always
      // «clear» the field and flicker back on top of it.
      delete element.dataset.clash;
      if (!typing) return;

      const covered = coveredBy(active.getBoundingClientRect(), element.getBoundingClientRect());
      if (covered === 0) {
        retried = false;
        return;
      }
      if (!retried && window.scrollY > 0) {
        // One attempt: move the form down by what is covered, then look again.
        retried = true;
        window.scrollBy({ top: -(covered + CLEARANCE_PX) });
        frame = window.requestAnimationFrame(measure);
        return;
      }
      element.dataset.clash = '';
    };

    const schedule = () => {
      retried = false;
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    };

    document.addEventListener('focusin', schedule);
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    schedule();
    return () => {
      document.removeEventListener('focusin', schedule);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [dock]);
}

/**
 * The guide, outside the dialog: the teacher's face tucked into the TOP-left
 * corner of the screen and a slim caption that says what the control in front
 * of the student is for — one line per field on the register form, one per
 * real step of the checkout — with a live line under it that follows what is
 * being typed. A quiet companion, not a second dialog: where it sits, how
 * small it is and how the page makes room for it are `guide.css`'s («the
 * helper»); what it must never do — cover the field being filled — is
 * `useKeepClear`'s.
 *
 * It is beside the form, never over the field being filled and never part of
 * it. It reads three things about the page and writes nothing to it: which
 * element has focus (`focusin`), what that element currently holds (`input`,
 * turned at once into a sentence — see `guide-status.ts` for what is and is
 * not kept), and which step the checkout announced (`lib/checkout-step.ts`).
 * The forms work exactly as they do with no helper on the page, which is what
 * they are for everybody who did not come through the guide.
 *
 * Not a dialog and not modal: it must never take focus from a field somebody
 * is typing in. Both lines are polite live regions, so a screen reader hears
 * the guidance the bubble shows.
 *
 * ## The × folds; it does not dismiss
 *
 * Closing the bubble leaves the circle, and the circle brings the bubble back
 * on the line for wherever the student is now. A closed bubble stays closed —
 * a new field does not pop it open again, it puts a dot on the circle. There
 * is no control here that removes the circle: the guide ends by being
 * finished, or from the dialog's own ×.
 */
export function GuideHelper({
  place,
  surface,
  face,
  voice,
  done,
  onDone,
}: {
  place: HelperPlace;
  surface: GuideSurface;
  face: GuideFace | null;
  voice: GuideVoice;
  done: boolean;
  onDone: () => void;
}) {
  const dockRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(true);
  /** The line that was up when the bubble was folded — for the unread dot. */
  const [foldedOn, setFoldedOn] = useState<GuideVoiceKey | null>(null);
  const [field, setField] = useState<GuideVoiceKey | null>(null);
  const [payFocus, setPayFocus] = useState<PayFocus | null>(null);
  /** The caption shows the whole line instead of its first two. */
  const [full, setFull] = useState(false);
  /** The live line for the focused field. A sentence — never the value. */
  const [status, setStatus] = useState<FieldStatus | null>(null);
  // Where the checkout is. The panel announces; this only listens — and the
  // snapshot read covers a panel that announced before this chunk had loaded.
  const checkout = useSyncExternalStore(
    place === 'checkout' ? subscribeCheckout : subscribeNothing,
    place === 'checkout' ? currentCheckoutStep : noCheckout,
    noCheckout,
  );

  const line: GuideVoiceKey =
    place === 'register'
      ? (field ?? 'register-intro')
      : place === 'login'
        ? 'login'
        : place === 'onboarding'
          ? 'after-signup'
          : // A method changed back to «which one?» forgets the field focus.
            checkoutLine(checkout, checkout?.railChosen ? payFocus : null);

  useKeepClear(dockRef);

  // The line on screen, for the listeners below — they outlive any one render.
  const lineRef = useRef(line);
  useEffect(() => {
    lineRef.current = line;
  }, [line]);

  /*
   * The page's own first touch is the gesture that lets a line be spoken; the
   * helper never plays before it. That first touch also speaks the line that
   * has been waiting on screen — on the sign-in and onboarding pages the line
   * never changes, so without this it would never be heard at all.
   *
   * Capture phase, so a field's own handlers stopping propagation cannot hide
   * the gesture. A touch on the helper ITSELF only unlocks: its play button
   * is about to act on that same press, and starting the clip here would make
   * the button's own toggle stop it again.
   */
  useEffect(() => {
    let first = true;
    const unlock = (event: Event) => {
      voice.player.unlock();
      if (!first) return;
      first = false;
      const onHelper = event.target instanceof Element && event.target.closest('.guide-dock') !== null;
      if (!onHelper) voice.player.say(lineRef.current);
    };
    document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    document.addEventListener('keydown', unlock, { capture: true });
    return () => {
      document.removeEventListener('pointerdown', unlock, { capture: true });
      document.removeEventListener('keydown', unlock, { capture: true });
    };
  }, [voice.player]);

  /*
   * Which field is being filled in, and what it holds — two delegated
   * listeners on the document, so the forms themselves are not touched.
   *
   * On FOCUS the field's line is spoken from inside this handler, not from an
   * effect a render later: a tap on a field is a user gesture, and a browser
   * that only lets a page speak during one (Safari) has to see `play()` called
   * while that gesture is still on the stack. If it refuses anyway the player
   * falls silent and the text is what is left — see `guide-voice.ts`. The
   * player ignores a line it is already speaking, so the effect below saying
   * the same line again is harmless.
   */
  useEffect(() => {
    if (place !== 'register' && place !== 'checkout') return;
    let timer = 0;

    const onFocus = (event: FocusEvent) => {
      window.clearTimeout(timer);
      const kind = statusKindOf(place, event.target);
      // Straight away on arrival, so a field that was already filled in says
      // so without waiting for a keystroke.
      setStatus(kind ? statusOf(kind, event.target as HTMLInputElement) : null);

      if (place === 'register') {
        const next = registerLine(event.target);
        if (next === null) return;
        voice.player.say(next);
        setField(next);
        return;
      }
      const id = (event.target as { id?: unknown } | null)?.id;
      const focus = typeof id === 'string' ? PAY_FOCUS[id] : undefined;
      if (focus === undefined) return;
      const detail = currentCheckoutStep();
      voice.player.say(checkoutLine(detail, detail?.railChosen ? focus : null));
      setPayFocus(focus);
    };

    const onInput = (event: Event) => {
      const target = event.target;
      const kind = statusKindOf(place, target);
      if (kind === null) return;
      // Debounced: «باقي ٧ أرقام… ٦… ٥…» on every key is a flicker, and a live
      // region that changes per keystroke is a screen reader that never stops.
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        // Read at the moment of asking and dropped: only the sentence is kept.
        setStatus(statusOf(kind, target as HTMLInputElement));
      }, STATUS_DEBOUNCE_MS);
    };

    document.addEventListener('focusin', onFocus);
    document.addEventListener('input', onInput);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('input', onInput);
    };
  }, [place, voice.player]);

  const finished = place === 'checkout' && checkout !== null && FINISHED.has(checkout.step);
  // Guarded by `done`, so a fresh `onDone` closure per render cannot loop it.
  useEffect(() => {
    if (finished && !done) onDone();
  }, [finished, done, onDone]);

  // A line that changed without a focus behind it — the checkout moving to its
  // next step — is spoken here. Never before the page's first touch, and
  // never when muted: the player decides both.
  useEffect(() => {
    voice.player.say(line);
  }, [line, voice.player]);

  const unread = !open && foldedOn !== line;

  return createPortal(
    <aside
      ref={dockRef}
      className="guide-dock guide-dock--helper guide-scope"
      data-surface={surface}
      data-place={place}
      data-open={open ? '' : undefined}
      aria-label={c.label}
      {...GUIDE_SCOPE}
    >
      <button
        type="button"
        className="guide-circle"
        aria-expanded={open}
        aria-label={open ? c.helper.hide : unread ? `${c.helper.show} — ${c.helper.unread}` : c.helper.show}
        onClick={() => {
          if (open) setFoldedOn(line);
          setOpen(!open);
        }}
      >
        <GuideFaceImage face={face} size={40} className="guide-circle__face" />
        {unread ? <i className="guide-circle__dot" aria-hidden="true" /> : null}
      </button>
      {open ? (
        <div className="guide-bubble" data-full={full ? '' : undefined}>
          {/* A tap on the caption shows the rest of a line that was cut to
              two. A convenience for the eye only — the full text is in the
              tree either way, so it carries no role and takes no tab stop. */}
          <div className="guide-bubble__lines" onClick={() => setFull((current) => !current)}>
            <SpeechLine line={line} voice={voice} />
            {/* Always in the tree while the bubble is open, so the live region
                exists before its first sentence and is announced when it
                arrives. */}
            <p className="guide-status" data-tone={status?.tone} aria-live="polite">
              {status?.text ?? ''}
            </p>
          </div>
          <div className="guide-bubble__tools">
            {voice.player.canPlay(line) ? <MuteButton voice={voice} className="guide-bubble__btn" /> : null}
            <button
              type="button"
              className="guide-bubble__btn"
              aria-label={c.helper.hide}
              onClick={() => {
                setFoldedOn(line);
                setOpen(false);
              }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </aside>,
    document.body,
  );
}
