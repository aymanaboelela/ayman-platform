import ExcelJS from 'exceljs';

/**
 * The analytics exports as a real workbook — what the instructor opens.
 *
 * ## Why not just the CSV
 *
 * A CSV has no idea which way a sheet reads or what its separator is, and
 * Excel guesses both from the machine. On an Arabic Windows the list separator
 * is not a comma, so the whole file lands in column A as one line per student,
 * with the RTL names and the LTR numbers shuffled by the bidi algorithm into
 * something unreadable (reported 2026-10-19 with a screenshot). A workbook
 * carries its own columns, direction and number formats, so it opens the same
 * on every machine.
 *
 * The CSV routes stay as they were: they are the pandas workflow `csv.ts` was
 * written for, and fractions there are still fractions.
 *
 * ## Values stay values
 *
 * A percentage is written as the fraction with a `0%` format, a duration as a
 * day fraction with `[h]:mm:ss`, a moment as a date with a date format. The
 * cell is still a number Excel can sort, filter and average — only the display
 * changes. Text cells are plain strings, and exceljs never writes a string as a
 * formula, so the `=`/`+` injection `csv.ts` guards against cannot happen here.
 */

export type XlsxKind = 'text' | 'int' | 'decimal' | 'percent' | 'duration' | 'datetime';

export interface XlsxColumn<Row> {
  header: string;
  kind: XlsxKind;
  width?: number;
  value: (row: Row) => string | number | null | undefined;
}

const FORMAT: Record<XlsxKind, string | undefined> = {
  text: undefined,
  int: '0',
  decimal: '0.00',
  percent: '0%',
  duration: '[h]:mm:ss',
  datetime: 'yyyy-mm-dd hh:mm',
};

const WIDTH: Record<XlsxKind, number> = {
  text: 22,
  int: 10,
  decimal: 12,
  percent: 12,
  duration: 12,
  datetime: 18,
};

const CAIRO = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/**
 * An Excel date has no zone: it is a wall-clock reading. exceljs writes a JS
 * Date's UTC fields, so a stored `…T16:49Z` would open as 16:49 — two or three
 * hours off for every reader in Egypt. Re-reading the instant in Cairo and
 * handing exceljs THOSE fields as UTC makes the cell say what the screen says.
 */
export function cairoWallClock(iso: string): Date | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const parts = Object.fromEntries(CAIRO.formatToParts(at).map((p) => [p.type, p.value]));
  return new Date(
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    ),
  );
}

function cellValue(kind: XlsxKind, raw: string | number | null | undefined): ExcelJS.CellValue {
  if (raw === null || raw === undefined || raw === '') return null;
  switch (kind) {
    case 'text':
      return String(raw);
    case 'datetime':
      return typeof raw === 'string' ? cairoWallClock(raw) : null;
    case 'duration':
      return typeof raw === 'number' ? raw / 86_400 : null;
    default:
      return typeof raw === 'number' ? raw : Number(raw);
  }
}

export async function toXlsx<Row>(
  sheetName: string,
  columns: readonly XlsxColumn<Row>[],
  rows: readonly Row[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  // Header row frozen and the sheet right-to-left: the first column is the
  // student's name on the right edge, where an Arabic reader starts.
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = columns.map((col, i) => ({
    key: String(i),
    width: col.width ?? WIDTH[col.kind],
    style: FORMAT[col.kind] ? { numFmt: FORMAT[col.kind] } : {},
  }));

  const header = sheet.addRow(columns.map((col) => col.header));
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 30;
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3EDE4' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFB8AFA3' } } };
  });

  for (const row of rows) {
    sheet.addRow(columns.map((col) => cellValue(col.kind, col.value(row))));
  }

  if (columns.length > 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
