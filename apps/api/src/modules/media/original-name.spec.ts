import { decodeOriginalName } from './original-name';

/**
 * `decodeOriginalName` repairs the filename multer hands us, and the three
 * cases below are the whole contract: repair what is broken, and — the part
 * that is easy to get wrong — leave everything else byte-identical.
 */
describe('decodeOriginalName', () => {
  /** What multer produces: UTF-8 bytes read one-per-character as latin1. */
  const asMulterSeesIt = (name: string): string =>
    Buffer.from(name, 'utf8').toString('latin1');

  it('recovers an Arabic name that arrived as latin1-decoded UTF-8', () => {
    // The exact name from the report, and the exact mojibake it became:
    // «Ø£Ø³Ø§Ø³ÙØ§Øª Ø§ÙØ¨Ø±ÙØ¬Ø©…» rendered under the lecture for every student.
    const real = 'أساسيات البرمجة - المحاضرة الأولى - م. أيمن أبو العلا.pdf';
    expect(decodeOriginalName(asMulterSeesIt(real))).toBe(real);
  });

  it('leaves an ASCII name exactly as it came', () => {
    // The overwhelmingly common case. A "fix" that rewrote these would be a
    // regression on every upload that was never broken.
    expect(decodeOriginalName('lecture-01.pdf')).toBe('lecture-01.pdf');
  });

  it('leaves a genuinely latin1 name alone rather than mangling it', () => {
    /*
     * The case that makes the round-trip guard necessary.
     *
     * `Ã©` here is NOT disguised UTF-8 — it is what a client that really does
     * send Latin-1 produces. Decoding it as UTF-8 yields U+FFFD, which
     * re-encodes to different bytes, so the guard rejects the repair and the
     * name survives. Without the guard this input comes back corrupted, which
     * is how a mojibake fix becomes the next bug.
     */
    const trulyLatin1 = 'résumé.pdf';
    expect(decodeOriginalName(trulyLatin1)).toBe(trulyLatin1);
  });

  it('round-trips an accented name that WAS sent as UTF-8', () => {
    const real = 'résumé-café.pdf';
    expect(decodeOriginalName(asMulterSeesIt(real))).toBe(real);
  });
});
