import { describe, expect, it } from 'vitest';
import { isStaleDeployError } from './stale-deploy';

/**
 * The predicate decides two behaviours that are invisible when it is wrong:
 * whether «حاول تاني» reloads on the first press instead of the second, and
 * whether a deploy artefact is filed as a fault on `/admin/errors`. Neither
 * failure announces itself, so the message it matches is pinned here.
 */
describe('isStaleDeployError', () => {
  it('matches the real production message, verbatim', () => {
    // Copied byte-for-byte from `/admin/errors` row 17 — including the trailing
    // space and newline before the docs link, which is what Next actually emits.
    const actual = new Error(
      'Server Action "70674c275044efa878d1f18e7c30cc06df93a1365f" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action',
    );

    expect(isStaleDeployError(actual)).toBe(true);
  });

  it('does not match ordinary failures', () => {
    // A page that legitimately threw must still reach the error log — matching
    // too broadly would silently empty the screen this was found on.
    for (const message of [
      'An error occurred in the Server Components render.',
      'Unable to initialize WebGL.',
      'fetch failed',
      'Server Action failed', // similar words, different fault: this one is real
      '',
    ]) {
      expect(isStaleDeployError(new Error(message))).toBe(false);
    }
  });
});
