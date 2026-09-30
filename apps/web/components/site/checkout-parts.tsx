'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Check, ChevronDown, Copy, TriangleAlert } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { Label } from '@ayman/ui/components/label';
import { cn } from '@ayman/ui/lib/cn';
import { formatEGP } from '@/lib/price';
/*
 * The checkout stylesheet — `:root` tokens only, because both checkouts are
 * drawn inside a Radix dialog that portals into `<body>`, outside `.site`
 * (`lib/books-dialog-tokens.test.ts`). Imported here as well as by each panel,
 * so any screen built from these parts has it.
 */
import './book-checkout.css';

/*
 * ══ The two checkouts' shared frame ═════════════════════════════════════════
 *
 * «اشتراك الكورس» (`SubscribePanel`) and «طلبك» (`BookOrderPanel`) are one
 * product to the student — both end in «حوّل المبلغ وارفع الصورة» — and they
 * used to look like two. These are the pieces both are now drawn with: the
 * step bar, the folding summary, the labelled field, the copy button, the
 * numbered payment stop, the finished card and the footer that holds the total.
 *
 * Presentation only. Nothing here reads the API, knows a price rule or decides
 * what is sent; each panel keeps its own logic and hands these the words.
 */

/**
 * A price the way both checkouts print it: the figure, then a smaller «ج».
 *
 * `<bdi>` around the figure — a Latin-digit run inside Arabic, grouped with
 * «٬» by `formatEGP` — so it can never be reordered against the unit or the
 * words beside it.
 *
 * ⚠️ Deliberately NOT a `priceLine` template («٣٠٠ جنيه»). That string is each
 * payment step's headline figure and is printed there exactly once; the footer
 * and the summary carry the same number in this split form.
 */
export function Money({ cents }: { cents: number }) {
  return (
    <>
      <bdi className="bco-money">{formatEGP(cents)}</bdi>{' '}
      <span className="bco-money__unit">{copy.books.currencyShort}</span>
    </>
  );
}

