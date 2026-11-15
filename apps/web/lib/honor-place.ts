import { copy } from '@ayman/contracts/copy';

const c = copy.landing.honorBoard;

/**
 * «المركز الأول» — the word under a name on the honour board, for any place.
 *
 * The written ordinals stop at the tenth (the range an instructor can hand-
 * set), but a paper's place is its dense rank by score, and a board of
 * quarter marks reaches the eleventh: 100, 99.75, 99.5 … 97 is twelve places.
 * Those cards used to print no word at all. Past the words it is «المركز 11»
 * (Western digits, the site's rule) in the same voice — what
 * `board-honors.tsx` already did.
 */
export function honorPlaceWord(rank: number): string {
  return c.placeRanks[rank - 1] ?? `${c.placeRankPrefix} ${rank}`;
}
