import { PracticeQuestionInputSchema, PracticeSetPatchSchema } from '@ayman/contracts/practice';
import { comparePracticeSets, isExactPermutation, parseLessonCode, sortPracticeSets } from './practice-order';

describe('practice ordering', () => {
  it('parses unit and lesson as numbers', () => {
    expect(parseLessonCode('6-10')).toEqual([6, 10]);
    expect(parseLessonCode(' 2-1 ')).toEqual([2, 1]);
  });

  it('sorts a malformed code last instead of throwing', () => {
    const [unit] = parseLessonCode('intro');
    expect(unit).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('orders by year, then track, then unit and lesson NUMERICALLY («6-10» after «6-8»)', () => {
    const rows = [
      { year: 2, track: 'arabic', lessonCode: '1-1' },
      { year: 1, track: 'languages', lessonCode: '1-1' },
      { year: 1, track: 'arabic', lessonCode: '10-1' },
      { year: 1, track: 'arabic', lessonCode: '6-10' },
      { year: 1, track: 'arabic', lessonCode: '6-8' },
      { year: 1, track: 'arabic', lessonCode: '2-1' },
    ] as const;
    expect(sortPracticeSets(rows).map((r) => `${r.year}/${r.track}/${r.lessonCode}`)).toEqual([
      '1/arabic/2-1',
      '1/arabic/6-8',
      '1/arabic/6-10',
      '1/arabic/10-1',
      '1/languages/1-1',
      '2/arabic/1-1',
    ]);
  });

  it('is a total order — equal keys compare 0', () => {
    const a = { year: 1, track: 'arabic', lessonCode: '3-2' } as const;
    expect(comparePracticeSets(a, { ...a })).toBe(0);
  });

  it('does not mutate its input', () => {
    const rows = [
      { year: 2, track: 'arabic', lessonCode: '1-1' },
      { year: 1, track: 'arabic', lessonCode: '1-1' },
    ] as const;
    const copy = [...rows];
    sortPracticeSets(rows);
    expect(rows).toEqual(copy);
  });
});

describe('isExactPermutation', () => {
  const current = ['a', 'b', 'c'];

  it('accepts every id exactly once, in any order', () => {
    expect(isExactPermutation(current, ['c', 'a', 'b'])).toBe(true);
  });

  it('refuses a missing id, a duplicate, or a foreign id', () => {
    expect(isExactPermutation(current, ['a', 'b'])).toBe(false);
    expect(isExactPermutation(current, ['a', 'a', 'b'])).toBe(false);
    expect(isExactPermutation(current, ['a', 'b', 'z'])).toBe(false);
  });
});

/* The DTOs are the contract's schemas verbatim, so these pin the validation
   the controller actually applies — the rules a bad paste would hit. */
describe('practice question validation (contract)', () => {
  const ok = { type: 'mcq', stem: 'ما هو؟', options: ['أ', 'ب'], answer: 1 };

  it('accepts a valid mcq and defaults the explanation', () => {
    const parsed = PracticeQuestionInputSchema.parse(ok);
    expect(parsed.explanation).toBe('');
  });

  it('refuses an mcq answer out of range, too few or duplicate options', () => {
    expect(PracticeQuestionInputSchema.safeParse({ ...ok, answer: 2 }).success).toBe(false);
    expect(PracticeQuestionInputSchema.safeParse({ ...ok, options: ['أ'], answer: 0 }).success).toBe(false);
    expect(PracticeQuestionInputSchema.safeParse({ ...ok, options: ['A', 'A'] }).success).toBe(false);
    // Case is meaningful: the ASCII lesson asks «O» against «o».
    expect(PracticeQuestionInputSchema.safeParse({ ...ok, options: ['A', 'a'] }).success).toBe(true);
  });

  it('refuses tf with options or an answer above 1', () => {
    expect(PracticeQuestionInputSchema.safeParse({ type: 'tf', stem: 'صح ولا غلط', answer: 0 }).success).toBe(true);
    expect(PracticeQuestionInputSchema.safeParse({ type: 'tf', stem: 'صح ولا غلط', options: ['x'], answer: 0 }).success).toBe(false);
    expect(PracticeQuestionInputSchema.safeParse({ type: 'tf', stem: 'صح ولا غلط', answer: 2 }).success).toBe(false);
  });

  it('a title-only PATCH injects no defaults (published/article untouched)', () => {
    expect(PracticeSetPatchSchema.parse({ title: 'جديد' })).toEqual({ title: 'جديد' });
  });
});
