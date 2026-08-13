/**
 * CSV for the data-science workflow — pandas on one end, Excel on the other.
 *
 * ## The BOM is not optional
 *
 * Excel on Windows reads a BOM-less UTF-8 file as the system codepage, so
 * every Arabic name in the export opens as mojibake — the single most likely
 * way this feature gets reported as broken. U+FEFF costs three bytes and
 * `pandas.read_csv` skips it by default (`utf-8-sig` is inferred).
 *
 * ## Fractions stay fractions
 *
 * A score column is written as `0.8235`, never `82.35%`. The renderer's job is
 * the `%`; a CSV that has already applied it forces every downstream analysis
 * to parse a string, and loses precision doing it. Same primitive as the JSON.
 */

/** RFC 4180 quoting: double the quotes, wrap anything with a separator, a
 *  quote or a newline. A leading `=`/`+`/`-`/`@` also gets quoted — that is
 *  the formula-injection guard, and a student really can be called `=cmd`. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'number' ? String(value) : String(value);
  const risky = /^[=+\-@\t\r]/.test(text) || /["\n\r,]/.test(text);
  return risky ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(headers: readonly string[], rows: readonly unknown[][]): string {
  const lines = [headers.map(cell).join(','), ...rows.map((row) => row.map(cell).join(','))];
  // CRLF, per RFC 4180 — the one line ending every spreadsheet agrees on.
  // The BOM is written as an escape, never as a literal: a bare U+FEFF in
  // source is invisible in every editor and `no-irregular-whitespace` rejects
  // it for exactly that reason.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** Rounded to four places. A raw float64 ratio writes 17 digits of noise into
 *  every cell, and nothing downstream wants more precision than the marks the
 *  ratio came from. */
export function csvFraction(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10_000) / 10_000;
}
