import type { BacklogItem } from '@ayman/contracts/backlog';
import { buildPlan, interleave } from './plan-schedule';

function item(courseId: string, n: number): BacklogItem {
  return {
    id: `${courseId}-${n}`,
    kind: 'lecture',
    lessonId: `${courseId}-${n}`,
    title: `${courseId} ${n}`,
    courseId,
    courseSlug: courseId,
    courseTitle: courseId,
    status: 'not_started',
  };
}

const twenty = Array.from({ length: 20 }, (_, n) => item('a', n));

describe('interleave', () => {
  it('alternates courses and keeps each course in its own order', () => {
    const out = interleave([item('a', 1), item('a', 2), item('a', 3), item('b', 1)]);
    expect(out.map((entry) => entry.id)).toEqual(['a-1', 'b-1', 'a-2', 'a-3']);
  });
});

describe('buildPlan', () => {
  it('says there is no plan without settings', () => {
    const plan = buildPlan({ today: '2026-10-27', settings: null, items: twenty, doneToday: 0 });
    expect(plan.status).toBe('none');
    expect(plan.remaining).toBe(20);
    expect(plan.days).toEqual([]);
  });

  it('spreads the backlog over the study days before the revision stretch', () => {
    // 20 days out → 3 revision days (15%), 17 study days before them.
    const plan = buildPlan({
      today: '2026-10-27',
      settings: { examDate: '2026-11-16', daysOff: [] },
      items: twenty,
      doneToday: 0,
    });
    expect(plan.daysLeft).toBe(20);
    expect(plan.revisionFrom).toBe('2026-11-13');
    expect(plan.perDay).toBe(2);
    expect(plan.days).toHaveLength(7);
    expect(plan.days[0]?.items.map((entry) => entry.id)).toEqual(['a-0', 'a-1']);
    expect(plan.status).toBe('onTrack');
  });

  it('leaves days off empty', () => {
    // 2026-10-30 is a Friday.
    const plan = buildPlan({
      today: '2026-10-27',
      settings: { examDate: '2026-11-16', daysOff: [5] },
      items: twenty,
      doneToday: 0,
    });
    const friday = plan.days.find((day) => day.date === '2026-10-30');
    expect(friday?.kind).toBe('off');
    expect(friday?.items).toEqual([]);
  });

  it('does not hand out more today once today’s share is done', () => {
    const plan = buildPlan({
      today: '2026-10-27',
      settings: { examDate: '2026-11-16', daysOff: [] },
      items: twenty.slice(2),
      doneToday: 2,
    });
    expect(plan.perDay).toBe(2);
    expect(plan.days[0]?.items).toEqual([]);
    expect(plan.days[1]?.items.map((entry) => entry.id)).toEqual(['a-2', 'a-3']);
  });

  it('calls it tight past the daily ceiling', () => {
    const plan = buildPlan({
      today: '2026-10-27',
      settings: { examDate: '2026-10-29', daysOff: [] },
      items: twenty,
      doneToday: 0,
    });
    expect(plan.status).toBe('tight');
    expect(plan.days.at(-1)?.kind).toBe('exam');
  });

  it('still gives today something when every day before the exam is off', () => {
    // Tuesday to Thursday, with Tuesday and Wednesday off.
    const plan = buildPlan({
      today: '2026-10-27',
      settings: { examDate: '2026-10-29', daysOff: [2, 3] },
      items: twenty.slice(0, 3),
      doneToday: 0,
    });
    expect(plan.days[0]?.kind).toBe('study');
    expect(plan.days[0]?.items).toHaveLength(3);
  });

  it('is clear with nothing owed and past after the date', () => {
    expect(
      buildPlan({ today: '2026-10-27', settings: { examDate: '2026-11-16', daysOff: [] }, items: [], doneToday: 0 })
        .status,
    ).toBe('clear');
    expect(
      buildPlan({ today: '2026-10-27', settings: { examDate: '2026-10-20', daysOff: [] }, items: twenty, doneToday: 0 })
        .status,
    ).toBe('past');
  });
});
