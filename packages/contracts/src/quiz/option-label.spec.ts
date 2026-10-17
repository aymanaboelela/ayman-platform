import { describe, expect, it } from 'vitest';
import {
  isCrossReferenceOption,
  isLetteredSet,
  keepsWrittenOrder,
  normalizeOptionText,
  stripOptionLabels,
} from './option-label';

describe('stripOptionLabels', () => {
  it('takes the typed letters off a lettered set, whatever the bracket', () => {
    expect(stripOptionLabels(['[أ] نعم.', '[ب] لا.', '[ج] فقط في المدارس.', '[د] فقط في الشركات.'])).toEqual([
      'نعم.',
      'لا.',
      'فقط في المدارس.',
      'فقط في الشركات.',
    ]);
    expect(stripOptionLabels(['أ) الكروم', 'ب) البكسل', 'ج ) الهرتز', 'د)لا شئ من ما سبق'])).toEqual([
      'الكروم',
      'البكسل',
      'الهرتز',
      'لا شئ من ما سبق',
    ]);
    expect(stripOptionLabels(['A. True', 'B. False'])).toEqual(['True', 'False']);
    expect(stripOptionLabels(['(1) x', '(2) y', '3) z'])).toEqual(['x', 'y', 'z']);
  });

  it('keeps the wrapper markup the bank stores options in', () => {
    expect(stripOptionLabels(['<p>أ) siri</p>', '<p>ب) Amazon</p>'])).toEqual(['<p>siri</p>', '<p>Amazon</p>']);
  });

  it('leaves a list that only LOOKS lettered alone', () => {
    // Initials, not labels: «C» is not the first option's letter.
    const inventors = ['C. Babbage', 'A. Turing', 'B. Lovelace'];
    expect(isLetteredSet(inventors)).toBe(false);
    expect(stripOptionLabels(inventors)).toEqual(inventors);
    // One labelled row is not a lettering scheme.
    expect(stripOptionLabels(['A. Turing', 'Babbage'])).toEqual(['A. Turing', 'Babbage']);
    // Arithmetic, not labels.
    expect(stripOptionLabels(['5 - 3', '2', '8'])).toEqual(['5 - 3', '2', '8']);
  });

  it('never strips an option down to nothing', () => {
    expect(stripOptionLabels(['أ)', 'ب) x'])).toEqual(['أ)', 'x']);
  });
});

describe('isCrossReferenceOption', () => {
  it.each([
    'كل ما سبق',
    'جميع ما سبق',
    'لا شئ من ما سبق',
    'د) لا شيء مما سبق',
    'ج و ب معا',
    'ج) أ , ب معا',
    'أ و د معًا',
    'All of the above',
    'none of the above',
    'Both A and B',
  ])('«%s» points at other options', (body) => {
    expect(isCrossReferenceOption(body)).toBe(true);
  });

  it.each(['لا شيء', 'a + b', 'جميع المهام', 'تحيز بيانات التدريب', 'حدث يهدد أمن المعلومات.'])(
    '«%s» is an ordinary answer',
    (body) => {
      expect(isCrossReferenceOption(body)).toBe(false);
    },
  );
});

describe('keepsWrittenOrder', () => {
  it('holds a question that refers to its own options', () => {
    expect(keepsWrittenOrder(['تحيز بيانات التدريب', 'عدم وضوح السؤال', 'سرعة الجهاز', 'أ و د معا'])).toBe(true);
  });

  it('holds a question the teacher lettered', () => {
    expect(keepsWrittenOrder(['أ) siri', 'ب) Amazon', 'ج) DeepL', 'د) YouTube'])).toBe(true);
  });

  it('lets an ordinary question shuffle', () => {
    expect(keepsWrittenOrder(['siri', 'Amazon', 'DeepL', 'YouTube'])).toBe(false);
  });
});

describe('normalizeOptionText', () => {
  it('compares the same option across a relettering, a retyping and spacing', () => {
    expect(normalizeOptionText('<p>أ) تحيز بيانات التدريب</p>')).toBe(normalizeOptionText('تحيز  بيانات التدريب'));
    expect(normalizeOptionText('إجابة صحيحة')).toBe(normalizeOptionText('اجابه صحيحه'));
    expect(normalizeOptionText('Siri')).toBe(normalizeOptionText('siri'));
  });
});
