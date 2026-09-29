import { describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy';
import { actionErrorMessage, isStaleActionError, isTabStale, subscribeStaleTab } from './stale-tab';

/**
 * The reactive half: a Server Action that failed because the tab outlived its
 * build. What is pinned is that the editor never sees Next's English sentence
 * again — and that NOTHING else changes, because every catch site that adopts
 * `actionErrorMessage` used to render `error.message` and must keep doing so
 * for every other failure.
 */

// Byte-for-byte what Next 16 throws (`server-action-reducer.js`), and what the
// homework form printed in red.
const NEXT_SENTENCE =
  'Server Action "70fa68aada035bb6cabeb0deeb8cb3ffe4681e9346" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action';

function staleError(): Error {
  const error = new Error(NEXT_SENTENCE);
  error.name = 'UnrecognizedActionError';
  return error;
}

describe('actionErrorMessage', () => {
  it('turns the stale-action error into the Arabic copy', () => {
    const message = actionErrorMessage(staleError(), 'unknown');
    expect(message).toBe(copy.common.staleBuildAction);
    expect(message).not.toContain('Server Action');
    expect(message).not.toContain('not found');
  });

  it('recognises it by the sentence alone, and by the name alone', () => {
    expect(actionErrorMessage(new Error(NEXT_SENTENCE), null)).toBe(copy.common.staleBuildAction);

    const renamed = new Error('reworded by a future Next');
    renamed.name = 'UnrecognizedActionError';
    expect(actionErrorMessage(renamed, null)).toBe(copy.common.staleBuildAction);
  });

  it('raises the reload toast, once the current task is done', async () => {
    const listener = vi.fn();
    const stop = subscribeStaleTab(listener);

    actionErrorMessage(staleError(), null);
    expect(isTabStale()).toBe(true);
    // Deferred: the caller may be inside another store's listener.
    expect(listener).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);

    // Again on the next failure — the toast may have been swiped away.
    actionErrorMessage(staleError(), null);
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
  });

  it('leaves every other failure exactly as the call site rendered it', () => {
    const listener = vi.fn();
    const stop = subscribeStaleTab(listener);

    expect(actionErrorMessage(new Error('failed with 409'), 'unknown')).toBe('failed with 409');
    expect(actionErrorMessage(new Error('Server Action failed'), 'unknown')).toBe('Server Action failed');
    expect(actionErrorMessage('a string', 'unknown')).toBe('unknown');
    expect(actionErrorMessage(undefined, null)).toBeNull();

    stop();
    return Promise.resolve().then(() => expect(listener).not.toHaveBeenCalled());
  });
});

describe('isStaleActionError', () => {
  it('is false for anything that is not an Error', () => {
    expect(isStaleActionError(NEXT_SENTENCE)).toBe(false);
    expect(isStaleActionError({ name: 'UnrecognizedActionError', message: NEXT_SENTENCE })).toBe(false);
    expect(isStaleActionError(null)).toBe(false);
  });
});
