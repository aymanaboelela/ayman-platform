import { groupGrantsByCourse, type ThreadGrantRow } from './thread-courses';

const COURSE_A = '01a00000-0000-7000-8000-00000000000a';
const COURSE_B = '01a00000-0000-7000-8000-00000000000b';

function grant(overrides: Partial<ThreadGrantRow>): ThreadGrantRow {
  return {
    courseId: COURSE_A,
    scope: 'course',
    source: 'purchase',
    validUntil: null,
    course: { title: 'أولى ثانوي' },
    term: null,
    month: null,
    ...overrides,
  };
}

describe('groupGrantsByCourse', () => {
  it('puts every month of one course on ONE entry, in curriculum order', () => {
    const courses = groupGrantsByCourse([
      grant({ scope: 'course_month', month: { monthIndex: 3, title: 'شهر ٣' } }),
      grant({ scope: 'course_month', month: { monthIndex: 1, title: 'شهر ١' } }),
    ]);
    expect(courses).toEqual([
      {
        courseId: COURSE_A,
        courseTitle: 'أولى ثانوي',
        source: 'purchase',
        validUntil: null,
        whole: false,
        terms: [],
        months: [
          { index: 1, title: 'شهر ١' },
          { index: 3, title: 'شهر ٣' },
        ],
      },
    ]);
  });

  it('lets a whole-course grant subsume the months, and keeps its end date', () => {
    const until = new Date('2026-12-01T00:00:00.000Z');
    const [course] = groupGrantsByCourse([
      grant({ scope: 'course_month', month: { monthIndex: 1, title: 'شهر ١' } }),
      grant({ scope: 'course', validUntil: until }),
    ]);
    expect(course).toMatchObject({ whole: true, months: [], terms: [], validUntil: until.toISOString() });
  });

  it('takes the most generous end date, and null beats any date', () => {
    const [course] = groupGrantsByCourse([
      grant({ validUntil: new Date('2026-10-01T00:00:00.000Z') }),
      grant({ validUntil: null }),
      grant({ validUntil: new Date('2027-01-01T00:00:00.000Z') }),
    ]);
    expect(course!.validUntil).toBeNull();
  });

  it('names terms once each', () => {
    const [course] = groupGrantsByCourse([
      grant({ scope: 'term', term: { title: 'الترم الأول' } }),
      grant({ scope: 'term', term: { title: 'الترم الأول' } }),
    ]);
    expect(course).toMatchObject({ whole: false, terms: ['الترم الأول'] });
  });

  it('says «بالإيد» only when every grant on the course was opened by hand', () => {
    const [mixed, byHand] = groupGrantsByCourse([
      grant({ scope: 'course_month', source: 'admin', month: { monthIndex: 1, title: 'شهر ١' } }),
      grant({ scope: 'course_month', source: 'purchase', month: { monthIndex: 2, title: 'شهر ٢' } }),
      grant({ courseId: COURSE_B, source: 'admin', course: { title: 'تانية ثانوي' } }),
    ]);
    expect(mixed!.source).toBe('purchase');
    expect(byHand).toMatchObject({ courseId: COURSE_B, source: 'admin' });
  });

  it('keeps first-appearance order, so the newest course stays first', () => {
    const courses = groupGrantsByCourse([
      grant({ courseId: COURSE_B, course: { title: 'تانية ثانوي' } }),
      grant({ courseId: COURSE_A }),
      grant({ courseId: COURSE_B, course: { title: 'تانية ثانوي' } }),
    ]);
    expect(courses.map((course) => course.courseId)).toEqual([COURSE_B, COURSE_A]);
  });
});
