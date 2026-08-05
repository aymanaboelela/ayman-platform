import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ASSISTANT_NODES } from '@ayman/contracts/assistant/script';
import { useAssistantScript } from './use-assistant-script';

/** The choice on `node` whose id is `id`. Throws loudly if the tree moved. */
function choiceOn(node: keyof typeof ASSISTANT_NODES, id: string) {
  const found = ASSISTANT_NODES[node].choices.find((choice) => choice.id === id);
  if (!found) throw new Error(`no choice "${id}" on node "${node}"`);
  return found;
}

describe('useAssistantScript', () => {
  it('starts at the root', () => {
    const { result } = renderHook(() => useAssistantScript());
    expect(result.current.nodeId).toBe('root');
    expect(result.current.path).toEqual(['root']);
  });

  it('records the route the student actually walked', () => {
    const { result } = renderHook(() => useAssistantScript());

    act(() => result.current.choose(choiceOn('root', 'join')));
    act(() => result.current.choose(choiceOn('join', 'joinPrice')));

    expect(result.current.nodeId).toBe('joinPrice');
    // This exact array is what the API stores as `entryPath`, which is what
    // the instructor reads at the top of the thread. The two being the same
    // value is the point: he sees what the student saw.
    expect(result.current.path).toEqual(['root', 'join', 'joinPrice']);
  });

  it('truncates rather than appends when a node is revisited', () => {
    /*
     * Every branch has a `back`, so appending would make `root → courses →
     * back` record `['root','courses','root']` — and a student who explored
     * three branches before asking would hand the instructor a transcript of
     * wandering instead of the route they took.
     */
    const { result } = renderHook(() => useAssistantScript());

    act(() => result.current.choose(choiceOn('root', 'courses')));
    act(() => result.current.choose(choiceOn('courses', 'back')));

    expect(result.current.path).toEqual(['root']);
    expect(result.current.nodeId).toBe('root');
  });

  it('does not grow without bound while a student explores', () => {
    const { result } = renderHook(() => useAssistantScript());

    for (let round = 0; round < 5; round += 1) {
      act(() => result.current.choose(choiceOn('root', 'courses')));
      act(() => result.current.choose(choiceOn('courses', 'courseStart')));
      act(() => result.current.choose(choiceOn('courseStart', 'back')));
      act(() => result.current.choose(choiceOn('courses', 'back')));
    }

    expect(result.current.path).toEqual(['root']);
  });

  it('ignores link and escalate choices — neither is a move within the tree', () => {
    const { result } = renderHook(() => useAssistantScript());

    act(() => result.current.choose(choiceOn('root', 'talk')));
    expect(result.current.nodeId).toBe('root');

    act(() => result.current.choose(choiceOn('root', 'courses')));
    act(() => result.current.choose(choiceOn('courses', 'coursesAvailable')));
    act(() => result.current.choose(choiceOn('coursesList', 'browseCourses')));
    // Still on the node — the caller navigates; the tree does not move.
    expect(result.current.nodeId).toBe('coursesList');
  });

  it('rewinds to an earlier stop and drops everything after it', () => {
    const { result } = renderHook(() => useAssistantScript());

    act(() => result.current.choose(choiceOn('root', 'study')));
    act(() => result.current.choose(choiceOn('study', 'studyAppeal')));
    act(() => result.current.rewindTo(0));

    expect(result.current.path).toEqual(['root']);
  });

  it('ignores a rewind to an index that is not on the path', () => {
    // The trail renders one button per stop, so this should be unreachable —
    // but an out-of-range slice would silently empty the path and leave the
    // panel rendering `undefined`.
    const { result } = renderHook(() => useAssistantScript());
    act(() => result.current.choose(choiceOn('root', 'study')));

    act(() => result.current.rewindTo(-1));
    act(() => result.current.rewindTo(99));

    expect(result.current.path).toEqual(['root', 'study']);
  });

  it('restarts to a single-stop path', () => {
    const { result } = renderHook(() => useAssistantScript());
    act(() => result.current.choose(choiceOn('root', 'account')));
    act(() => result.current.choose(choiceOn('account', 'accountVideo')));
    act(() => result.current.restart());

    expect(result.current.path).toEqual(['root']);
    expect(result.current.nodeId).toBe('root');
  });
});
