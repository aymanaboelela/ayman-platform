import { afterEach, describe, expect, it, vi } from 'vitest';
import { FONT_LOAD_TIMEOUT_MS, canvasToBlob, loadFonts } from './canvas-kit';

const FONTS = { display: 'Lalezar', body: 'IBM Plex Sans Arabic', script: 'Aref Ruqaa' };

function stubFonts(load: (font: string, text?: string) => Promise<unknown>) {
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
}

/**
 * «الصورة ماتجهّزتش» for everyone on 2026-11-15: the faces are fetched only
 * when the card is drawn, `FontFaceSet.load()` rejected (the service worker's
 * cache had thrown and every static request failed), and one rejected font
 * took the whole card with it. A missing face is a worse-looking card, not a
 * missing one.
 */
describe('loadFonts', () => {
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, 'fonts');
  });

  it('resolves when a face cannot be fetched', async () => {
    const load = vi.fn().mockRejectedValue(new DOMException('A network error occurred.', 'NetworkError'));
    stubFonts(load);
    await expect(loadFonts(FONTS)).resolves.toBeUndefined();
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('resolves when `load` throws synchronously', async () => {
    stubFonts(() => {
      throw new SyntaxError('bad font string');
    });
    await expect(loadFonts(FONTS)).resolves.toBeUndefined();
  });

  it('stops waiting for a download that never settles', async () => {
    vi.useFakeTimers();
    stubFonts(() => new Promise(() => undefined));
    const pending = loadFonts(FONTS);
    await vi.advanceTimersByTimeAsync(FONT_LOAD_TIMEOUT_MS);
    await expect(pending).resolves.toBeUndefined();
  });

  it('is a no-op where the Font Loading API is missing', async () => {
    await expect(loadFonts(FONTS)).resolves.toBeUndefined();
  });
});

describe('canvasToBlob', () => {
  it('falls back to toDataURL when toBlob answers null', async () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'toBlob').mockImplementation((cb) => cb(null));
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,iVBORw0KGgo=');
    const blob = await canvasToBlob(canvas, 'image/png');
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(8);
  });

  it('still rejects when both encoders fail — a tainted canvas', async () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'toBlob').mockImplementation(() => {
      throw new DOMException('Tainted canvases may not be exported.', 'SecurityError');
    });
    vi.spyOn(canvas, 'toDataURL').mockImplementation(() => {
      throw new DOMException('Tainted canvases may not be exported.', 'SecurityError');
    });
    await expect(canvasToBlob(canvas, 'image/png')).rejects.toThrow(/Tainted/);
  });
});