/** «١ … · ٢ … · ٣ …». `current` is 1-based; one past the last marks all done. */
export function CheckoutSteps({
  label,
  stops,
  current,
}: {
  label: string;
  stops: readonly string[];
  current: number;
}) {
  return (
    <ol className="bco-steps" aria-label={label}>
      {stops.map((stop, index) => {
        const n = index + 1;
        const state = n < current ? 'done' : n === current ? 'current' : 'next';
        return (
          <li
            key={stop}
            className="bco-steps__item"
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className="bco-steps__dot" aria-hidden="true">
              {state === 'done' ? <Check size={14} strokeWidth={3} /> : n}
            </span>
            <span className="bco-steps__label">{stop}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The ONE summary card, folding on a phone.
 *
 * On a phone it folds to its header row (`data-open`); on a wide layout the
 * stylesheet shows the body regardless and hides the toggle. The body is the
 * caller's — a basket's lines and zone, or a course's plan and months.
 */
export function CheckoutSummary({
  title,
  icon,
  badge,
  toggleLabel,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: ReactNode;
  /** A short count beside the title — «٣ كتاب», «٢ شهر». */
  badge?: string;
  toggleLabel: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <aside className="bco-sum" data-open={open ? 'true' : 'false'} aria-label={title}>
      <button type="button" className="bco-sum__head" aria-expanded={open} onClick={onToggle}>
        <span className="bco-sum__icon" aria-hidden="true">
          {icon}
        </span>
        <span className="bco-sum__title">{title}</span>
        {badge ? <span className="bco-sum__count">{badge}</span> : null}
        <span className="bco-sum__toggle">
          {toggleLabel}
          <ChevronDown size={16} aria-hidden="true" />
        </span>
      </button>
      <div className="bco-sum__body">{children}</div>
    </aside>
  );
}

/** A labelled field with its own message line — an error, or else a hint. */
export function CheckoutField({
  id,
  label,
  error,
  hint,
  full,
  children,
}: {
  /** What the label points at, and the prefix of the message's own id. */
  id: string;
  label: string;
  error?: string;
  hint?: string;
  /** Spans both columns of the form grid. */
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn('bco-field', full && 'bco-field--full')}>
      <Label htmlFor={id} className="bco-field__label">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="bco-field__error">
          <TriangleAlert size={14} aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p className="bco-field__hint">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * «نسخ الرقم» / «نسخ المبلغ». Clipboard first, then a hidden input and
 * `execCommand('copy')` — `navigator.clipboard` needs a secure context and is
 * refused outright by older WebViews, which is exactly the class of phone most
 * likely to be paying over Vodafone Cash.
 *
 * The input is `readOnly`, not `type="hidden"`: `execCommand` needs a real,
 * focusable, selectable element to select text from.
 */
export function CopyButton({
  text,
  label,
  copiedLabel,
  solid,
}: {
  text: string;
  label: string;
  copiedLabel: string;
  /** The filled variant — for the transfer number, the one to press first. */
  solid?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function copyNow() {
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    try {
      await navigator.clipboard.writeText(text);
      done();
      return;
    } catch {
      // Fall through to the execCommand path below.
    }
    const input = inputRef.current;
    if (!input) return;
    try {
      input.focus();
      input.select();
      if (document.execCommand('copy')) done();
    } catch {
      // Both paths refused — the text is still selected on screen.
    }
  }

  return (
    <>
      <button
        type="button"
        className={cn('bco-copy', solid && 'bco-copy--solid')}
        onClick={() => void copyNow()}
      >
        {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
        {copied ? copiedLabel : label}
      </button>
      <input
        ref={inputRef}
        readOnly
        dir="ltr"
        value={text}
        aria-hidden="true"
        tabIndex={-1}
        className="sr-only"
      />
    </>
  );
}

/** The figure to send — first, largest, and copyable. `value` is the exact
 *  `priceLine` string; `digits` is what the copy button puts on the clipboard. */
export function AmountCard({
  icon,
  label,
  value,
  digits,
  copyLabel,
  copiedLabel,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  digits: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  return (
    <div className="bco-amount">
      <span className="bco-amount__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="bco-amount__text">
        <p className="bco-amount__label">{label}</p>
        <p className="bco-amount__value">{value}</p>
      </div>
      <CopyButton text={digits} label={copyLabel} copiedLabel={copiedLabel} />
    </div>
  );
}

/** One numbered stop of the payment step. */
export function PayStep({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="bco-paystep">
      <span className="bco-paystep__num" aria-hidden="true">
        {n}
      </span>
      <div className="bco-paystep__body">{children}</div>
    </li>
  );
}

/** A finished (or waiting) state — an icon, a headline and what happens next. */
export function CheckoutDone({
  tone,
  icon,
  title,
  body,
  children,
}: {
  tone: 'success' | 'info';
  icon: ReactNode;
  title?: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn('bco-done', tone === 'success' && 'bco-done--success')} role="status">
      <span className="bco-done__icon" aria-hidden="true">
        {icon}
      </span>
      {title ? <p className="bco-done__title">{title}</p> : null}
      <p className="bco-done__body">{body}</p>
      {children}
    </div>
  );
}

/**
 * The footer: the total on one side, the action on the other, and a request
 * error — the one kind of message that is about no single field — above both.
 *
 * `total` is the whole block, so a step can put its own line there (the month
 * picker's running total, or the reason its button is off).
 */
export function CheckoutFooter({
  error,
  total,
  secondary,
  primary,
}: {
  error?: string | null;
  total?: ReactNode;
  secondary?: ReactNode;
  primary?: ReactNode;
}) {
  return (
    <div className="bco__foot">
      {error ? (
        <p role="alert" className="bco__alert">
          <TriangleAlert size={16} aria-hidden="true" />
          {error}
        </p>
      ) : null}
      <div className={cn('bco__bar', !total && 'bco__bar--bare')}>
        {total ?? null}
        <div className="bco__actions">
          {secondary}
          {primary}
        </div>
      </div>
    </div>
  );
}

/** The usual footer figure: a label, the amount, and a short note under it. */
export function FooterTotal({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="bco-total">
      <span className="bco-total__label">{label}</span>
      <span className="bco-total__value">{value}</span>
      {note ? <span className="bco-total__note">{note}</span> : null}
    </div>
  );
}

/*
 * ── The on-screen keyboard ────────────────────────────────────────────────
 *
 * On a phone the checkout dialog is a sheet pinned to the bottom of the LAYOUT
 * viewport, and neither iOS Safari nor Chrome (whose default is now
 * `resizes-visual`) shrinks that viewport for the keyboard — they shrink the
 * VISUAL one. So a keyboard opened for a field slid up over the sheet's footer
 * and the lower fields, and the pinned total sat on the very input being typed
 * into.
 *
 * This lifts the sheet to sit on top of the keyboard and caps it to the visible
 * height: the footer stays in view, the body scrolls, and the browser scrolls
 * the focused field into that body. Written as custom properties on the dialog
 * (`.bco-dialog[data-keyboard]` in the stylesheet) rather than inline geometry,
 * so the dialog's own layout is untouched the rest of the time. Nothing happens
 * outside a `.bco-dialog`, or on a desktop.
 */
export function useCheckoutKeyboard(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const host = rootRef.current?.closest<HTMLElement>('.bco-dialog');
    const viewport = typeof window === 'undefined' ? null : window.visualViewport;
    if (!host || !viewport) return;
    const clear = () => {
      host.style.removeProperty('--bco-kb');
      host.style.removeProperty('--bco-vvh');
      host.style.removeProperty('--bco-vvtop');
      delete host.dataset.keyboard;
    };
    const update = () => {
      const covered = window.innerHeight - (viewport.offsetTop + viewport.height);
      // 80px: a keyboard, not a collapsing URL bar.
      if (covered > 80) {
        host.style.setProperty('--bco-kb', `${Math.round(covered)}px`);
        host.style.setProperty('--bco-vvh', `${Math.round(viewport.height)}px`);
        host.style.setProperty('--bco-vvtop', `${Math.round(viewport.offsetTop)}px`);
        host.dataset.keyboard = 'open';
      } else {
        clear();
      }
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      clear();
    };
  }, [rootRef]);
}
