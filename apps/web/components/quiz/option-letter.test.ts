import { describe, expect, it } from 'vitest';
import { optionLetter } from './option-letter';

describe('optionLetter', () => {
  it('letters an English question A B C D', () => {
    const stem = '<p>What component made the first electronic computers as large as a room?</p>';
    expect([0, 1, 2, 3].map((i) => optionLetter(i, stem))).toEqual(['A', 'B', 'C', 'D']);
  });

  it('keeps أ ب ج د on an Arabic question, even one that quotes code', () => {
    expect(optionLetter(1, '<p>ما ناتج <code>print(5 // 2)</code>؟</p>')).toBe('ب');
  });

  it('keeps أ ب ج د when the stem is not known', () => {
    expect(optionLetter(0)).toBe('أ');
  });
});
