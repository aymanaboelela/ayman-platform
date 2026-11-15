import type { LearningPath } from '@ayman/contracts';
import { describe, expect, it } from 'vitest';
import { mistakeRows, nextStepAfter, reviewTally, stemPreview, type ReviewedQuestion } from './review-view';

const q = (slotPosition: number, correctness: ReviewedQuestion['correctness'], extra: Partial<ReviewedQuestion> = {}): ReviewedQuestion => ({
  slotPosition,
  type: 'mcq_single',
  stemHtml: `<p>سؤال ${slotPosition}</p>`,
  options: [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }, { id: 'o4' }],
  correctness,
  ...extra,
});

describe('reviewTally', () => {
  it('counts partial and unanswered as wrong, the same set `ReviewList` filters on', () => {
    expect(
      reviewTally([q(0, 'correct'), q(1, 'incorrect'), q(2, 'partial'), q(3, 'unanswered'), q(4, 'needsGrading')]),
    ).toEqual({ correct: 1, wrong: 3, pending: 1 });
  });

  it('is null when the window withholds correctness — zero right is a claim, not a blank', () => {
    expect(reviewTally([q(0, undefined), q(1, undefined)])).toBeNull();
  });
});

describe('mistakeRows', () => {
  it('prints the picked and right letters of a choice question', () => {
    const [row] = mistakeRows([
      q(3, 'incorrect', { response: { kind: 'choice', optionIds: ['o2'] }, rightAnswerOptionIds: ['o4'] }),
    ]);
    expect(row).toEqual({ slotPosition: 3, stem: 'سؤال 3', picked: 'ب', right: 'د' });
  });

  it('leaves the letters out when the window withholds them, and skips right answers', () => {
    const rows = mistakeRows([q(0, 'correct'), q(1, 'incorrect'), q(2, 'needsGrading')]);
    expect(rows).toEqual([{ slotPosition: 1, stem: 'سؤال 1', picked: null, right: null }]);
  });

  it('says an empty pick as empty, never as a letter', () => {
    const [row] = mistakeRows([q(0, 'unanswered', { response: { kind: 'choice', optionIds: [] }, rightAnswerOptionIds: ['o1'] })]);
    expect(row?.picked).toBe('');
    expect(row?.right).toBe('أ');
  });

  it('never prints letters for an essay or a short answer', () => {
    const [row] = mistakeRows([q(0, 'incorrect', { type: 'short_answer', response: { kind: 'text', text: 'x' } })]);
    expect(row?.picked).toBeNull();
  });
});

describe('stemPreview', () => {
  it('drops tags and decodes the entities a stem carries', () => {
    expect(stemPreview('<p>ناتج <code>3 ** 2</code> &amp; <b>10 &lt; 3</b></p><p>في بايثون</p>')).toBe(
      'ناتج 3 ** 2 & 10 < 3 في بايثون',
    );
  });
});

const path = (nextLessonId: string | null, published = true): LearningPath => ({
  courses: [
    {
      id: 'c1',
      slug: 'python',
      title: 'بايثون',
      subjectNameAr: 'برمجة',
      coverKey: null,
      published,
      progressPercent: 10,
      clearedLessons: 1,
      totalLessons: 3,
      contentComplete: true,
      whatsappGroupUrl: null,
      nextLessonId,
      nodes: [
        { id: 'quiz-1', lessonId: 'quiz-1', title: 'كويز ١', kind: 'quiz', state: 'passed', gate: 'cleared', isExam: false },
        { id: 'lec-2', lessonId: 'lec-2', title: 'المحاضرة التانية', kind: 'video', state: 'not_started', gate: 'available', isExam: false },
      ],
    },
  ] as LearningPath['courses'],
  currentCourseId: 'c1',
  clearedLessons: 1,
  totalLessons: 3,
  percent: 33,
});

describe('nextStepAfter', () => {
  it('follows the course’s own nextLessonId to the lesson page', () => {
    expect(nextStepAfter(path('lec-2'), 'quiz-1', null)).toEqual({
      href: '/courses/python/lessons/lec-2',
      kind: 'video',
      title: 'المحاضرة التانية',
    });
  });

  it('is null when the next stop is this very quiz, the course is paused, or done', () => {
    expect(nextStepAfter(path('quiz-1'), 'quiz-1', null)).toBeNull();
    expect(nextStepAfter(path('lec-2', false), 'quiz-1', null)).toBeNull();
    expect(nextStepAfter(path(null), 'quiz-1', null)).toBeNull();
    expect(nextStepAfter(null, 'quiz-1', null)).toBeNull();
  });

  it('falls back to the course by slug for a quiz that is not a stop on the map', () => {
    expect(nextStepAfter(path('lec-2'), 'monthly-1', 'python')?.href).toBe('/courses/python/lessons/lec-2');
    expect(nextStepAfter(path('lec-2'), 'monthly-1', 'other')).toBeNull();
  });
});
