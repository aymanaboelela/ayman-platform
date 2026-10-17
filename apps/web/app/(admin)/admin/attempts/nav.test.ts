import { describe, expect, it } from 'vitest';
import { overviewHref, quizHref, readAttemptsView } from './nav';

const QUIZ = '0190cccc-0000-7000-8000-000000000001';
const LESSON = '0190cccc-0000-7000-8000-000000000002';
const COURSE = '0190cccc-0000-7000-8000-000000000003';

describe('readAttemptsView', () => {
  it('opens the overview on a bare URL', () => {
    expect(readAttemptsView({})).toEqual({ view: 'overview', params: {} });
  });

  it('keeps the overview filters it understands and drops the rest', () => {
    expect(readAttemptsView({ courseId: COURSE, q: '  الدرس  ', page: '3' })).toEqual({
      view: 'overview',
      params: { courseId: COURSE, q: 'الدرس', page: 3 },
    });
    // A hand-edited id lands on the unfiltered overview, never on a 400.
    expect(readAttemptsView({ courseId: 'nope', page: '0' })).toEqual({ view: 'overview', params: {} });
  });

  it('opens one quiz by quiz id or by lesson id — the quiz id wins', () => {
    expect(readAttemptsView({ quizId: QUIZ })).toEqual({ view: 'quiz', params: { quizId: QUIZ, back: {} } });
    expect(readAttemptsView({ lessonId: LESSON })).toEqual({ view: 'quiz', params: { lessonId: LESSON, back: {} } });
    expect(readAttemptsView({ quizId: QUIZ, lessonId: LESSON }).params).not.toHaveProperty('lessonId');
  });

  it('reads the quiz view’s tab, search, sort and page, and only real values of each', () => {
    expect(
      readAttemptsView({ quizId: QUIZ, state: 'pending_review', q: 'منى', sort: 'score_desc', page: '2' }),
    ).toEqual({
      view: 'quiz',
      params: { quizId: QUIZ, state: 'pending_review', q: 'منى', sort: 'score_desc', page: 2, back: {} },
    });
    expect(readAttemptsView({ quizId: QUIZ, state: 'graded', sort: 'id' })).toEqual({
      view: 'quiz',
      params: { quizId: QUIZ, back: {} },
    });
  });

  it('carries the overview it came from under its own names', () => {
    // `q` is the STUDENT inside the quiz; the overview's search rides as `oq`.
    expect(readAttemptsView({ quizId: QUIZ, q: 'منى', courseId: COURSE, oq: 'الشهر' })).toEqual({
      view: 'quiz',
      params: { quizId: QUIZ, q: 'منى', back: { courseId: COURSE, q: 'الشهر' } },
    });
  });

  it('clamps a search to what the API accepts', () => {
    const view = readAttemptsView({ q: 'ا'.repeat(300) });
    expect(view.view === 'overview' && view.params.q?.length).toBe(120);
  });
});

describe('overviewHref / quizHref', () => {
  it('is the bare path for the unfiltered overview — the sidebar’s own link', () => {
    expect(overviewHref()).toBe('/admin/attempts');
    expect(overviewHref({ page: 1 })).toBe('/admin/attempts');
  });

  it('round-trips every view through the URL', () => {
    const views = [
      readAttemptsView({ courseId: COURSE, q: 'أحمد', page: '2' }),
      readAttemptsView({ quizId: QUIZ, state: 'submitted', q: 'منى', sort: 'oldest', page: '4', courseId: COURSE, oq: 'كويز' }),
      readAttemptsView({ lessonId: LESSON }),
    ];
    for (const view of views) {
      const url = view.view === 'quiz' ? quizHref(view.params) : overviewHref(view.params);
      const query = Object.fromEntries(new URL(url, 'http://x').searchParams);
      expect(readAttemptsView(query)).toEqual(view);
    }
  });

  it('leaves the defaults out, so a tab reached two ways is one URL', () => {
    expect(quizHref({ quizId: QUIZ, sort: 'newest', page: 1, back: {} })).toBe(`/admin/attempts?quizId=${QUIZ}`);
  });

  it('sends «رجوع» back to the overview exactly as it was left', () => {
    const view = readAttemptsView({ quizId: QUIZ, q: 'منى', courseId: COURSE, oq: 'الشهر' });
    expect(view.view === 'quiz' && overviewHref(view.params.back)).toBe(
      `/admin/attempts?courseId=${COURSE}&q=${encodeURIComponent('الشهر')}`,
    );
  });
});
