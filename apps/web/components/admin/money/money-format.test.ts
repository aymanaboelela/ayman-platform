import { describe, expect, it } from 'vitest';
import { dayTitle, formatAmount, shortDay } from './money-format';

describe('money-format', () => {
  it('keeps the minus on the digits inside an Arabic line', () => {
    // LRI … PDI around the signed figure — without it bidi renders «100−».
    expect(formatAmount(-10000)).toBe('⁦−100⁩ ج');
    expect(formatAmount(125050)).toBe('1,250.5 ج');
    expect(formatAmount(0)).toBe('0 ج');
  });

  it('reads a Cairo day key as that calendar day, whatever the machine zone is', () => {
    expect(shortDay('2026-09-28')).toContain('28');
    expect(dayTitle('2026-09-28', '2026-09-28', '2026-09-27').startsWith('النهارده')).toBe(true);
    expect(dayTitle('2026-09-27', '2026-09-28', '2026-09-27').startsWith('امبارح')).toBe(true);
    expect(dayTitle('2026-09-20', '2026-09-28', '2026-09-27')).toContain('20');
  });
});
