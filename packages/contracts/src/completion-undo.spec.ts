import { describe, expect, it } from 'vitest';
import { isCompletionUndoable } from './completion-undo';
import { VIDEO_POSITION_THRESHOLD, VIDEO_WATCHED_THRESHOLD } from './progress';

const DURATION = 600; // a ten-minute lesson

/**
 * «تم» → «نرجّع الدرس؟». The server and the player both ask THIS, so every
 * row here is a dialog that either opens and works, or never opens at all.
 */
describe('isCompletionUndoable', () => {
  const pressedEarly = {
    kind: 'video',
    completedVia: 'manual',
    durationSeconds: DURATION,
    watchedSeconds: 30,
    maxPositionSeconds: 45,
  };

  it('is true for a video finished by the button before it was watched', () => {
    expect(isCompletionUndoable(pressedEarly)).toBe(true);
  });

  it('is true for a video with no known duration — the button is its only finish', () => {
    expect(isCompletionUndoable({ ...pressedEarly, durationSeconds: 0 })).toBe(true);
  });

  it('is false for a completion that was EARNED rather than pressed', () => {
    expect(isCompletionUndoable({ ...pressedEarly, completedVia: 'auto' })).toBe(false);
    expect(isCompletionUndoable({ ...pressedEarly, completedVia: 'dwell' })).toBe(false);
  });

  it('is false for a lesson that is not complete at all', () => {
    expect(isCompletionUndoable({ ...pressedEarly, completedVia: null })).toBe(false);
  });

  it('is false for a quiz, whatever the row says', () => {
    expect(isCompletionUndoable({ ...pressedEarly, kind: 'quiz' })).toBe(false);
  });

  // The dwell timer re-arms the moment the lesson reads incomplete, and would
  // hand the completion straight back five seconds later.
  it('is false for text and attachment lessons, which complete themselves by dwelling', () => {
    expect(isCompletionUndoable({ ...pressedEarly, kind: 'text' })).toBe(false);
    expect(isCompletionUndoable({ ...pressedEarly, kind: 'attachment' })).toBe(false);
  });

  // Pressed early, then watched to the end anyway: the next heartbeat would
  // re-complete it as `auto`, so undoing it would last ten seconds.
  it('is false for a manual press on a video since watched to both thresholds', () => {
    expect(
      isCompletionUndoable({
        ...pressedEarly,
        watchedSeconds: VIDEO_WATCHED_THRESHOLD * DURATION,
        maxPositionSeconds: VIDEO_POSITION_THRESHOLD * DURATION,
      }),
    ).toBe(false);
  });

  // One threshold is not the rule — the heartbeat would NOT re-complete this.
  it('stays true when only one of the two thresholds is met', () => {
    expect(
      isCompletionUndoable({ ...pressedEarly, maxPositionSeconds: DURATION }),
    ).toBe(true);
  });
});
