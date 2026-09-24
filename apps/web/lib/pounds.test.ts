import { describe, expect, it } from 'vitest';
import { parsePounds, poundsOf } from './pounds';

describe('parsePounds', () => {
  it('reads Latin and Arabic-Indic digits the same — «٢٥٠» is what an Egyptian keyboard types', () => {
    expect(parsePounds('250')).toEqual({ kind: 'valid', cents: 25000 });
    expect(parsePounds('٢٥٠')).toEqual({ kind: 'valid', cents: 25000 });
    expect(parsePounds(' ٤٥٠ ')).toEqual({ kind: 'valid', cents: 45000 });
  });

  it('takes decimals, with either separator', () => {
    expect(parsePounds('99.5')).toEqual({ kind: 'valid', cents: 9950 });
    expect(parsePounds('٩٩٫٥')).toEqual({ kind: 'valid', cents: 9950 });
  });

  it('keeps blank («مش للبيع») apart from a typo — a typo must never save as off-sale', () => {
    expect(parsePounds('')).toEqual({ kind: 'empty' });
    expect(parsePounds('   ')).toEqual({ kind: 'empty' });
    expect(parsePounds('-100')).toEqual({ kind: 'invalid' });
    expect(parsePounds('abc')).toEqual({ kind: 'invalid' });
    expect(parsePounds('1,000')).toEqual({ kind: 'invalid' });
  });

  it('round-trips through poundsOf', () => {
    expect(poundsOf(25000)).toBe('250');
    expect(poundsOf(9950)).toBe('99.5');
    expect(poundsOf(null)).toBe('');
  });
});
