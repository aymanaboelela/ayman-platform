import type { BookTerm } from '@ayman/contracts/books';
import { copy } from '@ayman/contracts/copy/admin';

const c = copy.admin.books;

/**
 * «الترم الأول / الترم التاني / السنة كاملة» — the three bands `/books` groups
 * a shelf into, in the order it renders them.
 *
 * One table for the list, the editor and the term picker, so the three cannot
 * disagree on the words or the order. The same order the shop's own `TERMS`
 * uses in `books-shop.tsx`: first, second, then the whole-year volume.
 */
export const BOOK_TERMS: readonly BookTerm[] = ['first', 'second', 'full'];

export const BOOK_TERM_LABEL: Record<BookTerm, string> = {
  first: c.termFirst,
  second: c.termSecond,
  full: c.termFull,
};

/**
 * One colour per term, and the colour is the MEANING, not decoration.
 *
 * «السنة كاملة» printed over two first-term books is the bug this screen was
 * reopened for, and it went unnoticed because on the old list every chip was
 * the same grey outline — the term was there, and nothing about it drew the
 * eye. Three hues make a wrong band visible at a glance.
 *
 * Built from the status tokens the way `Badge` builds its tones (a
 * `color-mix` wash, a stronger edge, the token itself as text), so both themes
 * are handled by the tokens and no `dark:` variant is needed:
 *
 *   · first  → `--info`   blue
 *   · second → `--e-ink`  ember, the study ramp
 *   · full   → `--a-9`    amber, with `--a-11` as the readable text step
 *
 * Every variable named here is defined in `tokens/color.css`;
 * `css-token-coverage.test.ts` fails the build on one that is not.
 */
export const BOOK_TERM_TONE: Record<BookTerm, string> = {
  first:
    'text-[color:var(--info)] border-[color-mix(in_oklch,var(--info),transparent_60%)] bg-[color-mix(in_oklch,var(--info),transparent_90%)]',
  second:
    'text-[color:var(--e-ink)] border-[color-mix(in_oklch,var(--e-ink),transparent_60%)] bg-[color-mix(in_oklch,var(--e-ink),transparent_90%)]',
  full: 'text-accent-text border-[color-mix(in_oklch,var(--a-9),transparent_55%)] bg-[color-mix(in_oklch,var(--a-9),transparent_88%)]',
};

/**
 * The SELECTED state of the term picker — a full-strength edge and a deeper
 * wash in the same hue, with the body text colour on top.
 *
 * Not a solid fill with white text: `--e-ink` is re-pointed to a LIGHT step in
 * the dark theme (`--e-300`) and `--info` to a mid one, so white on either is
 * below 4.5:1 there. `text-fg` on a 25% wash reads in both themes, and the
 * check mark beside the label carries the state for anyone who cannot tell
 * the washes apart (WCAG 1.4.1).
 */
export const BOOK_TERM_SELECTED: Record<BookTerm, string> = {
  first:
    'text-fg border-[color:var(--info)] bg-[color-mix(in_oklch,var(--info),transparent_75%)]',
  second:
    'text-fg border-[color:var(--e-ink)] bg-[color-mix(in_oklch,var(--e-ink),transparent_75%)]',
  full: 'text-fg border-accent bg-[color-mix(in_oklch,var(--a-9),transparent_70%)]',
};

/**
 * The row's inline-start edge in the term's hue — the list's one strong stroke
 * of colour, so a column of books sorted into bands reads as bands even when
 * the eye never lands on a chip.
 */
export const BOOK_TERM_EDGE: Record<BookTerm, string> = {
  first: 'border-s-[color:var(--info)]',
  second: 'border-s-[color:var(--e-ink)]',
  full: 'border-s-accent',
};
