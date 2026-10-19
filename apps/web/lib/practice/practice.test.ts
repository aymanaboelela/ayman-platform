import { describe, expect, it } from 'vitest';
import type { PracticePublicSetSummary } from '@ayman/contracts/practice';
import {
  LESSON_CODE,
  parsePracticeTrack,
  parsePracticeYear,
  practiceCourseSlug,
  practicePath,
  practiceTotals,
  practiceUnits,
  unitLook,
} from './catalog';
import { bestKey, percent, practiceBand, readBest, recordBest, shuffledOrder } from './grade';

const set = (over: Partial<PracticePublicSetSummary>): PracticePublicSetSummary => ({
  year: 2,
  track: 'arabic',
  lessonCode: '1-1',
  title: 't',
  unitTitle: null,
  articleSlug: null,
  questionCount: 20,
  ...over,
});

describe('catalog', () => {
  it('groups one year and track by unit, in the book’s numeric order', () => {
    const sets = [
      set({ lessonCode: '6-10' }),
      set({ lessonCode: '6-8' }),
      set({ lessonCode: '2-1', unitTitle: 'الوحدة الثانية: الأمن السيبراني' }),
      set({ lessonCode: '1-1', track: 'languages' }),
      set({ lessonCode: '1-1', year: 1 }),
    ];
    const units = practiceUnits(sets, 2, 'arabic');
    expect(units.map((u) => u.number)).toEqual([2, 6]);
    expect(units[0]!.title).toBe('الوحدة الثانية: الأمن السيبراني');
    expect(units[1]!.title).toBe('الوحدة السادسة');
    expect(units[1]!.sets.map((s) => s.lessonCode)).toEqual(['6-8', '6-10']);
  });

  it('gives a known unit its own look and an unknown one a non-grey fallback', () => {
    expect(unitLook(2, 2)).toEqual({ tone: 'ok', icon: 'shield' });
    expect(unitLook(2, 9).icon).toBe('book');
  });

  it('counts lessons and questions per filter', () => {
    const sets = [set({}), set({ lessonCode: '1-2', questionCount: 10 }), set({ year: 1 })];
    expect(practiceTotals(sets)).toEqual({ lessons: 3, questions: 50 });
    expect(practiceTotals(sets, { year: 2 })).toEqual({ lessons: 2, questions: 30 });
  });

  it('builds and parses URLs, and recognises a legacy lesson segment', () => {
    expect(practicePath(2)).toBe('/practice/2');
    expect(practicePath(2, 'languages')).toBe('/practice/2/languages');
    expect(practicePath(1, 'arabic', '6-10')).toBe('/practice/1/arabic/6-10');
    expect(parsePracticeYear('3')).toBeNull();
    expect(parsePracticeTrack('english')).toBeNull();
    expect(LESSON_CODE.test('2-1')).toBe(true);
    expect(LESSON_CODE.test('arabic')).toBe(false);
    expect(practiceCourseSlug(2, 'languages')).toBe('programming-cs-year2-2027-languages');
    expect(practiceCourseSlug(1, 'arabic')).toBe('programming-cs-year1-2027-general');
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
    expect([...shuffledOrder(4, () => 0.3)].sort()).toEqual([0, 1, 2, 3]);
  });

  it('keeps the Arabic key the first release wrote, and a separate one for Languages', () => {
    expect(bestKey(2, 'arabic', '2-1')).toBe('2-2-1');
    expect(bestKey(2, 'languages', '2-1')).toBe('2-languages-2-1');
  });

  it('keeps only a better best score, and survives storage that throws', () => {
    localStorage.clear();
    expect(recordBest('2-2-1', { score: 10, total: 20 })).toBe(true);
    expect(recordBest('2-2-1', { score: 8, total: 20 })).toBe(false);
    expect(readBest('2-2-1')).toEqual({ score: 10, total: 20 });

    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(readBest('2-2-1')).toBeNull();
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
