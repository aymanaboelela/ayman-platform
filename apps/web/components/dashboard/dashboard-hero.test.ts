import { describe, expect, it } from 'vitest';
import type { EnrolledCourse } from '@ayman/contracts/progress';
import { scheduleLines } from './dashboard-hero';

/**
 * «مواعيد المحاضرات» — which enrolled courses put a line on the band.
 *
 * The rule is one field wide, and every one of these cases is a way the band
 * could quietly go wrong instead of loudly: a course with no note drawing an
 * empty row, a whitespace note drawing a course label with a blank time next
 * to it, a closed course losing a time the student is still expected at, or
 * the two normal courses (عربي on one night, لغات on another) coming out in an
 * order the payload did not choose.
 *
 * The rendering itself is deliberately NOT asserted here. Everything the
 * design has to get right about it — the type size, the wrapping at 390px, the
 * amber bar — is CSS, and a DOM test that queried for the text would pass
 * against a strip rendered at 11px in grey, which is the exact failure this
 * feature exists to avoid. `study-surface-a11y.e2e.ts` is where the band is
 * looked at.
 */
const base: EnrolledCourse = {
  id: '0198c3a2-0000-7000-8000-000000000001',
  slug: 'arabic-y3',
  title: 'اللغة العربية — تالتة ثانوي',
  coverKey: null,
  subjectNameAr: 'اللغة العربية',
  published: true,
  progressPercent: 40,
  completedLessons: 2,
  totalLessons: 5,
  lastLessonId: '0198c3a2-0000-7000-8000-000000000002',
  subscriptionValidUntil: null,
  comingSoonNote: null,
  contentComplete: false,
  bookTitle: null,
  bookPriceCents: null,
  scheduleNote: null,
};

const withNote = (id: string, title: string, scheduleNote: string | null): EnrolledCourse => ({
  ...base,
  id,
  title,
  scheduleNote,
});

describe('scheduleLines', () => {
  it('turns a course with a note into one line carrying the note verbatim', () => {
    const lines = scheduleLines([withNote('c1', 'اللغة العربية', 'السبت الساعة ٨ مساءً')]);

    expect(lines).toEqual([
      { courseId: 'c1', courseTitle: 'اللغة العربية', note: 'السبت الساعة ٨ مساءً' },
    ]);
  });

  it('contributes nothing at all for a course with no note', () => {
    expect(scheduleLines([withNote('c1', 'اللغة العربية', null)])).toEqual([]);
  });

  it('renders nothing for a student whose courses all lack a note', () => {
    // The whole `<section>` — heading included — is gated on this being empty,
    // so «مفيش ميعاد» never appears anywhere on the band.
    expect(
      scheduleLines([withNote('c1', 'عربي', null), withNote('c2', 'لغات', null)]),
    ).toHaveLength(0);
  });

  it('drops a whitespace-only note rather than drawing a blank time', () => {
    // The write path trims, but a row written by anything other than the admin
    // form can still hold this — and a course label with nothing beside it
    // reads as a broken band, not as an absent schedule.
    expect(scheduleLines([withNote('c1', 'عربي', '   ')])).toEqual([]);
  });

  it('trims a note that was stored with padding', () => {
    expect(scheduleLines([withNote('c1', 'عربي', '  السبت ٨ م  ')])[0]?.note).toBe('السبت ٨ م');
  });

  it('keeps two courses on two different nights, in payload order', () => {
    // عربي and لغات is the NORMAL case, not the edge one: two lines, both
    // present, and ordered the way `/api/me/dashboard` ordered them
    // (`updatedAt desc`) rather than re-sorted by a time nothing can parse.
    const lines = scheduleLines([
      withNote('c1', 'عربي', 'السبت الساعة ٨ مساءً'),
      withNote('c2', 'لغات', 'الحد الساعة ٨ مساءً'),
    ]);

    expect(lines.map((line) => line.courseId)).toEqual(['c1', 'c2']);
    expect(lines.map((line) => line.note)).toEqual([
      'السبت الساعة ٨ مساءً',
      'الحد الساعة ٨ مساءً',
    ]);
  });

  it('skips only the course that lacks a note, not the ones around it', () => {
    const lines = scheduleLines([
      withNote('c1', 'عربي', 'السبت ٨ م'),
      withNote('c2', 'كيمياء', null),
      withNote('c3', 'لغات', 'الحد ٨ م'),
    ]);

    expect(lines.map((line) => line.courseId)).toEqual(['c1', 'c3']);
  });

  it('keeps the line for a course that is temporarily closed', () => {
    // Unlike `lastLessonId`, which the payload nulls while a course is down:
    // that one is a press into a lesson the routes would refuse, this one is a
    // sentence, and a student whose course is being edited is still expected
    // in the live lesson on Saturday.
    const lines = scheduleLines([{ ...withNote('c1', 'عربي', 'السبت ٨ م'), published: false }]);

    expect(lines).toHaveLength(1);
  });

  it('returns nothing for a student with no courses at all', () => {
    expect(scheduleLines([])).toEqual([]);
  });
});
