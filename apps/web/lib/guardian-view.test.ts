import { describe, expect, it } from 'vitest';
import { GuardianViewSchema, type GuardianView } from '@ayman/contracts/guardian-view';
import {
  accessLabel,
  attentionItems,
  cairoDaysBetween,
  courseBehind,
  firstName,
  totals,
  weekExtras,
  weekSentence,
  whenLabel,
} from './guardian-view';

const NOW = new Date('2026-10-20T10:00:00Z');

function course(over: Partial<GuardianView['courses'][number]> = {}): GuardianView['courses'][number] {
  return {
    id: 'c-1',
    title: 'كورس البرمجة',
    subjectNameAr: 'البرمجة',
    coverKey: null,
    published: true,
    access: { state: 'active', plan: 'full', months: [], validUntil: null },
    lectures: { completed: 2, total: 4, percent: 50 },
    backlog: { lectures: 0, quizzes: 0, homework: 0 },
    quizzes: { taken: 0, average: null },
    exams: { taken: 0, average: null },
    lastActivityAt: '2026-10-20T08:00:00Z',
    ...over,
  };
}

function view(over: Partial<GuardianView> = {}): GuardianView {
  return GuardianViewSchema.parse({
    student: { name: 'سارة محمد علي', yearLabel: 'الصف الثاني', trackLabel: null },
    lastActivityAt: '2026-10-20T08:00:00Z',
    week: { lecturesDone: 3, lecturesOpen: 4, quizzesSat: 1, homeworkHandedIn: 2 },
    courses: [course()],
    backlog: { lectures: 0, quizzes: 0, homework: 0, items: [] },
    homework: { accepted: 0, submitted: 0, needsWork: 0, missing: 0, items: [] },
    quizzes: {
      quizzes: { taken: 0, average: null },
      exams: { taken: 0, average: null },
      passed: 0,
      failed: 0,
      pending: 0,
      series: [],
      papers: [],
    },
    rank: null,
    honorBoard: null,
    certificates: null,
    weakTopics: null,
    attendance: null,
    ...over,
  });
}

describe('the hero sentence', () => {
  it('«الأسبوع ده 3 من 4 محاضرات اتشافت»', () => {
    expect(weekSentence(view())).toBe('الأسبوع ده 3 من 4 محاضرات اتشافت');
  });

  it('says so when everything open was watched', () => {
    expect(weekSentence(view({ week: { lecturesDone: 4, lecturesOpen: 4, quizzesSat: 0, homeworkHandedIn: 0 } }))).toBe(
      'الأسبوع ده كل المحاضرات المفتوحة اتشافت — 4 محاضرات',
    );
  });

  it('a quiet week names what is waiting, not a zero', () => {
    expect(weekSentence(view({ week: { lecturesDone: 0, lecturesOpen: 2, quizzesSat: 0, homeworkHandedIn: 0 } }))).toBe(
      'الأسبوع ده لسه مفيش محاضرة اتشافت من 2 مفتوحين',
    );
  });

  it('a student with no course gets the first-run line', () => {
    expect(weekSentence(view({ courses: [] }))).toContain('أول ما يتم الاشتراك');
  });

  it('lists only the extras that happened, with Arabic counting', () => {
    expect(weekExtras(view())).toEqual(['امتحان واحد اتحل', 'واجبين اتسلّموا']);
    expect(weekExtras(view({ week: { lecturesDone: 0, lecturesOpen: 0, quizzesSat: 0, homeworkHandedIn: 3 } }))).toEqual([
      '3 واجبات اتسلّمت',
    ]);
    // Homework switched off on this stack: never mentioned.
    expect(weekExtras(view({ homework: null }))).toEqual(['امتحان واحد اتحل']);
  });
});

