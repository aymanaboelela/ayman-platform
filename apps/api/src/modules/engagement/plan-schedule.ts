import type { BacklogItem } from '@ayman/contracts/backlog';
import {
  PLAN_TIGHT_PER_DAY,
  planCalendar,
  planPerDay,
  type PlanDay,
  type PlanPicks,
  type StudyPlanPayload,
  type StudyPlanSettings,
} from '@ayman/contracts/engagement';

/** Days shown ahead, today included. */
const VISIBLE_DAYS = 7;

/**
 * Round-robin across courses, each course in its own path order: a student
 * with two subjects gets a bit of both every day, not a week of one and then a
 * week of the other — and never a lecture before the one it builds on.
 */
export function interleave(items: readonly BacklogItem[]): BacklogItem[] {
  const queues = new Map<string, BacklogItem[]>();
  for (const item of items) queues.set(item.courseId, [...(queues.get(item.courseId) ?? []), item]);
  const lanes = [...queues.values()];
  const out: BacklogItem[] = [];
  for (let round = 0; out.length < items.length; round += 1) {
    for (const lane of lanes) {
      const item = lane[round];
      if (item) out.push(item);
    }
  }
  return out;
}

/**
 * The plan's queue: the starred rows first, in the order they were starred,
 * then the rest interleaved — minus everything taken out of the plan.
 *
 * Starring cannot break a course's order in a way that locks anything: every
 * row here already passed the gate, so «الأول» only changes which open door
 * comes up first, never opens a closed one.
 */
export function planQueue(items: readonly BacklogItem[], picks: PlanPicks): BacklogItem[] {
  const skipped = new Set(picks.skipped);
  const byId = new Map(items.map((item) => [item.id, item]));
  const first = picks.first.flatMap((id) => {
    const item = byId.get(id);
    return item && !skipped.has(id) ? [item] : [];
  });
  const starred = new Set(first.map((item) => item.id));
  return [...first, ...interleave(items.filter((item) => !skipped.has(item.id) && !starred.has(item.id)))];
}

/**
 * The backlog spread over the days left to the exam.
 *
 * Nothing here is stored. It is re-run on every read from the LIVE backlog, so
 * a lecture finished at noon leaves the plan at noon and the share of every
 * later day shrinks by itself — a stored schedule would go stale the first
 * evening a student did more (or less) than planned. Only the student's picks
 * are stored, and they are ids, not a schedule.
 *
 * The days' shape is `planCalendar`'s; `planPerDay` is the share.
 *
 * ## Today's share counts what was already done today
 *
 * `perDay` is (owed + done today) ÷ study days, and today gets `perDay` minus
 * what is already done. Without that, finishing today's three lectures would
 * hand the student three MORE for today on the next read — a plan that
 * punishes finishing.
 */
export function buildPlan(input: {
  today: string;
  settings: StudyPlanSettings | null;
  items: readonly BacklogItem[];
  picks?: PlanPicks;
  doneToday: number;
}): Omit<StudyPlanPayload, 'pool'> {
  const { today, settings, items, doneToday } = input;
  const ids = new Set(items.map((item) => item.id));
  // Picks for rows that left the backlog are dropped from what is reported,
  // so «٣ برّه الخطة» never counts a lecture finished since.
  const picks: PlanPicks = {
    skipped: (input.picks?.skipped ?? []).filter((id) => ids.has(id)),
    first: (input.picks?.first ?? []).filter((id) => ids.has(id)),
  };
  const queue = planQueue(items, picks);
  const base = { settings, today, remaining: queue.length, total: items.length, doneToday, picks };

  if (!settings) {
    return { ...base, daysLeft: null, studyDays: 0, perDay: 0, revisionFrom: null, status: 'none', days: [] };
  }

  const { daysLeft, revisionFrom, days: calendar } = planCalendar(today, settings);
  if (daysLeft < 0) {
    return { ...base, daysLeft, studyDays: 0, perDay: 0, revisionFrom: null, status: 'past', days: [] };
  }

  const studyDayCount = calendar.filter((day) => day.kind === 'study').length;
  // Every day off or under revision, and still something owed: today becomes
  // a study day (see `planPerDay`).
  if (studyDayCount === 0 && queue.length > 0 && calendar[0]) calendar[0].kind = 'study';

  const perDay = planPerDay(queue.length, doneToday, studyDayCount);
  const days: PlanDay[] = calendar.slice(0, VISIBLE_DAYS).map((day) => ({ ...day, items: [] }));

  let cursor = 0;
  for (const [index, day] of calendar.entries()) {
    if (day.kind !== 'study' || cursor >= queue.length) continue;
    const share = day.date === today ? Math.max(0, perDay - doneToday) : perDay;
    const taken = queue.slice(cursor, cursor + share);
    cursor += taken.length;
    if (index < VISIBLE_DAYS) days[index]!.items = taken;
  }

  const status: StudyPlanPayload['status'] =
    queue.length === 0 ? 'clear' : perDay > PLAN_TIGHT_PER_DAY ? 'tight' : 'onTrack';

  return { ...base, daysLeft, studyDays: studyDayCount, perDay, revisionFrom, status, days };
}
