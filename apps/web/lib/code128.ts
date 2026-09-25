/**
 * Code 128, set B — enough of it to print the attendance code on «كارت
 * الحضور» as a barcode a USB scanner at the centre's door can read.
 *
 * ## Why not a package
 *
 * The payload is `ST` plus a short number (`attendanceCodeFor`), so set B —
 * printable ASCII, one symbol per character — covers it with no code-set
 * switching, and the whole encoder is a table and a checksum. A barcode
 * library would bring renderers, fonts and a canvas path this page never
 * draws; this renders to SVG on the server and ships no bytes to the browser.
 *
 * ## The layout, in modules (the narrowest bar is one module)
 *
 *   quiet zone · START B · one symbol per char · checksum · STOP · quiet zone
 *
 * Every symbol is 3 bars and 3 spaces totalling 11 modules; STOP is 4 bars
 * and 3 spaces totalling 13. The quiet zone is the blank margin a scanner
 * needs to find the first bar — 10 modules is the spec's minimum, and a card
 * that crops it is a card the scanner at the door refuses.
 */

/**
 * Bar/space widths for symbol values 0–106, bar first. Index = symbol value.
 * 103–105 are START A/B/C; 106 is STOP.
 */
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
] as const;

export const CODE128_START_B = 104;
export const CODE128_STOP = 106;
/** The spec's minimum blank margin on each side, in modules. */
export const CODE128_QUIET_ZONE = 10;

/** The width pattern for one symbol value — exported for the test. */
export function code128Pattern(value: number): string {
  const pattern = PATTERNS[value];
  if (pattern === undefined) throw new RangeError(`no Code 128 symbol ${value}`);
  return pattern;
}

/**
 * The symbol values for `text` in set B, START to STOP inclusive.
 *
 * Throws on anything outside printable ASCII (32–126): set B has no symbol for
 * it, and a barcode that silently drops a character reads as a DIFFERENT
 * student at the door.
 */
export function code128BValues(text: string): number[] {
  const data = Array.from(text, (char) => {
    const code = char.charCodeAt(0);
    if (char.length !== 1 || code < 32 || code > 126) {
      throw new RangeError(`"${char}" is not encodable in Code 128 set B`);
    }
    return code - 32;
  });
  return [CODE128_START_B, ...data, code128Checksum(CODE128_START_B, data), CODE128_STOP];
}

/** START's value, plus each data symbol times its 1-based position, mod 103. */
export function code128Checksum(start: number, data: readonly number[]): number {
  return data.reduce((sum, value, index) => sum + value * (index + 1), start) % 103;
}

export interface Code128Bars {
  /** Each bar's start and width, in modules from the left edge (quiet zone included). */
  bars: Array<{ x: number; width: number }>;
  /** Total width in modules, both quiet zones included. */
  width: number;
}

/**
 * The bars to draw. Modules, not pixels — the SVG's `viewBox` is this width,
 * so the card scales it to whatever the layout gives it and every bar stays a
 * whole multiple of the narrowest.
 */
export function code128Bars(text: string): Code128Bars {
  const bars: Code128Bars['bars'] = [];
  let x = CODE128_QUIET_ZONE;
  for (const value of code128BValues(text)) {
    Array.from(code128Pattern(value)).forEach((digit, index) => {
      const width = Number(digit);
      // Even positions are bars, odd are spaces — every pattern starts on a bar.
      if (index % 2 === 0) bars.push({ x, width });
      x += width;
    });
  }
  return { bars, width: x + CODE128_QUIET_ZONE };
}