describe('dates on the Cairo calendar', () => {
  it('counts calendar days in Cairo, not 24-hour blocks', () => {
    // 22:30 Cairo yesterday (UTC+3) is «امبارح» at 10:00 today.
    expect(cairoDaysBetween(new Date('2026-10-19T19:30:00Z'), NOW)).toBe(1);
    // 00:30 Cairo today is today, though it was the 19th in UTC.
    expect(cairoDaysBetween(new Date('2026-10-19T21:30:00Z'), NOW)).toBe(0);
  });

  it('«النهارده» · «امبارح» · «من 3 أيام» · a date past a week', () => {
    expect(whenLabel('2026-10-20T06:00:00Z', NOW)).toBe('النهارده');
    expect(whenLabel('2026-10-19T06:00:00Z', NOW)).toBe('امبارح');
    expect(whenLabel('2026-10-17T06:00:00Z', NOW)).toBe('من 3 أيام');
    expect(whenLabel('2026-10-01T06:00:00Z', NOW)).toMatch(/^يوم 1 أكتوبر$/u);
    expect(whenLabel(null, NOW)).toBeNull();
    expect(whenLabel('not a date', NOW)).toBeNull();
  });
});

describe('names', () => {
  it('greets by the first name, keeping «عبد» with what follows', () => {
    expect(firstName('سارة محمد علي')).toBe('سارة');
    expect(firstName('عبد الرحمن محمد')).toBe('عبد الرحمن');
    expect(firstName('  ')).toBe('');
  });
});

describe('totals', () => {
  it('adds lectures across courses, and homework handed in out of every row', () => {
    const sum = totals(
      view({
        courses: [course(), course({ id: 'c-2', lectures: { completed: 1, total: 6, percent: 17 } })],
        homework: {
          accepted: 1,
          submitted: 1,
          needsWork: 1,
          missing: 2,
          items: Array.from({ length: 5 }, (_, i) => ({
            lessonId: `l${i}`,
            lessonTitle: `L${i}`,
            courseId: 'c-1',
            courseTitle: 'ك',
            status: (['accepted', 'submitted', 'needs_work', 'missing', 'missing'] as const)[i]!,
            submittedAt: null,
            grade: null,
          })),
        },
      }),
    );
    expect(sum).toEqual({ lecturesDone: 3, lecturesTotal: 10, lecturesPercent: 30, homeworkIn: 3, homeworkTotal: 5 });
  });
});

describe('the subscription chip', () => {
  it('names the months held, and the end date when there is one', () => {
    expect(accessLabel({ state: 'active', plan: 'months', months: ['شهر ١', 'شهر ٢'], validUntil: null }, true)).toEqual({
      tone: 'ok',
      text: 'شغّال: شهر ١، شهر ٢',
      sub: null,
    });
    expect(accessLabel({ state: 'active', plan: 'full', months: [], validUntil: '2026-12-31T00:00:00Z' }, true).sub).toBe(
      'لحد 31 ديسمبر',
    );
  });

  it('ended reads ended; a closed course reads closed whatever the grant says', () => {
    expect(accessLabel({ state: 'ended', plan: null, months: [], validUntil: null }, true)).toMatchObject({
      tone: 'warn',
      text: 'الاشتراك خلص',
    });
    expect(accessLabel({ state: 'active', plan: 'full', months: [], validUntil: null }, false).tone).toBe('off');
  });
});

