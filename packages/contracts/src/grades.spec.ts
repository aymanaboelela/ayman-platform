import { describe, expect, it } from 'vitest';
import { GRADES, gradeOf, parseTenantGrades, stageWords } from './grades';

describe('parseTenantGrades', () => {
  it('reads nothing from an unset or empty variable — the old questions', () => {
    expect(parseTenantGrades(undefined)).toEqual([]);
    expect(parseTenantGrades('')).toEqual([]);
  });

  it('keeps the env order, trims, and drops unknown and repeated slugs', () => {
    expect(parseTenantGrades(' sec1, prep3 ,nope,prep3').map((g) => g.slug)).toEqual(['sec1', 'prep3']);
  });

  it('files الصف الأول الثانوي under الثانوية العامة year 1', () => {
    expect(parseTenantGrades('sec1')[0]).toMatchObject({ system: 'thanaweya_amma', year: 1 });
  });
});

describe('gradeOf', () => {
  const grades = parseTenantGrades('prep1,prep2,prep3,sec1');

  it('tells two year-1 grades apart by their system', () => {
    expect(gradeOf(grades, 'preparatory', 1)?.labelAr).toBe('الصف الأول الإعدادي');
    expect(gradeOf(grades, 'thanaweya_amma', 1)?.labelAr).toBe('الصف الأول الثانوي');
  });

  it('answers nothing for a pair the stack does not teach', () => {
    expect(gradeOf(grades, 'thanaweya_amma', 2)).toBeUndefined();
  });
});

describe('stageWords', () => {
  it('is the old literal on a stack with no grades, so its copy is byte-identical', () => {
    expect(stageWords([])).toEqual({
      stage: 'المرحلة الثانوية',
      forStage: 'للمرحلة الثانوية',
      stageShort: 'ثانوي',
      forStageShort: 'للثانوية',
      firstGrade: 'أول ثانوي',
      gradesSpoken: 'أولى وتانية وتالتة ثانوي',
    });
  });

  it('is the same on a secondary-only stack', () => {
    expect(stageWords(parseTenantGrades('sec1,sec2'))).toEqual(stageWords([]));
  });

  it('names both stages for الإعدادي + أولى ثانوي', () => {
    expect(stageWords(parseTenantGrades('prep1,prep2,prep3,sec1'))).toEqual({
      stage: 'الإعدادي والثانوي',
      forStage: 'للإعدادي والثانوي',
      stageShort: 'إعدادي وثانوي',
      forStageShort: 'لإعدادي وثانوي',
      firstGrade: 'أولى إعدادي',
      gradesSpoken: 'إعدادي وأولى ثانوي',
    });
  });

  it('names الإعدادية alone for a preparatory-only stack', () => {
    expect(stageWords(parseTenantGrades('prep3')).stage).toBe('المرحلة الإعدادية');
  });

  it('covers every grade it lists', () => {
    expect(GRADES.every((g) => g.year >= 1 && g.year <= 3)).toBe(true);
  });
});
