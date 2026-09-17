import { describe, expect, it } from 'vitest';
import { bookLineStream } from './line-stream';

/**
 * «بشوف الكتب اللي الناس طالباها وما بيبقاش مكتوب عام ولا لغات» — the column
 * that was blank on every cart order, and the three-step chain that fills it.
 *
 * The cases below are the three real shapes an order line comes in, not a
 * sweep of the boolean space: a line that points at a catalogue book, a line
 * that points at nothing on an order that came from a course page, and a line
 * that points at nothing on an order that came from `/books`.
 */
const courseOrder = { courseForGeneral: false, courseForLanguages: true };
const cartOrder = { courseForGeneral: null, courseForLanguages: null };

describe('bookLineStream', () => {
  it("uses the line's own pair when the book is still linked", () => {
    expect(bookLineStream({ forGeneral: true, forLanguages: false }, courseOrder)).toEqual({
      forGeneral: true,
      forLanguages: false,
    });
  });

  it("prefers the line over the order's course, even when they disagree", () => {
    // The course is a لغات course; the book in the box is the عام edition.
    // The packing list must say what is in the box.
    expect(bookLineStream({ forGeneral: true, forLanguages: true }, courseOrder)).toEqual({
      forGeneral: true,
      forLanguages: true,
    });
  });

  it('falls back to the order course for a hand-typed line', () => {
    expect(bookLineStream({ forGeneral: null, forLanguages: null }, courseOrder)).toEqual({
      forGeneral: false,
      forLanguages: true,
    });
  });

  it('renders nothing when there is neither a book nor a course to read', () => {
    expect(bookLineStream({ forGeneral: null, forLanguages: null }, cartOrder)).toBeNull();
  });

  /*
   * The pair falls back TOGETHER. A half-null line should never be able to
   * borrow the other half from the course — that would print a combination
   * neither the book nor the course ever claimed. Not reachable through the
   * API (the two columns are written as a pair), which is exactly why it is
   * pinned here: the next person to "tidy" this into `line.x ?? course.x`
   * would make it reachable.
   */
  it('never mixes half a line with half a course', () => {
    expect(bookLineStream({ forGeneral: true, forLanguages: null }, courseOrder)).toEqual({
      forGeneral: true,
      forLanguages: false,
    });
  });

  it('treats a stale all-false pair as nothing to say, via StreamBadge', () => {
    // `{ false, false }` is unrepresentable in the database (`books_serves_a_
    // stream`), so this helper passes it through rather than inventing a rule;
    // `<StreamBadge>` is what renders nothing for it. Pinned so the two
    // components' division of labour stays visible.
    expect(bookLineStream({ forGeneral: false, forLanguages: false }, courseOrder)).toEqual({
      forGeneral: false,
      forLanguages: false,
    });
  });
});