describe('«محتاج متابعة»', () => {
  const paper = (title: string, passed: boolean, pending = false) => ({
    lessonId: title,
    title,
    courseId: 'c-1',
    courseTitle: 'ك',
    kind: 'quiz' as const,
    result: { score: passed ? 9 : 3, outOf: 10, percent: passed ? 90 : 30, passed },
    pending: pending ? { gradedScore: 3, gradedOutOf: 5, pendingOutOf: 5 } : null,
    sittings: 1,
    lastSubmittedAt: '2026-10-10T00:00:00Z',
  });

  it('is empty — «كله تمام» — when nothing is owed', () => {
    expect(attentionItems(view(), NOW)).toEqual([]);
  });

  it('orders the ended subscription first and does not list its lectures as unwatched', () => {
    const items = attentionItems(
      view({
        courses: [
          course({
            id: 'gone',
            title: 'كورس الفيزياء',
            access: { state: 'ended', plan: null, months: [], validUntil: null },
            backlog: { lectures: 3, quizzes: 0, homework: 0 },
          }),
          course({ id: 'live', backlog: { lectures: 2, quizzes: 1, homework: 0 } }),
        ],
        backlog: {
          lectures: 5,
          quizzes: 1,
          homework: 0,
          items: [
            { courseId: 'gone', courseTitle: 'ف', kind: 'lecture', title: 'محاضرة ف' },
            { courseId: 'live', courseTitle: 'ب', kind: 'lecture', title: 'محاضرة ١' },
            { courseId: 'live', courseTitle: 'ب', kind: 'lecture', title: 'محاضرة ٢' },
            { courseId: 'live', courseTitle: 'ب', kind: 'quiz', title: 'كويز ٢' },
          ],
        },
        quizzes: {
          ...view().quizzes,
          papers: [paper('كويز ١', false), paper('كويز ٣', true), paper('ميدترم', false, true)],
        },
      }),
      NOW,
    );
    expect(items.map((item) => [item.tone, item.title, item.detail])).toEqual([
      ['urgent', 'اشتراك «كورس الفيزياء» خلص', 'المحاضرات الجديدة مش هتفتح لحد ما الاشتراك يتجدد.'],
      // Only the failed paper with nothing being marked — never the midterm on the teacher's desk.
      ['warn', 'امتحان واحد درجته تحت النجاح', 'كويز ١'],
      ['info', 'محاضرتين لسه متشافوش', 'محاضرة ١، محاضرة ٢'],
      ['info', 'كويز واحد مفتوح ومتحلّش', 'كويز ٢'],
    ]);
  });

  it('names missing and returned homework, the first three and a count', () => {
    const hw = (i: number, status: 'missing' | 'needs_work') => ({
      lessonId: `l${i}`,
      lessonTitle: `المحاضرة ${i}`,
      courseId: 'c-1',
      courseTitle: 'ك',
      status,
      submittedAt: null,
      grade: null,
    });
    const items = attentionItems(
      view({
        homework: {
          accepted: 0,
          submitted: 0,
          needsWork: 1,
          missing: 4,
          items: [hw(1, 'missing'), hw(2, 'missing'), hw(3, 'missing'), hw(4, 'missing'), hw(5, 'needs_work')],
        },
      }),
      NOW,
    );
    expect(items.map((item) => [item.title, item.detail])).toEqual([
      ['4 واجبات متسلّمتش', 'المحاضرة 1، المحاضرة 2، المحاضرة 3 و1 كمان'],
      ['واجب واحد محتاج يتعاد', 'المحاضرة 5'],
    ]);
  });

  it('warns about a subscription ending within the week, and a week of silence', () => {
    const items = attentionItems(
      view({
        lastActivityAt: '2026-10-05T10:00:00Z',
        courses: [course({ access: { state: 'active', plan: 'full', months: [], validUntil: '2026-10-24T12:00:00Z' } })],
      }),
      NOW,
    );
    expect(items.map((item) => item.title)).toEqual([
      'اشتراك «كورس البرمجة» بيخلص 24 أكتوبر',
      'مفيش أي نشاط من 15 يوم',
    ]);
  });
});

describe('a course card’s «فاضل»', () => {
  it('says what is left, in Arabic counting, or nothing', () => {
    expect(courseBehind(course({ backlog: { lectures: 2, quizzes: 1, homework: 3 } }))).toEqual([
      'محاضرتين',
      'كويز',
      '3 واجبات',
    ]);
    expect(courseBehind(course())).toEqual([]);
  });
});
