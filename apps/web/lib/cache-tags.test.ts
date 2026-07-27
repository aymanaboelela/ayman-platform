import { describe, expect, it } from 'vitest';
import {
  MAX_TAGS_PER_CALL,
  MAX_TAG_LENGTH,
  TAG_COURSES,
  assertTagBudget,
  courseTag,
  tag,
  tags,
} from './cache-tags';

describe('tag', () => {
  it('joins parts with a colon', () => {
    expect(tag('course')).toBe('course');
    expect(tag('course', '0192f000-0000-7000-8000-000000000001')).toBe(
      'course:0192f000-0000-7000-8000-000000000001',
    );
  });

  it('throws rather than returning a tag over 256 characters', () => {
    const huge = 'x'.repeat(257);
    expect(() => tag(huge)).toThrow(/256/);
  });

  it('accepts exactly 256 characters', () => {
    const exact = 'x'.repeat(256);
    expect(tag(exact)).toHaveLength(256);
  });
});

describe('assertTagBudget', () => {
  it('does not throw at or under 128 tags', () => {
    expect(() => assertTagBudget(Array.from({ length: MAX_TAGS_PER_CALL }, () => 'x'))).not.toThrow();
  });

  it('throws at 129 tags', () => {
    expect(() => assertTagBudget(Array.from({ length: 129 }, () => 'x'))).toThrow(/128/);
  });
});

describe('the vocabulary', () => {
  it('TAG_COURSES is the coarse list tag', () => {
    expect(TAG_COURSES).toBe('course');
  });

  it('courseTag is per-entity', () => {
    expect(courseTag('abc')).toBe('course:abc');
    expect(courseTag('abc')).not.toBe(courseTag('def'));
  });
});

describe('tag part validation', () => {
  it('rejects an empty part, which would produce a double colon', () => {
    expect(() => tag('settings', '')).toThrow();
  });
});

describe('tags', () => {
  it('produces the documented shapes', () => {
    expect(tags.settings('branding')).toBe('settings:branding');
    expect(tags.flags()).toBe('flags');
    expect(tags.nav()).toBe('nav');
    expect(tags.homeBlocks()).toBe('home-blocks');
    expect(tags.media('0191f2a0-1111-7000-8000-000000000000')).toBe(
      'media:0191f2a0-1111-7000-8000-000000000000',
    );
    expect(tags.taxonomy()).toBe('taxonomy');
  });

  it('every tag it can build is inside the 256-character budget', () => {
    const built = [
      tags.settings('branding'),
      tags.settings('seo'),
      tags.settings('contact'),
      tags.settings('features'),
      tags.flags(),
      tags.nav(),
      tags.homeBlocks(),
      tags.taxonomy(),
      tags.media('0191f2a0-1111-7000-8000-000000000000'),
    ];
    for (const value of built) {
      expect(value.length).toBeLessThanOrEqual(MAX_TAG_LENGTH);
    }
    expect(() => assertTagBudget(built)).not.toThrow();
  });
});
