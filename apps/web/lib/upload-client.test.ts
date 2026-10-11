import { describe, expect, it } from 'vitest';
import { classify } from './upload-client';

/**
 * The API's refusals → the reason the screen names. Each case is a message the
 * API actually sends (`MediaService`), because the bug this guards was a
 * mapping that collapsed different refusals into one sentence: an iPhone photo
 * the API could not open came back as `unreadable`, the homework card said
 * «ده مش ملف صورة» for it, and the student was told her photo was not a photo.
 */
describe('classify', () => {
  const json = (message: string) => JSON.stringify({ statusCode: 400, message });

  it('413 is too large, whoever sent it — a proxy page has no JSON to read', () => {
    expect(classify(413, '<html>Request Entity Too Large</html>')).toBe('tooLarge');
    expect(classify(413, json('image dimensions are too large'))).toBe('tooLarge');
  });

  it('a file that is not a picture is badType — by name AND by bytes', () => {
    expect(classify(400, json('file extension is not allowed'))).toBe('badType');
    // «not AN allowed» — the magic-byte gate. `'not allowed'` alone missed it.
    expect(classify(400, json('file contents are not an allowed image type'))).toBe('badType');
  });

  it('a picture the API could not open is unreadable, NOT badType', () => {
    expect(classify(400, json('file could not be processed as an image'))).toBe('unreadable');
  });

  it('anything else is the generic retry, including the converter being busy', () => {
    expect(classify(503, json('image conversion is busy, try again shortly'))).toBe('failed');
    expect(classify(500, 'not json')).toBe('failed');
  });
});
