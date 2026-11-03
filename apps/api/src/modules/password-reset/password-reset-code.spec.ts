import { PASSWORD_RESET_LIMITS } from '@ayman/contracts/password-reset';
import { codeMatches, generateCode, generateHandle, hashCode, hashHandle, renderMessage } from './password-reset-code';

const SECRET = 'x'.repeat(40);

describe('password reset code', () => {
  it('is six digits, leading zeros kept', () => {
    for (let i = 0; i < 500; i += 1) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });

  it('is not one value over and over', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateCode()));
    expect(seen.size).toBeGreaterThan(190);
  });

  it('hashes with the key and the row, so the same digits differ across rows and secrets', () => {
    const a = hashCode(SECRET, 'row-a', '123456');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCode(SECRET, 'row-b', '123456')).not.toBe(a);
    expect(hashCode('y'.repeat(40), 'row-a', '123456')).not.toBe(a);
  });

  it('matches only the right code on the right row', () => {
    const stored = hashCode(SECRET, 'row-a', '000417');
    expect(codeMatches(SECRET, 'row-a', '000417', stored)).toBe(true);
    expect(codeMatches(SECRET, 'row-a', '000418', stored)).toBe(false);
    expect(codeMatches(SECRET, 'row-b', '000417', stored)).toBe(false);
    // A row that was never delivered has no hash — nothing matches it.
    expect(codeMatches(SECRET, 'row-a', '000417', null)).toBe(false);
    expect(codeMatches(SECRET, 'row-a', '000417', 'short')).toBe(false);
  });

  it('puts the code and its lifetime in the message, and the platform name with no placeholder left', () => {
    const text = renderMessage('204913');
    expect(text).toContain('204913');
    expect(text).toContain(String(PASSWORD_RESET_LIMITS.codeTtlSeconds / 60));
    expect(text).not.toMatch(/\{\w+\}/);
  });

  it('hands out a 43-character random handle, stored only as its hash', () => {
    const a = generateHandle();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateHandle()).not.toBe(a);
    expect(hashHandle(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashHandle(a)).not.toContain(a);
  });
});
