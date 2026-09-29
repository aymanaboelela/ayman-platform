import type { RankNextExam, RankNextQuizState } from '@ayman/contracts/rank-next';
import {
  FULL_MARK_PERCENT,
  attemptPercent,
  classifyQuiz,
  compareHomework,
  compareQuizzes,
  pickExams,
  type NextAttempt,
  type NextQuizFacts,
  type ReadingOrder,
} from './rank-next';

/**
 * «الطريق لفوق» — القواعد من غير داتابيز. اللي بيطلع فعلًا للطالب (والمقفول)
 * في `rank-next.service.spec.ts` على داتابيز حقيقية.
 */

const NOW = new Date('2026-09-30T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function attempt(overrides: Partial<NextAttempt> = {}): NextAttempt {
  return {
    attemptNo: 1,
    paper: 'original',
    state: 'submitted',
    extraAttempts: 0,
    scaledScore: 70,
    gradeOutOf: 100,
    submittedAt: new Date(NOW.getTime() - HOUR),
    ...overrides,
  };
}

function quiz(overrides: Partial<NextQuizFacts> = {}): NextQuizFacts {
  return { allowsImprovement: false, openFrom: null, openUntil: null, attempts: [], ...overrides };
}

describe('attemptPercent — نفس حساب النقط', () => {
  it('scales by the attempt’s own grade_out_of and caps at 100', () => {
    expect(attemptPercent({ scaledScore: 15, gradeOutOf: 20 })).toBe(75);
    expect(attemptPercent({ scaledScore: 25, gradeOutOf: 20 })).toBe(100);
  });

  it('a paper out of zero is 0, and a sitting with no score has none', () => {
    expect(attemptPercent({ scaledScore: 5, gradeOutOf: 0 })).toBe(0);
    expect(attemptPercent({ scaledScore: null, gradeOutOf: 100 })).toBeNull();
  });
});

describe('classifyQuiz — ناقص ولا لأ، وأقدر أعمل فيه إيه', () => {
  it('never sat: new, with no score (not zero)', () => {
    expect(classifyQuiz(quiz(), NOW)).toEqual({ state: 'new', bestPercent: null, full: false });
  });

  it('sat below 100% with no sitting left: spent, showing the best score', () => {
    const verdict = classifyQuiz(quiz({ attempts: [attempt({ scaledScore: 70 })] }), NOW);
    expect(verdict).toEqual({ state: 'spent', bestPercent: 70, full: false });
  });

  it('a perfect paper is full — it leaves the list', () => {
    expect(classifyQuiz(quiz({ attempts: [attempt({ scaledScore: 100 })] }), NOW).full).toBe(true);
    // Decimal rounding on a perfect paper still counts, same threshold as the points.
    const nearly = (FULL_MARK_PERCENT + 0.001) / 100;
    expect(classifyQuiz(quiz({ attempts: [attempt({ scaledScore: nearly * 100 })] }), NOW).full).toBe(true);
  });

  it('a best just under 100 is never printed as 100', () => {
    const verdict = classifyQuiz(quiz({ attempts: [attempt({ scaledScore: 99.96 })] }), NOW);
    expect(verdict.full).toBe(false);
    expect(verdict.bestPercent).toBe(99.9);
  });

  it('an improvable exam after the first paper: retake', () => {
    const verdict = classifyQuiz(quiz({ allowsImprovement: true, attempts: [attempt({ scaledScore: 60 })] }), NOW);
    expect(verdict.state).toBe('retake');
  });

  it('an admin-granted extra sitting reopens a spent quiz', () => {
    const verdict = classifyQuiz(quiz({ attempts: [attempt({ scaledScore: 40, extraAttempts: 1 })] }), NOW);
    expect(verdict.state).toBe('retake');
  });

  it('an attempt in progress wins over everything: resume', () => {
    const verdict = classifyQuiz(
      quiz({ attempts: [attempt({ state: 'in_progress', submittedAt: null, scaledScore: null })] }),
      NOW,
    );
    expect(verdict.state).toBe('resume');
    expect(verdict.bestPercent).toBeNull();
  });

  it('papers still with the teacher: grading, never «spent» on a provisional mark', () => {
    const verdict = classifyQuiz(quiz({ attempts: [attempt({ state: 'pending_review', scaledScore: 40 })] }), NOW);
    expect(verdict.state).toBe('grading');
    expect(verdict.full).toBe(false);
  });

  it('an abandoned sitting uses the allowance and scores nothing', () => {
    const verdict = classifyQuiz(
      quiz({ attempts: [attempt({ state: 'abandoned', submittedAt: null, scaledScore: null })] }),
      NOW,
    );
    expect(verdict).toEqual({ state: 'spent', bestPercent: null, full: false });
  });

  it('follows the open window the server enforces', () => {
    const ahead = quiz({ openFrom: new Date(NOW.getTime() + HOUR) });
    expect(classifyQuiz(ahead, NOW).state).toBe('upcoming');
    const shut = quiz({ openUntil: NOW });
    // `now >= openUntil` is closed — the same instant `assertCanAttempt` refuses on.
    expect(classifyQuiz(shut, NOW).state).toBe('spent');
  });
});

