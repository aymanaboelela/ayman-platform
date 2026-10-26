/**
 * A one-page PDF around one JPEG — the certificate's «تنزيل PDF».
 *
 * PDF carries JPEG natively (`/DCTDecode`): the file is the JPEG bytes plus a
 * few hundred bytes of objects and a cross-reference table. That is the whole
 * reason there is no PDF library here — `jspdf` is ~350 KB to ship for the
 * same output.
 *
 * The page is A4 landscape in points (842×595); the image fills it exactly,
 * because the certificate canvas is drawn at the A4 ratio.
 */
export function jpegToPdf(jpeg: Uint8Array, imgW: number, imgH: number, pageW = 842, pageH = 595): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: Uint8Array | string) => {
    const bytes = typeof part === 'string' ? enc.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: string, stream?: Uint8Array) => {
    offsets[id] = length;
    push(`${id} 0 obj\n${body}\n`);
    if (stream) {
      push('stream\n');
      push(stream);
      push('\nendstream\n');
    }
    push('endobj\n');
  };

  const content = enc.encode(`q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`);
  push('%PDF-1.4\n%âãÏÓ\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );
  object(
    4,
    `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`,
    jpeg,
  );
  object(5, `<< /Length ${content.length} >>`, content);

  const xref = length;
  push(`xref\n0 6\n0000000000 65535 f \n`);
  for (let id = 1; id <= 5; id += 1) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
