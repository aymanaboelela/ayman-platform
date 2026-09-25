import { describe, expect, it } from 'vitest';
import {
  CODE128_QUIET_ZONE,
  CODE128_START_B,
  CODE128_STOP,
  code128BValues,
  code128Bars,
  code128Pattern,
} from './code128';

const widthOf = (pattern: string) => Array.from(pattern).reduce((sum, digit) => sum + Number(digit), 0);

describe('Code 128 set B', () => {
  it('computes the checksum of the textbook example', () => {
    // «PJJ123C» is the worked example the Code 128 check-digit explanation
    // uses: 104 + 48·1 + 42·2 + 42·3 + 17·4 + 18·5 + 19·6 + 35·7 = 879,
    // and 879 mod 103 = 55.
    const values = code128BValues('PJJ123C');
    expect(values[0]).toBe(CODE128_START_B);
    expect(values.at(-2)).toBe(55);
    expect(values.at(-1)).toBe(CODE128_STOP);
  });

  it('encodes an attendance code', () => {
    // S=51 T=52 4=20 3=19 7=23 3=19 → 104 + 51 + 104 + 60 + 76 + 115 + 114
    // = 624, and 624 mod 103 = 6.
    expect(code128BValues('ST4373')).toEqual([104, 51, 52, 20, 19, 23, 19, 6, 106]);
  });

  it('starts on START B and ends on STOP, inside a quiet zone', () => {
    const { bars, width } = code128Bars('ST4373');
    // START B is 2-1-1-2-1-4: bars of 2, 1 and 1 modules at 10, 13 and 16.
    expect(bars.slice(0, 3)).toEqual([
      { x: CODE128_QUIET_ZONE, width: 2 },
      { x: CODE128_QUIET_ZONE + 3, width: 1 },
      { x: CODE128_QUIET_ZONE + 6, width: 1 },
    ]);
    // STOP is 2-3-3-1-1-1-2: its last bar is 2 modules and ends where the
    // trailing quiet zone begins.
    const last = bars.at(-1)!;
    expect(last.width).toBe(2);
    expect(last.x + last.width).toBe(width - CODE128_QUIET_ZONE);
    // start + 6 data + checksum at 11 modules each, stop at 13, two quiet zones.
    expect(width).toBe(11 * 8 + 13 + 2 * CODE128_QUIET_ZONE);
  });

  it('has a well-formed table', () => {
    for (let value = 0; value < CODE128_STOP; value += 1) {
      expect(widthOf(code128Pattern(value))).toBe(11);
    }
    expect(widthOf(code128Pattern(CODE128_STOP))).toBe(13);
  });

  it('refuses a character set B cannot print', () => {
    expect(() => code128BValues('ST٤٣')).toThrow(RangeError);
  });
});