function at(order: Partial<ReadingOrder> & { lessonId: string }): ReadingOrder {
  return { courseOrder: 0, sectionPosition: 0, sectionId: 's', lessonPosition: 0, ...order };
}

describe('ordering', () => {
  it('quizzes: what can be done now first, then reading order', () => {
    const rows: Array<ReadingOrder & { state: RankNextQuizState }> = [
      { ...at({ lessonId: 'a', lessonPosition: 0 }), state: 'spent' },
      { ...at({ lessonId: 'b', lessonPosition: 3 }), state: 'new' },
      { ...at({ lessonId: 'c', lessonPosition: 1 }), state: 'new' },
      { ...at({ lessonId: 'd', lessonPosition: 9 }), state: 'resume' },
      { ...at({ lessonId: 'e', lessonPosition: 2 }), state: 'retake' },
    ];
    expect(rows.sort(compareQuizzes).map((row) => row.lessonId)).toEqual(['d', 'c', 'b', 'e', 'a']);
  });

  it('reading order is course, then unit, then lecture', () => {
    const rows: Array<ReadingOrder & { state: RankNextQuizState }> = [
      { ...at({ lessonId: 'x', courseOrder: 1 }), state: 'new' },
      { ...at({ lessonId: 'y', sectionPosition: 2 }), state: 'new' },
      { ...at({ lessonId: 'z', sectionPosition: 1, lessonPosition: 5 }), state: 'new' },
    ];
    expect(rows.sort(compareQuizzes).map((row) => row.lessonId)).toEqual(['z', 'y', 'x']);
  });

  it('homework sent back comes before homework never handed in', () => {
    const rows: Array<ReadingOrder & { status: 'new' | 'needs_work' }> = [
      { ...at({ lessonId: 'first', lessonPosition: 0 }), status: 'new' },
      { ...at({ lessonId: 'late', lessonPosition: 7 }), status: 'needs_work' },
      { ...at({ lessonId: 'second', lessonPosition: 1 }), status: 'new' },
    ];
    expect(rows.sort(compareHomework).map((row) => row.lessonId)).toEqual(['late', 'first', 'second']);
  });
});

function exam(
  lessonId: string,
  overrides: Partial<RankNextExam> & { lastSubmittedAt?: Date | null } = {},
): RankNextExam & { lastSubmittedAt: Date | null } {
  return {
    lessonId,
    title: lessonId,
    courseSlug: 'c',
    courseTitle: 'c',
    phase: 'open',
    openFrom: null,
    openUntil: null,
    state: 'new',
    bestPercent: null,
    lastSubmittedAt: null,
    ...overrides,
  };
}

describe('pickExams — الجاي وآخر نتيجة', () => {
  it('nothing at all: both empty («لسه مانزلش»)', () => {
    expect(pickExams([])).toEqual({ next: null, last: null });
  });

  it('an open exam still to sit beats an upcoming one that opens sooner', () => {
    const picked = pickExams([
      exam('soon', { phase: 'upcoming', openFrom: new Date(NOW.getTime() + HOUR).toISOString() }),
      exam('open', { openUntil: new Date(NOW.getTime() + 48 * HOUR).toISOString() }),
    ]);
    expect(picked.next?.lessonId).toBe('open');
  });

  it('with none open, the upcoming one that opens first', () => {
    const picked = pickExams([
      exam('later', { phase: 'upcoming', openFrom: new Date(NOW.getTime() + 9 * HOUR).toISOString() }),
      exam('sooner', { phase: 'upcoming', openFrom: new Date(NOW.getTime() + 2 * HOUR).toISOString() }),
    ]);
    expect(picked.next?.lessonId).toBe('sooner');
  });

  it('an open exam already sat with no sitting left is a result, not the next one', () => {
    const picked = pickExams([
      exam('done', { state: 'spent', bestPercent: 85, lastSubmittedAt: new Date(NOW.getTime() - HOUR) }),
    ]);
    expect(picked.next).toBeNull();
    expect(picked.last).toMatchObject({ lessonId: 'done', bestPercent: 85 });
    expect(picked.last).not.toHaveProperty('lastSubmittedAt');
  });

  it('the latest sitting is the result shown', () => {
    const picked = pickExams([
      exam('old', { phase: 'closed', state: 'spent', lastSubmittedAt: new Date(NOW.getTime() - 30 * 24 * HOUR) }),
      exam('recent', { phase: 'closed', state: 'spent', lastSubmittedAt: new Date(NOW.getTime() - 24 * HOUR) }),
    ]);
    expect(picked.last?.lessonId).toBe('recent');
  });
});
