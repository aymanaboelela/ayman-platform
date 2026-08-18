import { isCleared, resolveGate, type GateLesson } from './gate-rule';

function lesson(id: string, state = 'not_started'): GateLesson {
  return { id, state, kind: 'video' };
}

/** A lecture's quiz. In the run, but never part of the exam's prerequisites. */
function quiz(id: string, state = 'not_started'): GateLesson {
  return { id, state, kind: 'quiz' };
}

const gateFor = (lessons: GateLesson[], examLessonId: string | null = null) =>
  resolveGate({ lessons, examLessonId });

describe('isCleared', () => {
  it.each(['completed', 'passed'])('treats %s as cleared', (state) => {
    expect(isCleared(state)).toBe(true);
  });

  it.each(['not_started', 'in_progress', 'failed'])('does not treat %s as cleared', (state) => {
    expect(isCleared(state)).toBe(false);
  });
});

/**
 * The rule, stated as the property it now has: a student can open any lecture
 * of a course they are enrolled in, in any order, on their first day.
 *
 * These were 25 cases about a chain — lesson N+1 waiting on lesson N — and the
 * chain is gone. It gated on `lesson_progress.state`, which records whether the
 * student pressed «خلاص · التالي» rather than whether they watched anything, so
 * it showed the identical padlock to the student who had done the work and the
 * student who had not. `gate-rule.ts` carries the full reasoning.
 */
describe('resolveGate — every lecture is open', () => {
  it('opens all of them on a course nothing has been done in', () => {
    const gate = gateFor([lesson('a'), lesson('b'), lesson('c')]);
    expect([...gate.values()]).toEqual(['available', 'available', 'available']);
  });

  it('opens the last lesson without the first being touched', () => {
    // The case the chain existed to refuse, and the one this change is for.
    expect(gateFor([lesson('a'), lesson('b'), lesson('c')]).get('c')).toBe('available');
  });

  it('reports what the student HAS finished as cleared', () => {
    const gate = gateFor([lesson('a', 'completed'), lesson('b', 'passed'), lesson('c')]);
    expect(gate.get('a')).toBe('cleared');
    expect(gate.get('b')).toBe('cleared');
    expect(gate.get('c')).toBe('available');
  });

  it('leaves a FAILED lesson available rather than cleared', () => {
    // Two different questions: `state` is what they did, `gate` is what they
    // may do. A failed quiz is not a pass, and it does not shut anything.
    const gate = gateFor([lesson('a', 'failed'), lesson('b')]);
    expect(gate.get('a')).toBe('available');
    expect(gate.get('b')).toBe('available');
  });

  it('opens a lecture quiz before its own lecture is watched', () => {
    // A quiz used to wait on the lecture above it. Every graded sitting is
    // entered through `<ExamGateDialog>`, which states in words that the paper
    // is one sitting and permanently recorded — so nobody reaches a question
    // by wandering, and the lock was buying nothing.
    const gate = gateFor([lesson('a'), quiz('a-quiz')]);
    expect(gate.get('a-quiz')).toBe('available');
  });

  it('locks nothing at all in a course with no exam', () => {
    const gate = gateFor([lesson('a'), quiz('a-quiz', 'failed'), lesson('b'), quiz('b-quiz')]);
    expect([...gate.values()]).not.toContain('locked');
  });

  it('handles an empty course without throwing', () => {
    expect(gateFor([]).size).toBe(0);
  });

  it('crosses section boundaries — the run is the whole course flattened', () => {
    // The caller flattens sections in reading order, so there is nothing
    // section-shaped in here at all. This test pins that contract.
    const gate = gateFor([lesson('s1l1'), lesson('s2l1'), lesson('s2l2')]);
    expect([...gate.values()]).toEqual(['available', 'available', 'available']);
  });
});

/**
 * The one gate left, and the reason `examLessonId` is a column rather than a
 * convention about position.
 */
describe('resolveGate — the exam', () => {
  it('locks the exam until every lecture is cleared', () => {
    const gate = gateFor([lesson('a', 'completed'), lesson('b'), lesson('exam')], 'exam');
    expect(gate.get('exam')).toBe('locked');
  });

  it('opens the exam once every lecture is cleared', () => {
    const gate = gateFor([lesson('a', 'completed'), lesson('b', 'passed'), lesson('exam')], 'exam');
    expect(gate.get('exam')).toBe('available');
  });

  it('opens the exam wherever it sits in the order, not only at the end', () => {
    const gate = gateFor(
      [lesson('exam'), lesson('a', 'completed'), lesson('b', 'completed')],
      'exam',
    );
    expect(gate.get('exam')).toBe('available');
  });

  it('reports a cleared exam as cleared', () => {
    const gate = gateFor([lesson('a', 'completed'), lesson('exam', 'passed')], 'exam');
    expect(gate.get('exam')).toBe('cleared');
  });

  it('opens an exam that is the only lesson in the course', () => {
    expect(gateFor([lesson('exam')], 'exam').get('exam')).toBe('available');
  });

  it('ignores a stale examLessonId that names no lesson in the run', () => {
    const gate = gateFor([lesson('a'), lesson('b')], 'gone');
    expect([...gate.values()]).toEqual(['available', 'available']);
  });

  /**
   * ⚠️ The deadlock this rule cost before quizzes came out of the prerequisite
   * set. A lecture quiz gets one sitting and `failed` is not cleared, so
   * counting quizzes meant one under-par score shutting the final exam forever
   * with nothing the student could do about it. Measured on production
   * 2026-08-17: three of the six students who had sat the المحاضرة الثانية quiz
   * were stopped by exactly that.
   */
  it('does not require quizzes to be cleared before the exam', () => {
    const gate = gateFor(
      [lesson('a', 'completed'), quiz('a-quiz', 'failed'), lesson('exam')],
      'exam',
    );
    expect(gate.get('exam')).toBe('available');
  });

  it('never returns a course in which nothing at all can be opened', () => {
    // Stated directly, because "every lesson is shut and no action reopens
    // any of them" is the failure mode a per-lesson assertion walks past. An
    // exam at position 0 is what `POST /exam/scaffold` produces on a course
    // with no sections yet, and what an admin dragging the exam upward
    // produces at any time.
    for (const examId of ['exam', 'l1', 'l2', null]) {
      const gate = resolveGate({
        examLessonId: examId,
        lessons: [lesson('exam'), lesson('l1'), lesson('l2')],
      });
      expect([...gate.values()]).toContain('available');
    }
  });

  it('leaves the lessons that FOLLOW a mid-course exam open', () => {
    const gate = gateFor(
      [lesson('l1', 'completed'), lesson('l2'), lesson('exam'), lesson('l3')],
      'exam',
    );
    expect(gate.get('l3')).toBe('available');
    expect(gate.get('exam')).toBe('locked');
  });
});
