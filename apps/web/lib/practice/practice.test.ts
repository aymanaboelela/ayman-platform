import { describe, expect, it } from 'vitest';
import { PRACTICE_SETS } from './sets';
import {
  PRACTICE_YEARS,
  allPracticeLessons,
  getPracticeSet,
  parsePracticeYear,
  practicePath,
  practiceUnits,
} from './catalog';
import { percent, practiceBand, readBest, recordBest, shuffledOrder } from './grade';

/**
 * The sets are written by hand and auto-graded with no human in the loop, so
 * a broken key is a student told «غلط» for the right answer on a public page.
 * These are the properties that make a key unambiguous.
 */
describe('practice sets', () => {
  it('has one set per (year, lesson), and every set is listed by the catalog', () => {
    const keys = PRACTICE_SETS.map((s) => `${s.year}-${s.lesson}`);
    expect(new Set(keys).size).toBe(keys.length);
    const listed = new Set(allPracticeLessons().map((l) => `${l.year}-${l.code}`));
    for (const key of keys) expect(listed.has(key), `${key} has no catalog row`).toBe(true);
  });

  for (const set of PRACTICE_SETS) {
    describe(`${set.year}-${set.lesson} ${set.title}`, () => {
      it('has between 15 and 30 questions with unique ids', () => {
        expect(set.questions.length).toBeGreaterThanOrEqual(15);
        expect(set.questions.length).toBeLessThanOrEqual(30);
        const ids = set.questions.map((q) => q.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it('keys every question to exactly one real option', () => {
        for (const q of set.questions) {
          if (q.type === 'tf') {
            expect(q.options, q.id).toBeUndefined();
            expect([0, 1], q.id).toContain(q.answer);
          } else {
            expect(q.options?.length, q.id).toBe(4);
            expect(new Set(q.options!.map((o) => o.trim())).size, q.id).toBe(4);
            expect(q.answer, q.id).toBeGreaterThanOrEqual(0);
            expect(q.answer, q.id).toBeLessThan(4);
          }
          expect(q.explanation.trim().length, q.id).toBeGreaterThan(0);
        }
      });

      it('never offers an option that points at the others', () => {
        // Options are shuffled per attempt, so «كل ما سبق» would point at rows
        // that moved — `quiz/option-label.ts` documents the same failure.
        for (const q of set.questions) {
          for (const o of q.options ?? []) expect(o, q.id).not.toMatch(/كل ما سبق|جميع ما سبق|لا شيء مما سبق/);
        }
      });
    });
  }
});

describe('catalog', () => {
  it('orders year 2 before year 1 and keeps every unit non-empty', () => {
    expect(PRACTICE_YEARS).toEqual([2, 1]);
    for (const year of PRACTICE_YEARS) {
      for (const unit of practiceUnits(year)) expect(unit.lessons.length).toBeGreaterThan(0);
    }
  });

  it('resolves a path back to its set and rejects anything else', () => {
    const first = allPracticeLessons()[0]!;
    expect(practicePath(first.year, first.code)).toBe(`/practice/${first.year}/${first.code}`);
    expect(getPracticeSet(first.year, first.code)?.title).toBe(first.title);
    expect(parsePracticeYear('3')).toBeNull();
    expect(parsePracticeYear('2')).toBe(2);
    expect(getPracticeSet(2, '9-9')).toBeNull();
  });

  it('links every lesson to a free lesson article', () => {
    for (const lesson of allPracticeLessons()) expect(lesson.article).toMatch(/^شرح-درس-/);
  });
});

describe('grading', () => {
  it('bands at 90 / 75 / 60', () => {
    expect(practiceBand(18, 20)).toBe('excellent');
    expect(practiceBand(15, 20)).toBe('great');
    expect(practiceBand(12, 20)).toBe('good');
    expect(practiceBand(11, 20)).toBe('review');
    expect(practiceBand(0, 0)).toBe('review');
    expect(percent(17, 20)).toBe(85);
  });

  it('shuffles into a permutation', () => {
    const order = shuffledOrder(4, () => 0.3);
    expect([...order].sort()).toEqual([0, 1, 2, 3]);
  });

  it('keeps only a better best score, and survives storage that throws', () => {
    localStorage.clear();
    expect(recordBest(2, '2-1', { score: 10, total: 20 })).toBe(true);
    expect(recordBest(2, '2-1', { score: 8, total: 20 })).toBe(false);
    expect(readBest(2, '2-1')).toEqual({ score: 10, total: 20 });
    expect(recordBest(2, '2-1', { score: 19, total: 20 })).toBe(true);

    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(readBest(2, '2-1')).toBeNull();
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
