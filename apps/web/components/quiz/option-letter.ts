import { copy } from '@ayman/contracts/copy';

/**
 * أ ب ج د — the name a student gives an option out loud («الإجابة ج»).
 *
 * Positional, on purpose: options arrive in the snapshotted per-attempt order
 * and most papers shuffle them, so «ب» means "the second one on THIS paper" —
 * the only thing a letter can honestly mean. The runner and the review both
 * render the served order, so the letter a student picked is the letter they
 * see marked afterwards. Past the tenth option, a plain number.
 *
 * Its own module with no directive, so the review (rendered from a client
 * list) and the runner share it without either importing the other.
 */
export function optionLetter(index: number): string {
  return copy.quiz.optionLetters[index] ?? String(index + 1);
}
