import { describe, expect, it } from 'vitest';
import type { QuizHistoryPoint } from '@ayman/contracts';
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  passLineY,
  polylinePoints,
  projectSeries,
} from './quiz-history-view';

function point(overrides: Partial<QuizHistoryPoint> = {}): QuizHistoryPoint {
  return {
    attemptId: 'a1',
    lessonId: 'l1',
    quizTitle: 'اختبار',
    attemptNo: 1,
    scorePercent: 50,
    passed: true,
    submittedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('projectSeries', () => {
  it('returns nothing for an empty series', () => {
    expect(projectSeries([])).toEqual([]);
  });

  it('centres a single point instead of dividing by zero', () => {
    // With one attempt there is no interval: `CHART_WIDTH / 0` is Infinity,
    // which serialises into the `points` attribute as garbage and renders
    // nothing at all.
    const projected = projectSeries([point({ scorePercent: 100 })]);

    expect(projected).toHaveLength(1);
    expect(projected[0]?.x).toBe(CHART_WIDTH / 2);
    expect(Number.isFinite(projected[0]?.x)).toBe(true);
  });

  it('runs oldest-to-newest RIGHT to LEFT, matching the RTL reading direction', () => {
    const projected = projectSeries([
      point({ attemptId: 'old' }),
      point({ attemptId: 'mid' }),
      point({ attemptId: 'new' }),
    ]);

    expect(projected[0]?.x).toBe(CHART_WIDTH);
    expect(projected[2]?.x).toBe(0);
    // Strictly decreasing — a later attempt is always further left.
    expect(projected[0]!.x).toBeGreaterThan(projected[1]!.x);
    expect(projected[1]!.x).toBeGreaterThan(projected[2]!.x);
  });

  it('maps 100% to the top of the box and 0% to the bottom', () => {
    // SVG's y grows downward, so the higher score must have the SMALLER y.
    const projected = projectSeries([point({ scorePercent: 0 }), point({ scorePercent: 100 })]);

    expect(projected[0]?.y).toBe(CHART_HEIGHT);
    expect(projected[1]?.y).toBe(0);
  });

  it('clamps a score outside 0–100 rather than drawing outside the box', () => {
    const projected = projectSeries([
      point({ scorePercent: -10 }),
      point({ scorePercent: 130 }),
    ]);

    expect(projected[0]?.y).toBe(CHART_HEIGHT);
    expect(projected[1]?.y).toBe(0);
  });

  it('keeps every point inside the viewBox for a long series', () => {
    const series = Array.from({ length: 40 }, (_, i) =>
      point({ attemptId: `a${i}`, scorePercent: i * 2 }),
    );

    for (const projected of projectSeries(series)) {
      expect(projected.x).toBeGreaterThanOrEqual(0);
      expect(projected.x).toBeLessThanOrEqual(CHART_WIDTH);
      expect(projected.y).toBeGreaterThanOrEqual(0);
      expect(projected.y).toBeLessThanOrEqual(CHART_HEIGHT);
    }
  });
});

describe('passLineY', () => {
  it('puts the pass line above the floor and below the ceiling', () => {
    const y = passLineY(50);
    expect(y).toBe(CHART_HEIGHT / 2);
  });
});

describe('polylinePoints', () => {
  it('emits space-separated x,y pairs', () => {
    const projected = projectSeries([point({ scorePercent: 0 }), point({ scorePercent: 100 })]);
    expect(polylinePoints(projected)).toBe(`100,${CHART_HEIGHT} 0,0`);
  });

  it('rounds to two decimals rather than emitting 17 significant figures', () => {
    // 3 points over a width of 100 gives a step of 50 — clean. 7 points do
    // not divide evenly, which is where the long decimals came from.
    const series = Array.from({ length: 7 }, (_, i) => point({ attemptId: `a${i}` }));
    const emitted = polylinePoints(projectSeries(series));

    for (const pair of emitted.split(' ')) {
      const [x] = pair.split(',');
      const decimals = x?.split('.')[1] ?? '';
      expect(decimals.length).toBeLessThanOrEqual(2);
    }
  });

  it('never emits Infinity or NaN', () => {
    const emitted = polylinePoints(projectSeries([point()]));
    expect(emitted).not.toMatch(/Infinity|NaN/);
  });
});
