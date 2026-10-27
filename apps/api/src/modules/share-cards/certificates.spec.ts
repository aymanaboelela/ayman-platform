import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';
import { buildCertificates, type AttemptRow, type CourseRow, type QuizLessonRow } from './certificates';

/** The certificate rules from `@ayman/contracts/share-cards`, one per case. */
describe('buildCertificates', () => {
  const course: CourseRow = { id: 'c1', slug: 'y2', title: 'تانية بكالوريا', examLessonId: 'final' };
  const lesson = (id: string, sectionId: string, sectionTitle: string, sectionPosition = 1): QuizLessonRow => ({
    id,
    title: `كويز ${id}`,
    courseId: 'c1',
    sectionId,
    sectionTitle,
    sectionPosition,
  });
  const at = (day: number) => new Date(Date.UTC(2026, 9, day));
  const attempt = (lessonId: string, score: number, day = 1, total = 10): AttemptRow => ({
    lessonId,
    score,
    total,
    submittedAt: at(day),
  });

  const unit1 = [lesson('q1', 's1', 'الوحدة الأولى'), lesson('q2', 's1', 'الوحدة الأولى')];

  it('earns a unit when every quiz is marked and the average of the bests reaches 85%', () => {
    const { units } = buildCertificates([course], unit1, [
      attempt('q1', 7, 1),
      attempt('q1', 9, 3), // best of q1 is the retake
      attempt('q2', 8, 5),
    ]);
    expect(units).toEqual([
      expect.objectContaining({
        id: 's1',
        title: 'الوحدة الأولى',
        quizzesTotal: 2,
        quizzesTaken: 2,
        averagePercent: 85,
        earned: true,
        earnedAt: at(5).toISOString(),
      }),
    ]);
  });

  it('does not earn a unit with a quiz still untaken, however good the rest', () => {
    const [unit] = buildCertificates([course], unit1, [attempt('q1', 10)]).units;
    expect(unit).toMatchObject({ quizzesTaken: 1, averagePercent: 100, earned: false, earnedAt: null });
  });

  it('does not earn a unit below the line', () => {
    const [unit] = buildCertificates([course], unit1, [attempt('q1', 8), attempt('q2', 8)]).units;
    expect(unit).toMatchObject({ averagePercent: 80, earned: false });
  });

  it('keeps exams out of units and gives them their own certificate', () => {
    const lessons = [
      ...unit1,
      lesson('monthly', 'shelf', EXAM_SHELF_TITLE, 9),
      lesson('final', 's9', 'امتحان نهاية الكورس', 10),
    ];
    const { units, exams } = buildCertificates([course], lessons, [
      attempt('monthly', 18, 2, 20),
      attempt('final', 16, 4, 20), // 80% — no certificate
    ]);
    expect(units.map((unit) => unit.id)).toEqual(['s1']);
    expect(exams).toEqual([
      expect.objectContaining({ id: 'monthly', score: 18, total: 20, percent: 90, earnedAt: at(2).toISOString() }),
    ]);
  });

  it('dates a repeated best mark from the first time it was reached', () => {
    const lessons = [lesson('monthly', 'shelf', EXAM_SHELF_TITLE)];
    const { exams } = buildCertificates([course], lessons, [attempt('monthly', 9, 7), attempt('monthly', 9, 2)]);
    expect(exams[0]?.earnedAt).toBe(at(2).toISOString());
  });

  it('orders units by the course, then by their place in it', () => {
    const lessons = [lesson('b', 's2', 'الوحدة الثانية', 2), lesson('a', 's1', 'الوحدة الأولى', 1)];
    expect(buildCertificates([course], lessons, []).units.map((unit) => unit.id)).toEqual(['s1', 's2']);
  });
});
