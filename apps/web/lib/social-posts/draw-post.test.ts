import { describe, expect, it } from 'vitest';
import type { SocialFacts } from '@ayman/contracts/social/posts';
import { __test, coverKeyOf, photoKeysOf } from './draw-post';

const { withAlpha, initials } = __test;

describe('draw-post helpers', () => {
  it('puts an alpha on every colour shape the palette can hand back', () => {
    expect(withAlpha('rgb(10, 20, 30)', 0.5)).toBe('rgb(10 20 30 / 0.5)');
    expect(withAlpha('rgba(10, 20, 30, 0.9)', 0.5)).toBe('rgb(10 20 30 / 0.5)');
    expect(withAlpha('oklch(0.62 0.17 258)', 0.2)).toBe('oklch(0.62 0.17 258 / 0.2)');
    expect(withAlpha('oklch(0.62 0.17 258 / 0.8)', 0.2)).toBe('oklch(0.62 0.17 258 / 0.2)');
    expect(withAlpha('#336699', 1)).toBe('#336699ff');
  });

  it('draws two initials from a short name', () => {
    expect(initials('أحمد م.')).toBe('أ م');
    expect(initials('منى')).toBe('م');
  });

  it('loads only the honor-board photos a post carries, once each', () => {
    const facts: SocialFacts = {
      kind: 'honor',
      day: '2026-10-20',
      title: 'x',
      people: [
        { name: 'أ', photoKey: 'ab/1.webp', score: null, total: null, rank: 1 },
        { name: 'ب', photoKey: null, score: null, total: null, rank: 2 },
        { name: 'ج', photoKey: 'ab/1.webp', score: null, total: null, rank: 3 },
      ],
    };
    expect(photoKeysOf(facts)).toEqual(['ab/1.webp']);
    expect(coverKeyOf(facts)).toBeNull();
    expect(coverKeyOf({ kind: 'news', title: 't', excerpt: '', coverKey: 'cd/2.webp' })).toBe('cd/2.webp');
  });
});
