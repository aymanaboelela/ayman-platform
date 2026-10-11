import { describe, expect, it } from 'vitest';
import { variantRuns, type BankRow } from './bank-rows';

const row = (id: string, variantGroupKey: string | null): BankRow => ({
  id,
  archivedAt: null,
  usedInQuizzes: 0,
  variantGroupKey,
  category: { id: 'c', name: 'تصنيف' },
  versions: [],
});

describe('variantRuns', () => {
  it('boxes consecutive rows of one group, and leaves an ungrouped row on its own', () => {
    const runs = variantRuns([row('a', 'loop'), row('b', 'loop'), row('c', null), row('d', null), row('e', 'if')]);
    expect(runs.map((run) => [run.key, run.rows.map((r) => r.id)])).toEqual([
      ['loop', ['a', 'b']],
      [null, ['c']],
      [null, ['d']],
      ['if', ['e']],
    ]);
  });
});
