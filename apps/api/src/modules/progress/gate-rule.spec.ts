import { isCleared, resolveGate, type GateLesson } from './gate-rule';

function lesson(id: string, state = 'not_started', isFreePreview = false): GateLesson {
  return { id, state, isFreePreview };
}

const seq = (lessons: GateLesson[], examLessonId: string | null = null) =>
  resolveGate({ mode: 'sequential', lessons, examLessonId });

describe('isCleared', () => {
  it.each(['completed', 'passed'])('treats %s as cleared', (state) => {
    expect(isCleared(state)).toBe(true);
  });

  it.each(['not_started', 'in_progress', 'failed'])('does not treat %s as cleared', (state) => {
    expect(isCleared(state)).toBe(false);
  });

  it('does NOT clear a failed attempt — that is the whole point of the pass mark', () => {
    const gate = seq([lesson('a', 'failed'), lesson('b')]);
    expect(gate.get('a')).toBe('available');
    expect(gate.get('b')).toBe('locked');
  });
});

describe('resolveGate — sequential', () => {
  it('opens the first lesson and locks the rest', () => {
    const gate = seq([lesson('a'), lesson('b'), lesson('c')]);
    expect([...gate.values()]).toEqual(['available', 'locked', 'locked']);
  });

  it('opens exactly one more lesson per lesson cleared', () => {
    const gate = seq([lesson('a', 'completed'), lesson('b'), lesson('c')]);
    expect(gate.get('a')).toBe('cleared');
    expect(gate.get('b')).toBe('available');
    expect(gate.get('c')).toBe('locked');
  });

  it('counts a PASSED quiz lesson as cleared', () => {
    const gate = seq([lesson('a', 'passed'), lesson('b')]);
    expect(gate.get('b')).toBe('available');
  });

  it('never re-locks a cleared lesson, even out of order', () => {
    // 'c' cleared while 'b' is not — cannot happen through the gate, but an
    // admin unlock or a data fix can produce it, and it must not close.
    const gate = seq([lesson('a', 'completed'), lesson('b'), lesson('c', 'completed')]);
    expect(gate.get('c')).toBe('cleared');
  });

  it('does not let a cleared lesson further down open the one after it', () => {
    // 'c' is cleared but 'b' is not, so 'd' still depends on 'c' — which IS
    // cleared, so 'd' opens. The rule is strictly "the previous one".
    const gate = seq([lesson('a', 'completed'), lesson('b'), lesson('c', 'completed'), lesson('d')]);
    expect(gate.get('b')).toBe('available');
    expect(gate.get('d')).toBe('available');
  });

  it('always opens a free preview, wherever it sits', () => {
    const gate = seq([lesson('a'), lesson('b'), lesson('c', 'not_started', true)]);
    expect(gate.get('b')).toBe('locked');
    expect(gate.get('c')).toBe('available');
  });

  it('does NOT let a free preview unlock what follows it unless it is cleared', () => {
    const gate = seq([lesson('a'), lesson('b', 'not_started', true), lesson('c')]);
    expect(gate.get('b')).toBe('available');
    expect(gate.get('c')).toBe('locked');
  });

  it('crosses section boundaries — the run is the whole course flattened', () => {
    // The caller flattens sections in reading order, so there is nothing
    // section-shaped in here at all. This test pins that contract.
    const gate = seq([lesson('s1l1', 'completed'), lesson('s2l1'), lesson('s2l2')]);
    expect(gate.get('s2l1')).toBe('available');
    expect(gate.get('s2l2')).toBe('locked');
  });

  it('handles an empty course without throwing', () => {
    expect(seq([]).size).toBe(0);
  });
});

describe('resolveGate — the exam', () => {
  it('locks the exam until every OTHER lesson is cleared', () => {
    const gate = seq([lesson('a', 'completed'), lesson('b'), lesson('exam')], 'exam');
    expect(gate.get('exam')).toBe('locked');
  });

  it('opens the exam once everything else is cleared', () => {
    const gate = seq([lesson('a', 'completed'), lesson('b', 'passed'), lesson('exam')], 'exam');
    expect(gate.get('exam')).toBe('available');
  });

  it('locks the exam even when its immediate predecessor IS cleared', () => {
    // The distinguishing case: sequential order alone would open it here.
    const gate = seq([lesson('a'), lesson('b', 'completed'), lesson('exam')], 'exam');
    expect(gate.get('b')).toBe('cleared');
    expect(gate.get('exam')).toBe('locked');
  });

  it('opens the exam wherever it sits in the order, not only at the end', () => {
    const gate = seq([lesson('exam'), lesson('a', 'completed'), lesson('b', 'completed')], 'exam');
    expect(gate.get('exam')).toBe('available');
  });

  it('reports a cleared exam as cleared', () => {
    const gate = seq([lesson('a', 'completed'), lesson('exam', 'passed')], 'exam');
    expect(gate.get('exam')).toBe('cleared');
  });

  it('opens an exam that is the only lesson in the course', () => {
    expect(seq([lesson('exam')], 'exam').get('exam')).toBe('available');
  });

  it('ignores a stale examLessonId that names no lesson in the run', () => {
    const gate = seq([lesson('a'), lesson('b')], 'gone');
    expect(gate.get('a')).toBe('available');
    expect(gate.get('b')).toBe('locked');
  });
});

describe('resolveGate — open mode', () => {
  it('makes everything available and locks nothing', () => {
    const gate = resolveGate({
      mode: 'open',
      lessons: [lesson('a'), lesson('b'), lesson('c')],
      examLessonId: null,
    });
    expect([...gate.values()]).toEqual(['available', 'available', 'available']);
  });

  it('still reports cleared lessons as cleared', () => {
    const gate = resolveGate({
      mode: 'open',
      lessons: [lesson('a', 'passed'), lesson('b')],
      examLessonId: null,
    });
    expect(gate.get('a')).toBe('cleared');
  });

  it('does not gate the exam either', () => {
    const gate = resolveGate({
      mode: 'open',
      lessons: [lesson('a'), lesson('exam')],
      examLessonId: 'exam',
    });
    expect(gate.get('exam')).toBe('available');
  });
});
