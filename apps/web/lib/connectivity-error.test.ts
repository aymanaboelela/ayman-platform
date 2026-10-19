import { afterEach, describe, expect, it, vi } from 'vitest';
import { isConnectivityError } from './connectivity-error';

/**
 * "The connection failed, not the page" — the classifier both the reporter
 * (stop filing it) and the boundary (bring the page back by itself) ask.
 */
describe('isConnectivityError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('recognises every engine’s sentence for a dropped connection', () => {
    for (const message of [
      // Chrome, before the answer and half-way through its body. The second
      // is what `/results`, `/rank` and a quiz review recorded.
      'Failed to fetch',
      'network error',
      // Safari.
      'Load failed',
      'The network connection was lost.',
      'The Internet connection appears to be offline.',
      // Firefox.
      'NetworkError when attempting to fetch resource.',
    ]) {
      expect(isConnectivityError(new TypeError(message)), message).toBe(true);
    }
  });

  it('recognises React’s own sentence for a Flight stream that ended early', () => {
    expect(isConnectivityError(new Error('Connection closed.'))).toBe(true);
  });

  it('recognises the same sentence minified, as Next 16.3.8’s React throws it', () => {
    // Byte for byte what a production build raised on a truncated `/` stream
    // (local `next build` on 16.3.8, at `ec`/`n` in the Flight client chunk).
    const minified =
      'Minified React error #412; visit https://react.dev/errors/412 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.';
    expect(isConnectivityError(new Error(minified))).toBe(true);
    // Any OTHER minified React error is a real fault and stays in the log.
    expect(
      isConnectivityError(
        new Error(
          'Minified React error #418; visit https://react.dev/errors/418 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.',
        ),
      ),
    ).toBe(false);
  });

  it('needs the TypeError, not just the words', () => {
    // A component that throws `new Error('network error')` on purpose is a
    // real message and must reach the log.
    expect(isConnectivityError(new Error('network error'))).toBe(false);
    expect(isConnectivityError(new Error('Failed to fetch'))).toBe(false);
  });

  it('never matches a longer sentence that only contains the words', () => {
    expect(isConnectivityError(new TypeError('network error while parsing the reply'))).toBe(false);
    expect(isConnectivityError(new TypeError("Cannot read properties of null (reading 'replace')"))).toBe(
      false,
    );
  });

  it('treats anything as connectivity while the browser reports itself offline', () => {
    vi.spyOn(Navigator.prototype, 'onLine', 'get').mockReturnValue(false);
    expect(isConnectivityError(new Error('whatever broke'))).toBe(true);
  });

  it('is false for things that are not errors at all', () => {
    expect(isConnectivityError('Failed to fetch')).toBe(false);
    expect(isConnectivityError(null)).toBe(false);
  });
});
