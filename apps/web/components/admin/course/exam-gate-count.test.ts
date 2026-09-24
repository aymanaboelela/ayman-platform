import { describe, expect, it } from 'vitest';
import { examPrerequisiteCount } from './exam-gate-count';

/** The same cases `gate-rule.spec.ts` proves on the server, from the admin's
 *  side: the number on the exam row has to be the number the gate waits on. */
describe('examPrerequisiteCount', () => {
  const lecture = (id: string, isPublished = true) => ({ id, isPublished, kind: 'video' });
  const quiz = (id: string, isPublished = true) => ({ id, isPublished, kind: 'quiz' });

  it('counts published lectures and nothing else — three lectures with three quizzes is 3, not 6', () => {
    const sections = [
      {
        isPublished: true,
        lessons: [lecture('a'), quiz('qa'), lecture('b'), quiz('qb'), lecture('c'), quiz('qc')],
      },
    ];
    expect(examPrerequisiteCount(sections, null)).toBe(3);
  });

  it('never counts the exam itself', () => {
    const sections = [{ isPublished: true, lessons: [lecture('a'), quiz('exam')] }];
    expect(examPrerequisiteCount(sections, 'exam')).toBe(1);
  });

  it('skips drafts, and every lecture in a DRAFT section — the gate never loads them', () => {
    const sections = [
      { isPublished: true, lessons: [lecture('a'), lecture('draft', false)] },
      { isPublished: false, lessons: [lecture('hidden-1'), lecture('hidden-2')] },
    ];
    expect(examPrerequisiteCount(sections, null)).toBe(1);
  });

  it('is 0 when the exam is the only thing published — it then opens straight away', () => {
    const sections = [{ isPublished: true, lessons: [quiz('exam')] }];
    expect(examPrerequisiteCount(sections, 'exam')).toBe(0);
  });
});
