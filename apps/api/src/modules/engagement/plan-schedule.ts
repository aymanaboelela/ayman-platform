import type { BacklogItem } from '@ayman/contracts/backlog';
import {
  PLAN_REVISION_MAX_DAYS,
  PLAN_TIGHT_PER_DAY,
  daysBetween,
  shiftDayKey,
  weekdayOf,
  type PlanDay,
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
 * The backlog spread over the days left to the exam.
 *
 * Nothing here is stored. It is re-run on every read from the LIVE backlog, so
 * a lecture finished at noon leaves the plan at noon and the share of every
 * later day shrinks by itself — a stored schedule would go stale the first
 * evening a student did more (or less) than planned.
 *
 * ## The shape of the days
 *
 *   · the exam day itself — `exam`, nothing on it.
 *   · the last stretch before it — `revision`: 15% of the time left, at most
 *     `PLAN_REVISION_MAX_DAYS`. Nothing new is taught in the last week.
 *   · a weekday the student took off — `off`.
 *   · everything else — `study`, sharing the backlog equally.
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
  doneToday: number;
}): StudyPlanPayload {
  const { today, settings, items, doneToday } = input;
  const base = { settings, today, remaining: items.length, doneToday };

  if (!settings) {
    return { ...base, daysLeft: null, perDay: 0, revisionFrom: null, status: 'none', days: [] };
  }

  const daysLeft = daysBetween(today, settings.examDate);
  if (daysLeft < 0) {
    return { ...base, daysLeft, perDay: 0, revisionFrom: null, status: 'past', days: [] };
  }

  const revisionDays = Math.min(PLAN_REVISION_MAX_DAYS, Math.floor(daysLeft * 0.15));
  const revisionFrom = revisionDays > 0 ? shiftDayKey(settings.examDate, -revisionDays) : null;
  const studyEnd = revisionFrom ?? settings.examDate;
  const off = new Set(settings.daysOff);

  const calendar: { date: string; kind: PlanDay['kind'] }[] = [];
  for (let offset = 0; offset <= daysLeft; offset += 1) {
    const date = shiftDayKey(today, offset);
    const kind: PlanDay['kind'] =
      date === settings.examDate
        ? 'exam'
        : date >= studyEnd
          ? 'revision'
          : off.has(weekdayOf(date))
            ? 'off'
            : 'study';
    calendar.push({ date, kind });
  }

  // Every day off or under revision, and still something owed: today becomes
  // a study day. Telling a student «nothing to do» with lectures unwatched
  // would be the plan lying to make itself fit.
  let studyDays = calendar.filter((day) => day.kind === 'study');
  if (studyDays.length === 0 && items.length > 0 && calendar[0]) {
    calendar[0].kind = 'study';
    studyDays = [calendar[0]];
  }

  const perDay = studyDays.length === 0 ? 0 : Math.ceil((items.length + doneToday) / studyDays.length);
  const queue = interleave(items);
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
    items.length === 0 ? 'clear' : perDay > PLAN_TIGHT_PER_DAY ? 'tight' : 'onTrack';

  return { ...base, daysLeft, perDay, revisionFrom, status, days };
}
