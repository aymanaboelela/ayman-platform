import { arabicCount } from '@ayman/contracts/arabic-count';
import { guardianCopy as c } from '@ayman/contracts/copy/guardian';
import { formatCopy } from '@ayman/contracts/format';
import type { GuardianAccess, GuardianView } from '@ayman/contracts/guardian-view';

/**
 * Everything the parent's page SAYS, decided here as pure functions so every
 * sentence and every «محتاج متابعة» row is pinned by `guardian-view.test.ts`
 * rather than by eye. The components only draw what these return.
 */

const CAIRO_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const DATE = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'long', timeZone: 'Africa/Cairo' });

/** Calendar days between two instants, on the Cairo calendar — «امبارح» at
 *  00:30 is yesterday evening, not "under a day ago". */
export function cairoDaysBetween(from: Date, to: Date): number {
  const day = (date: Date) => Date.parse(`${CAIRO_DAY.format(date)}T00:00:00Z`);
  return Math.round((day(to) - day(from)) / 86_400_000);
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : DATE.format(date);
}

/** «النهارده» · «امبارح» · «من ٣ أيام» · «يوم ١٢ أكتوبر». */
export function whenLabel(iso: string | null, now: Date): string | null {
  if (iso === null) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const days = cairoDaysBetween(date, now);
  if (days <= 0) return c.when.today;
  if (days === 1) return c.when.yesterday;
  if (days <= 6) return formatCopy(c.when.days, { count: days });
  return formatCopy(c.when.date, { date: DATE.format(date) });
}

/** «عبد» and «أبو» are not a name on their own — same rule as the rank's
 *  `shortName`, so «عبد الرحمن محمد» greets as «عبد الرحمن». */
const NAME_PREFIXES = new Set(['عبد', 'أبو', 'ابو']);

export function firstName(fullName: string): string {
  const words = fullName.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length > 1 && NAME_PREFIXES.has(words[0]!)) return `${words[0]} ${words[1]}`;
  return words[0]!;
}

/** The sentence under the name. */
export function weekSentence(view: GuardianView): string {
  const { lecturesDone: done, lecturesOpen: open } = view.week;
  if (view.courses.length === 0) return c.hero.weekNoCourses;
  if (open === 0) return c.hero.weekNothingOpen;
  if (done === 0) return formatCopy(c.hero.weekNoneYet, { open });
  if (done === open) return arabicCount(done, c.hero.weekAllDone);
  return formatCopy(c.hero.week, { done, open });
}

/** The smaller facts beside it — only the ones that happened. */
export function weekExtras(view: GuardianView): string[] {
  const out: string[] = [];
  if (view.week.quizzesSat > 0) out.push(arabicCount(view.week.quizzesSat, c.hero.quizzesThisWeek));
  if (view.homework && view.week.homeworkHandedIn > 0) {
    out.push(arabicCount(view.week.homeworkHandedIn, c.hero.homeworkThisWeek));
  }
  return out;
}

export interface GuardianTotals {
  lecturesDone: number;
  lecturesTotal: number;
  lecturesPercent: number;
  homeworkIn: number;
  homeworkTotal: number;
}

export function totals(view: GuardianView): GuardianTotals {
  const lecturesDone = view.courses.reduce((sum, course) => sum + course.lectures.completed, 0);
  const lecturesTotal = view.courses.reduce((sum, course) => sum + course.lectures.total, 0);
  const homework = view.homework;
  return {
    lecturesDone,
    lecturesTotal,
    lecturesPercent: lecturesTotal === 0 ? 0 : Math.round((lecturesDone / lecturesTotal) * 100),
    homeworkIn: homework ? homework.accepted + homework.submitted + homework.needsWork : 0,
    homeworkTotal: homework ? homework.items.length : 0,
  };
}

export type AccessTone = 'ok' | 'warn' | 'off';

/** The subscription chip on a course card. */
export function accessLabel(
  access: GuardianAccess,
  published: boolean,
): { tone: AccessTone; text: string; sub: string | null } {
  if (!published) return { tone: 'off', text: c.courses.access.closed, sub: null };
  if (access.state === 'ended') return { tone: 'warn', text: c.courses.access.ended, sub: null };
  if (access.state === 'codes') return { tone: 'ok', text: c.courses.access.codes, sub: null };
  const text =
    access.plan === 'months'
      ? formatCopy(c.courses.access.months, { months: access.months.join('، ') })
      : access.plan === 'term'
        ? c.courses.access.term
        : c.courses.access.full;
  const sub = access.validUntil ? formatCopy(c.courses.access.until, { date: formatDate(access.validUntil) }) : null;
  return { tone: 'ok', text, sub };
}

export type AttentionTone = 'urgent' | 'warn' | 'info';

export interface AttentionItem {
  key: string;
  tone: AttentionTone;
  kind: 'subscription' | 'homework' | 'marks' | 'lectures' | 'quizzes' | 'activity';
  title: string;
  /** The first few names it is about, e.g. the lecture titles. */
  detail: string | null;
}

/** Days within which an expiring subscription is worth a row. */
const ENDING_SOON_DAYS = 7;
/** No activity for this long is worth a row. */
const INACTIVE_DAYS = 7;
const DETAIL_NAMES = 3;

