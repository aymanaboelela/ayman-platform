import { describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts';
import { assistantPathLabels, assistantTrailLabels } from './assistant-path';

describe('assistantPathLabels', () => {
  it('reads back the buttons the student pressed', () => {
    // What the instructor sees at the top of a thread. It has to be the
    // student's own route in their own words, or the inbox is describing a
    // journey nobody took.
    expect(assistantPathLabels(['root', 'join', 'joinPrice'])).toEqual([
      copy.assistant.choices.join,
      copy.assistant.choices.joinPrice,
    ]);
  });

  it('drops the root, which every path shares', () => {
    expect(assistantPathLabels(['root'])).toEqual([]);
  });

  it('drops a stop the tree no longer connects', () => {
    /*
     * A row written before the tree was re-shaped, or edited by hand. Rendering
     * a blank crumb or crashing the inbox on one historical row are both worse
     * than showing the part that still resolves.
     */
    expect(assistantPathLabels(['root', 'accountVideo'])).toEqual([]);
    expect(assistantPathLabels(['root', 'join', 'studyAppeal'])).toEqual([
      copy.assistant.choices.join,
    ]);
  });

  it('drops ids that are not nodes at all', () => {
    // `entryPath` is validated on the way in, so this should be unreachable —
    // but the inbox must not be the thing that discovers otherwise.
    expect(assistantPathLabels(['root', 'not-a-node'])).toEqual([]);
    expect(assistantPathLabels(['__proto__', 'join'])).toEqual([]);
  });

  it('returns nothing for an empty path', () => {
    expect(assistantPathLabels([])).toEqual([]);
  });
});

describe('assistantTrailLabels', () => {
  it('keeps the root as the trail’s first stop', () => {
    // The widget's trail is a place to tap back TO, so the starting point has
    // to be on it — unlike the inbox breadcrumbs, which only describe.
    expect(assistantTrailLabels(['root', 'study', 'studyRetake'])).toEqual([
      copy.assistant.title,
      copy.assistant.choices.study,
      copy.assistant.choices.studyRetake,
    ]);
  });
});
