import { stripOptionLabels } from '@ayman/contracts/quiz/option-label';

/** A version's option as the marking screen reads it from the bank. */
export interface WrittenOption {
  id: string;
  bodyHtml: string;
  position: number;
  fraction: unknown;
}

export interface PaperOption {
  id: string;
  bodyHtml: string;
  position: number;
  isRight: boolean;
  /** The weight itself — the card suggests a mark with the engine's own
   *  formula (`gradeChoice`), which reads weights, not «right or not». */
  fraction: number;
}

/**
 * One question's options as THIS student read them, for the marking screen.
 *
 * In the order they were served — `option_order` is the attempt's snapshot of
 * the shuffle — so «ب» on the card is the «ب» the student saw and the review
 * shows. An option the snapshot does not name (an old attempt) goes after, in
 * position order, rather than vanishing.
 *
 * And with the bodies the student read: the letters a teacher typed («أ) …»)
 * come off over the WRITTEN order, the way the learner and review serializers
 * take them off, because the card draws the paper's own letter beside each
 * row and would otherwise print two.
 *
 * `written` must be in position order.
 */
export function paperOptions(
  written: readonly WrittenOption[],
  optionOrder: readonly number[],
): PaperOption[] {
  const bodies = stripOptionLabels(written.map((option) => option.bodyHtml));
  const rows = written.map((option, index) => ({
    id: option.id,
    bodyHtml: bodies[index]!,
    position: option.position,
    isRight: Number(option.fraction) > 0,
    fraction: Number(option.fraction),
  }));
  const byPosition = new Map(rows.map((row) => [row.position, row]));
  const served: PaperOption[] = [];
  const used = new Set<number>();
  for (const position of optionOrder) {
    const row = byPosition.get(position);
    if (!row || used.has(position)) continue;
    served.push(row);
    used.add(position);
  }
  return [...served, ...rows.filter((row) => !used.has(row.position))];
}
