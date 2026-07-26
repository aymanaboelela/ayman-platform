import { describe, expect, it } from 'vitest';
import { MAX_TAGS_PER_CALL, TAG_COURSES, assertTagBudget, courseTag, tag } from './cache-tags';

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
