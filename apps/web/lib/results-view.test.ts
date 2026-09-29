import { describe, expect, it } from 'vitest';
import type { QuizHistoryPoint, QuizHistoryRow, StudentQuizHistory } from '@ayman/contracts';
import {
  EXCELLENT_PERCENT,
  PASS_LINE_PERCENT,
  formatDay,
  gaugeArcPath,
  gaugePoint,
  groupByCourse,
  hasPendingMarks,
  latestDeltas,
  resultsMood,
  scoreBand,
  verdictOf,
} from './results-view';

function point(overrides: Partial<QuizHistoryPoint> = {}): QuizHistoryPoint {
  return {
    attemptId: 'a1',
    lessonId: 'l1',
    quizTitle: 'اختبار',
    attemptNo: 1,
    scorePercent: 50,
    passed: true,
    submittedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

function row(overrides: Partial<QuizHistoryRow> = {}): QuizHistoryRow {
  return {
    lessonId: 'l1',
    quizTitle: 'اختبار',
    courseTitle: 'كورس',
    courseSlug: 'course',
    attemptsUsed: 1,
    allowsImprovement: false,
    improvementUsed: false,
    bestPercent: 60,
    latestPercent: 60,
    latestAttemptId: 'a1',
    passed: true,
    lastSubmittedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

function summary(overrides: Partial<StudentQuizHistory['summary']> = {}): StudentQuizHistory['summary'] {
  return {
    quizzesTaken: 3,
    attemptsTotal: 3,
    averagePercent: 60,
    bestPercent: 80,
    passedCount: 2,
    ...overrides,
  };
}

describe('scoreBand', () => {
  it('puts the lines where the gauge ticks them', () => {
    expect(scoreBand(PASS_LINE_PERCENT - 1)).toBe('low');
    expect(scoreBand(PASS_LINE_PERCENT)).toBe('pass');
    expect(scoreBand(EXCELLENT_PERCENT - 1)).toBe('pass');
    expect(scoreBand(EXCELLENT_PERCENT)).toBe('high');
  });

  it('shares «امتياز» with the dashboard badge', () => {
    // Two screens, one student, one meaning of "excellent".
    expect(EXCELLENT_PERCENT).toBe(90);
  });
});

describe('resultsMood', () => {
  it('calls a single sitting a start, whatever it scored', () => {
    expect(resultsMood(summary({ attemptsTotal: 1, averagePercent: 4 }), [point()]).key).toBe(
      'moodFirst',
    );
  });

  it('names a real climb with its numbers, even under a low average', () => {
    const mood = resultsMood(summary({ averagePercent: 30 }), [
      point({ scorePercent: 10 }),
      point({ scorePercent: 25 }),
      point({ scorePercent: 55 }),
    ]);

    expect(mood).toEqual({ key: 'moodRising', vars: { first: 10, last: 55 } });
  });

  it('does not call a two-point wobble a climb', () => {
    const mood = resultsMood(summary({ averagePercent: 30, passedCount: 0 }), [
      point({ scorePercent: 27 }),
      point({ scorePercent: 29 }),
    ]);

    expect(mood.key).toBe('moodLow');
  });

  it('prefers «امتياز» over «all passed», and «all passed» over the plain pass line', () => {
    const flat = [point({ scorePercent: 70 }), point({ scorePercent: 70 })];

    expect(resultsMood(summary({ averagePercent: 95, passedCount: 3 }), flat).key).toBe('moodHigh');
    expect(resultsMood(summary({ averagePercent: 70, passedCount: 3 }), flat)).toEqual({
      key: 'moodAllPassed',
      vars: { passed: 3, total: 3 },
    });
    expect(resultsMood(summary({ averagePercent: 70, passedCount: 2 }), flat).key).toBe('moodPass');
  });

  it('has no sentence for a decline — a low average gets the way forward', () => {
    const mood = resultsMood(summary({ averagePercent: 18, passedCount: 0 }), [
      point({ scorePercent: 27 }),
      point({ scorePercent: 12 }),
      point({ scorePercent: 1 }),
    ]);

    expect(mood.key).toBe('moodLow');
  });
});

describe('hasPendingMarks', () => {
  it('is true only while a verdict is null', () => {
    expect(hasPendingMarks([row(), row({ passed: false })])).toBe(false);
    expect(hasPendingMarks([row(), row({ passed: null })])).toBe(true);
  });
});

describe('latestDeltas', () => {
  it('compares the latest sitting with the one before it, per quiz', () => {
    const deltas = latestDeltas([
      point({ lessonId: 'exam', scorePercent: 40 }),
      point({ lessonId: 'quiz', scorePercent: 90 }),
      point({ lessonId: 'exam', scorePercent: 65 }),
    ]);

    expect(deltas.get('exam')).toBe(25);
  });

  it('says nothing about a quiz sat once — there is nothing to compare', () => {
    expect(latestDeltas([point({ lessonId: 'quiz' })]).has('quiz')).toBe(false);
  });
});

describe('groupByCourse', () => {
  it('keeps the API order at both levels and counts passes per course', () => {
    const groups = groupByCourse([
      row({ lessonId: '1', courseSlug: 'b', courseTitle: 'ب', passed: true }),
      row({ lessonId: '2', courseSlug: 'a', courseTitle: 'أ', passed: false }),
      row({ lessonId: '3', courseSlug: 'b', courseTitle: 'ب', passed: null }),
    ]);

    expect(groups.map((g) => g.courseSlug)).toEqual(['b', 'a']);
    expect(groups[0]!.rows.map((r) => r.lessonId)).toEqual(['1', '3']);
    expect(groups[0]!.passed).toBe(1);
    expect(groups[1]!.passed).toBe(0);
  });

  it('keys on the slug, so two courses sharing a title stay apart', () => {
    const groups = groupByCourse([
      row({ courseSlug: 'foundation-2026', courseTitle: 'الكورس التأسيسي' }),
      row({ courseSlug: 'foundation-2027', courseTitle: 'الكورس التأسيسي' }),
    ]);

    expect(groups).toHaveLength(2);
  });
});

describe('verdictOf', () => {
  it('reads the server’s verdict, never the percentage against 50', () => {
    expect(verdictOf({ passed: false, bestPercent: 65 })).toBe('failed');
    expect(verdictOf({ passed: true, bestPercent: 45 })).toBe('passed');
  });

  it('treats null as not marked yet, never as a fail', () => {
    expect(verdictOf({ passed: null, bestPercent: 20 })).toBe('pending');
  });

  it('adds «امتياز» only to a pass', () => {
    expect(verdictOf({ passed: true, bestPercent: EXCELLENT_PERCENT })).toBe('excellent');
    expect(verdictOf({ passed: null, bestPercent: 100 })).toBe('pending');
  });
});

describe('formatDay', () => {
  it('writes the Cairo date with Latin digits', () => {
    expect(formatDay('2026-09-24T09:00:00.000Z')).toBe('24 سبتمبر');
    // 22:30 UTC is already the next day in Cairo.
    expect(formatDay('2026-09-24T22:30:00.000Z')).toBe('25 سبتمبر');
  });

  it('returns nothing for a timestamp it cannot read', () => {
    expect(formatDay('not a date')).toBe('');
  });
});

describe('the gauge', () => {
  const SIZE = 200;
  const R = 76;

  it('starts at the bottom RIGHT and ends at the bottom left — RTL', () => {
    const start = gaugePoint(0, SIZE, R);
    const end = gaugePoint(1, SIZE, R);

    expect(start.x).toBeGreaterThan(SIZE / 2);
    expect(end.x).toBeLessThan(SIZE / 2);
    expect(start.y).toBeGreaterThan(SIZE / 2);
    expect(end.y).toBe(start.y);
  });

  it('puts the halfway mark at twelve o’clock', () => {
    expect(gaugePoint(0.5, SIZE, R)).toEqual({ x: SIZE / 2, y: SIZE / 2 - R });
  });

  it('clamps outside 0..1 rather than drawing past the ends', () => {
    expect(gaugePoint(-1, SIZE, R)).toEqual(gaugePoint(0, SIZE, R));
    expect(gaugePoint(2, SIZE, R)).toEqual(gaugePoint(1, SIZE, R));
  });

  it('draws the arc the long way round, counter-clockwise', () => {
    // large-arc 1 (270° > 180°), sweep 0 (counter-clockwise on screen).
    expect(gaugeArcPath(SIZE, R)).toMatch(/A 76 76 0 1 0 /);
    expect(gaugeArcPath(SIZE, R)).not.toMatch(/NaN|Infinity/);
  });
});