function names(titles: readonly string[]): string | null {
  if (titles.length === 0) return null;
  const shown = titles.slice(0, DETAIL_NAMES).join('، ');
  const rest = titles.length - DETAIL_NAMES;
  return rest > 0 ? `${shown} ${formatCopy(c.attention.more, { count: rest })}` : shown;
}

/**
 * «محتاج متابعة» — most important first. A course whose subscription ended is
 * said ONCE, as that; its unwatched lectures are not then listed as «لسه
 * متشافتش» as well, because they are doors that will not open until renewal.
 */
export function attentionItems(view: GuardianView, now: Date): AttentionItem[] {
  const items: AttentionItem[] = [];
  const ended = new Set(
    view.courses.filter((course) => course.published && course.access.state === 'ended').map((course) => course.id),
  );

  for (const course of view.courses) {
    if (ended.has(course.id)) {
      items.push({
        key: `ended:${course.id}`,
        tone: 'urgent',
        kind: 'subscription',
        title: formatCopy(c.attention.ended, { course: course.title }),
        detail: c.attention.endedBody,
      });
    } else if (course.access.state === 'active' && course.access.validUntil) {
      const days = cairoDaysBetween(now, new Date(course.access.validUntil));
      if (days >= 0 && days <= ENDING_SOON_DAYS) {
        items.push({
          key: `ending:${course.id}`,
          tone: 'warn',
          kind: 'subscription',
          title: formatCopy(c.attention.endingSoon, {
            course: course.title,
            when: days === 0 ? c.when.today : formatDate(course.access.validUntil),
          }),
          detail: null,
        });
      }
    }
  }

  if (view.homework) {
    const open = view.homework.items.filter((item) => !ended.has(item.courseId));
    const missing = open.filter((item) => item.status === 'missing');
    const redo = open.filter((item) => item.status === 'needs_work');
    if (missing.length > 0) {
      items.push({
        key: 'homework:missing',
        tone: 'warn',
        kind: 'homework',
        title: arabicCount(missing.length, c.attention.homeworkMissing),
        detail: names(missing.map((item) => item.lessonTitle)),
      });
    }
    if (redo.length > 0) {
      items.push({
        key: 'homework:redo',
        tone: 'warn',
        kind: 'homework',
        title: arabicCount(redo.length, c.attention.homeworkRedo),
        detail: names(redo.map((item) => item.lessonTitle)),
      });
    }
  }

  const failed = view.quizzes.papers.filter((paper) => paper.result && !paper.result.passed && !paper.pending);
  if (failed.length > 0) {
    items.push({
      key: 'marks:failed',
      tone: 'warn',
      kind: 'marks',
      title: arabicCount(failed.length, c.attention.failed),
      detail: names(failed.map((paper) => paper.title)),
    });
  }

  const lectures = view.courses
    .filter((course) => !ended.has(course.id))
    .reduce((sum, course) => sum + course.backlog.lectures, 0);
  if (lectures > 0) {
    items.push({
      key: 'lectures',
      tone: 'info',
      kind: 'lectures',
      title: arabicCount(lectures, c.attention.lectures),
      detail: names(
        view.backlog.items.filter((item) => item.kind === 'lecture' && !ended.has(item.courseId)).map((item) => item.title),
      ),
    });
  }

  const quizzes = view.courses
    .filter((course) => !ended.has(course.id))
    .reduce((sum, course) => sum + course.backlog.quizzes, 0);
  if (quizzes > 0) {
    items.push({
      key: 'quizzes',
      tone: 'info',
      kind: 'quizzes',
      title: arabicCount(quizzes, c.attention.quizzes),
      detail: names(
        view.backlog.items.filter((item) => item.kind !== 'lecture' && !ended.has(item.courseId)).map((item) => item.title),
      ),
    });
  }

  if (view.courses.length > 0 && view.lastActivityAt) {
    const idle = cairoDaysBetween(new Date(view.lastActivityAt), now);
    if (idle >= INACTIVE_DAYS) {
      items.push({
        key: 'inactive',
        tone: 'warn',
        kind: 'activity',
        title: formatCopy(c.attention.inactive, { count: idle }),
        detail: null,
      });
    }
  }

  const order: Record<AttentionTone, number> = { urgent: 0, warn: 1, info: 2 };
  return items.sort((a, b) => order[a.tone] - order[b.tone]);
}

/** «فاضل: محاضرتين · واجب» on a course card — empty when nothing is left. */
export function courseBehind(course: GuardianView['courses'][number]): string[] {
  const out: string[] = [];
  if (course.backlog.lectures > 0) out.push(arabicCount(course.backlog.lectures, c.courses.lecturesBehind));
  if (course.backlog.quizzes > 0) out.push(arabicCount(course.backlog.quizzes, c.courses.quizzesBehind));
  if (course.backlog.homework > 0) out.push(arabicCount(course.backlog.homework, c.courses.homeworkBehind));
  return out;
}

/** A mark for display — two decimals at most, trailing zeros dropped. */
export function mark(value: number): string {
  return String(Math.round(value * 100) / 100);
}
