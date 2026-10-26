import { describe, expect, it } from 'vitest';
import { jpegToPdf } from './pdf';

describe('jpegToPdf', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const pdf = jpegToPdf(jpeg, 2480, 1754);
  const text = new TextDecoder('latin1').decode(pdf);

  it('is a PDF that ends where a reader looks for the trailer', () => {
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('points every xref entry at the object it names', () => {
    const table = text.slice(text.indexOf('xref\n') + 5).split('\n').slice(2, 7);
    table.forEach((row, i) => {
      const offset = Number(row.slice(0, 10));
      expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
    const startxref = Number(text.match(/startxref\n(\d+)/)?.[1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
  });

  it('embeds the JPEG bytes unchanged with their declared length', () => {
    expect(text).toContain(`/Length ${jpeg.length}`);
    expect(text).toContain('/Width 2480 /Height 1754');
    const at = text.indexOf('stream\n') + 'stream\n'.length;
    expect(Array.from(pdf.slice(at, at + jpeg.length))).toEqual(Array.from(jpeg));
  });
});
