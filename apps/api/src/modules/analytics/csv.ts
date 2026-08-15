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

/**
 * Two separate jobs, and conflating them is what left the export exploitable.
 *
 * ## 1. RFC 4180 quoting — a PARSING concern
 *
 * Double the quotes, wrap anything containing a separator, a quote or a
 * newline. This is what keeps the file readable as CSV.
 *
 * ## 2. Formula injection — a SPREADSHEET concern, and quoting does not fix it
 *
 * This function used to treat a leading `=`/`+`/`-`/`@` as merely "risky" and
 * answer it by quoting, with a comment calling that "the formula-injection
 * guard". It is not one. Quotes are consumed by the CSV PARSER; by the time
 * Excel or LibreOffice decides whether a cell is a formula, they are gone and
 * the cell content is `=cmd` either way. `csv.spec.ts` asserted the quoting
 * and passed the whole time.
 *
 * The mitigation that works is to make the cell start with something that is
 * not a formula lead-in. A single quote is the conventional choice (OWASP):
 * Excel treats it as an explicit "this is text" marker and does not display
 * it.
 *
 * ## Why NUMBERS are exempt, and why that matters
 *
 * `-0.5` is a perfectly ordinary score and it starts with `-`. Prefixing it
 * would turn a numeric column into text and break exactly the pandas workflow
 * this file exists for. So the guard applies to STRING cells only — a number
 * reaching a spreadsheet as a number is the correct outcome, and a number can
 * never carry a formula.
 *
 * The cost is honest and small: a student literally named `=cmd` reads as
 * `'=cmd` in pandas. That is a pathological value, and the alternative is a
 * live formula in the instructor's spreadsheet.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';

  // Numbers bypass the formula guard entirely — see above. They also can never
  // contain a separator, a quote or a newline, so they need no quoting either.
  if (typeof value === 'number') return String(value);

  const raw = String(value);
  const text = FORMULA_LEAD.test(raw) ? `'${raw}` : raw;
  const needsQuoting = FORMULA_LEAD.test(raw) || /["\n\r,]/.test(text);
  return needsQuoting ? `"${text.replaceAll('"', '""')}"` : text;
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
