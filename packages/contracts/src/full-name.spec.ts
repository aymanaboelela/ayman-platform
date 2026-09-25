import { describe, expect, it } from 'vitest';
import { FULL_NAME_ERRORS, FullNameSchema } from './full-name';

function issue(value: unknown): string | undefined {
  const result = FullNameSchema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe('FullNameSchema', () => {
  it.each([
    'أحمد محمد علي',
    'سلمى إبراهيم عبد الرحمن',
    'محمّد مصطفى السيد',
    'Ahmed Mohamed Ali',
    'mohamed abd el rahman',
  ])('accepts %s', (name) => {
    expect(FullNameSchema.safeParse(name)).toEqual({ success: true, data: name });
  });

  it('tidies the spacing and drops تطويل instead of refusing them', () => {
    expect(FullNameSchema.parse('  أحمد   محمـــد\tعلي ')).toBe('أحمد محمد علي');
  });

  it.each(['', '   ', undefined, null, 42])('requires a name (%j)', (value) => {
    expect(issue(value)).toBe(FULL_NAME_ERRORS.required);
  });

  it.each(['أحمد', 'أحمد محمد', 'Ahmed Ali'])('wants three parts (%s)', (name) => {
    expect(issue(name)).toBe(FULL_NAME_ERRORS.tooFewParts);
  });

  it.each(['أحمد م علي', 'Ahmed M Ali'])('refuses a one-letter part (%s)', (name) => {
    expect(issue(name)).toBe(FULL_NAME_ERRORS.shortPart);
  });

  it.each(['أحمد محمد 3', 'أحمد محمد ٣', 'أحمد، محمد علي', 'Ahmed.Mohamed Ali', 'أحمد محمد @علي', 'Ahmed Mohamed Ali!'])(
    'refuses digits and symbols (%s)',
    (name) => {
      expect(issue(name)).toBe(FULL_NAME_ERRORS.characters);
    },
  );

  it('refuses a name that mixes Arabic and English', () => {
    expect(issue('أحمد Mohamed علي')).toBe(FULL_NAME_ERRORS.mixed);
  });

  it('caps the length', () => {
    expect(issue(Array.from({ length: 30 }, () => 'محمود').join(' '))).toBe(
      FULL_NAME_ERRORS.tooLong,
    );
  });
});
