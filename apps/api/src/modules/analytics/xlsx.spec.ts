import ExcelJS from 'exceljs';
import { cairoWallClock, toXlsx, type XlsxColumn } from './xlsx';

interface Row {
  name: string;
  score: number | null;
  seconds: number | null;
  at: string | null;
}

const COLUMNS: XlsxColumn<Row>[] = [
  { header: 'الطالب', kind: 'text', value: (r) => r.name },
  { header: 'متوسط درجاته', kind: 'percent', value: (r) => r.score },
  { header: 'زمن الحل', kind: 'duration', value: (r) => r.seconds },
  { header: 'آخر نشاط', kind: 'datetime', value: (r) => r.at },
];

async function readBack(rows: Row[]): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await toXlsx('الطلبة', COLUMNS, rows));
  return workbook.getWorksheet('الطلبة')!;
}

describe('analytics xlsx export', () => {
  it('is one value per column, right-to-left, with the header frozen', async () => {
    const sheet = await readBack([{ name: 'كنزي محمد', score: 0.8, seconds: 125, at: null }]);
    expect(sheet.views[0]).toMatchObject({ rightToLeft: true, state: 'frozen', ySplit: 1 });
    expect(sheet.getRow(1).values).toEqual([undefined, 'الطالب', 'متوسط درجاته', 'زمن الحل', 'آخر نشاط']);
    expect(sheet.getCell('A2').value).toBe('كنزي محمد');
    expect(sheet.actualColumnCount).toBe(4);
  });

  it('keeps numbers numeric and lets the format do the display', async () => {
    const sheet = await readBack([{ name: 'x', score: 0.8, seconds: 125, at: null }]);
    expect(sheet.getCell('B2').value).toBe(0.8);
    expect(sheet.getCell('B2').numFmt).toBe('0%');
    // Stored as the day fraction 125/86400; exceljs reads a time-formatted
    // number back as a Date on the 1899-12-30 epoch, so 125 s is 00:02:05.
    expect((sheet.getCell('C2').value as Date).toISOString()).toBe('1899-12-30T00:02:05.000Z');
    expect(sheet.getCell('C2').numFmt).toBe('[h]:mm:ss');
  });

  it('writes moments as Cairo wall-clock time, not UTC', async () => {
    // 16:49Z on 19 Oct 2026 is 19:49 in Cairo (EEST, UTC+3) — the screen's «٧:٤٩ م».
    const sheet = await readBack([{ name: 'x', score: null, seconds: null, at: '2026-10-19T16:49:16.319Z' }]);
    const at = sheet.getCell('D2').value as Date;
    expect(at.toISOString().slice(0, 16)).toBe('2026-10-19T19:49');
    expect(sheet.getCell('B2').value).toBeNull();
  });

  it('never turns a leading «=» into a formula', async () => {
    const sheet = await readBack([{ name: '=HYPERLINK("x")', score: null, seconds: null, at: null }]);
    expect(sheet.getCell('A2').type).toBe(ExcelJS.ValueType.String);
  });

  it('reads an unparseable moment as empty rather than throwing', () => {
    expect(cairoWallClock('not a date')).toBeNull();
  });
});
