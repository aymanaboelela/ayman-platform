import { describe, expect, it } from 'vitest';
import { formatBytes, formatEta, formatSpeed } from './upload-format';

describe('upload-format', () => {
  it('keeps one decimal under 10 MB, where an ADSL upload actually lives', () => {
    expect(formatBytes(400_000)).toBe('0.4 ميجا');
    expect(formatBytes(350_000_000)).toBe('350 ميجا');
    expect(formatBytes(1_400_000_000)).toBe('1.4 جيجا');
    expect(formatSpeed(3_200_000)).toBe('3.2 ميجا/ث');
  });

  it('says the time left the way a person would', () => {
    expect(formatEta(40)).toBe('فاضل 40 ثانية');
    expect(formatEta(61)).toBe('فاضل 2 دقيقة');
    expect(formatEta(3600 + 5 * 60)).toBe('فاضل 1 ساعة و5 دقيقة');
  });
});
