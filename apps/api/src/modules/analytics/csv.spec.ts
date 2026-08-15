import { csvFraction, toCsv } from './csv';

describe('toCsv', () => {
  it('starts with a UTF-8 BOM', () => {
    // Without it, Excel on Windows reads the file as the system codepage and
    // every Arabic name opens as mojibake.
    expect(toCsv(['a'], [[1]]).codePointAt(0)).toBe(0xfeff);
  });

  it('uses CRLF line endings', () => {
    expect(toCsv(['a', 'b'], [[1, 2]])).toBe('\uFEFFa,b\r\n1,2\r\n');
  });

  it('quotes and doubles embedded quotes', () => {
    expect(toCsv(['a'], [['say "hi"']])).toContain('"say ""hi"""');
  });

  it('quotes a cell containing a comma or newline', () => {
    expect(toCsv(['a'], [['x,y']])).toContain('"x,y"');
    expect(toCsv(['a'], [['x\ny']])).toContain('"x\ny"');
  });

  it('NEUTRALISES a cell that would otherwise be read as a formula', () => {
    /*
     * The previous version of this test asserted only that the value was
     * QUOTED, and it passed for as long as the guard was broken. Quotes are
     * consumed by the CSV parser; by the time a spreadsheet decides whether a
     * cell is a formula they are gone and the content is `=cmd` either way.
     *
     * What has to be true is that the cell no longer STARTS with a formula
     * lead-in. Asserting the `'` prefix specifically is the difference between
     * a test that describes the mechanism and one that describes the effect.
     */
    for (const value of ['=cmd', '+1', '-1', '@SUM', '\tTAB']) {
      const out = toCsv(['a'], [[value]]);
      expect(out).toContain(`"'${value}"`);
      // And must not appear anywhere as a bare lead-in.
      expect(out).not.toContain(`,${value}`);
    }
  });

  it('leaves a negative NUMBER numeric — the guard must not corrupt scores', () => {
    // `-0.5` is an ordinary score and it starts with `-`. Prefixing it would
    // turn a numeric column into text and break the pandas workflow this file
    // exists for. Numbers cannot carry a formula, so they are exempt.
    const out = toCsv(['score'], [[-0.5]]);
    expect(out).toContain('-0.5');
    expect(out).not.toContain("'-0.5");
    expect(out).not.toContain('"-0.5"');
  });

  it('still quotes an ordinary string containing a comma, with no prefix', () => {
    // The formula guard must not fire on values that merely need RFC 4180
    // quoting — an Arabic name with a list comma is the common case.
    const out = toCsv(['a'], [['القاهرة, مصر']]);
    expect(out).toContain('"القاهرة, مصر"');
    expect(out).not.toContain("'القاهرة");
  });

  it('writes null and undefined as an empty cell, not "null"', () => {
    expect(toCsv(['a', 'b'], [[null, undefined]])).toBe('\uFEFFa,b\r\n,\r\n');
  });

  it('writes a header-only file when there are no rows', () => {
    expect(toCsv(['a', 'b'], [])).toBe('\uFEFFa,b\r\n');
  });
});

describe('csvFraction', () => {
  it('rounds to four places rather than writing float noise', () => {
    expect(csvFraction(0.123456789)).toBe(0.1235);
    expect(csvFraction(1 / 3)).toBe(0.3333);
  });

  it('keeps null null — an absent score is not a zero', () => {
    expect(csvFraction(null)).toBeNull();
  });
});
