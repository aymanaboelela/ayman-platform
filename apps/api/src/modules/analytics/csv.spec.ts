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

  it('quotes a cell that would otherwise be read as a formula', () => {
    // A student really can be called `=cmd`, and an unquoted leading `=` is a
    // spreadsheet formula the moment the file is opened.
    for (const value of ['=cmd', '+1', '-1', '@SUM']) {
      expect(toCsv(['a'], [[value]])).toContain(`"${value}"`);
    }
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
