/**
 * «عام ولا لغات» for ONE line of ONE order — the fallback chain, in one place.
 *
 * ## The complaint this exists for
 *
 * «بشوف الكتب اللي الناس طالباها وما بيبقاش مكتوب عام ولا لغات». The column used
 * to read the ORDER's course, and an order placed from `/books` has no course —
 * so on every cart order, which is now most of them, the cell was blank. The
 * school is on the BOOK now (`books.for_general` / `books.for_languages`), read
 * live off the linked row rather than snapshotted, and that is what the packing
 * list should say.
 *
 * ## Why it is a chain and not one field
 *
 * Three cases, and all three are real:
 *
 *   1. The line points at a catalogue book → the book's own pair. Live, so an
 *      admin correcting a mislabelled book fixes every packing list at once.
 *   2. Both `null` — a line the admin typed by hand («كتاب خاص»), or one whose
 *      book row was deleted — on an order that DID come from a course page →
 *      the course's pair, which is the same answer the column gave before books
 *      had a school of their own.
 *   3. Nothing to read on either → `null`, and the caller prints NOTHING. An
 *      empty cell is honest; guessing «عام» because it is the commoner school
 *      would put a wrong word on a box.
 *
 * ## Why the pair falls back together
 *
 * `forGeneral` and `forLanguages` are one answer in two fields — the database
 * CHECK (`books_serves_a_stream`) makes "neither" unrepresentable, and they are
 * written as a pair by `StreamChoiceField`. Falling back field-by-field could
 * therefore mix a book's «عربي» with a course's «لغات» and produce a combination
 * neither row ever claimed. The contract's own note says the two are «both null
 * together»; this treats them that way rather than trusting it.
 */
export interface LineStream {
  forGeneral: boolean;
  forLanguages: boolean;
}

export function bookLineStream(
  line: { forGeneral: boolean | null; forLanguages: boolean | null },
  order: { courseForGeneral: boolean | null; courseForLanguages: boolean | null },
): LineStream | null {
  if (line.forGeneral !== null || line.forLanguages !== null) {
    return { forGeneral: line.forGeneral ?? false, forLanguages: line.forLanguages ?? false };
  }
  if (order.courseForGeneral !== null || order.courseForLanguages !== null) {
    return {
      forGeneral: order.courseForGeneral ?? false,
      forLanguages: order.courseForLanguages ?? false,
    };
  }
  return null;
}
