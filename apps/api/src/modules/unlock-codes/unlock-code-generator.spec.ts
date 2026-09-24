import { isUnlockCodeShape, normaliseUnlockCode, UnlockCodeSchema } from '@ayman/contracts/unlock-codes';
import { generateUnlockCode } from './unlock-code-generator';

describe('unlock codes — shape', () => {
  it('generates six characters from the no-lookalike alphabet', () => {
    for (let index = 0; index < 500; index += 1) {
      const code = generateUnlockCode();
      expect(isUnlockCodeShape(code)).toBe(true);
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it('accepts what a student actually types: lower case, spaces, a dash', () => {
    expect(normaliseUnlockCode(' ab c-7k9 ')).toBe('ABC7K9');
    expect(UnlockCodeSchema.parse('abc-7k9')).toBe('ABC7K9');
  });

  it('refuses the wrong length and the lookalike letters', () => {
    expect(UnlockCodeSchema.safeParse('ABC7K').success).toBe(false);
    expect(UnlockCodeSchema.safeParse('ABC7K0').success).toBe(false);
    expect(UnlockCodeSchema.safeParse('ABCDEFG').success).toBe(false);
  });
});
