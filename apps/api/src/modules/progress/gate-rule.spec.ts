import { isCleared, resolveGate, type GateLesson } from './gate-rule';

function lesson(id: string, state = 'not_started', isFreePreview = false): GateLesson {
  return { id, state, isFreePreview, kind: 'video' };
}

/** A lecture's quiz. Sits in the run, but never gates what follows it. */
function quiz(id: string, state = 'not_started', isFreePreview = false): GateLesson {
  return { id, state, isFreePreview, kind: 'quiz' };
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

/**
 * A quiz belongs to the lecture above it, and a lecture quiz has ONE sitting
 * with no retake. Leaving it in the chain meant a student who scored below the
 * pass mark could never reach lesson 3 — `failed` is not cleared, the attempt
 * cannot be repeated, and no action the student can take changes it. Measured
 * on production 2026-08-17: three of six students who had sat the المحاضرة
 * الثانية quiz were permanently stopped there.
 *
 * So the chain is LECTURES. A quiz opens with the lecture that owns it and
 * blocks nothing.
 */
describe('resolveGate — a lecture quiz never blocks the course', () => {
  it('opens the lecture after a FAILED quiz', () => {
    const gate = seq([lesson('a', 'completed'), quiz('a-quiz', 'failed'), lesson('b')]);
    expect(gate.get('b')).toBe('available');
  });

  it('opens the lecture after an UNTAKEN quiz', () => {
    const gate = seq([lesson('a', 'completed'), quiz('a-quiz'), lesson('b')]);
    expect(gate.get('b')).toBe('available');
  });

  it('opens a quiz as soon as its own lecture is cleared', () => {
    const gate = seq([lesson('a', 'completed'), quiz('a-quiz'), lesson('b')]);
    expect(gate.get('a-quiz')).toBe('available');
  });

  it('keeps a quiz shut while its lecture is unwatched', () => {
    const gate = seq([lesson('a'), quiz('a-quiz'), lesson('b')]);
    expect(gate.get('a-quiz')).toBe('locked');
    expect(gate.get('b')).toBe('locked');
  });

  it('still reports a passed quiz as cleared', () => {
    const gate = seq([lesson('a', 'completed'), quiz('a-quiz', 'passed')]);
    expect(gate.get('a-quiz')).toBe('cleared');
  });

  it('does not let a quiz stand in for the lecture it follows', () => {
    // The quiz is cleared but its lecture is not: 'b' waits on the LECTURE.
    const gate = seq([lesson('a'), quiz('a-quiz', 'passed'), lesson('b')]);
    expect(gate.get('b')).toBe('locked');
  });

  it('opens the first lecture when a quiz somehow sits first', () => {
    const gate = seq([quiz('orphan'), lesson('a')]);
    expect(gate.get('orphan')).toBe('available');
    expect(gate.get('a')).toBe('available');
  });

  it('does not require quizzes to be cleared before the exam', () => {
    const gate = seq(
      [lesson('a', 'completed'), quiz('a-quiz', 'failed'), lesson('exam')],
      'exam',
    );
    expect(gate.get('exam')).toBe('available');
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

/**
 * The deadlock.
 *
 * Every case below returned an all-locked (or partially bricked) course before
 * the exam was taken out of the sequential chain. They are written as whole-map
 * assertions rather than single-lesson ones because the defect was a PROPERTY
 * of the map — "nothing is open" — which a per-lesson test walks straight past.
 */
describe('resolveGate — the exam is never a prerequisite', () => {
  const lesson = (id: string, state = 'not_started', isFreePreview = false) => ({
    id,
    state,
    isFreePreview,
  });

  it('does not lock the entire course when the exam sits first', () => {
    // `POST /exam/scaffold` on a course with no sections produces exactly this,
    // and so does an admin dragging the exam to the top.
    const gates = resolveGate({
      mode: 'sequential',
      examLessonId: 'exam',
      lessons: [lesson('exam'), lesson('l1'), lesson('l2')],
    });

    expect(gates.get('l1')).toBe('available');
    expect(gates.get('exam')).toBe('locked');
    expect([...gates.values()]).toContain('available');
  });

  it('never returns a course in which nothing at all can be opened', () => {
    // The invariant rule 5 was always meant to guarantee — "something has to
    // be [available]" — stated directly, because that is the sentence the old
    // implementation broke.
    for (const examId of ['exam', 'l1', 'l2', null]) {
      const gates = resolveGate({
        mode: 'sequential',
        examLessonId: examId,
        lessons: [lesson('exam'), lesson('l1'), lesson('l2')],
      });
      expect([...gates.values()]).toContain('available');
    }
  });

  it('does not strand the lessons that follow an exam placed mid-course', () => {
    // The general form of the same cycle: l3 waited on the exam, the exam
    // waited on l3.
    const gates = resolveGate({
      mode: 'sequential',
      examLessonId: 'exam',
      lessons: [lesson('l1', 'completed'), lesson('l2', 'completed'), lesson('exam'), lesson('l3')],
    });

    expect(gates.get('l3')).toBe('available');
  });

  it('still opens the exam only once every other lesson is cleared', () => {
    // The rule being preserved — this must not become "the exam is just
    // another lesson".
    const partly = resolveGate({
      mode: 'sequential',
      examLessonId: 'exam',
      lessons: [lesson('l1', 'completed'), lesson('l2'), lesson('exam')],
    });
    expect(partly.get('exam')).toBe('locked');

    const done = resolveGate({
      mode: 'sequential',
      examLessonId: 'exam',
      lessons: [lesson('l1', 'completed'), lesson('l2', 'passed'), lesson('exam')],
    });
    expect(done.get('exam')).toBe('available');
  });

  it('keeps the chain contiguous across the removed exam', () => {
    // l3's prerequisite is l2 — the lesson before the exam — not the exam and
    // not l1.
    const gates = resolveGate({
      mode: 'sequential',
      examLessonId: 'exam',
      lessons: [lesson('l1', 'completed'), lesson('l2'), lesson('exam'), lesson('l3')],
    });

    expect(gates.get('l2')).toBe('available');
    expect(gates.get('l3')).toBe('locked');
  });

  it('leaves open-mode courses completely unaffected', () => {
    const gates = resolveGate({
      mode: 'open',
      examLessonId: 'exam',
      lessons: [lesson('exam'), lesson('l1')],
    });

    expect(gates.get('exam')).toBe('available');
    expect(gates.get('l1')).toBe('available');
  });

  it('still honours a free preview sitting after the exam', () => {
    const gates = resolveGate({
      mode: 'sequential',
      examLessonId: 'exam',
      lessons: [lesson('l1'), lesson('exam'), lesson('promo', 'not_started', true)],
    });

    expect(gates.get('promo')).toBe('available');
  });
});
