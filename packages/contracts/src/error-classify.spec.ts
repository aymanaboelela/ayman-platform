import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONNECTIVITY_ERROR_MESSAGES,
  MINIFIED_CONNECTION_CLOSED_MESSAGE,
  isConnectivityErrorMessage,
  isOmittedServerErrorMessage,
  isUnexpectedServerResponseMessage,
} from './error-classify';

/**
 * The one list both ends of `/admin/errors` read: the browser decides what to
 * file with it, the API decides what to store. Pinned here so neither side can
 * grow a sentence the other does not know — which is how «network error»
 * reached the log after «Failed to fetch» had been taught to both.
 */
describe('error-classify', () => {
  it('knows the sentence production actually recorded', () => {
    expect(isConnectivityErrorMessage('network error')).toBe(true);
  });

  it('knows React’s «Connection closed.» in its minified spelling, and only #412', () => {
    expect(isConnectivityErrorMessage(MINIFIED_CONNECTION_CLOSED_MESSAGE)).toBe(true);
    // #488 is the server renderer's «Couldn't find all resumable slots…», which
    // a production server prints in full — and any other code is a real fault.
    expect(isConnectivityErrorMessage(MINIFIED_CONNECTION_CLOSED_MESSAGE.replaceAll('412', '488'))).toBe(false);
  });

  it('matches whole sentences, never a substring', () => {
    for (const message of CONNECTIVITY_ERROR_MESSAGES) {
      expect(isConnectivityErrorMessage(`${message} while saving`), message).toBe(false);
    }
    expect(isConnectivityErrorMessage(undefined)).toBe(false);
  });

  it('recognises Next’s production sentence by its stable middle clause', () => {
    expect(
      isOmittedServerErrorMessage(
        'An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.',
      ),
    ).toBe(true);
    expect(isOmittedServerErrorMessage('/api/session failed with 429')).toBe(false);
  });

  it('recognises an action the edge answered, and only that exact sentence', () => {
    expect(isUnexpectedServerResponseMessage('An unexpected response was received from the server.')).toBe(true);
    expect(isUnexpectedServerResponseMessage('An unexpected response was received from the server. Retry?')).toBe(
      false,
    );
  });

  it('stays a leaf the API can load through Node’s own loader — no imports at all', () => {
    // `apps/api` requires contracts subpaths at runtime, and Node refuses the
    // extensionless relative imports Turbopack is happy with. A module with no
    // imports cannot trip that, and Zod would also land in every error boundary.
    const source = readFileSync(join(import.meta.dirname, 'error-classify.ts'), 'utf8');
    expect(source).not.toMatch(/^\s*import\s/m);
  });
});
