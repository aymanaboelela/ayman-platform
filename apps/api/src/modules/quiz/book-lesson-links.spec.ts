import { bookLessonLinks, isLecture, type CourseLessonRow } from './book-lesson-links';

const row = (lessonId: string, title: string, sectionTitle: string, kind = 'video', courseId = 'c1'): CourseLessonRow => ({
  courseId,
  lessonId,
  title,
  kind,
  sectionTitle,
});

describe('isLecture', () => {
  it('keeps lecture videos, including topic words that only contain «حل»', () => {
    expect(isLecture(row('a', ' تطور تكنولوجيا المعلومات والتحول الاجتماعي', 'الوحدة الأولى'))).toBe(true);
    expect(isLecture(row('a', 'تحليل البيانات', 'الوحدة العاشرة'))).toBe(true);
    expect(isLecture(row('a', 'Cryptographic Technologies and Authentication', 'الوحده الثانيه'))).toBe(true);
  });

  it('drops quizzes, texts, solution videos and exam sections', () => {
    expect(isLecture(row('a', 'كويز الدرس الرابع', 'الوحدة الأولى', 'quiz'))).toBe(false);
    expect(isLecture(row('a', 'pdf حل التقيمات', 'حل تقيمات الوحده الاولي', 'text'))).toBe(false);
    expect(isLecture(row('a', 'حل تقيم الاسبوع الاول', 'حل تقيمات الوحده الاولي'))).toBe(false);
    expect(isLecture(row('a', 'Solve the First Unit Assessments', 'الوحدة الأولى'))).toBe(false);
    expect(isLecture(row('a', 'مراجعة الوحدة', 'الوحدة الأولى'))).toBe(false);
  });
});

describe('bookLessonLinks', () => {
  // كورس تانية لغات على البرودكشن بالحرف: فيديو «Solve the Assessments» في
  // آخر الوحدة الأولى، ولو اتعدّ كان درس ٢-١ في الكتاب هيروح عليه.
  const languages = [
    row('l1', 'Development of Information Technology and Social Transformation', 'الوحدة الأولى'),
    row('q1', 'Quiz — Development of Information Technology', 'الوحدة الأولى', 'quiz'),
    row('l2', 'How AI Works', 'الوحدة الأولى'),
    row('l3', 'AI in Daily Life and Industry', 'الوحدة الأولى'),
    row('l4', 'Ethical Issue with AI', 'الوحدة الأولى'),
    row('s1', 'Solve the First Unit Assessments', 'الوحدة الأولى'),
    row('e1', 'Mid-Month Exam 1 — Lessons 1 and 2', 'امتحانات الشهر', 'quiz'),
    row('l5', 'Cryptographic Technologies and Authentication', 'الوحده الثانيه'),
  ];

  it('links book lesson N to the course’s Nth lecture, across units', () => {
    const book = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'].map((categoryId) => ({ courseId: 'c1', categoryId }));
    expect(bookLessonLinks(languages, [book])).toEqual([
      { categoryId: 'b1', courseId: 'c1', lessonId: 'l1' },
      { categoryId: 'b2', courseId: 'c1', lessonId: 'l2' },
      { categoryId: 'b3', courseId: 'c1', lessonId: 'l3' },
      { categoryId: 'b4', courseId: 'c1', lessonId: 'l4' },
      { categoryId: 'b5', courseId: 'c1', lessonId: 'l5' },
    ]);
  });

  it('a lecture added later picks up the next book lesson', () => {
    const book = [{ courseId: 'c1', categoryId: 'b1' }, { courseId: 'c1', categoryId: 'b2' }];
    const before = [row('l1', 'الدرس الاول', 'الوحده الاولي')];
    expect(bookLessonLinks(before, [book])).toHaveLength(1);
    const after = [...before, row('l2', 'الدرس الثاني', 'الوحده الاولي')];
    expect(bookLessonLinks(after, [book])[1]).toEqual({ categoryId: 'b2', courseId: 'c1', lessonId: 'l2' });
  });

  it('two books on one course each count from the first lecture', () => {
    const lessons = [row('l1', 'الدرس الاول', 'الوحده الاولي')];
    const links = bookLessonLinks(lessons, [[{ courseId: 'c1', categoryId: 'a1' }], [{ courseId: 'c1', categoryId: 'b1' }]]);
    expect(links.map((link) => [link.categoryId, link.lessonId])).toEqual([
      ['a1', 'l1'],
      ['b1', 'l1'],
    ]);
  });
});
