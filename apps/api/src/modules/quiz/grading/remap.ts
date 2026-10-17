import { normalizeOptionText } from '@ayman/contracts/quiz/option-label';

/**
 * Carrying an answer from one VERSION of a question to another.
 *
 * Option ids are minted per version (`question_options` rows belong to one
 * `question_versions` row), so an answer saved against version 1 names ids
 * that do not exist in version 2. Moving an answer forward — a regrade after
 * the key was corrected, or an autosave from a tab that loaded the old version
 * — means finding, for every option the student touched, the SAME option in
 * the new version.
 *
 * "The same" is decided, in order:
 *
 *  1. by TEXT (`normalizeOptionText`): survives the teacher reordering the
 *     options, re-lettering them, or fixing spacing and hamzas;
 *  2. by POSITION, for what text could not place, when both versions have the
 *     same number of options, the slot is still free AND the two texts are
 *     close (`similar`): a typo fix («Amazone» → «Amazon») that left the
 *     option where it was;
 *  3. the last one left: exactly one unplaced option on each side, again only
 *     when the texts are close — the option that was edited.
 *
 * Anything still unplaced has no honest counterpart, and an answer that
 * touched it is NOT moved — the caller leaves it, and its mark, as they were.
 *
 * The similarity bar on 2 and 3 is the whole safety of this file. Without it,
 * a teacher who REWROTE an option would have it matched to whatever now sits
 * in its place: on 2026-10-17 one exam's «أ و د معا» — the answer the teacher
 * meant, chosen by 41 students — was replaced by a plain distractor in the
 * same row, and a position match would have taken 41 correct marks away.
 */

export interface MappableOption {
  id: string;
  bodyHtml: string;
  position: number;
}

/** Character-bigram Dice coefficient of two normalised texts, 0..1. */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (text: string): Map<string, number> => {
    const counts = new Map<string, number>();
    for (let index = 0; index < text.length - 1; index += 1) {
      const pair = text.slice(index, index + 2);
      counts.set(pair, (counts.get(pair) ?? 0) + 1);
    }
    return counts;
  };
  const left = bigrams(a);
  const right = bigrams(b);
  let shared = 0;
  for (const [pair, count] of left) shared += Math.min(count, right.get(pair) ?? 0);
  return (2 * shared) / (a.length - 1 + (b.length - 1));
}

/** Close enough to be one option edited, rather than one option replaced. */
const SAME_OPTION_SIMILARITY = 0.6;

function similar(a: MappableOption, b: MappableOption): boolean {
  return similarity(normalizeOptionText(a.bodyHtml), normalizeOptionText(b.bodyHtml)) >= SAME_OPTION_SIMILARITY;
}

export function mapOptionsBetweenVersions(
  from: readonly MappableOption[],
  to: readonly MappableOption[],
): Map<string, string> {
  const mapping = new Map<string, string>();
  const taken = new Set<string>();

  // 1. Text. Only a UNIQUE match counts: two options that normalise to the
  //    same text in either version could be either of them.
  const toByText = new Map<string, MappableOption[]>();
  for (const option of to) {
    const key = normalizeOptionText(option.bodyHtml);
    toByText.set(key, [...(toByText.get(key) ?? []), option]);
  }
  const fromTextCounts = new Map<string, number>();
  for (const option of from) {
    const key = normalizeOptionText(option.bodyHtml);
    fromTextCounts.set(key, (fromTextCounts.get(key) ?? 0) + 1);
  }
  for (const option of from) {
    const key = normalizeOptionText(option.bodyHtml);
    const candidates = toByText.get(key) ?? [];
    if (key === '' || candidates.length !== 1 || fromTextCounts.get(key) !== 1) continue;
    const target = candidates[0]!;
    if (taken.has(target.id)) continue;
    mapping.set(option.id, target.id);
    taken.add(target.id);
  }

  // 2. Position, only between two versions of the same size, only an edit.
  if (from.length === to.length) {
    const toByPosition = new Map(to.map((option) => [option.position, option]));
    for (const option of from) {
      if (mapping.has(option.id)) continue;
      const target = toByPosition.get(option.position);
      if (!target || taken.has(target.id) || !similar(option, target)) continue;
      mapping.set(option.id, target.id);
      taken.add(target.id);
    }
  }

  // 3. One edited option on each side.
  const unplacedFrom = from.filter((option) => !mapping.has(option.id));
  const unplacedTo = to.filter((option) => !taken.has(option.id));
  if (unplacedFrom.length === 1 && unplacedTo.length === 1 && similar(unplacedFrom[0]!, unplacedTo[0]!)) {
    mapping.set(unplacedFrom[0]!.id, unplacedTo[0]!.id);
  }

  return mapping;
}

/**
 * The answer with every option id carried across, or null when any of them
 * has no counterpart (see above — such an answer is left alone, never
 * half-moved). Text answers carry no ids and pass through unchanged.
 */
export function remapResponse(response: unknown, mapping: ReadonlyMap<string, string>): unknown {
  if (response === null || response === undefined || typeof response !== 'object') return response;
  const record = response as { kind?: unknown; optionIds?: unknown };
  if (record.kind !== 'choice' || !Array.isArray(record.optionIds)) return response;
  const next: string[] = [];
  for (const id of record.optionIds) {
    if (typeof id !== 'string') return null;
    const mapped = mapping.get(id);
    if (!mapped) return null;
    next.push(mapped);
  }
  return { ...record, optionIds: next };
}

/**
 * The snapshotted option ORDER, carried across: `optionOrder` lists the old
 * version's positions as the student was shown them, so each is replaced by
 * the position its counterpart holds in the new version. New options the old
 * version did not have go last, in their written order — the student's
 * review still shows the rows they saw where they saw them.
 */
export function remapOptionOrder(
  optionOrder: readonly number[],
  from: readonly MappableOption[],
  to: readonly MappableOption[],
  mapping: ReadonlyMap<string, string>,
): number[] {
  const fromByPosition = new Map(from.map((option) => [option.position, option]));
  const toById = new Map(to.map((option) => [option.id, option]));
  const order: number[] = [];
  const used = new Set<number>();
  for (const position of optionOrder) {
    const source = fromByPosition.get(position);
    const target = source ? toById.get(mapping.get(source.id) ?? '') : undefined;
    if (target && !used.has(target.position)) {
      order.push(target.position);
      used.add(target.position);
    }
  }
  for (const option of [...to].sort((a, b) => a.position - b.position)) {
    if (!used.has(option.position)) order.push(option.position);
  }
  return order;
}
